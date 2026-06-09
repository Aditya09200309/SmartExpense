"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function authenticate(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!(authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith('Bearer '))) {
        res.status(401).json({ error: 'Authentication required' });
        return;
    }
    const token = authHeader.slice(7);
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        res.status(500).json({ error: 'Server misconfiguration' });
        return;
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, secret);
        req.user = { userId: payload.userId };
        next();
    }
    catch (_a) {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}
