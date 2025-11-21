// API endpoint untuk fetch total qty dari semua penginputan untuk produk (kumulatif + sisa per proses)
import express from "express"
import prismaPkg from "@prisma/client"
import { z } from "zod"
import { verifyToken } from "./auth.js"
import { requireAuth } from "../middlewares/authz.js"

const { PrismaClient } = prismaPkg
const prisma = new PrismaClient()
const router = express.Router()

type Shift = "S1" | "S2" | "S3"

export interface PreviousQtyResult {
  found: boolean

  // SISA per proses (dipakai untuk prefill / history / validasi input step berikutnya)
  beforeIpqc: number
  afterIpqc: number
  afterPostcured: number

  // Nilai kumulatif mentah (jumlah input per proses, bukan saldo)
  rawBeforeIpqc: number
  rawAfterIpqc: number
  rawOnGoingPostcured: number
  rawAfterPostcured: number

  previousDate: string | null
  previousShift: Shift | null
  totalInputs: number
}

/**
 * Helper: convert date string ke UTC midnight
 * (cocok untuk kolom @db.Date)
 */
const asDateOnly = (d: string | Date): Date => {
  if (d instanceof Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  }

  const [y, m, day] = String(d).split("-").map(Number)
  if (!y || !m || !day) throw new Error(`Invalid date-only: ${d}`)
  return new Date(Date.UTC(y, m - 1, day))
}

/**
 * Helper: get shift order (S1 = 1, S2 = 2, S3 = 3)
 */
const getShiftOrder = (shift: Shift): number => {
  const shiftMap: Record<Shift, number> = { S1: 1, S2: 2, S3: 3 }
  return shiftMap[shift] ?? 0
}

/**
 * Core logic kumulatif + sisa per proses
 *
 * Sesuai maumu:
 *
 * - User bisa input dari proses mana saja:
 *   * hanya Before IPQC  -> nambah stok di before
 *   * hanya After IPQC   -> mengurangi stok before & menambah after
 *   * hanya After Post   -> mengurangi stok after & menambah postcure
 *
 * - Pola input nyata di UI:
 *   * Baris yang punya Before & After sekaligus (misal Before=2500, After=2500)
 *     itu maksudnya: 2500 sudah diproses dari stok existing,
 *     BUKAN nambah 2500 baru ke Before.
 *
 * - Maka:
 *   * Before dianggap "penambahan baru" HANYA jika di baris itu
 *     tidak ada After IPQC dan tidak ada After Postcured.
 *   * After IPQC dan After Postcured SELALU dianggap mutasi proses.
 */
export const getPreviousQty = async (params: {
  productId: string
  date: string | Date
  shift: Shift
  prismaClient?: prismaPkg.PrismaClient
}): Promise<PreviousQtyResult> => {
  const { productId, date, shift, prismaClient } = params
  const db = prismaClient ?? prisma

  const currentDate = asDateOnly(date)
  const currentShiftOrder = getShiftOrder(shift)

  const shiftsUpToCurrent: Shift[] = (["S1", "S2", "S3"] as const).filter(
    (s) => getShiftOrder(s) <= currentShiftOrder
  )

  const entries = await db.dailyEntry.findMany({
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
    return {
      found: false,
      beforeIpqc: 0,
      afterIpqc: 0,
      afterPostcured: 0,
      rawBeforeIpqc: 0,
      rawAfterIpqc: 0,
      rawOnGoingPostcured: 0,
      rawAfterPostcured: 0,
      previousDate: null,
      previousShift: null,
      totalInputs: 0,
    }
  }

  const totalInputs = entries.length
  const lastEntry = entries[entries.length - 1]

  let rawBeforeIpqc = 0
  let rawAfterIpqc = 0
  let rawOnGoingPostcured = 0
  let rawAfterPostcured = 0

  for (const e of entries) {
    const b = Math.max(0, e.beforeIpqc ?? 0)
    const a = Math.max(0, e.afterIpqc ?? 0)
    const og = Math.max(0, e.onGoingPostcured ?? 0)
    const ap = Math.max(0, e.afterPostcured ?? 0)

    // BEFORE IPQC:
    // Dianggap penambahan stok baru HANYA jika tidak ada proses lanjut di baris ini.
    const isPureBefore = b > 0 && a === 0 && ap === 0
    if (isPureBefore) {
      rawBeforeIpqc += b
    }

    // AFTER IPQC & AFTER POSTCURED: selalu dianggap mutasi proses
    if (a > 0) {
      rawAfterIpqc += a
    }
    if (ap > 0) {
      rawAfterPostcured += ap
    }
    if (og > 0) {
      rawOnGoingPostcured += og
    }
  }

  // Sisa per proses (flow qty mengalir antar step)
  const remainingBeforeIpqc = Math.max(0, rawBeforeIpqc - rawAfterIpqc)
  const remainingAfterIpqc = Math.max(0, rawAfterIpqc - rawAfterPostcured)
  const remainingAfterPostcured = rawAfterPostcured

  return {
    found: true,

    beforeIpqc: remainingBeforeIpqc,
    afterIpqc: remainingAfterIpqc,
    afterPostcured: remainingAfterPostcured,

    rawBeforeIpqc,
    rawAfterIpqc,
    rawOnGoingPostcured,
    rawAfterPostcured,

    previousDate: lastEntry.date.toISOString().slice(0, 10),
    previousShift: lastEntry.shift as Shift,
    totalInputs,
  }
}

/**
 * GET /api/entries/previous-qty
 */
router.get("/previous-qty", verifyToken, requireAuth, async (req, res) => {
  const schema = z.object({
    productId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    shift: z.enum(["S1", "S2", "S3"]),
  })

  try {
    const { productId, date, shift } = schema.parse(req.query)

    const result = await getPreviousQty({
      productId,
      date,
      shift: shift as Shift,
    })

    return res.json(result)
  } catch (e: any) {
    console.error("GET /previous-qty error:", e)

    if (e instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid query params",
        details: e.issues,
      })
    }

    return res.status(500).json({
      error: "Internal server error",
    })
  }
})

export default router
