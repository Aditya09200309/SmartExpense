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
exports.eventHandlers = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const analytics_engine_1 = require("./analytics.engine");
const socialBalance_engine_1 = require("./socialBalance.engine");
function handleExpenseAdded(event) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b;
        try {
            const { groupId } = event.data;
            // We do NOT query the core ledger for transactional logic.
            // We only read historical aggregates to update Intel_* tables.
            // For Phase 1, we can compute fairness index based on total paid so far
            const expenses = yield prisma_1.default.expense.findMany({
                where: { groupId },
                select: { paidById: true, amount: true }
            });
            const totalVolume = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
            // Group by user
            const paymentsByUser = new Map();
            for (const e of expenses) {
                paymentsByUser.set(e.paidById, ((_a = paymentsByUser.get(e.paidById)) !== null && _a !== void 0 ? _a : 0) + Number(e.amount));
            }
            const fairnessIndex = analytics_engine_1.analyticsEngine.computeFairnessIndex(Array.from(paymentsByUser.values()), totalVolume);
            // Update group health
            const existingHealth = yield prisma_1.default.intel_GroupHealth.findUnique({ where: { groupId } });
            const staleDebtVolume = Number((_b = existingHealth === null || existingHealth === void 0 ? void 0 : existingHealth.staleDebtVolume) !== null && _b !== void 0 ? _b : 0);
            const healthScore = analytics_engine_1.analyticsEngine.computeGroupHealth(staleDebtVolume, totalVolume, fairnessIndex);
            yield prisma_1.default.intel_GroupHealth.upsert({
                where: { groupId },
                update: {
                    healthScore,
                    fairnessIndex,
                    lastCalculatedAt: new Date()
                },
                create: {
                    groupId,
                    healthScore,
                    fairnessIndex,
                    staleDebtVolume: 0
                }
            });
            // Phase A: Social Balance Intelligence - Update upfront burden
            yield (0, socialBalance_engine_1.updateGroupSocialEquilibrium)(groupId);
        }
        catch (error) {
            console.error('[Intelligence] Error handling ExpenseAdded:', error);
        }
    });
}
function handleSettlementRecorded(event) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { payerId, amount } = event.data;
            // Find the payer's behavior record
            let behavior = yield prisma_1.default.intel_UserBehavior.findUnique({ where: { userId: payerId } });
            if (!behavior) {
                behavior = {
                    userId: payerId,
                    trustScore: 100,
                    avgTimeToSettleHours: 0,
                    totalDelayedPayments: 0,
                    lastCalculatedAt: new Date()
                };
            }
            // In a full implementation, we'd find the time difference between the debt creation and now.
            // For this Phase 1, we simulate a slight improvement on settlement.
            // (If they had delayed payments, it stays, but settling helps.)
            const newTrustScore = analytics_engine_1.analyticsEngine.computeTrustScore(Math.max(0, behavior.avgTimeToSettleHours - 1), // slightly faster avg
            behavior.totalDelayedPayments);
            yield prisma_1.default.intel_UserBehavior.upsert({
                where: { userId: payerId },
                update: {
                    trustScore: newTrustScore,
                    lastCalculatedAt: new Date()
                },
                create: {
                    userId: payerId,
                    trustScore: newTrustScore,
                    avgTimeToSettleHours: 0,
                    totalDelayedPayments: 0
                }
            });
            // Phase 2: Compute Personality Trait
            const sampleSize = yield prisma_1.default.settlement.count({ where: { payerId } });
            // We pass 0 for fairness index as proxy here, full implementation would query user's group fairness.
            const traitResult = analytics_engine_1.analyticsEngine.computePersonalityTrait(behavior.avgTimeToSettleHours, behavior.totalDelayedPayments, 0, sampleSize);
            if (traitResult) {
                yield prisma_1.default.intel_UserPersonality.upsert({
                    where: { userId: payerId },
                    update: {
                        dominantTrait: traitResult.trait,
                        traitConfidence: traitResult.confidence,
                        lastEvaluatedAt: new Date()
                    },
                    create: {
                        userId: payerId,
                        dominantTrait: traitResult.trait,
                        traitConfidence: traitResult.confidence
                    }
                });
            }
        }
        catch (error) {
            console.error('[Intelligence] Error handling SettlementRecorded:', error);
        }
    });
}
exports.eventHandlers = {
    handleExpenseAdded,
    handleSettlementRecorded
};
