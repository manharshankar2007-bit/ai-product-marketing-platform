import type { Request, Response } from "express"
import type { HealthResponse } from "../types/health"

export function getHealth(_req: Request, res: Response<HealthResponse>) {
  res.status(200).json({
    status: "ok",
    message: "Backend is running",
  })
}
