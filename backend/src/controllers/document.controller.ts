import type { NextFunction, Request, Response } from "express"
import type { UploadErrorResponse, UploadSuccessResponse } from "../types/document"
import { extractPdfText } from "../services/pdfExtractor"
import { cleanExtractedText } from "../services/textCleaner"
import { env } from "../config/env"
import { GroqProvider } from "../ai/providers/groqProvider"
import { extractFeaturesWithFutureScopePass } from "../ai/futureScopePass"
import { routeExtraction } from "../ai/chunking/router"
import { loadExtractorPromptForChunking, extractFeaturesChunkedLive } from "../ai/chunking/liveChunkedPipeline"
import { buildNewsletter } from "../newsletter/builder"
import type { NewsletterBuilderOutput } from "../newsletter/types"
import { prepareWriterPrompt } from "../writer/writerEngine"
import { WriterProvider } from "../writer/writerProvider"

/**
 * Slices a "mixed" Builder output down to just its What's New content, so
 * it can be rendered as its own standalone newsletter instead of being
 * woven into one combined document. Builder's own classification logic is
 * untouched — this only rearranges its already-produced output.
 */
function sliceForWhatsNew(builderOutput: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return { ...builderOutput, newsletterType: "whats_new", comingSoon: [] }
}

/** Counterpart to sliceForWhatsNew — Coming Soon content only. */
function sliceForComingSoon(builderOutput: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return {
    ...builderOutput,
    newsletterType: "coming_soon",
    whatsNew: [],
    unclassified: [],
    uiChanges: [],
    enhancements: [],
    bugFixes: [],
    knownLimitations: [],
  }
}

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

    const groqProvider = new GroqProvider()

    // Route based on whether this document fits the existing single-pass
    // path unchanged. Anything that fits keeps running down the exact
    // same code it always has — this is the regression guarantee. Only a
    // document too large for a single call goes down the chunked path.
    const systemPrompt = loadExtractorPromptForChunking()
    const route = routeExtraction(systemPrompt, cleanText, env.groqMaxOutputTokens)
    console.log(
      `[document.controller] route: ${route.path} (estimated ${route.estimatedTotalTokens} tokens, budget ${route.budgetTokens})`,
    )

    const featureExtraction =
      route.path === "single_pass"
        ? await extractFeaturesWithFutureScopePass(groqProvider, cleanText)
        : await extractFeaturesChunkedLive(groqProvider, cleanText)

    const builderOutput = buildNewsletter(featureExtraction)
    const writerProvider = new WriterProvider()

    // A "mixed" release now gets two separate, independently-generated
    // newsletters instead of one combined document — each slice looks
    // like a standalone whats_new/coming_soon Builder output to the
    // Writer, so its existing per-type structure/validation applies
    // unchanged to each.
    const whatsNew = builderOutput.whatsNew.length > 0
      ? await writerProvider.generateNewsletter(prepareWriterPrompt(sliceForWhatsNew(builderOutput)))
      : null

    const comingSoon = builderOutput.comingSoon.length > 0
      ? await writerProvider.generateNewsletter(prepareWriterPrompt(sliceForComingSoon(builderOutput)))
      : null

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
      newsletters: { whatsNew, comingSoon },
    })
  } catch (error) {
    next(error)
  }
}
