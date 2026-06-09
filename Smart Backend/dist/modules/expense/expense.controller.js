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
Object.defineProperty(exports, "__esModule", { value: true });
exports.expenseController = void 0;
const expense_service_1 = require("./expense.service");
function createExpense(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { groupId, amount, description, category, splits, paidById: bodyPaidById } = req.body;
        const paidById = typeof bodyPaidById === 'string' && bodyPaidById.trim()
            ? bodyPaidById
            : req.user.userId;
        if (!groupId || !(description === null || description === void 0 ? void 0 : description.trim()) || amount === undefined || amount === null) {
            res.status(400).json({ error: 'groupId, description, and amount are required' });
            return;
        }
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0.01 || amount > 9999999.99) {
            res.status(400).json({ error: 'amount must be between 0.01 and 9,999,999.99' });
            return;
        }
        if (!Array.isArray(splits) || splits.length === 0) {
            res.status(400).json({ error: 'splits must be a non-empty array' });
            return;
        }
        for (const split of splits) {
            if (!split.userId || typeof split.amount !== 'number' || split.amount < 0.01) {
                res.status(400).json({ error: 'each split must have a userId and an amount of at least 0.01' });
                return;
            }
        }
        const splitUserIds = splits.map((s) => s.userId);
        if (new Set(splitUserIds).size !== splitUserIds.length) {
            res.status(400).json({ error: 'splits cannot contain duplicate userIds' });
            return;
        }
        try {
            const expense = yield expense_service_1.expenseService.createExpense({
                groupId,
                requesterId: req.user.userId,
                paidById,
                amount,
                description,
                category,
                splits,
            });
            res.status(201).json({ expense });
        }
        catch (err) {
            if (err instanceof Error) {
                if (err.name === 'GROUP_NOT_FOUND') {
                    res.status(404).json({ error: err.message });
                    return;
                }
                if (err.name === 'NOT_MEMBER') {
                    res.status(403).json({ error: err.message });
                    return;
                }
                if (err.name === 'PAYER_NOT_MEMBER') {
                    res.status(403).json({ error: err.message });
                    return;
                }
                if (err.name === 'SPLIT_USER_NOT_MEMBER') {
                    res.status(422).json({ error: err.message });
                    return;
                }
                if (err.name === 'SPLIT_AMOUNT_MISMATCH' || err.name === 'DUPLICATE_SPLIT_USER') {
                    res.status(400).json({ error: err.message });
                    return;
                }
            }
            console.error('[createExpense]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
exports.expenseController = { createExpense };
