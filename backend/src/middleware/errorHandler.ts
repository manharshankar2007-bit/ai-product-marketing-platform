import type { NextFunction, Request, Response } from "express"
import { MulterError } from "multer"
import { HttpError } from "../utils/httpError"

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE" ? "File exceeds the 20MB size limit" : err.message
    res.status(400).json({ success: false, message })
    return
  }

  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ success: false, message: err.message })
    return
  }

  console.error(err)
  res.status(500).json({ success: false, message: "Internal server error" })
}
