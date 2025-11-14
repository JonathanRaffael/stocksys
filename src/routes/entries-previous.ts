// API endpoint untuk fetch total qty dari semua penginputan untuk produk (kumulatif + sisa per proses)
import express from "express"
import prismaPkg from "@prisma/client"
import { z } from "zod"
import { verifyToken } from "./auth.js"
import { requireAuth } from "../middlewares/authz.js"

const { PrismaClient } = prismaPkg
const prisma = new PrismaClient()
const router = express.Router()

/**
 * Helper: convert date string ke UTC midnight
 * (cocok untuk kolom @db.Date)
 */
const asDateOnly = (d: string) => {
  const [y, m, day] = String(d).split("-").map(Number)
  if (!y || !m || !day) throw new Error(`Invalid date-only: ${d}`)
  return new Date(Date.UTC(y, m - 1, day))
}

/**
 * Helper: get shift order (S1 = 1, S2 = 2, S3 = 3)
 */
const getShiftOrder = (shift: string): number => {
  const shiftMap = { S1: 1, S2: 2, S3: 3 }
  return shiftMap[shift as keyof typeof shiftMap] || 0
}

/**
 * GET /api/entries/previous-qty
 *
 * LOGIKA KUMULATIF + SISA PER PROSES:
 *
 * 1) Ambil semua entry untuk productId tsb dengan:
 *    - date < currentDate  -> semua shift (S1, S2, S3)
 *    - date = currentDate & shift <= currentShift -> hanya shift sampai saat ini
 *
 * 2) Dari kumpulan entry itu hitung:
 *    totalBeforeIpqc     = Σ beforeIpqc
 *    totalAfterIpqc      = Σ afterIpqc
 *    totalOnGoingPost    = Σ onGoingPostcured
 *    totalAfterPostcured = Σ afterPostcured
 *
 * 3) Stok "sisa" per proses:
 *    remainingBeforeIpqc    = max(0, totalBeforeIpqc - totalAfterIpqc)
 *    remainingAfterIpqc     = max(0, totalAfterIpqc - totalAfterPostcured)
 *    remainingAfterPostcure = totalAfterPostcured  // tahap terakhir (belum dikurangi proses berikutnya)
 *
 * Contoh:
 *  14: S1=1000, S2=2000, S3=2000 -> totalBefore=5000
 *  15 S1: input 5000 -> totalBefore=10000, totalAfter=0 -> remainingBefore=10000
 *  15 S2: input AfterIPQC=10000 -> totalBefore=10000, totalAfterIpqc=10000
 *          remainingBefore=0
 *  15 S3: input AfterPostcured=10000 -> totalAfterPostcured=10000
 *          remainingAfterIpqc = 10000 - 10000 = 0
 */
router.get("/previous-qty", verifyToken, requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      productId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      shift: z.enum(["S1", "S2", "S3"]),
    })

    const { productId, date, shift } = schema.parse(req.query)
    const currentDate = asDateOnly(date as string)
    const currentShiftOrder = getShiftOrder(shift as string)

    // Daftar shift yang diikutkan untuk HARI INI (S1..shiftSaatIni)
    const shiftsUpToCurrent = (["S1", "S2", "S3"] as const).filter(
      (s) => getShiftOrder(s) <= currentShiftOrder
    )

    // ✅ Ambil SEMUA ENTRY kumulatif untuk productId tsb:
    //    - semua tanggal sebelum currentDate (lt)
    //    - + tanggal = currentDate, shift <= currentShift
    const entries = await prisma.dailyEntry.findMany({
      where: {
        productId,
        OR: [
          { date: { lt: currentDate } },
          {
            date: currentDate,
            shift: { in: shiftsUpToCurrent as any[] },
          },
        ],
      },
      orderBy: [{ date: "asc" }, { shift: "asc" }],
      select: {
        beforeIpqc: true,
        afterIpqc: true,
        onGoingPostcured: true,
        afterPostcured: true,
        date: true,
        shift: true,
      },
    })

    if (entries.length === 0) {
      return res.json({
        found: false,
        beforeIpqc: 0,
        afterIpqc: 0,
        onGoingPostcured: 0,
        afterPostcured: 0,
        totalInputs: 0,
      })
    }

    const totalInputs = entries.length

    const totalBeforeIpqc = entries.reduce(
      (sum, e) => sum + Math.max(0, e.beforeIpqc),
      0
    )
    const totalAfterIpqc = entries.reduce(
      (sum, e) => sum + Math.max(0, e.afterIpqc),
      0
    )
    const totalOnGoingPostcured = entries.reduce(
      (sum, e) => sum + Math.max(0, e.onGoingPostcured),
      0
    )
    const totalAfterPostcured = entries.reduce(
      (sum, e) => sum + Math.max(0, e.afterPostcured),
      0
    )

    // 🔥 SISA per proses
    const remainingBeforeIpqc = Math.max(0, totalBeforeIpqc - totalAfterIpqc)
    const remainingAfterIpqc = Math.max(0, totalAfterIpqc - totalAfterPostcured)
    const remainingAfterPostcured = totalAfterPostcured // tahap terakhir

    const lastEntry = entries[entries.length - 1]

    const sisaQty = {
      found: true,

      // 👇 Nilai sisa per proses (dipakai di history / prefill form)
      beforeIpqc: remainingBeforeIpqc,
      afterIpqc: remainingAfterIpqc,
      afterPostcured: remainingAfterPostcured,

      // 👇 Nilai kumulatif mentah kalau mau dipakai di dashboard / debug
      rawBeforeIpqc: totalBeforeIpqc,
      rawAfterIpqc: totalAfterIpqc,
      rawOnGoingPostcured: totalOnGoingPostcured,
      rawAfterPostcured: totalAfterPostcured,

      previousDate: lastEntry.date.toISOString().slice(0, 10),
      previousShift: lastEntry.shift,
      totalInputs,
    }

    res.json(sisaQty)
  } catch (e: any) {
    console.error("GET /previous-qty error:", e)
    res.status(400).json({ error: "Invalid query" })
  }
})

export default router
