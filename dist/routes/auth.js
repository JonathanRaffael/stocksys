"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = verifyToken;
// @ts-nocheck
const express_1 = require("express");
const client_1 = __importDefault(require("@prisma/client"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const { PrismaClient } = client_1.default;
const prisma = new PrismaClient();
const router = (0, express_1.Router)();
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(4),
});
function makeJwt(user) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        console.warn("[WARN] JWT_SECRET tidak terisi. Harap set di .env / platform deploy.");
    return jsonwebtoken_1.default.sign({ role: user.role }, secret || "supersecretkey", // DEV fallback
    { subject: user.id, expiresIn: "7d" });
}
// POST /api/auth/login
router.post("/login", async (req, res) => {
    try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.issues });
        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;
        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, name: true, email: true, role: true, password: true },
        });
        if (!user)
            return res.status(401).json({ error: "Email or password invalid" });
        const ok = await bcrypt_1.default.compare(password, user.password);
        if (!ok)
            return res.status(401).json({ error: "Email or password invalid" });
        const token = makeJwt(user);
        const useCookie = String(process.env.AUTH_USE_COOKIE || "").toLowerCase() === "true";
        if (useCookie) {
            const isProd = process.env.NODE_ENV === "production";
            res.cookie("token", token, {
                httpOnly: true,
                sameSite: isProd ? "none" : "lax",
                secure: isProd,
                maxAge: 7 * 24 * 60 * 60 * 1000,
                path: "/",
            });
            return res.json({
                message: "Login success",
                user: { id: user.id, name: user.name, email: user.email, role: user.role },
            });
        }
        return res.json({
            message: "Login success",
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role },
        });
    }
    catch (err) {
        console.error("Login error:", err);
        if (err?.issues)
            return res.status(400).json({ error: err.issues });
        return res.status(500).json({ error: "Login failed" });
    }
});
// Middleware verifikasi token (opsional untuk routes lain)
function verifyToken(req, res, next) {
    if (req.method === "OPTIONS")
        return next();
    const useCookie = String(process.env.AUTH_USE_COOKIE || "").toLowerCase() === "true";
    let token = "";
    if (useCookie) {
        token = req.cookies?.token || "";
    }
    else {
        const auth = req.headers.authorization || "";
        if (auth.startsWith("Bearer "))
            token = auth.slice(7).trim();
    }
    if (!token)
        return res.status(401).json({ error: "Missing token" });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || "supersecretkey");
        const { sub } = decoded;
        const role = decoded?.role;
        if (!sub || !role)
            return res.status(401).json({ error: "Invalid token payload" });
        req.user = { id: String(sub), role };
        return next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}
exports.default = router;
