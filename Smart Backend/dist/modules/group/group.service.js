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
exports.groupService = void 0;
const prisma_1 = __importDefault(require("../../lib/prisma"));
const GROUP_LIST_SELECT = {
    id: true,
    name: true,
    description: true,
    createdAt: true,
};
const MEMBER_SELECT = {
    id: true,
    role: true,
    joinedAt: true,
    user: {
        select: {
            id: true,
            name: true,
            email: true,
        },
    },
};
const GROUP_SELECT = {
    id: true,
    name: true,
    description: true,
    createdAt: true,
    createdById: true,
    members: {
        select: MEMBER_SELECT,
    },
};
function createGroup(input) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            var _a;
            const user = yield tx.user.findUnique({
                where: { id: input.createdById },
                select: { id: true },
            });
            if (!user) {
                const err = new Error('User not found');
                err.name = 'USER_NOT_FOUND';
                throw err;
            }
            return tx.group.create({
                data: {
                    name: input.name.trim(),
                    description: (_a = input.description) === null || _a === void 0 ? void 0 : _a.trim(),
                    createdById: input.createdById,
                    members: {
                        create: {
                            userId: input.createdById,
                            role: 'ADMIN',
                        },
                    },
                },
                select: GROUP_SELECT,
            });
        }));
    });
}
function getGroupById(id, requesterId) {
    return __awaiter(this, void 0, void 0, function* () {
        const group = yield prisma_1.default.group.findUnique({
            where: { id },
            select: GROUP_SELECT,
        });
        if (!group) {
            const err = new Error('Group not found');
            err.name = 'GROUP_NOT_FOUND';
            throw err;
        }
        const membership = yield prisma_1.default.groupMember.findUnique({
            where: { userId_groupId: { userId: requesterId, groupId: id } },
            select: { id: true },
        });
        if (!membership) {
            const err = new Error('You are not a member of this group');
            err.name = 'NOT_MEMBER';
            throw err;
        }
        return group;
    });
}
function addMember(input) {
    return __awaiter(this, void 0, void 0, function* () {
        return prisma_1.default.$transaction((tx) => __awaiter(this, void 0, void 0, function* () {
            const group = yield tx.group.findUnique({
                where: { id: input.groupId },
                select: { id: true },
            });
            if (!group) {
                const err = new Error('Group not found');
                err.name = 'GROUP_NOT_FOUND';
                throw err;
            }
            const requester = yield tx.groupMember.findUnique({
                where: { userId_groupId: { userId: input.requesterId, groupId: input.groupId } },
                select: { role: true },
            });
            if (!requester) {
                const err = new Error('You are not a member of this group');
                err.name = 'NOT_MEMBER';
                throw err;
            }
            if (requester.role !== 'ADMIN') {
                const err = new Error('Only admins can add members');
                err.name = 'NOT_ADMIN';
                throw err;
            }
            const user = yield tx.user.findUnique({
                where: { id: input.userId },
                select: { id: true },
            });
            if (!user) {
                const err = new Error('User not found');
                err.name = 'USER_NOT_FOUND';
                throw err;
            }
            const existing = yield tx.groupMember.findUnique({
                where: { userId_groupId: { userId: input.userId, groupId: input.groupId } },
                select: { id: true },
            });
            if (existing) {
                const err = new Error('User is already a member of this group');
                err.name = 'ALREADY_MEMBER';
                throw err;
            }
            return tx.groupMember.create({
                data: {
                    userId: input.userId,
                    groupId: input.groupId,
                    role: 'MEMBER',
                },
                select: MEMBER_SELECT,
            });
        }));
    });
}
function getAllGroups(requesterId) {
    return __awaiter(this, void 0, void 0, function* () {
        const rows = yield prisma_1.default.group.findMany({
            where: { members: { some: { userId: requesterId } } },
            select: {
                id: true,
                name: true,
                description: true,
                createdAt: true,
                members: { where: { userId: requesterId }, select: { role: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        return rows.map(g => {
            var _a, _b, _c;
            return ({
                id: g.id,
                name: g.name,
                description: (_a = g.description) !== null && _a !== void 0 ? _a : undefined,
                createdAt: g.createdAt,
                currentUserRole: ((_c = (_b = g.members[0]) === null || _b === void 0 ? void 0 : _b.role) !== null && _c !== void 0 ? _c : 'MEMBER'),
            });
        });
    });
}
function getGroupMembers(groupId, requesterId) {
    return __awaiter(this, void 0, void 0, function* () {
        const group = yield prisma_1.default.group.findUnique({
            where: { id: groupId },
            select: { id: true },
        });
        if (!group) {
            const err = new Error('Group not found');
            err.name = 'GROUP_NOT_FOUND';
            throw err;
        }
        const membership = yield prisma_1.default.groupMember.findUnique({
            where: { userId_groupId: { userId: requesterId, groupId } },
            select: { id: true },
        });
        if (!membership) {
            const err = new Error('You are not a member of this group');
            err.name = 'NOT_MEMBER';
            throw err;
        }
        const members = yield prisma_1.default.groupMember.findMany({
            where: { groupId },
            select: {
                user: {
                    select: { id: true, name: true, email: true },
                },
            },
        });
        return members.map((m) => m.user);
    });
}
exports.groupService = { createGroup, getGroupById, getAllGroups, getGroupMembers, addMember };
