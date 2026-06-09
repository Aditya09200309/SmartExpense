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
exports.groupController = void 0;
const group_service_1 = require("./group.service");
function createGroup(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const { name, description } = req.body;
        const createdById = req.user.userId;
        if (!(name === null || name === void 0 ? void 0 : name.trim())) {
            res.status(400).json({ error: 'name is required' });
            return;
        }
        try {
            const group = yield group_service_1.groupService.createGroup({ name, description, createdById });
            res.status(201).json({ group });
        }
        catch (err) {
            if (err instanceof Error && err.name === 'USER_NOT_FOUND') {
                res.status(404).json({ error: err.message });
                return;
            }
            console.error('[createGroup]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function getGroupById(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const id = req.params['id'];
        const requesterId = req.user.userId;
        try {
            const group = yield group_service_1.groupService.getGroupById(id, requesterId);
            res.json({ group });
        }
        catch (err) {
            if (err instanceof Error) {
                if (err.name === 'GROUP_NOT_FOUND') {
                    res.status(404).json({ error: err.message });
                    return;
                }
                if (err.name === 'NOT_MEMBER') {
                    res.status(403).json({ error: err.message });
                    return;
                }
            }
            console.error('[getGroupById]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function addMember(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const groupId = req.params['groupId'];
        const { userId } = req.body;
        const requesterId = req.user.userId;
        if (!userId) {
            res.status(400).json({ error: 'userId is required' });
            return;
        }
        try {
            const member = yield group_service_1.groupService.addMember({ groupId, userId, requesterId });
            res.status(201).json({ member });
        }
        catch (err) {
            if (err instanceof Error) {
                if (err.name === 'GROUP_NOT_FOUND' || err.name === 'USER_NOT_FOUND') {
                    res.status(404).json({ error: err.message });
                    return;
                }
                if (err.name === 'NOT_MEMBER' || err.name === 'NOT_ADMIN') {
                    res.status(403).json({ error: err.message });
                    return;
                }
                if (err.name === 'ALREADY_MEMBER') {
                    res.status(409).json({ error: err.message });
                    return;
                }
            }
            console.error('[addMember]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function getAllGroups(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const requesterId = req.user.userId;
        try {
            const groups = yield group_service_1.groupService.getAllGroups(requesterId);
            res.json({ groups });
        }
        catch (err) {
            console.error('[getAllGroups]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
function getGroupMembers(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const groupId = req.params['groupId'];
        const requesterId = req.user.userId;
        try {
            const members = yield group_service_1.groupService.getGroupMembers(groupId, requesterId);
            res.json({ members });
        }
        catch (err) {
            if (err instanceof Error) {
                if (err.name === 'GROUP_NOT_FOUND') {
                    res.status(404).json({ error: err.message });
                    return;
                }
                if (err.name === 'NOT_MEMBER') {
                    res.status(403).json({ error: err.message });
                    return;
                }
            }
            console.error('[getGroupMembers]', err);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
}
exports.groupController = { createGroup, getGroupById, getAllGroups, getGroupMembers, addMember };
