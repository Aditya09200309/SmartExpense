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
const vitest_1 = require("vitest");
// Must mock before importing the module under test.
// $transaction must pass `db` as the tx argument so the service callback can
// call tx.settlement.create — same vi.fn() instance so mockCreate tracks it.
vitest_1.vi.mock('../../lib/prisma', () => {
    const createFn = vitest_1.vi.fn();
    const db = { settlement: { create: createFn } };
    return {
        default: Object.assign({}, db, {
            $transaction: vitest_1.vi.fn((fn) => fn(db)),
        }),
    };
});
vitest_1.vi.mock('../balance/balance.service', () => ({
    balanceService: {
        getGroupBalances: vitest_1.vi.fn(),
    },
}));
const settlement_service_1 = require("./settlement.service");
const balance_service_1 = require("../balance/balance.service");
const prisma_1 = __importDefault(require("../../lib/prisma"));
const mockGetBalances = vitest_1.vi.mocked(balance_service_1.balanceService.getGroupBalances);
const mockCreate = vitest_1.vi.mocked(prisma_1.default.settlement.create);
const GROUP_ID = 'group-1';
const PAYER_ID = 'user-alice';
const RECEIVER_ID = 'user-bob';
const BASE_BALANCES = {
    groupId: GROUP_ID,
    netBalances: [
        { userId: PAYER_ID, name: 'Alice', email: 'alice@t.com', netBalance: -50 },
        { userId: RECEIVER_ID, name: 'Bob', email: 'bob@t.com', netBalance: 50 },
    ],
    simplifiedDebts: [
        {
            fromUserId: PAYER_ID, fromUserName: 'Alice',
            toUserId: RECEIVER_ID, toUserName: 'Bob',
            amount: 50,
        },
    ],
    rawDebts: [
        {
            fromUserId: PAYER_ID, fromUserName: 'Alice',
            toUserId: RECEIVER_ID, toUserName: 'Bob',
            amount: 50,
        },
    ],
    totalExpenses: 0,
    totalSettled: 0,
    activity: [],
};
const CREATED_SETTLEMENT = {
    id: 'settlement-1',
    groupId: GROUP_ID,
    amount: 50,
    note: null,
    settledAt: new Date(),
    payer: { id: PAYER_ID, name: 'Alice', email: 'alice@t.com' },
    receiver: { id: RECEIVER_ID, name: 'Bob', email: 'bob@t.com' },
};
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    mockGetBalances.mockResolvedValue(BASE_BALANCES);
    mockCreate.mockResolvedValue(CREATED_SETTLEMENT);
});
(0, vitest_1.describe)('settlementService.createSettlement', () => {
    (0, vitest_1.it)('creates a valid full settlement', () => __awaiter(void 0, void 0, void 0, function* () {
        const result = yield settlement_service_1.settlementService.createSettlement({
            groupId: GROUP_ID,
            payerId: PAYER_ID,
            receiverId: RECEIVER_ID,
            amount: 50,
        });
        (0, vitest_1.expect)(mockCreate).toHaveBeenCalledOnce();
        (0, vitest_1.expect)(result).toBe(CREATED_SETTLEMENT);
    }));
    (0, vitest_1.it)('creates a valid partial settlement (amount < debt)', () => __awaiter(void 0, void 0, void 0, function* () {
        yield settlement_service_1.settlementService.createSettlement({
            groupId: GROUP_ID,
            payerId: PAYER_ID,
            receiverId: RECEIVER_ID,
            amount: 25,
        });
        (0, vitest_1.expect)(mockCreate).toHaveBeenCalledOnce();
    }));
    (0, vitest_1.it)('rejects when balanceService says the group does not exist', () => __awaiter(void 0, void 0, void 0, function* () {
        const err = Object.assign(new Error('Group not found'), { name: 'GROUP_NOT_FOUND' });
        mockGetBalances.mockRejectedValue(err);
        yield (0, vitest_1.expect)(settlement_service_1.settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50 })).rejects.toMatchObject({ name: 'GROUP_NOT_FOUND' });
        (0, vitest_1.expect)(mockCreate).not.toHaveBeenCalled();
    }));
    (0, vitest_1.it)('rejects when payer is not a member (balanceService throws NOT_MEMBER)', () => __awaiter(void 0, void 0, void 0, function* () {
        const err = Object.assign(new Error('You are not a member of this group'), { name: 'NOT_MEMBER' });
        mockGetBalances.mockRejectedValue(err);
        yield (0, vitest_1.expect)(settlement_service_1.settlementService.createSettlement({ groupId: GROUP_ID, payerId: 'stranger', receiverId: RECEIVER_ID, amount: 50 })).rejects.toMatchObject({ name: 'NOT_MEMBER' });
        (0, vitest_1.expect)(mockCreate).not.toHaveBeenCalled();
    }));
    (0, vitest_1.it)('rejects when receiver is not in netBalances', () => __awaiter(void 0, void 0, void 0, function* () {
        mockGetBalances.mockResolvedValue(Object.assign(Object.assign({}, BASE_BALANCES), { netBalances: BASE_BALANCES.netBalances.filter(b => b.userId !== RECEIVER_ID), simplifiedDebts: [], rawDebts: [], totalExpenses: 0, totalSettled: 0, activity: [] }));
        yield (0, vitest_1.expect)(settlement_service_1.settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50 })).rejects.toMatchObject({ name: 'RECEIVER_NOT_MEMBER' });
        (0, vitest_1.expect)(mockCreate).not.toHaveBeenCalled();
    }));
    (0, vitest_1.it)('rejects when no simplified debt exists from payer to receiver', () => __awaiter(void 0, void 0, void 0, function* () {
        mockGetBalances.mockResolvedValue(Object.assign(Object.assign({}, BASE_BALANCES), { simplifiedDebts: [], rawDebts: [] }));
        yield (0, vitest_1.expect)(settlement_service_1.settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50 })).rejects.toMatchObject({ name: 'NO_DEBT_OWED' });
        (0, vitest_1.expect)(mockCreate).not.toHaveBeenCalled();
    }));
    (0, vitest_1.it)('rejects when amount exceeds the outstanding debt', () => __awaiter(void 0, void 0, void 0, function* () {
        yield (0, vitest_1.expect)(settlement_service_1.settlementService.createSettlement({ groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50.01 })).rejects.toMatchObject({ name: 'AMOUNT_EXCEEDS_OWED' });
        (0, vitest_1.expect)(mockCreate).not.toHaveBeenCalled();
    }));
    (0, vitest_1.it)('allows settlement equal to the exact debt amount', () => __awaiter(void 0, void 0, void 0, function* () {
        yield settlement_service_1.settlementService.createSettlement({
            groupId: GROUP_ID, payerId: PAYER_ID, receiverId: RECEIVER_ID, amount: 50,
        });
        (0, vitest_1.expect)(mockCreate).toHaveBeenCalledOnce();
    }));
});
