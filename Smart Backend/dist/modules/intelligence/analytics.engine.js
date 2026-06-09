"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsEngine = void 0;
exports.analyticsEngine = {
    computeTrustScore(avgTimeToSettleHours, totalDelayedPayments) {
        let score = 100;
        // Deduct points for slow settlement average
        if (avgTimeToSettleHours > 24) {
            const days = Math.floor(avgTimeToSettleHours / 24);
            score -= days * 2; // 2 points per day
        }
        // Deduct points for delayed payments (>30 days)
        score -= totalDelayedPayments * 5;
        return Math.max(0, Math.min(100, score));
    },
    computeGroupHealth(staleDebtVolume, totalExpensesVolume, fairnessIndex) {
        let health = 100;
        // If there is significant stale debt relative to total expenses
        if (totalExpensesVolume > 0 && staleDebtVolume > 0) {
            const staleRatio = staleDebtVolume / totalExpensesVolume;
            health -= staleRatio * 50; // up to 50 points penalty
        }
        // Fairness penalty (0.0 to 1.0)
        health -= fairnessIndex * 30; // up to 30 points penalty
        return Math.max(0, Math.min(100, Math.round(health)));
    },
    computeFairnessIndex(userPayments, totalExpenses) {
        if (totalExpenses === 0 || userPayments.length === 0)
            return 0;
        // Gini coefficient approximation for fairness
        const shares = userPayments.map(p => p / totalExpenses);
        const idealShare = 1 / userPayments.length;
        let variance = 0;
        for (const share of shares) {
            variance += Math.abs(share - idealShare);
        }
        // Max variance is 2 * (1 - idealShare)
        const maxVariance = 2 * (1 - idealShare);
        if (maxVariance === 0)
            return 0;
        return Math.min(1.0, variance / maxVariance);
    },
    computePersonalityTrait(avgTimeToSettleHours, totalDelayedPayments, fairnessIndex, sampleSize) {
        if (sampleSize < 3)
            return null; // Not enough data to be confident
        let confidence = Math.min(1.0, sampleSize / 10); // 10 samples for max confidence
        if (totalDelayedPayments === 0 && avgTimeToSettleHours <= 24) {
            return { trait: 'LIGHTNING_SETTLER', confidence };
        }
        if (fairnessIndex > 0.6 && sampleSize >= 5) {
            // Assuming a high fairness index (close to 1) means this person is paying a lot disproportionately
            // Note: in a real implementation, we'd check if THIS user is the one paying. For now, it's a proxy.
            return { trait: 'ANCHOR_CONTRIBUTOR', confidence };
        }
        if (totalDelayedPayments === 0 && avgTimeToSettleHours <= 72) {
            return { trait: 'RELIABLE_CONTRIBUTOR', confidence };
        }
        // Default to nothing instead of assigning a negative trait
        return null;
    }
};
