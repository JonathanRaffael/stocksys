// server/middlewares/verifyToken.ts
import { RequestHandler } from "express";
import jwt from "jsonwebtoken";

export const verifyToken: RequestHandler = (req, res, next) => {
  // jangan tahan preflight
  if (req.method === "OPTIONS") return next();

  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!);
    const { sub } = payload as any;
    const role = (payload as any).role;

    if (!sub || !role) {
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // cocokkan dengan typing kamu
    req.user = { id: String(sub), role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
