"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// @ts-nocheck
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const express_list_endpoints_1 = __importDefault(require("express-list-endpoints"));
// ==== STATIC IMPORT ROUTERS (no more .ts/.js drama) ====
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const products_1 = __importDefault(require("./routes/products"));
const entries_1 = __importDefault(require("./routes/entries"));
const ipqc_1 = __importDefault(require("./routes/ipqc"));
const oqc_1 = __importDefault(require("./routes/oqc"));
const history_1 = __importDefault(require("./routes/history"));
const admin_aggregate_1 = __importDefault(require("./routes/admin.aggregate"));
const summary_1 = require("./routes/summary");
exports.app = (0, express_1.default)();
/* =========================
 *  SERVER BASICS
 * ========================= */
exports.app.set("trust proxy", true); // penting untuk cookie/session di belakang proxy (Vercel/Railway)
/* =========================
 *  CORS (DEV + PROD)
 * ========================= */
const allowlist = [
    process.env.CLIENT_ORIGIN, // ex: https://stocksys-client.vercel.app
    "http://localhost:5173", // Vite dev
    "http://127.0.0.1:5173",
].filter(Boolean);
const corsOptions = {
    origin(origin, cb) {
        // izinkan tools seperti curl/Postman/no-origin
        if (!origin)
            return cb(null, true);
        if (allowlist.includes(origin))
            return cb(null, true);
        return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
};
exports.app.use((0, cors_1.default)(corsOptions));
// pastikan preflight pakai konfigurasi yang sama
exports.app.options("*", (0, cors_1.default)(corsOptions));
/* =========================
 *  BODY & COOKIE PARSER
 * ========================= */
exports.app.use(express_1.default.json({ limit: "2mb" }));
exports.app.use((0, cookie_parser_1.default)());
/* =========================
 *  LOGGER
 * ========================= */
exports.app.use((req, _res, next) => {
    console.log(`[REQ] ${req.method} ${req.path}`);
    next();
});
/* =========================
 *  HEALTH
 * ========================= */
exports.app.get("/", (_req, res) => res.json({ ok: true, service: "StockSys API", hint: "try /health or /ping" }));
exports.app.get("/ping", (_req, res) => res.json({ pong: true }));
exports.app.get("/health", (_req, res) => res.json({ ok: true, service: "StockSys API" }));
exports.app.get("/favicon.ico", (_req, res) => res.status(204).end());
/* =========================
 *  ROUTES (STATIC MOUNT)
 * ========================= */
// ---- AUTH: dukung /api/auth/* dan /auth/* (alias untuk FE lama)
exports.app.use("/api/auth", auth_1.default);
exports.app.use("/auth", auth_1.default); // alias agar POST /auth/login juga jalan
// ---- USERS & PRODUCTS
exports.app.use("/api/users", users_1.default);
exports.app.use("/api/products", products_1.default);
// ---- SUMMARY
exports.app.use("/api/summary", summary_1.summaryRouter);
exports.app.use("/api/ipqc/summary", summary_1.ipqcSummaryRouter); // konsisten: /api/ipqc/summary
// ---- IPQC/OQC & entries & history
exports.app.use("/api/entries", entries_1.default);
exports.app.use("/api/ipqc", ipqc_1.default);
exports.app.use("/api/oqc", oqc_1.default);
exports.app.use("/api/history", history_1.default);
// ---- ADMIN AGGREGATE
exports.app.use("/api/admin", admin_aggregate_1.default);
console.log("✅ Routers mounted");
try {
    console.table((0, express_list_endpoints_1.default)(exports.app));
}
catch (_) {
    // ignore if module not present
}
/* =========================
 *  404 & ERROR HANDLER
 * ========================= */
exports.app.use((_req, res) => res.status(404).json({ error: "Not Found" }));
// error handler harus 4 args
exports.app.use((err, _req, res, _next) => {
    console.error(err instanceof Error ? err.stack || err.message : err);
    if (!res.headersSent)
        res.status(500).json({ error: "Internal Server Error" });
});
/* =========================
 *  START (LOCAL) & EXPORT (VERCEL)
 * ========================= */
if (!process.env.VERCEL) {
    const PORT = Number(process.env.PORT) || 3001;
    exports.app.listen(PORT, () => console.log(`✅ API running at http://localhost:${PORT}`));
}
exports.default = exports.app;
