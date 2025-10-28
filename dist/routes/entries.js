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
// ✅ Prisma ESM-safe import
const { PrismaClient, Role, Shift, Prisma } = client_1.default;
const prisma = new PrismaClient();
const router = express_1.default.Router();
// ===== Helpers: date-only (aman untuk kolom @db.Date) =====
const asDateOnly = (d) => new Date(`${d}T00:00:00.000Z`);
// Builder perubahan sederhana untuk history
function diffFields(before, after, keys) {
    const changes = {};
    if (!before && after) {
        for (const k of keys) {
            if (typeof after[k] !== "undefined") {
                changes[String(k)] = { old: null, new: after[k] };
            }
        }
        return changes;
    }
    if (before && after) {
        for (const k of keys) {
            if (before[k] !== after[k]) {
                changes[String(k)] = { old: before[k], new: after[k] };
            }
        }
    }
    return changes;
}
// ========= Schemas =========
const positiveInt = zod_1.z.number().int().min(0);
const createSchema = zod_1.z.object({
    productId: zod_1.z.string().uuid(),
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shift: zod_1.z.nativeEnum(Shift),
    plant: zod_1.z.string().nullable().optional(),
    line: zod_1.z.string().nullable().optional(),
    note: zod_1.z.string().nullable().optional(),
    beforeIpqc: positiveInt.optional(),
    afterIpqc: positiveInt.optional(),
    onGoingPostcured: positiveInt.optional(),
    afterPostcured: positiveInt.optional(),
    beforeOqc: positiveInt.optional(),
    afterOqc: positiveInt.optional(),
    onHoldOrReturn: positiveInt.optional(),
});
const patchSchema = zod_1.z.object({
    beforeIpqc: positiveInt.optional(),
    afterIpqc: positiveInt.optional(),
    onGoingPostcured: positiveInt.optional(),
    afterPostcured: positiveInt.optional(),
    beforeOqc: positiveInt.optional(),
    afterOqc: positiveInt.optional(),
    onHoldOrReturn: positiveInt.optional(),
    note: zod_1.z.string().nullable().optional(),
    plant: zod_1.z.string().nullable().optional(),
    line: zod_1.z.string().nullable().optional(),
});
// ========= GET /api/entries =========
router.get("/", async (req, res) => {
    try {
        const schema = zod_1.z.object({
            productId: zod_1.z.string().uuid().optional(),
            date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            to: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            shift: zod_1.z.nativeEnum(Shift).optional(),
            plant: zod_1.z.string().optional(),
            line: zod_1.z.string().optional(),
            includeProduct: zod_1.z.coerce.boolean().optional(),
            type: zod_1.z.enum(["IPQC", "OQC"]).optional(),
        });
        const { productId, date, to, shift, plant, line, includeProduct = true, type } = schema.parse(req.query);
        const where = {};
        if (productId)
            where.productId = productId;
        if (shift)
            where.shift = shift;
        if (plant)
            where.plant = plant;
        if (line)
            where.line = line;
        if (date && to) {
            where.date = { gte: asDateOnly(date), lte: asDateOnly(to) };
        }
        else if (date) {
            where.date = asDateOnly(date);
        }
        if (type === "OQC") {
            where.OR = [
                { beforeOqc: { gt: -1 } },
                { afterOqc: { gt: -1 } },
                { onHoldOrReturn: { gt: -1 } },
            ];
        }
        else if (type === "IPQC") {
            where.OR = [
                { beforeIpqc: { gt: -1 } },
                { afterIpqc: { gt: -1 } },
                { onGoingPostcured: { gt: -1 } },
                { afterPostcured: { gt: -1 } },
            ];
        }
        const entries = await prisma.dailyEntry.findMany({
            where,
            include: includeProduct
                ? { product: { select: { id: true, name: true, computerCode: true, size: true } } }
                : undefined,
            orderBy: [{ date: "desc" }, { shift: "asc" }, { createdAt: "desc" }],
        });
        res.json(entries);
    }
    catch (e) {
        console.error("GET /entries error:", e);
        res.status(400).json({ error: "Invalid query or failed to fetch" });
    }
});
// ========= POST /api/entries =========
router.post("/", auth_js_1.verifyToken, authz_js_1.requireAuth, (0, authz_js_1.requireRole)("IPQC", "OQC"), async (req, res) => {
    try {
        const parsed = createSchema.parse(req.body);
        const role = req.user.role;
        const userId = req.user.id;
        const day = asDateOnly(parsed.date);
        const existing = await prisma.dailyEntry.findUnique({
            where: { productId_date_shift: { productId: parsed.productId, date: day, shift: parsed.shift } },
        });
        const zeros = {
            beforeIpqc: 0, afterIpqc: 0, onGoingPostcured: 0, afterPostcured: 0,
            beforeOqc: 0, afterOqc: 0, onHoldOrReturn: 0,
        };
        if (!existing) {
            const createData = {
                productId: parsed.productId,
                date: day,
                shift: parsed.shift,
                plant: parsed.plant ?? null,
                line: parsed.line ?? null,
                createdByUserId: userId,
                createdByRole: role,
                note: parsed.note ?? null,
                ...zeros,
            };
            if (role === "IPQC") {
                createData.beforeIpqc = parsed.beforeIpqc ?? 0;
                createData.afterIpqc = parsed.afterIpqc ?? 0;
                createData.onGoingPostcured = parsed.onGoingPostcured ?? 0;
                createData.afterPostcured = parsed.afterPostcured ?? 0;
            }
            else {
                createData.beforeOqc = parsed.beforeOqc ?? 0;
                createData.afterOqc = parsed.afterOqc ?? 0;
                createData.onHoldOrReturn = parsed.onHoldOrReturn ?? 0;
            }
            const created = await prisma.dailyEntry.create({ data: createData });
            const product = await prisma.product.findUnique({ where: { id: parsed.productId } });
            const keys = ["beforeIpqc", "afterIpqc", "onGoingPostcured", "afterPostcured", "beforeOqc", "afterOqc", "onHoldOrReturn", "note", "plant", "line"];
            const changes = diffFields(null, created, keys);
            await prisma.entryHistory.create({
                data: {
                    dailyEntryId: created.id,
                    productId: created.productId,
                    productCode: product?.computerCode ?? "",
                    productName: product?.name ?? "",
                    date: created.date,
                    shift: created.shift,
                    action: "CREATE",
                    byUserId: userId,
                    byRole: role,
                    note: created.note ?? undefined,
                    changes: Object.keys(changes).length ? changes : Prisma.JsonNull,
                    snapshot: created,
                },
            });
            return res.status(201).json(created);
        }
        // UPDATE
        const updateData = {
            note: parsed.note ?? null,
            plant: parsed.plant ?? null,
            line: parsed.line ?? null,
            updatedByUserId: userId,
        };
        if (role === "IPQC") {
            if (typeof parsed.beforeIpqc === "number")
                updateData.beforeIpqc = parsed.beforeIpqc;
            if (typeof parsed.afterIpqc === "number")
                updateData.afterIpqc = parsed.afterIpqc;
            if (typeof parsed.onGoingPostcured === "number")
                updateData.onGoingPostcured = parsed.onGoingPostcured;
            if (typeof parsed.afterPostcured === "number")
                updateData.afterPostcured = parsed.afterPostcured;
        }
        else {
            if (typeof parsed.beforeOqc === "number")
                updateData.beforeOqc = parsed.beforeOqc;
            if (typeof parsed.afterOqc === "number")
                updateData.afterOqc = parsed.afterOqc;
            if (typeof parsed.onHoldOrReturn === "number")
                updateData.onHoldOrReturn = parsed.onHoldOrReturn;
        }
        const updated = await prisma.dailyEntry.update({
            where: { id: existing.id },
            data: updateData,
        });
        const product = await prisma.product.findUnique({ where: { id: existing.productId } });
        const keys = ["beforeIpqc", "afterIpqc", "onGoingPostcured", "afterPostcured", "beforeOqc", "afterOqc", "onHoldOrReturn", "note", "plant", "line"];
        const changes = diffFields(existing, updated, keys);
        await prisma.entryHistory.create({
            data: {
                dailyEntryId: updated.id,
                productId: updated.productId,
                productCode: product?.computerCode ?? "",
                productName: product?.name ?? "",
                date: updated.date,
                shift: updated.shift,
                action: "UPDATE",
                byUserId: userId,
                byRole: role,
                note: updated.note ?? undefined,
                changes: Object.keys(changes).length ? changes : Prisma.JsonNull,
                snapshot: updated,
            },
        });
        res.status(201).json(updated);
    }
    catch (e) {
        console.error("POST /entries error:", e);
        return res.status(500).json({ error: "Failed to create/update entry" });
    }
});
// ========= DELETE /api/entries/:id =========
router.delete("/:id", auth_js_1.verifyToken, authz_js_1.requireAuth, (0, authz_js_1.requireRole)("ADMIN", "IPQC", "OQC"), async (req, res) => {
    const id = req.params.id;
    const validUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!validUUID.test(id))
        return res.status(400).json({ error: "Invalid id" });
    try {
        const userId = req.user.id;
        const role = req.user.role;
        const before = await prisma.dailyEntry.findUnique({ where: { id } });
        if (!before)
            return res.status(404).json({ error: "Not found" });
        const product = await prisma.product.findUnique({ where: { id: before.productId } });
        const historyData = {
            dailyEntryId: before.id,
            productId: before.productId,
            productCode: product?.computerCode ?? "",
            productName: product?.name ?? "",
            date: before.date,
            shift: before.shift,
            action: "DELETE",
            byUserId: userId,
            byRole: role,
            note: before.note ?? undefined,
            changes: Prisma.JsonNull,
            snapshot: before,
        };
        await prisma.$transaction([
            prisma.entryHistory.create({ data: historyData }),
            prisma.dailyEntry.delete({ where: { id } }),
        ]);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error("DELETE /entries/:id error:", e);
        res.status(500).json({ error: "Failed to delete entry" });
    }
});
exports.default = router;
