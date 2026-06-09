"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const intelligence_controller_1 = require("./intelligence.controller");
const router = (0, express_1.Router)();
// Read-only endpoints for intelligence data
router.get('/users/:userId', intelligence_controller_1.intelligenceController.getUserIntelligence);
router.get('/users/:userId/longitudinal', intelligence_controller_1.intelligenceController.getUserLongitudinalStats);
router.get('/groups/:groupId', intelligence_controller_1.intelligenceController.getGroupIntelligence);
router.get('/groups/:groupId/balance-insight', intelligence_controller_1.intelligenceController.getSocialBalanceInsight);
exports.default = router;
