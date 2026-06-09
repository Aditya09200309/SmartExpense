"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateGroupSocialEquilibrium = updateGroupSocialEquilibrium;
exports.getSocialBalanceInsight = getSocialBalanceInsight;
const prisma_1 = __importDefault(require("../../lib/prisma"));
/**
 * Re-computes the 30-day social equilibrium metrics for a group
 * after an expense is added. This is an asynchronous side-effect.
 */
function updateGroupSocialEquilibrium(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        // 1. Fetch all expenses in the last 30 days for this group
        const recentExpenses = yield prisma_1.default.expense.findMany({
            where: {
                groupId,
                createdAt: {
                    gte: thirtyDaysAgo
                }
            }
        });
        // 2. Aggregate burden metrics per user
        const userMetrics = new Map();
        for (const expense of recentExpenses) {
            const payerId = expense.paidById;
            const current = userMetrics.get(payerId) || { liquidityBurden: 0, initiationCount: 0 };
            current.liquidityBurden += Number(expense.amount);
            current.initiationCount += 1;
            userMetrics.set(payerId, current);
        }
        // 3. Upsert metrics to Intel_SocialEquilibrium
        for (const [userId, metrics] of userMetrics.entries()) {
            yield prisma_1.default.intel_SocialEquilibrium.upsert({
                where: {
                    groupId_userId: { groupId, userId }
                },
                update: {
                    rollingLiquidityBurden: metrics.liquidityBurden,
                    rollingInitiationCount: metrics.initiationCount,
                    lastUpdated: new Date()
                },
                create: {
                    groupId,
                    userId,
                    rollingLiquidityBurden: metrics.liquidityBurden,
                    rollingInitiationCount: metrics.initiationCount
                }
            });
        }
    });
}
/**
 * Read-only insight function to determine who should naturally cover the next expense.
 */
function getSocialBalanceInsight(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        // 1. Fetch group members (to know the baseline)
        const group = yield prisma_1.default.group.findUnique({
            where: { id: groupId },
            include: { members: { include: { user: true } } }
        });
        if (!group || group.members.length < 2) {
            return { suggestedPayerId: null, message: '' };
        }
        // 2. Fetch the current equilibrium metrics
        const metrics = yield prisma_1.default.intel_SocialEquilibrium.findMany({
            where: { groupId }
        });
        if (metrics.length === 0) {
            return { suggestedPayerId: null, message: '' };
        }
        let totalLiquidity = 0;
        let totalInitiation = 0;
        for (const m of metrics) {
            totalLiquidity += Number(m.rollingLiquidityBurden);
            totalInitiation += m.rollingInitiationCount;
        }
        // Confidence Check: Too little data
        if (totalInitiation < 5) {
            return { suggestedPayerId: null, message: '' };
        }
        // Find the anchor (the one carrying the highest burden)
        let anchorPayerId = null;
        let maxLiquidityShare = 0;
        for (const m of metrics) {
            const share = Number(m.rollingLiquidityBurden) / totalLiquidity;
            if (share > 0.6) { // If one person is paying > 60% of the total liquidity in the group
                anchorPayerId = m.userId;
                maxLiquidityShare = share;
            }
        }
        if (anchorPayerId) {
            const anchorMember = group.members.find((m) => m.userId === anchorPayerId);
            if (anchorMember) {
                return {
                    suggestedPayerId: null, // We never force assign, but we provide an insight
                    message: `${anchorMember.user.name} has covered several recent expenses. Picking up this one may help balance the group.`
                };
            }
        }
        return { suggestedPayerId: null, message: '' };
    });
}
