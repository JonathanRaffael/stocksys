"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ipqcRouter;
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
function ipqcRouter(prisma = prismaDefault) {
    const router = express_1.default.Router();
    // GET /api/ipqc/summary?date=YYYY-MM-DD&shift=S1&plant=&line=
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
                    beforeIpqc: true,
                    afterIpqc: true,
                    onGoingPostcured: true,
                    afterPostcured: true,
                },
            });
            return res.json({
                totalBeforeIpqc: agg._sum.beforeIpqc ?? 0,
                totalAfterIpqc: agg._sum.afterIpqc ?? 0,
                totalOnGoingPostcured: agg._sum.onGoingPostcured ?? 0,
                totalAfterPostcured: agg._sum.afterPostcured ?? 0,
            });
        }
        catch (e) {
            console.error("GET /api/ipqc/summary error:", e);
            return res.status(500).json({ error: e?.message || "Failed to generate IPQC summary" });
        }
    });
    return router;
}
