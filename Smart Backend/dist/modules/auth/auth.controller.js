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
exports.authController = void 0;
const auth_service_1 = require("./auth.service");
const user_service_1 = require("../user/user.service");
function me(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const user = yield user_service_1.userService.getUserById(req.user.userId);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({ user });
        }
        catch (err) {
            console.error('[me]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function login(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { email, password } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: 'email and password are required' });
            return;
        }
        try {
            const result = yield auth_service_1.authService.login(email, password);
            res.json(result);
        }
        catch (err) {
            if (err instanceof Error && err.name === 'INVALID_CREDENTIALS') {
                res.status(401).json({ error: err.message });
                return;
            }
            console.error('[login]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
exports.authController = { login, me };
