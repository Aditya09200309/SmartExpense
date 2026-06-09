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
exports.balanceController = void 0;
const balance_service_1 = require("./balance.service");
function getGroupBalances(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const groupId = req.params['groupId'];
        const requesterId = req.user.userId;
        try {
            const balances = yield balance_service_1.balanceService.getGroupBalances(groupId, requesterId);
            res.json(balances);
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
            }
            console.error('[getGroupBalances]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
exports.balanceController = { getGroupBalances };
