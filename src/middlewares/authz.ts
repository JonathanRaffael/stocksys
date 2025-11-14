import type { RequestHandler } from "express"

export type AppRole = "ADMIN" | "MASTER" | "USER" | "IPQC" | "OQC"

// Tambahan typing untuk req.user
declare global {
  namespace Express {
    interface User {
      id: string
      role: AppRole
    }

    interface Request {
      user?: User
    }
  }
}

/** Middleware: pastikan sudah login */
export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" })
  }
  next()
}

/** Middleware: pastikan punya role tertentu */
export const requireRole = (...roles: AppRole[]): RequestHandler => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" })
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden (insufficient role)" })
    }
    next()
  }
}
