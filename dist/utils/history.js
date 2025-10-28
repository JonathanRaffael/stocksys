"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildChanges = buildChanges;
exports.writeEntryHistory = writeEntryHistory;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
// Field yang dicatat perubahannya
const NUMERIC_FIELDS = [
    "beforeIpqc", "afterIpqc", "onGoingPostcured", "afterPostcured",
    "beforeOqc", "afterOqc", "onHoldOrReturn",
];
const TEXT_FIELDS = ["note"];
function buildChanges(oldData, newData) {
    const changes = {};
    for (const f of NUMERIC_FIELDS) {
        const o = Number(oldData?.[f] ?? 0);
        const n = Number(newData?.[f] ?? 0);
        if (o !== n)
            changes[f] = { old: o, new: n };
    }
    for (const f of TEXT_FIELDS) {
        const o = oldData?.[f] ?? null;
        const n = newData?.[f] ?? null;
        if ((o ?? "") !== (n ?? ""))
            changes[f] = { old: o, new: n };
    }
    return Object.keys(changes).length ? changes : null;
}
async function writeEntryHistory(params) {
    const { action, byUserId, byRole, entry, previous } = params;
    const snapshot = {
        beforeIpqc: entry.beforeIpqc ?? 0,
        afterIpqc: entry.afterIpqc ?? 0,
        onGoingPostcured: entry.onGoingPostcured ?? 0,
        afterPostcured: entry.afterPostcured ?? 0,
        beforeOqc: entry.beforeOqc ?? 0,
        afterOqc: entry.afterOqc ?? 0,
        onHoldOrReturn: entry.onHoldOrReturn ?? 0,
        note: entry.note ?? null,
    };
    const changes = action === "UPDATE"
        ? buildChanges(previous, { ...previous, ...snapshot })
        : action === "DELETE"
            ? buildChanges(previous, undefined)
            : null;
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
    });
}
