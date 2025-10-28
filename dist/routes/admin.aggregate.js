"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = __importDefault(require("express"));
const client_1 = __importDefault(require("@prisma/client")); // ⬅️ default import (ESM-safe)
const auth_js_1 = require("./auth.js");
const authz_js_1 = require("../middlewares/authz.js");
const { PrismaClient, Role } = client_1.default; // ⬅️ ambil value runtime & types dari default
const prisma = new PrismaClient();
const router = express_1.default.Router();
// helper tanggal (date-only)
const asDateOnlyStart = (s) => new Date(`${s}T00:00:00.000Z`);
const asDateOnlyEnd = (s) => new Date(`${s}T23:59:59.999Z`);
router.get("/aggregate-by-product", auth_js_1.verifyToken, authz_js_1.requireAuth, (0, authz_js_1.requireRole)(Role.ADMIN, Role.MASTER), // ⬅️ tetap bisa pakai enum runtime
(async (req, res) => {
    try {
        const date = String(req.query.date || "");
        const dateFrom = String(req.query.dateFrom || "");
        const dateTo = String(req.query.dateTo || "");
        const plant = String(req.query.plant || "");
        const line = String(req.query.line || "");
        const order = (String(req.query.order || "desc") === "asc" ? "asc" : "desc");
        const take = Math.min(Math.max(Number(req.query.take || 100), 1), 1000);
        const where = {};
        if (date) {
            where.date = { gte: asDateOnlyStart(date), lte: asDateOnlyEnd(date) };
        }
        else if (dateFrom || dateTo) {
            where.date = {};
            if (dateFrom)
                where.date.gte = asDateOnlyStart(dateFrom);
            if (dateTo)
                where.date.lte = asDateOnlyEnd(dateTo);
        }
        if (plant)
            where.plant = plant;
        if (line)
            where.line = line;
        const grouped = await prisma.dailyEntry.groupBy({
            by: ["productId"],
            where,
            _sum: {
                beforeOqc: true,
                afterOqc: true,
                onHoldOrReturn: true,
                beforeIpqc: true,
                afterIpqc: true,
                onGoingPostcured: true,
                afterPostcured: true,
            },
        });
        const productIds = grouped.map(g => g.productId).filter(Boolean);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true, computerCode: true, name: true, size: true, uom: true, isActive: true
            },
        });
        const byId = new Map(products.map(p => [p.id, p]));
        const rows = grouped.map((g) => {
            const p = g.productId ? byId.get(g.productId) : undefined;
            const beforeOqc = g._sum.beforeOqc ?? 0;
            const afterOqc = g._sum.afterOqc ?? 0;
            const hold = g._sum.onHoldOrReturn ?? 0;
            const totalOk = afterOqc;
            const belumOkCore = Math.max(0, beforeOqc - afterOqc);
            const totalBelumOk = belumOkCore + hold;
            return {
                productId: g.productId ?? null,
                productCode: p?.computerCode ?? "",
                productName: p?.name ?? "",
                productSize: p?.size ? (p?.uom ? `${p.size} ${p.uom}` : p.size) : null,
                isActive: p?.isActive ?? false,
                beforeOqc,
                afterOqc,
                hold,
                beforeIpqc: g._sum.beforeIpqc ?? 0,
                afterIpqc: g._sum.afterIpqc ?? 0,
                beforePostcured: g._sum.onGoingPostcured ?? 0,
                afterPostcured: g._sum.afterPostcured ?? 0,
                totalOk,
                totalBelumOk,
            };
        });
        rows.sort((a, b) => order === "asc" ? a.totalOk - b.totalOk : b.totalOk - a.totalOk);
        const grand = rows.reduce((acc, r) => {
            acc.totalOk += r.totalOk;
            acc.totalBelumOk += r.totalBelumOk;
            acc.afterIpqc += r.afterIpqc;
            acc.afterPostcured += r.afterPostcured;
            acc.beforeOqc += r.beforeOqc;
            acc.afterOqc += r.afterOqc;
            acc.hold += r.hold;
            return acc;
        }, { totalOk: 0, totalBelumOk: 0, afterIpqc: 0, afterPostcured: 0, beforeOqc: 0, afterOqc: 0, hold: 0 });
        return res.json({
            items: rows.slice(0, take),
            totalProducts: rows.length,
            grand,
        });
    }
    catch (e) {
        console.error("[admin] GET /aggregate-by-product error:", e);
        return res.status(500).json({ error: e instanceof Error ? e.message : "Failed to aggregate" });
    }
}));
exports.default = router;
