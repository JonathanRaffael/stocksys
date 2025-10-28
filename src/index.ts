// @ts-nocheck
import "dotenv/config"
import express from "express"
import cors from "cors"
import cookieParser from "cookie-parser"
import listEndpoints from "express-list-endpoints"

// ==== STATIC IMPORT ROUTERS (no more .ts/.js drama) ====
import authRouter from "./routes/auth"
import usersRouter from "./routes/users"
import productsRouter from "./routes/products"
import entriesRouter from "./routes/entries"
import ipqcRouter from "./routes/ipqc"
import oqcRouter from "./routes/oqc"
import historyRouter from "./routes/history"
import adminAggregateRouter from "./routes/admin.aggregate"
import { summaryRouter, ipqcSummaryRouter } from "./routes/summary"

export const app = express()

/* =========================
 *  SERVER BASICS
 * ========================= */
app.set("trust proxy", true) // penting untuk cookie/session di belakang proxy (Vercel/Railway)

/* =========================
 *  CORS (DEV + PROD)
 * ========================= */
const allowlist = [
  process.env.CLIENT_ORIGIN,        // ex: https://stocksys-client.vercel.app
  "http://localhost:5173",          // Vite dev
  "http://127.0.0.1:5173",
].filter(Boolean)

const corsOptions: cors.CorsOptions = {
  origin(origin, cb) {
    // izinkan tools seperti curl/Postman/no-origin
    if (!origin) return cb(null, true)
    if (allowlist.includes(origin)) return cb(null, true)
    return cb(new Error("Not allowed by CORS"))
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
}

app.use(cors(corsOptions))
// pastikan preflight pakai konfigurasi yang sama
/* =========================
 *  BODY & COOKIE PARSER
 * ========================= */
app.use(express.json({ limit: "2mb" }))
app.use(cookieParser())

/* =========================
 *  LOGGER
 * ========================= */
app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.path}`)
  next()
})

/* =========================
 *  HEALTH
 * ========================= */
app.get("/", (_req, res) => res.json({ ok: true, service: "StockSys API", hint: "try /health or /ping" }))
app.get("/ping", (_req, res) => res.json({ pong: true }))
app.get("/health", (_req, res) => res.json({ ok: true, service: "StockSys API" }))
app.get("/favicon.ico", (_req, res) => res.status(204).end())

/* =========================
 *  ROUTES (STATIC MOUNT)
 * ========================= */
// ---- AUTH: dukung /api/auth/* dan /auth/* (alias untuk FE lama)
app.use("/api/auth", authRouter)
app.use("/auth", authRouter) // alias agar POST /auth/login juga jalan

// ---- USERS & PRODUCTS
app.use("/api/users", usersRouter)
app.use("/api/products", productsRouter)

// ---- SUMMARY
app.use("/api/summary", summaryRouter)
app.use("/api/ipqc/summary", ipqcSummaryRouter) // konsisten: /api/ipqc/summary

// ---- IPQC/OQC & entries & history
app.use("/api/entries", entriesRouter)
app.use("/api/ipqc", ipqcRouter)
app.use("/api/oqc", oqcRouter)
app.use("/api/history", historyRouter)

// ---- ADMIN AGGREGATE
app.use("/api/admin", adminAggregateRouter)

console.log("✅ Routers mounted")
try {
  console.table(listEndpoints(app))
} catch (_) {
  // ignore if module not present
}

/* =========================
 *  404 & ERROR HANDLER
 * ========================= */
app.use((_req, res) => res.status(404).json({ error: "Not Found" }))
// error handler harus 4 args
app.use((err, _req, res, _next) => {
  console.error(err instanceof Error ? err.stack || err.message : err)
  if (!res.headersSent) res.status(500).json({ error: "Internal Server Error" })
})

/* =========================
 *  START (LOCAL) & EXPORT (VERCEL)
 * ========================= */
if (!process.env.VERCEL) {
  const PORT = Number(process.env.PORT) || 3001
  app.listen(PORT, () => console.log(`✅ API running at http://localhost:${PORT}`))
}

export default app
