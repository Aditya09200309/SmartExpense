"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./modules/auth/auth.routes"));
const user_routes_1 = __importDefault(require("./modules/user/user.routes"));
const group_routes_1 = __importDefault(require("./modules/group/group.routes"));
const expense_routes_1 = __importDefault(require("./modules/expense/expense.routes"));
const balance_routes_1 = __importDefault(require("./modules/balance/balance.routes"));
const settlement_routes_1 = __importDefault(require("./modules/settlement/settlement.routes"));
const intelligence_routes_1 = __importDefault(require("./modules/intelligence/intelligence.routes"));
const auth_middleware_1 = require("./middleware/auth.middleware");
const events_1 = require("./lib/events");
const event_handlers_1 = require("./modules/intelligence/event.handlers");
// Initialize event listeners
events_1.eventEmitter.on('ExpenseAdded', event_handlers_1.eventHandlers.handleExpenseAdded);
events_1.eventEmitter.on('SettlementRecorded', event_handlers_1.eventHandlers.handleSettlementRecorded);
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin)
            return callback(null, true);
        if (/^http:\/\/localhost:(5173|5174|5175)$/.test(origin)) {
            return callback(null, true);
        }
        if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    }
}));
app.use(express_1.default.json());
app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});
// Public
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
// Protected
app.use('/api/groups', auth_middleware_1.authenticate, group_routes_1.default);
app.use('/api/expenses', auth_middleware_1.authenticate, expense_routes_1.default);
app.use('/api/groups', auth_middleware_1.authenticate, balance_routes_1.default);
app.use('/api/settlements', auth_middleware_1.authenticate, settlement_routes_1.default);
app.use('/api/intelligence', auth_middleware_1.authenticate, intelligence_routes_1.default);
exports.default = app;
