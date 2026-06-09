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
exports.intelligenceController = void 0;
const intelligence_service_1 = require("./intelligence.service");
const socialBalance_engine_1 = require("./socialBalance.engine");
function getUserIntelligence(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = req.params.userId;
            const data = yield intelligence_service_1.intelligenceService.getUserIntelligence(userId);
            res.json(data);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to fetch user intelligence' });
        }
    });
}
function getGroupIntelligence(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const groupId = req.params.groupId;
            const data = yield intelligence_service_1.intelligenceService.getGroupIntelligence(groupId);
            res.json(data);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to fetch group intelligence' });
        }
    });
}
function getUserLongitudinalStats(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const userId = req.params.userId;
            const data = yield intelligence_service_1.intelligenceService.getUserLongitudinalStats(userId);
            res.json(data);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to fetch longitudinal stats' });
        }
    });
}
function getSocialBalanceInsight(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const groupId = req.params.groupId;
            const data = yield (0, socialBalance_engine_1.getSocialBalanceInsight)(groupId);
            res.json(data);
        }
        catch (error) {
            res.status(500).json({ error: 'Failed to fetch social balance insight' });
        }
    });
}
exports.intelligenceController = {
    getUserIntelligence,
    getGroupIntelligence,
    getUserLongitudinalStats,
    getSocialBalanceInsight
};
