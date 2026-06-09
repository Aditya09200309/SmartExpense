"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const expense_controller_1 = require("./expense.controller");
const router = (0, express_1.Router)();
router.post('/', expense_controller_1.expenseController.createExpense);
exports.default = router;
