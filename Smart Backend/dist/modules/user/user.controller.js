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
exports.userController = void 0;
const user_service_1 = require("./user.service");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function createUser(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            res.status(400).json({ error: 'name, email, and password are required' });
            return;
        }
        if (!EMAIL_REGEX.test(email)) {
            res.status(400).json({ error: 'Invalid email format' });
            return;
        }
        if (password.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }
        try {
            const user = yield user_service_1.userService.createUser({ name, email, password });
            res.status(201).json({ user });
        }
        catch (err) {
            if (err instanceof Error && err.name === 'EMAIL_TAKEN') {
                res.status(409).json({ error: err.message });
                return;
            }
            console.error('[createUser]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function getUsers(_req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const users = yield user_service_1.userService.getUsers();
            res.json({ users });
        }
        catch (err) {
            console.error('[getUsers]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function getUserById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = req.params['id'];
        try {
            const user = yield user_service_1.userService.getUserById(id);
            if (!user) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            res.json({ user });
        }
        catch (err) {
            console.error('[getUserById]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
exports.userController = { createUser, getUsers, getUserById };
