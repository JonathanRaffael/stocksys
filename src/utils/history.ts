import { PrismaClient, HistoryAction, Role, Shift } from "@prisma/client"

const prisma = new PrismaClient()

// Field yang dicatat perubahannya
const NUMERIC_FIELDS = [
  "beforeIpqc","afterIpqc","onGoingPostcured","afterPostcured",
  "beforeOqc","afterOqc","onHoldOrReturn",
] as const
const TEXT_FIELDS = ["note"] as const

export function buildChanges(oldData?: any, newData?: any) {
  const changes: Record<string, { old: any; new: any }> = {}

  for (const f of NUMERIC_FIELDS) {
    const o = Number(oldData?.[f] ?? 0)
    const n = Number(newData?.[f] ?? 0)
    if (o !== n) changes[f] = { old: o, new: n }
  }
  for (const f of TEXT_FIELDS) {
    const o = oldData?.[f] ?? null
    const n = newData?.[f] ?? null
    if ((o ?? "") !== (n ?? "")) changes[f] = { old: o, new: n }
  }

  return Object.keys(changes).length ? changes : null
}

export async function writeEntryHistory(params: {
  action: HistoryAction
  byUserId: string
  byRole: Role
  entry: {
    id?: string
    productId?: string
    productCode: string
    productName: string
    date: Date
    shift: Shift
    note?: string | null
    beforeIpqc?: number
    afterIpqc?: number
    onGoingPostcured?: number
    afterPostcured?: number
    beforeOqc?: number
    afterOqc?: number
    onHoldOrReturn?: number
  }
  previous?: any
}) {
  const { action, byUserId, byRole, entry, previous } = params

  const snapshot = {
    beforeIpqc: entry.beforeIpqc ?? 0,
    afterIpqc: entry.afterIpqc ?? 0,
    onGoingPostcured: entry.onGoingPostcured ?? 0,
    afterPostcured: entry.afterPostcured ?? 0,
    beforeOqc: entry.beforeOqc ?? 0,
    afterOqc: entry.afterOqc ?? 0,
    onHoldOrReturn: entry.onHoldOrReturn ?? 0,
    note: entry.note ?? null,
  }

  const changes =
    action === "UPDATE"
      ? buildChanges(previous, { ...previous, ...snapshot })
      : action === "DELETE"
      ? buildChanges(previous, undefined)
      : null

  await prisma.entryHistory.create({
    data: {
      action,
      byUserId,
      byRole,
      dailyEntryId: entry.id ?? null,
      productId: entry.productId ?? null,
      productCode: entry.productCode,
      productName: entry.productName,
      date: entry.date,
      shift: entry.shift,
      note: entry.note ?? null,
      // ⬇️ Omit kalau null → DB akan NULL tanpa konflik tipe
      ...(changes ? { changes } : {}),
      snapshot,
    },
  })
}
