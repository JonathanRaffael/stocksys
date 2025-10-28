"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = oqcRouter;
// @ts-nocheck
const express_1 = __importDefault(require("express"));
const client_1 = __importDefault(require("@prisma/client"));
// ✅ Prisma import aman untuk ESM/Vercel
const { PrismaClient } = client_1.default;
const prismaDefault = new PrismaClient();
const SHIFT = new Set(["S1", "S2", "S3"]);
// Helper parse tanggal @db.Date (UTC-safe)
function parseDateOnly(ymd) {
    if (!ymd)
        throw new Error("date required");
    const d = new Date(`${ymd}T00:00:00.000Z`);
    if (isNaN(d.getTime()))
        throw new Error("invalid date format (expected YYYY-MM-DD)");
    return d;
}
// Factory supaya bisa test / reuse prisma instance
function oqcRouter(prisma = prismaDefault) {
    const router = express_1.default.Router();
    // GET /api/oqc/summary?date=YYYY-MM-DD&shift=S1&plant=&line=
    router.get("/summary", async (req, res) => {
        try {
            res.setHeader("Cache-Control", "no-store");
            const dateStr = String(req.query.date || "");
            const shift = String(req.query.shift || "");
            const plant = req.query.plant || undefined;
            const line = req.query.line || undefined;
            if (!dateStr)
                return res.status(400).json({ error: "date required (YYYY-MM-DD)" });
            if (!SHIFT.has(shift))
                return res.status(400).json({ error: "shift must be S1|S2|S3" });
            const date = parseDateOnly(dateStr);
            const where = { date, shift };
            if (plant)
                where.plant = plant;
            if (line)
                where.line = line;
            const agg = await prisma.dailyEntry.aggregate({
                where,
                _sum: {
                    beforeOqc: true,
                    afterOqc: true,
                    onHoldOrReturn: true,
                },
            });
            return res.json({
                totalBeforeOqc: agg._sum.beforeOqc ?? 0,
                totalAfterOqc: agg._sum.afterOqc ?? 0,
                totalHoldOrReturn: agg._sum.onHoldOrReturn ?? 0,
            });
        }
        catch (e) {
            console.error("GET /api/oqc/summary error:", e);
            return res.status(500).json({ error: e?.message || "Failed to generate OQC summary" });
        }
    });
    return router;
}
