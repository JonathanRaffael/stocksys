// src/types/express.d.ts
import "express-serve-static-core"

declare module "express-serve-static-core" {
  interface Request {
    user?: {
      id: string
      role: string
      email: string
      name: string
      iat?: number
      exp?: number
    }
  }
}
