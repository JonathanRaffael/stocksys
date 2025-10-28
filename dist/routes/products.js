"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// @ts-nocheck
const express_1 = __importDefault(require("express"));
const client_1 = __importDefault(require("@prisma/client"));
const zod_1 = require("zod");
const auth_js_1 = require("./auth.js");
const authz_js_1 = require("../middlewares/authz.js");
// ✅ Prisma ESM-safe
const { PrismaClient, Prisma } = client_1.default;
const prisma = new PrismaClient();
const router = express_1.default.Router();
// ========= Schemas =========
const productSchema = zod_1.z.object({
    computerCode: zod_1.z.string().min(3),
    name: zod_1.z.string().min(2),
    size: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    uom: zod_1.z.string().optional(),
});
const productPatchSchema = productSchema.partial().extend({
    isActive: zod_1.z.boolean().optional(),
});
// ========= GET /api/products =========
// Support: ?query=...&take=20&page=1&includeInactive=false
router.get("/", async (req, res) => {
    try {
        const schema = zod_1.z.object({
            query: zod_1.z.string().optional(),
            take: zod_1.z.coerce.number().min(1).max(100).optional(),
            page: zod_1.z.coerce.number().min(1).optional(),
            includeInactive: zod_1.z.coerce.boolean().optional(),
        });
        const { query = "", take = 20, page = 1, includeInactive = false } = schema.parse(req.query);
        const or = query
            ? [
                { name: { contains: query, mode: Prisma.QueryMode.insensitive } },
                { computerCode: { contains: query, mode: Prisma.QueryMode.insensitive } },
                { description: { contains: query, mode: Prisma.QueryMode.insensitive } },
            ]
            : [];
        const where = {
            ...(includeInactive ? {} : { isActive: true }),
            ...(or.length ? { OR: or } : {}),
        };
        const [items, total] = await Promise.all([
            prisma.product.findMany({
                where,
                orderBy: [{ isActive: "desc" }, { name: "asc" }],
                take,
                skip: (page - 1) * take,
            }),
            prisma.product.count({ where }),
        ]);
        res.json({
            items,
            page,
            take,
            total,
            pages: Math.max(1, Math.ceil(total / take)),
        });
    }
    catch (err) {
        console.error("GET /products error:", err);
        res.status(400).json({ error: "Invalid query or failed to fetch products" });
    }
});
// ========= GET /api/products/:id =========
router.get("/:id", async (req, res) => {
    try {
        const p = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!p)
            return res.status(404).json({ error: "Not found" });
        res.json(p);
    }
    catch {
        res.status(500).json({ error: "Failed to fetch" });
    }
});
// ========= POST /api/products (ADMIN) =========
router.post("/", auth_js_1.verifyToken, (0, authz_js_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const parsed = productSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const product = await prisma.product.create({ data: parsed.data });
        res.status(201).json(product);
    }
    catch (err) {
        if (err?.code === "P2002")
            return res.status(409).json({ error: "computerCode already exists" });
        res.status(500).json({ error: "Failed to create product" });
    }
});
// ========= PATCH /api/products/:id (ADMIN) =========
router.patch("/:id", auth_js_1.verifyToken, (0, authz_js_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const parsed = productPatchSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.flatten() });
        const updated = await prisma.product.update({
            where: { id: req.params.id },
            data: parsed.data,
        });
        res.json(updated);
    }
    catch (err) {
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Not found" });
        if (err?.code === "P2002")
            return res.status(409).json({ error: "computerCode already exists" });
        res.status(500).json({ error: "Failed to update product" });
    }
});
// ========= DELETE /api/products/:id (ADMIN, soft delete) =========
router.delete("/:id", auth_js_1.verifyToken, (0, authz_js_1.requireRole)("ADMIN"), async (req, res) => {
    try {
        const updated = await prisma.product.update({
            where: { id: req.params.id },
            data: { isActive: false },
        });
        res.json({ ok: true, id: updated.id });
    }
    catch (err) {
        if (err?.code === "P2025")
            return res.status(404).json({ error: "Not found" });
        res.status(500).json({ error: "Failed to delete" });
    }
});
exports.default = router;
