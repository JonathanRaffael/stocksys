// @ts-nocheck
import { Router } from "express";
import prismaPkg from "@prisma/client";
import { z } from "zod";
import bcrypt from "bcrypt";
import { verifyToken } from "./auth.js";
import { requireRole } from "../middlewares/authz.js";

const { PrismaClient, Role } = prismaPkg;
const prisma = new PrismaClient();
const router = Router();

/* =========================
 * Zod Schemas
 * ========================= */
const userCreateSchema = z.object({
  name: z.string().min(2, "Name minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z.string().min(4, "Password minimal 4 karakter"),
  role: z.nativeEnum(Role, { errorMap: () => ({ message: "Role tidak valid" }) }),
});

const userPatchSchema = z.object({
  name: z.string().min(2, "Name minimal 2 karakter").optional(),
  email: z.string().email("Email tidak valid").optional(),
  role: z.nativeEnum(Role, { errorMap: () => ({ message: "Role tidak valid" }) }).optional(),
});

const resetPassSchema = z.object({
  password: z.string().min(4, "Password minimal 4 karakter"),
});

// NOTE: kalau id kamu UUID/CUID, schema berikut bisa disesuaikan:
// const idSchema = z.object({ id: z.string().uuid("ID tidak valid") })
const idSchema = z.object({ id: z.string().min(1, "ID wajib diisi") });

/* =========================
 * Selectors (hide sensitive)
 * ========================= */
const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} as const;

/* =========================
 * Helpers
 * ========================= */
function isPrismaError(e, code) {
  return !!(e && typeof e === "object" && "code" in e && e.code === code);
}

/* =========================
 * Routes
 * ========================= */

// GET /api/users  (ADMIN only)
router.get("/", verifyToken, requireRole("ADMIN"), async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: publicUserSelect,
    });
    res.json(users);
  } catch (err) {
    console.error("GET /api/users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// POST /api/users  (ADMIN only)
router.post("/", verifyToken, requireRole("ADMIN"), async (req, res) => {
  try {
    const parsed = userCreateSchema.parse(req.body);
    const hashed = await bcrypt.hash(parsed.password, 10);

    const user = await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        password: hashed,
        role: parsed.role,
      },
      select: publicUserSelect,
    });

    res.status(201).json(user);
  } catch (err) {
    console.error("POST /api/users error:", err);

    if (isPrismaError(err, "P2002")) {
      // unique constraint (email)
      return res.status(409).json({ error: "Email already exists" });
    }
    if (err?.issues) {
      return res.status(400).json({ error: err.issues });
    }

    res.status(500).json({ error: "Failed to create user" });
  }
});

// PATCH /api/users/:id  (ADMIN only)
router.patch("/:id", verifyToken, requireRole("ADMIN"), async (req, res) => {
  try {
    const { id } = idSchema.parse(req.params);
    const parsed = userPatchSchema.parse(req.body);

    // kalau tidak ada field yang dikirim, balikan 400
    if (!Object.keys(parsed).length) {
      return res.status(400).json({ error: "No fields to update" });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: parsed,
      select: publicUserSelect,
    });

    res.json(updated);
  } catch (err) {
    console.error("PATCH /api/users/:id error:", err);

    if (isPrismaError(err, "P2025")) {
      return res.status(404).json({ error: "User not found" });
    }
    if (isPrismaError(err, "P2002")) {
      return res.status(409).json({ error: "Email already exists" });
    }
    if (err?.issues) {
      return res.status(400).json({ error: err.issues });
    }

    res.status(500).json({ error: "Failed to update user" });
  }
});

// PATCH /api/users/:id/password  (ADMIN only)
router.patch("/:id/password", verifyToken, requireRole("ADMIN"), async (req, res) => {
  try {
    const { id } = idSchema.parse(req.params);
    const { password } = resetPassSchema.parse(req.body);
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.update({
      where: { id },
      data: { password: hashed },
      select: { id: true },
    });

    res.json({ ok: true, id: user.id });
  } catch (err) {
    console.error("PATCH /api/users/:id/password error:", err);

    if (isPrismaError(err, "P2025")) {
      return res.status(404).json({ error: "User not found" });
    }
    if (err?.issues) {
      return res.status(400).json({ error: err.issues });
    }

    res.status(500).json({ error: "Failed to reset password" });
  }
});

// DELETE /api/users/:id  (ADMIN only)
router.delete("/:id", verifyToken, requireRole("ADMIN"), async (req, res) => {
  try {
    const { id } = idSchema.parse(req.params);

    // jangan boleh hapus diri sendiri
    if (req.user?.id === id) {
      return res.status(400).json({ error: "You cannot delete your own account" });
    }

    const user = await prisma.user.delete({
      where: { id },
      select: { id: true },
    });

    res.json({ ok: true, id: user.id });
  } catch (err) {
    console.error("DELETE /api/users/:id error:", err);

    if (isPrismaError(err, "P2025")) {
      return res.status(404).json({ error: "User not found" });
    }

    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
