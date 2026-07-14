import { readFile } from "node:fs/promises"
import { PDFParse } from "pdf-parse"
import { HttpError } from "../utils/httpError"

export interface PdfExtractionResult {
  pages: number
  textLength: number
  extractedText: string
}

export async function extractPdfText(filePath: string): Promise<PdfExtractionResult> {
  const data = await readFile(filePath)
  const parser = new PDFParse({ data })

  try {
    const result = await parser.getText()

    return {
      pages: result.total,
      textLength: result.text.length,
      extractedText: result.text,
    }
  } catch {
    throw new HttpError(422, "Failed to extract text from the uploaded PDF")
  } finally {
    await parser.destroy()
  }
}
