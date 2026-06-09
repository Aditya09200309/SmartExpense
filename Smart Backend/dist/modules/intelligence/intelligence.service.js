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
exports.intelligenceService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
function getUserIntelligence(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const [behavior, personality] = yield Promise.all([
            prisma_1.default.intel_UserBehavior.findUnique({ where: { userId } }),
            prisma_1.default.intel_UserPersonality.findUnique({ where: { userId } })
        ]);
        return {
            userId,
            trustScore: (_a = behavior === null || behavior === void 0 ? void 0 : behavior.trustScore) !== null && _a !== void 0 ? _a : 100, // Default to 100
            dominantTrait: personality === null || personality === void 0 ? void 0 : personality.dominantTrait
        };
    });
}
function getGroupIntelligence(groupId) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const health = yield prisma_1.default.intel_GroupHealth.findUnique({
            where: { groupId }
        });
        return {
            groupId,
            healthScore: (_a = health === null || health === void 0 ? void 0 : health.healthScore) !== null && _a !== void 0 ? _a : 100 // Default to 100
        };
    });
}
function getUserLongitudinalStats(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        // In a full implementation, this queries the Intel_LongitudinalStats table 
        // which is populated by a nightly cron job.
        // For Phase 4 execution, we scaffold a 3-month synthetic trend to demonstrate the moat.
        const now = new Date();
        return [
            { periodStart: new Date(now.getFullYear(), now.getMonth() - 2, 1), avgTimeToSettle: 48, totalContribution: 1200 },
            { periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1), avgTimeToSettle: 36, totalContribution: 1800 },
            { periodStart: new Date(now.getFullYear(), now.getMonth(), 1), avgTimeToSettle: 12, totalContribution: 800 },
        ];
    });
}
exports.intelligenceService = {
    getUserIntelligence,
    getGroupIntelligence,
    getUserLongitudinalStats
};
