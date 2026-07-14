import type { NextFunction, Request, Response } from "express"
import type { UploadErrorResponse, UploadSuccessResponse } from "../types/document"
import { extractPdfText } from "../services/pdfExtractor"
import { cleanExtractedText } from "../services/textCleaner"

export async function uploadDocument(
  req: Request,
  res: Response<UploadSuccessResponse | UploadErrorResponse>,
  next: NextFunction,
) {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" })
    return
  }

  try {
    const { pages, textLength, extractedText } = await extractPdfText(req.file.path)
    const cleanText = cleanExtractedText(extractedText)

    res.status(201).json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      pages,
      textLength,
      rawText: extractedText,
      cleanText,
    })
  } catch (error) {
    next(error)
  }
}
