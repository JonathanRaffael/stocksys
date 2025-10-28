// @ts-nocheck
import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";

const prisma = new PrismaClient();
const router = Router();

/* ========= Helpers ========= */
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(4),
});

function signJwt(user: any) {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === "production";

  if (!secret && isProd) {
    // di produksi: jangan jalan tanpa secret
    throw new Error("JWT_SECRET is missing in production");
  }
  // di dev: boleh fallback supaya gampang tes lokal
  const useSecret = secret || "supersecretkey-dev-only";

  return jwt.sign(
    { role: user.role },
    useSecret,
    { subject: String(user.id), expiresIn: "7d" }
  );
}

/* ========= POST /api/auth/login ========= */
router.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid body", detail: parsed.error.issues });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const password = parsed.data.password;

    // Ambil user + dua kemungkinan kolom hash
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, role: true, password: true as any, passwordHash: true as any, isActive: true as any },
    });

    if (!user) return res.status(401).json({ error: "Email or password invalid" });
    if (user.isActive === false) return res.status(403).json({ error: "User is not active" });

    const hash: string | undefined = (user as any).password ?? (user as any).passwordHash;
    if (!hash) {
      // skema DB kamu tidak punya kolom hash yang dikenali
      return res.status(500).json({ error: "User has no password hash in DB" });
    }

    const ok = await bcrypt.compare(password, hash);
    if (!ok) return res.status(401).json({ error: "Email or password invalid" });

    const token = signJwt(user);

    const useCookie = String(process.env.AUTH_USE_COOKIE || "").toLowerCase() === "true";
    const isProd = process.env.NODE_ENV === "production";

    if (useCookie) {
      res.cookie("token", token, {
        httpOnly: true,
        sameSite: isProd ? "none" : "lax",
        secure: isProd,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/",
      });
      return res.json({
        message: "Login success",
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    }

    return res.json({
      message: "Login success",
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    console.error("LOGIN ERROR:", err?.message || err);
    return res.status(500).json({ error: "Login failed" });
  }
});

/* ========= Middleware: verifyToken ========= */
export function verifyToken(req, res, next) {
  if (req.method === "OPTIONS") return next();

  const useCookie = String(process.env.AUTH_USE_COOKIE || "").toLowerCase() === "true";
  let token = "";

  if (useCookie) {
    token = req.cookies?.token || "";
  } else {
    const auth = req.headers.authorization || "";
    if (auth.startsWith("Bearer ")) token = auth.slice(7).trim();
  }

  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const secret = process.env.JWT_SECRET || "supersecretkey-dev-only";
    const decoded: any = jwt.verify(token, secret);
    const sub = decoded?.sub;
    const role = decoded?.role;
    if (!sub || !role) return res.status(401).json({ error: "Invalid token payload" });

    req.user = { id: String(sub), role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export default router;
