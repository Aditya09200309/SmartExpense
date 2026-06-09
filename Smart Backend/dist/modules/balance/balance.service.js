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
exports.balanceService = void 0;
exports.simplifyDebts = simplifyDebts;
const prisma_1 = __importDefault(require("../../lib/prisma"));
function getGroupBalances(groupId_1, requesterId_1) {
    return __awaiter(this, arguments, void 0, function* (groupId, requesterId, db = prisma_1.default) {
        var _a, _b, _c, _d;
        // All four queries are independent — fetch in a single round-trip
        const [group, members, expenses, settlements] = yield Promise.all([
            db.group.findUnique({
                where: { id: groupId },
                select: { id: true, name: true },
            }),
            db.groupMember.findMany({
                where: { groupId },
                select: {
                    userId: true,
                    user: { select: { id: true, name: true, email: true } },
                },
            }),
            db.expense.findMany({
                where: { groupId },
                orderBy: { createdAt: 'desc' },
                select: {
                    paidById: true,
                    amount: true,
                    description: true,
                    createdAt: true,
                    splits: { select: { userId: true, amount: true } },
                },
            }),
            db.settlement.findMany({
                where: { groupId },
                orderBy: { settledAt: 'desc' },
                select: { payerId: true, receiverId: true, amount: true, settledAt: true },
            }),
        ]);
        if (!group) {
            const err = new Error('Group not found');
            err.name = 'GROUP_NOT_FOUND';
            throw err;
        }
        const memberIdSet = new Set(members.map((m) => m.userId));
        if (!memberIdSet.has(requesterId)) {
            const err = new Error('You are not a member of this group');
            err.name = 'NOT_MEMBER';
            throw err;
        }
        // Work in integer cents to avoid floating-point rounding errors
        const balanceCents = new Map();
        const userMap = new Map();
        let totalExpenseCents = 0;
        for (const m of members) {
            balanceCents.set(m.userId, 0);
            userMap.set(m.userId, m.user);
        }
        for (const expense of expenses) {
            const paid = toCents(expense.amount);
            totalExpenseCents += paid;
            balanceCents.set(expense.paidById, ((_a = balanceCents.get(expense.paidById)) !== null && _a !== void 0 ? _a : 0) + paid);
            for (const split of expense.splits) {
                const owed = toCents(split.amount);
                balanceCents.set(split.userId, ((_b = balanceCents.get(split.userId)) !== null && _b !== void 0 ? _b : 0) - owed);
            }
        }
        for (const s of settlements) {
            const amount = toCents(s.amount);
            // Payer reduced their debt; receiver's outstanding credit shrinks
            balanceCents.set(s.payerId, ((_c = balanceCents.get(s.payerId)) !== null && _c !== void 0 ? _c : 0) + amount);
            balanceCents.set(s.receiverId, ((_d = balanceCents.get(s.receiverId)) !== null && _d !== void 0 ? _d : 0) - amount);
        }
        const netBalances = members.map((m) => {
            var _a;
            return ({
                userId: m.userId,
                name: m.user.name,
                email: m.user.email,
                netBalance: fromCents((_a = balanceCents.get(m.userId)) !== null && _a !== void 0 ? _a : 0),
            });
        });
        // Calculate total settled amount for progress bar
        // Progress = (Total Expenses) - (Total Outstanding Debts)
        // Total Outstanding = Sum of all positive net balances
        const totalOutstandingCents = netBalances
            .filter(b => b.netBalance > 0)
            .reduce((sum, b) => sum + toCents(b.netBalance), 0);
        const totalSettledCents = Math.max(0, totalExpenseCents - totalOutstandingCents);
        // Build derived activity history
        const activity = [
            ...expenses.map(e => {
                var _a, _b;
                return ({
                    type: 'expense',
                    userName: (_b = (_a = userMap.get(e.paidById)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Unknown',
                    description: e.description,
                    amount: Number(e.amount),
                    date: e.createdAt,
                });
            }),
            ...settlements.map(s => {
                var _a, _b, _c, _d;
                return ({
                    type: 'settlement',
                    userName: (_b = (_a = userMap.get(s.payerId)) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : 'Unknown',
                    receiverName: (_d = (_c = userMap.get(s.receiverId)) === null || _c === void 0 ? void 0 : _c.name) !== null && _d !== void 0 ? _d : 'Unknown',
                    amount: Number(s.amount),
                    date: s.settledAt,
                });
            })
        ].sort((a, b) => b.date.getTime() - a.date.getTime());
        // Restrict simplification to current members only.
        const memberBalanceCents = new Map();
        for (const [userId, cents] of balanceCents) {
            if (userMap.has(userId))
                memberBalanceCents.set(userId, cents);
        }
        const simplifiedDebts = simplifyDebts(memberBalanceCents, userMap);
        const rawDebts = computeRawDebts(expenses, settlements, userMap);
        return {
            groupId,
            netBalances,
            simplifiedDebts,
            rawDebts,
            totalExpenses: fromCents(totalExpenseCents),
            totalSettled: fromCents(totalSettledCents),
            activity
        };
    });
}
// Debt simplification — three-phase algorithm.
//
// Net balances are computed before this function runs, so chains like
// A→B→C are already collapsed to A→C via the balance arithmetic.
//
// Phase 1 — exact-match pass:
//   Bucket creditors by amount. Walk debtors largest-first. When a debtor's
//   amount exactly equals a creditor's amount they settle in one transaction
//   without splitting.  Pure greedy misses these pairs, forcing a later debtor
//   to split across two creditors unnecessarily.
//
// Phase 2 — single-payment preference pass:
//   For each remaining debtor, prefer a creditor whose balance ≥ the debtor's
//   balance so the debtor can be fully settled in a single payment. Only if
//   no such creditor exists does the debtor split across multiple creditors.
//   This minimises per-debtor outgoing payments while keeping total transaction
//   count at most n−1.
//
// Phase 3 — consolidation:
//   Merge any (from, to) entries that share the same pair into one. Guards
//   against edge cases where the same pair appears from both earlier phases.
//
// All keys in balanceCents are guaranteed to exist in userMap by the caller.
function simplifyDebts(balanceCents, userMap) {
    const debtors = [];
    const creditors = [];
    for (const [userId, cents] of balanceCents) {
        if (cents < 0)
            debtors.push({ userId, cents: -cents });
        else if (cents > 0)
            creditors.push({ userId, cents });
    }
    if (debtors.length === 0 || creditors.length === 0)
        return [];
    // Largest-first ordering; userId breaks ties deterministically.
    debtors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
    creditors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
    const raw = [];
    // ── Phase 1: exact-match pass ──────────────────────────────────────────
    // bucket: cents → creditors with that exact amount (used as a stack).
    const creditorsByAmount = new Map();
    for (const c of creditors) {
        const bucket = creditorsByAmount.get(c.cents);
        if (bucket)
            bucket.push(c);
        else
            creditorsByAmount.set(c.cents, [c]);
    }
    const unmatchedDebtors = [];
    for (const debtor of debtors) {
        const bucket = creditorsByAmount.get(debtor.cents);
        if (bucket === null || bucket === void 0 ? void 0 : bucket.length) {
            const creditor = bucket.pop();
            raw.push(makeDebt(debtor.userId, creditor.userId, debtor.cents, userMap));
            if (!bucket.length)
                creditorsByAmount.delete(debtor.cents);
        }
        else {
            unmatchedDebtors.push(debtor);
        }
    }
    // Collect creditors not consumed by Phase 1.
    const unmatchedCreditors = [];
    for (const bucket of creditorsByAmount.values()) {
        for (const c of bucket)
            unmatchedCreditors.push(c);
    }
    // Re-sort so Phase 2 always sees the correct largest-first order.
    unmatchedDebtors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
    unmatchedCreditors.sort((a, b) => b.cents - a.cents || a.userId.localeCompare(b.userId));
    // ── Phase 2: single-payment preference + greedy sweep ─────────────────
    // For each debtor, first try to find a creditor whose balance ≥ the debtor's
    // balance so the debtor settles in one payment. Fall back to largest-creditor
    // greedy when no such creditor exists.
    for (const debtor of unmatchedDebtors) {
        while (debtor.cents > 0) {
            // Prefer a creditor that can absorb the full debtor amount (single payment).
            const singlePayIdx = unmatchedCreditors.findIndex(c => c.cents >= debtor.cents);
            const ci = singlePayIdx !== -1 ? singlePayIdx : 0; // fall back to largest creditor
            const creditor = unmatchedCreditors[ci];
            if (!creditor)
                break;
            const transfer = Math.min(debtor.cents, creditor.cents);
            raw.push(makeDebt(debtor.userId, creditor.userId, transfer, userMap));
            debtor.cents -= transfer;
            creditor.cents -= transfer;
            if (creditor.cents === 0) {
                unmatchedCreditors.splice(ci, 1);
            }
        }
    }
    // ── Phase 3: consolidate duplicate (from, to) pairs ───────────────────
    return consolidate(raw);
}
function makeDebt(fromUserId, toUserId, cents, userMap) {
    return {
        fromUserId,
        fromUserName: userMap.get(fromUserId).name,
        toUserId,
        toUserName: userMap.get(toUserId).name,
        amount: fromCents(cents),
    };
}
// Merge any transactions that share the same (from, to) pair.
function consolidate(debts) {
    if (debts.length <= 1)
        return debts;
    const merged = new Map();
    for (const d of debts) {
        const key = `${d.fromUserId}|${d.toUserId}`;
        const existing = merged.get(key);
        if (existing) {
            existing.amount = fromCents(toCents(existing.amount) + toCents(d.amount));
        }
        else {
            merged.set(key, Object.assign({}, d));
        }
    }
    return [...merged.values()];
}
function toCents(value) {
    return Math.round(Number(value) * 100);
}
function fromCents(cents) {
    return cents / 100;
}
// Computes direct pairwise obligations from expense splits and settlements —
// no cross-person routing, no chain elimination, no exact-match optimisation.
//
// Each entry shows what one person directly owes another because they were in
// that person's expense split.  Settlements reduce the corresponding pair.
// Mutual debts (A→B and B→A) are netted into a single directed entry.
//
// Invariant: for every member U,
//   sum(rawDebts where from=U) − sum(rawDebts where to=U) = U.netBalance
// Both views are derived from the same underlying state.
function computeRawDebts(expenses, settlements, userMap) {
    var _a, _b, _c, _d;
    // pairCents[fromId][toId] = net cents from owes to
    const pairCents = new Map();
    function addCents(from, to, delta) {
        var _a;
        let row = pairCents.get(from);
        if (!row) {
            row = new Map();
            pairCents.set(from, row);
        }
        row.set(to, ((_a = row.get(to)) !== null && _a !== void 0 ? _a : 0) + delta);
    }
    for (const expense of expenses) {
        for (const split of expense.splits) {
            if (split.userId === expense.paidById)
                continue; // payer's own share
            addCents(split.userId, expense.paidById, toCents(split.amount));
        }
    }
    for (const s of settlements) {
        addCents(s.payerId, s.receiverId, -toCents(s.amount));
    }
    // Net out mutual (A→B, B→A) pairs and emit a single directed entry per pair
    const result = [];
    const processed = new Set();
    for (const [fromId, toMap] of pairCents) {
        for (const [toId] of toMap) {
            const fwdKey = `${fromId}|${toId}`;
            const revKey = `${toId}|${fromId}`;
            if (processed.has(fwdKey))
                continue;
            processed.add(fwdKey);
            processed.add(revKey);
            const fwd = (_b = (_a = pairCents.get(fromId)) === null || _a === void 0 ? void 0 : _a.get(toId)) !== null && _b !== void 0 ? _b : 0;
            const rev = (_d = (_c = pairCents.get(toId)) === null || _c === void 0 ? void 0 : _c.get(fromId)) !== null && _d !== void 0 ? _d : 0;
            const net = fwd - rev;
            if (net > 0 && userMap.has(fromId) && userMap.has(toId)) {
                result.push({
                    fromUserId: fromId,
                    fromUserName: userMap.get(fromId).name,
                    toUserId: toId,
                    toUserName: userMap.get(toId).name,
                    amount: fromCents(net),
                });
            }
            else if (net < 0 && userMap.has(fromId) && userMap.has(toId)) {
                result.push({
                    fromUserId: toId,
                    fromUserName: userMap.get(toId).name,
                    toUserId: fromId,
                    toUserName: userMap.get(fromId).name,
                    amount: fromCents(-net),
                });
            }
        }
    }
    return result;
}
exports.balanceService = { getGroupBalances };
