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
exports.settlementController = void 0;
const settlement_service_1 = require("./settlement.service");
function createSettlement(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { groupId, receiverId, amount, note, payerId: explicitPayerId } = req.body;
        const requesterId = req.user.userId;
        const payerId = explicitPayerId !== null && explicitPayerId !== void 0 ? explicitPayerId : requesterId;
        if (!groupId || !receiverId) {
            res.status(400).json({ error: 'groupId and receiverId are required' });
            return;
        }
        if (payerId === receiverId) {
            res.status(400).json({ error: 'You cannot settle with yourself' });
            return;
        }
        if (requesterId !== payerId && requesterId !== receiverId) {
            res.status(403).json({ error: 'You can only settle debts you are a party to' });
            return;
        }
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0.01 || amount > 9999999.99) {
            res.status(400).json({ error: 'amount must be between 0.01 and 9,999,999.99' });
            return;
        }
        if (note !== undefined && typeof note !== 'string') {
            res.status(400).json({ error: 'note must be a string' });
            return;
        }
        try {
            const settlement = yield settlement_service_1.settlementService.createSettlement({
                groupId,
                payerId,
                receiverId,
                amount,
                note,
            });
            res.status(201).json({ settlement });
        }
        catch (err) {
            if (err instanceof Error) {
                if (err.name === 'GROUP_NOT_FOUND') {
                    res.status(404).json({ error: err.message });
                    return;
                }
                // NOT_MEMBER means payer is not in the group (thrown by balanceService)
                if (err.name === 'NOT_MEMBER' || err.name === 'PAYER_NOT_MEMBER') {
                    res.status(403).json({ error: err.message });
                    return;
                }
                if (err.name === 'RECEIVER_NOT_MEMBER') {
                    res.status(422).json({ error: err.message });
                    return;
                }
                if (err.name === 'NO_DEBT_OWED') {
                    res.status(422).json({ error: err.message });
                    return;
                }
                if (err.name === 'AMOUNT_EXCEEDS_OWED') {
                    res.status(422).json({ error: err.message });
                    return;
                }
            }
            console.error('[createSettlement]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
exports.settlementController = { createSettlement };
