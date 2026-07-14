import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import multer, { type FileFilterCallback } from "multer"
import type { Request } from "express"
import { env } from "../config/env"
import { HttpError } from "../utils/httpError"

fs.mkdirSync(env.uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, env.uploadDir)
  },
  filename: (_req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase() || ".pdf"
    cb(null, `${randomUUID()}${extension}`)
  },
})

function pdfOnlyFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (file.mimetype !== "application/pdf") {
    cb(new HttpError(400, "Only PDF files are allowed"))
    return
  }
  cb(null, true)
}

export const uploadPdf = multer({
  storage,
  fileFilter: pdfOnlyFilter,
  limits: { fileSize: env.maxUploadSizeBytes },
}).single("file")
