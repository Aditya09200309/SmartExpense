"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_controller_1 = require("./user.controller");
const auth_middleware_1 = require("../../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.post('/', user_controller_1.userController.createUser); // public: registration
router.get('/', auth_middleware_1.authenticate, user_controller_1.userController.getUsers); // protected: frontend dropdowns
router.get('/:id', auth_middleware_1.authenticate, user_controller_1.userController.getUserById); // protected
exports.default = router;
