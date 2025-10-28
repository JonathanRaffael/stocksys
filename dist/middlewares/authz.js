"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.requireAuth = void 0;
/** Middleware: pastikan sudah login */
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
};
exports.requireAuth = requireAuth;
/** Middleware: pastikan punya role tertentu */
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: "Forbidden (insufficient role)" });
        }
        next();
    };
};
exports.requireRole = requireRole;
