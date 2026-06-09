"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const settlement_controller_1 = require("./settlement.controller");
const router = (0, express_1.Router)();
router.post('/', settlement_controller_1.settlementController.createSettlement);
exports.default = router;
