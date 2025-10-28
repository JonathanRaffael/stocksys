// @ts-nocheck
import { Router } from "express";
import prismaPkg from "@prisma/client";
import { verifyToken } from "./auth.js";
import { requireAuth } from "../middlewares/authz.js";

const { PrismaClient } = prismaPkg;
type Role = prismaPkg.Role;
type Shift = prismaPkg.Shift;
type HistoryAction = prismaPkg.HistoryAction;

const prisma = new PrismaClient();
const router = Router();

// ===== Tanggal versi UTC date-only (untuk kolom @db.Date) =====
function asDateOnlyStart(dateStr: string) { return new Date(`${dateStr}T00:00:00.000Z`); }
function asDateOnlyEnd(dateStr: string)   { return new Date(`${dateStr}T23:59:59.999Z`); }

// Helper kecil buat merangkai ukuran (opsional uom)
function composeSize(size?: string | null, uom?: string | null) {
  if (!size) return null;
  return uom ? `${size} ${uom}` : size;
}

// GET /api/history
router.get("/", verifyToken, requireAuth, async (req, res) => {
  try {
    const date      = String(req.query.date || "");
    const dateFrom  = String(req.query.dateFrom || "");
    const dateTo    = String(req.query.dateTo || "");
    const shift     = String(req.query.shift || "") as "" | Shift;
    const productId = String(req.query.productId || "");
    const type      = String(req.query.type || "");   // IPQC|OQC|""
    const action    = String(req.query.action || ""); // CREATE|UPDATE|DELETE|""
    const q         = String(req.query.q || "");
    const by        = String(req.query.by || "");     // "me"
    const plant     = String(req.query.plant || "");
    const line      = String(req.query.line || "");

    const take = Math.min(Number(req.query.take || 20), 200);
    const page = Math.max(Number(req.query.page || 1), 1);
    const cursor = req.query.cursor ? { id: String(req.query.cursor) } : undefined;
    const useOffset = !cursor;

    const where: any = {};

    if (type === "IPQC" || type === "OQC") where.byRole = type as Role;
    if (action === "CREATE" || action === "UPDATE" || action === "DELETE") where.action = action as HistoryAction;

    if (date) {
      where.date = { gte: asDateOnlyStart(date), lte: asDateOnlyEnd(date) };
    } else if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = asDateOnlyStart(dateFrom);
      if (dateTo)   where.date.lte = asDateOnlyEnd(dateTo);
    }

    if (shift) where.shift = shift;
    if (productId) where.productId = productId;

    if (q) {
      where.OR = [
        { productCode: { contains: q, mode: "insensitive" } },
        { productName: { contains: q, mode: "insensitive" } },
      ];
    }

    // Jika schema EntryHistory punya kolom plant/line:
    if (plant) (where as any).plant = plant;
    if (line)  (where as any).line  = line;

    if (by === "me" && req.user?.id) where.byUserId = req.user.id;

    const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const total = useOffset ? await prisma.entryHistory.count({ where }) : undefined;

    // include relasi product → tarik size/uom
    const itemsRaw = await prisma.entryHistory.findMany({
      where,
      orderBy,
      take,
      ...(useOffset ? { skip: (page - 1) * take } : cursor ? { skip: 1, cursor } : {}),
      select: {
        id: true,
        dailyEntryId: true,
        productId: true,
        productCode: true,
        productName: true,
        date: true,
        shift: true,
        action: true,
        byUserId: true,
        byRole: true,
        note: true,
        changes: true,
        snapshot: true,
        createdAt: true,
        product: { select: { size: true, uom: true } },
      },
    });

    // Hydrate: tambah productSize (fallback ke snapshot jika perlu)
    const items = itemsRaw.map((it: any) => {
      const sizeFromProduct = composeSize(it.product?.size ?? null, it.product?.uom ?? null);
      const sizeFromSnapshot =
        it.snapshot?.product?.size ??
        it.snapshot?.size ??
        null;

      return {
        id: it.id,
        dailyEntryId: it.dailyEntryId,
        productId: it.productId,
        productCode: it.productCode,
        productName: it.productName,
        date: it.date,
        shift: it.shift,
        action: it.action,
        byUserId: it.byUserId,
        byRole: it.byRole,
        note: it.note,
        changes: it.changes,
        snapshot: it.snapshot,
        createdAt: it.createdAt,
        productSize: sizeFromProduct ?? sizeFromSnapshot ?? null,
      };
    });

    const nextCursor = !useOffset && itemsRaw.length === take ? itemsRaw[itemsRaw.length - 1].id : null;

    res.json({
      items,
      ...(typeof total === "number" ? { total, page, take } : {}),
      ...(nextCursor ? { nextCursor } : {}),
    });
  } catch (e: any) {
    console.error("[history] GET /api/history error:", e);
    res.status(500).json({ error: e?.message || "Failed to fetch history" });
  }
});

export default router;
