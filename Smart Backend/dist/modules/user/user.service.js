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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = __importDefault(require("../../lib/prisma"));
const USER_SELECT = {
    id: true,
    name: true,
    email: true,
    createdAt: true,
};
function createUser(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const normalizedEmail = input.email.toLowerCase().trim();
        const existing = yield prisma_1.default.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
        });
        if (existing) {
            const err = new Error('Email is already in use');
            err.name = 'EMAIL_TAKEN';
            throw err;
        }
        const passwordHash = yield bcryptjs_1.default.hash(input.password, 10);
        const user = yield prisma_1.default.user.create({
            data: {
                name: input.name.trim(),
                email: normalizedEmail,
                passwordHash,
            },
            select: USER_SELECT,
        });
        return user;
    });
}
function getUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma_1.default.user.findMany({
            select: USER_SELECT,
            orderBy: { createdAt: 'asc' },
        });
    });
}
function getUserById(id) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma_1.default.user.findUnique({
            where: { id },
            select: USER_SELECT,
        });
    });
}
exports.userService = { createUser, getUsers, getUserById };
