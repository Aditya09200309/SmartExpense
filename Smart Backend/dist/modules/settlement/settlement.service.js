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
exports.settlementService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const client_1 = require("../../generated/prisma/client");
const balance_service_1 = require("../balance/balance.service");
const SETTLEMENT_SELECT = {
    id: true,
    groupId: true,
    amount: true,
    note: true,
    settledAt: true,
    payer: {
        select: { id: true, name: true, email: true },
    },
    receiver: {
        select: { id: true, name: true, email: true },
    },
};
const events_1 = require("../../lib/events");
function createSettlement(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const settlement = yield prisma_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            // getGroupBalances throws GROUP_NOT_FOUND or NOT_MEMBER if the group doesn't
            // exist or the payer is not a member — both propagate to the controller.
            const balances = yield balance_service_1.balanceService.getGroupBalances(input.groupId, input.payerId, tx);
            // Verify receiver is a current member of the group.
            const receiverInGroup = balances.netBalances.some(b => b.userId === input.receiverId);
            if (!receiverInGroup) {
                const err = new Error('Receiver is not a member of this group');
                err.name = 'RECEIVER_NOT_MEMBER';
                throw err;
            }
            // There must be a simplified debt from payer → receiver right now.
            const debt = balances.simplifiedDebts.find(d => d.fromUserId === input.payerId && d.toUserId === input.receiverId);
            if (!debt) {
                const err = new Error('You do not currently owe this person in this group');
                err.name = 'NO_DEBT_OWED';
                throw err;
            }
            // Settlement cannot exceed the outstanding simplified debt.
            const debtCents = Math.round(debt.amount * 100);
            const amountCents = Math.round(input.amount * 100);
            if (amountCents > debtCents) {
                const err = new Error(`Settlement amount exceeds the amount currently owed (${debt.amount.toFixed(2)})`);
                err.name = 'AMOUNT_EXCEEDS_OWED';
                throw err;
            }
            return tx.settlement.create({
                data: {
                    groupId: input.groupId,
                    payerId: input.payerId,
                    receiverId: input.receiverId,
                    amount: input.amount,
                    note: ((_a = input.note) === null || _a === void 0 ? void 0 : _a.trim()) || null,
                },
                select: SETTLEMENT_SELECT,
            });
        }), { isolationLevel: client_1.Prisma.TransactionIsolationLevel.Serializable });
        // Emit event after successful transaction
        events_1.eventEmitter.emit('SettlementRecorded', {
            type: 'SettlementRecorded',
            version: '1.0',
            timestamp: Date.now(),
            data: {
                settlementId: settlement.id,
                groupId: settlement.groupId,
                payerId: settlement.payer.id,
                receiverId: settlement.receiver.id,
                amount: Number(settlement.amount)
            }
        });
        return settlement;
    });
}
exports.settlementService = { createSettlement };
