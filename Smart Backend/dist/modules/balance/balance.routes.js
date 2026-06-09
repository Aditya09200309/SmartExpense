"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const balance_controller_1 = require("./balance.controller");
const router = (0, express_1.Router)();
router.get('/:groupId/balances', balance_controller_1.balanceController.getGroupBalances);
exports.default = router;
