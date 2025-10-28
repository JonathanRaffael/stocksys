"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const verifyToken = (req, res, next) => {
    // jangan tahan preflight
    if (req.method === "OPTIONS")
        return next();
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!token) {
        return res.status(401).json({ error: "Missing Authorization header" });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const { sub } = payload;
        const role = payload.role;
        if (!sub || !role) {
            return res.status(401).json({ error: "Invalid token payload" });
        }
        // cocokkan dengan typing kamu
        req.user = { id: String(sub), role };
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
};
exports.verifyToken = verifyToken;
