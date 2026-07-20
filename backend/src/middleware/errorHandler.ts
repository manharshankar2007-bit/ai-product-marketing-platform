import type { NextFunction, Request, Response } from "express"
import { MulterError } from "multer"
import { HttpError } from "../utils/httpError"
import { DocumentTooLargeError, ExtractionValidationError, GroqProviderError } from "../ai/errors"
import { ChunkTooLargeError, PhaseFramingNotFoundError } from "../ai/chunking/types"
import { ChunkTruncatedError } from "../ai/chunking/chunkedExtraction"
import { MalformedExtractionInputError } from "../newsletter/types"
import { NewsletterGenerationError } from "../writer/writerProvider"
import { WriterEngineFileNotFoundError } from "../writer/types"

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

  if (err instanceof DocumentTooLargeError) {
    res.status(413).json({ success: false, message: err.message })
    return
  }

  if (err instanceof ExtractionValidationError || err instanceof MalformedExtractionInputError) {
    res.status(422).json({ success: false, message: err.message })
    return
  }

  if (err instanceof GroqProviderError || err instanceof NewsletterGenerationError) {
    console.error(err)
    if (err.cause) console.error("cause:", err.cause)
    res.status(502).json({ success: false, message: err.message })
    return
  }

  if (
    err instanceof ChunkTruncatedError ||
    err instanceof ChunkTooLargeError ||
    err instanceof PhaseFramingNotFoundError
  ) {
    console.error(err)
    res.status(502).json({ success: false, message: err.message })
    return
  }

  if (err instanceof WriterEngineFileNotFoundError) {
    console.error(err)
    res.status(500).json({ success: false, message: "Newsletter writer is misconfigured" })
    return
  }

  console.error(err)
  res.status(500).json({ success: false, message: "Internal server error" })
}
