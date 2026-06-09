"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventEmitter = void 0;
const events_1 = require("events");
class TypedEventEmitter extends events_1.EventEmitter {
    emit(eventName, ...args) {
        return super.emit(eventName, ...args);
    }
    on(eventName, listener) {
        return super.on(eventName, listener);
    }
}
exports.eventEmitter = new TypedEventEmitter();
