// @ts-nocheck
import { Router } from "express"
import prismaPkg from "@prisma/client"
import { z } from "zod"
import { startOfDay, endOfDay } from "date-fns"

const { PrismaClient, Shift } = prismaPkg

const prisma = new PrismaClient()

/** WIB = UTC+7 */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000
const toUtcFromWib = (d: Date) => new Date(d.getTime() - WIB_OFFSET_MS)
const rangeUtcFromLocalWib = (ymd: string) => {
  const local = new Date(`${ymd}T00:00:00`)
  const startUtc = toUtcFromWib(startOfDay(local))
  const endUtc = toUtcFromWib(endOfDay(local))
  return { startUtc, endUtc }
}

// Urutan shift: untuk akumulasi S1..shift sekarang
const SHIFT_ORDER: Record<string, number> = { S1: 1, S2: 2, S3: 3 }
const getShiftOrder = (s: string) => SHIFT_ORDER[s] ?? 0

// ================= Routers =================
export const summaryRouter = Router()       // -> /api/summary
export const ipqcSummaryRouter = Router()   // -> /api/ipqc/summary

/* ============================================================================
 * 1) RINGKASAN UMUM: GET /api/summary
 * ==========================================================================*/
const Query = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  productId: z.string().uuid().optional(),
  shift: z.nativeEnum(Shift).optional(),
  plant: z.string().optional(),
  line: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).optional(),
})

summaryRouter.get("/", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store")
    const { from, to, productId, shift, plant, line, take = 10 } = Query.parse(req.query)

    // Default: 7 hari terakhir (WIB)
    const todayLocal = new Date()
    const defaultTo = (to ?? todayLocal.toISOString().slice(0, 10))!
    const defaultFrom =
      from ?? new Date(todayLocal.getTime() - 6 * 86400000).toISOString().slice(0, 10)

    const { startUtc: rangeStart } = rangeUtcFromLocalWib(defaultFrom)
    const { endUtc: rangeEnd } = rangeUtcFromLocalWib(defaultTo)

    const whereBase: any = {
      date: { gte: rangeStart, lte: rangeEnd },
      ...(productId ? { productId } : {}),
      ...(shift ? { shift } : {}),
      ...(plant && plant.trim() ? { plant } : {}),
      ...(line && line.trim() ? { line } : {}),
    }

    // KPI hari ini (WIB)
    const { startUtc: startTodayUtc, endUtc: endTodayUtc } = rangeUtcFromLocalWib(
      new Date().toISOString().slice(0, 10)
    )

    const [
      totalProducts,
      activeProducts,
      totalUsers,
      todayByShiftRaw,
      lastEntriesRaw,
      grouped,
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({ where: { isActive: true } }),
      prisma.user.count(),
      prisma.dailyEntry.groupBy({
        by: ["shift"],
        _count: { id: true },
        where: { date: { gte: startTodayUtc, lte: endTodayUtc } },
      }),
      prisma.dailyEntry.findMany({
        where: whereBase,
        take,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: {
          product: { select: { name: true } },
          author: { select: { name: true } },
        },
      }),
      prisma.dailyEntry.groupBy({
        by: ["productId"],
        where: whereBase,
        _sum: {
          beforeIpqc: true,
          afterIpqc: true,
          onGoingPostcured: true,
          afterPostcured: true,
          beforeOqc: true,
          afterOqc: true,
          onHoldOrReturn: true,
        },
      }),
    ])

    const todayByShift: Record<"S1" | "S2" | "S3", number> = { S1: 0, S2: 0, S3: 0 }
    for (const row of todayByShiftRaw) {
      // @ts-ignore
      todayByShift[row.shift] = row._count.id
    }

    const productIds = grouped.map((g) => g.productId)
    const products = productIds.length
      ? await prisma.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, size: true, computerCode: true },
        })
      : []
    const prodMap = new Map(products.map((p) => [p.id, p]))

    const perProduct = grouped
      .map((g) => {
        const p = prodMap.get(g.productId)
        const totalBeforeIpqc = g._sum.beforeIpqc ?? 0
        const totalAfterIpqc = g._sum.afterIpqc ?? 0
        const totalOnGoingPostcured = g._sum.onGoingPostcured ?? 0
        const totalAfterPostcured = g._sum.afterPostcured ?? 0
        const totalBeforeOqc = g._sum.beforeOqc ?? 0
        const totalAfterOqc = g._sum.afterOqc ?? 0
        const totalHoldOrReturn = g._sum.onHoldOrReturn ?? 0

        return {
          productId: g.productId,
          productName: p?.name ?? "-",
          size: p?.size ?? null,
          code: p?.computerCode ?? "-",
          totalBeforeIpqc,
          totalAfterIpqc,
          totalOnGoingPostcured,
          totalAfterPostcured,
          totalBeforeOqc,
          totalAfterOqc,
          totalHoldOrReturn,
          totalAvailable:
            totalAfterIpqc + totalAfterPostcured + totalAfterOqc - totalHoldOrReturn,
        }
      })
      .sort((a, b) => a.productName.localeCompare(b.productName))

    res.json({
      range: { from: defaultFrom, to: defaultTo, timezone: "Asia/Jakarta" },
      filters: {
        productId: productId ?? null,
        shift: shift ?? null,
        plant: plant && plant.trim() ? plant : null,
        line: line && line.trim() ? line : null,
      },
      kpi: { totalProducts, activeProducts, totalUsers, todayByShift },
      lastEntries: lastEntriesRaw.map((e) => ({
        id: e.id,
        date: e.date,
        productName: e.product?.name ?? "-",
        shift: e.shift,
        beforeIpqc: e.beforeIpqc ?? 0,
        afterIpqc: e.afterIpqc ?? 0,
        onGoingPostcured: e.onGoingPostcured ?? 0,
        afterPostcured: e.afterPostcured ?? 0,
        beforeOqc: e.beforeOqc ?? 0,
        afterOqc: e.afterOqc ?? 0,
        author: e.author?.name ?? "-",
      })),
      perProduct,
    })
  } catch (err: any) {
    console.error("GET /api/summary error:", err)
    if (err?.issues) return res.status(400).json({ error: err.issues })
    return res.status(400).json({ error: "Invalid query or failed to generate summary" })
  }
})

/* ============================================================================
 * 2) KPI DASHBOARD IPQC: GET /api/ipqc/summary
 *    - Akumulasi S1..shiftSaatIni untuk hari tsb
 *    - Jika hari tsb belum ada data -> pakai total HARI TERAKHIR SEBELUMNYA
 * ==========================================================================*/
const IpqcQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shift: z.nativeEnum(Shift),
  plant: z.string().optional(),
  line: z.string().optional(),
})

ipqcSummaryRouter.get("/summary", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store")

    const { date, shift, plant, line } = IpqcQuery.parse(req.query)
    const { startUtc, endUtc } = rangeUtcFromLocalWib(date)

    const currentShiftOrder = getShiftOrder(String(shift))

    // daftar shift yang diikutkan untuk hari ini (S1..shiftSekarang)
    const shiftsUpToCurrent = (["S1", "S2", "S3"] as const).filter(
      (s) => getShiftOrder(s) <= currentShiftOrder
    )

    // WHERE utk HARI & SHIFT SEKARANG (akumulasi S1..shiftSekarang)
    const whereToday: any = {
      date: { gte: startUtc, lte: endUtc },
      shift: { in: shiftsUpToCurrent },
      ...(plant && plant.trim() ? { plant } : {}),
      ...(line && line.trim() ? { line } : {}),
    }

    // Cek dulu: hari ini ada data atau tidak?
    const [anyToday, aggToday] = await Promise.all([
      prisma.dailyEntry.findFirst({
        where: whereToday,
        select: { id: true },
      }),
      prisma.dailyEntry.aggregate({
        _sum: {
          beforeIpqc: true,
          afterIpqc: true,
          onGoingPostcured: true,
          afterPostcured: true,
          beforeOqc: true,
          afterOqc: true,
          onHoldOrReturn: true,
        },
        where: whereToday,
      }),
    ])

    let aggSource = aggToday

    // Jika hari ini benar-benar nggak ada entry -> pakai HARI TERAKHIR SEBELUMNYA
    if (!anyToday) {
      const prevBaseWhere: any = {
        date: { lt: startUtc }, // sebelum hari ini (WIB)
        ...(plant && plant.trim() ? { plant } : {}),
        ...(line && line.trim() ? { line } : {}),
      }

      // Cari satu entry terakhir (tanggal paling akhir) utk plant/line tsb
      const lastPrev = await prisma.dailyEntry.findFirst({
        where: prevBaseWhere,
        orderBy: [{ date: "desc" }],
        select: { date: true },
      })

      if (!lastPrev) {
        // Tidak ada histori sama sekali -> balikin 0 semua
        return res.json({
          totalBeforeIpqc: 0,
          totalAfterIpqc: 0,
          totalOnGoingPostcured: 0,
          totalAfterPostcured: 0,
          totalBeforeOqc: 0,
          totalAfterOqc: 0,
          totalHoldOrReturn: 0,
          netAvailable: 0,
          passRateIpqc: 0,
          passRatePostcure: 0,
        })
      }

      // Konversi tanggal histori ke Y-M-D lokal WIB
      const prevLocalYmd = new Date(lastPrev.date.getTime() + WIB_OFFSET_MS)
        .toISOString()
        .slice(0, 10)
      const { startUtc: prevStartUtc, endUtc: prevEndUtc } = rangeUtcFromLocalWib(prevLocalYmd)

      // Ambil SEMUA SHIFT di hari histori tsb (S1+S2+S3)
      const aggPrev = await prisma.dailyEntry.aggregate({
        _sum: {
          beforeIpqc: true,
          afterIpqc: true,
          onGoingPostcured: true,
          afterPostcured: true,
          beforeOqc: true,
          afterOqc: true,
          onHoldOrReturn: true,
        },
        where: {
          date: { gte: prevStartUtc, lte: prevEndUtc },
          ...(plant && plant.trim() ? { plant } : {}),
          ...(line && line.trim() ? { line } : {}),
        },
      })

      aggSource = aggPrev
    }

    const totalBeforeIpqc = aggSource._sum.beforeIpqc ?? 0
    const totalAfterIpqc = aggSource._sum.afterIpqc ?? 0
    const totalOnGoingPostcured = aggSource._sum.onGoingPostcured ?? 0
    const totalAfterPostcured = aggSource._sum.afterPostcured ?? 0
    const totalBeforeOqc = aggSource._sum.beforeOqc ?? 0
    const totalAfterOqc = aggSource._sum.afterOqc ?? 0
    const totalHoldOrReturn = aggSource._sum.onHoldOrReturn ?? 0

    const passRateIpqc =
      totalBeforeIpqc > 0 ? Math.round((totalAfterIpqc / totalBeforeIpqc) * 100) : 0

    const denomPostcure = totalAfterIpqc + totalOnGoingPostcured + totalAfterPostcured
    const passRatePostcure =
      denomPostcure > 0 ? Math.round((totalAfterPostcured / denomPostcure) * 100) : 0

    const netAvailable = totalAfterIpqc + totalAfterPostcured

    return res.json({
      totalBeforeIpqc,
      totalAfterIpqc,
      totalOnGoingPostcured,
      totalAfterPostcured,
      totalBeforeOqc,
      totalAfterOqc,
      totalHoldOrReturn,
      netAvailable,
      passRateIpqc,
      passRatePostcure,
    })
  } catch (err: any) {
    console.error("GET /api/ipqc/summary error:", err)
    if (err?.issues) return res.status(400).json({ error: err.issues })
    return res.status(400).json({ error: "Failed to generate IPQC summary" })
  }
})
