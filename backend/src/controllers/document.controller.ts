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
import { verifyNewsletters } from "../verifier/newsletterVerifier"
import { saveNewsletter } from "../db/newsletterHistory"
import { getActiveLlmConfig } from "../config/llmProvider"
import { pipelineDebugger } from "../debug/pipelineDebugger"
import { detectDocumentStatus } from "../ai/documentStatus"

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

/**
 * Instrumentation-only wrapper around WriterProvider.generateNewsletter —
 * records the "Writer" stage, then returns exactly what the call itself
 * returned, or rethrows exactly what it threw. Never changes the result.
 */
async function generateNewsletterWithRecording(
  writerProvider: WriterProvider,
  prep: Parameters<WriterProvider["generateNewsletter"]>[0],
  label: string,
): ReturnType<WriterProvider["generateNewsletter"]> {
  const startedAt = Date.now()
  try {
    const result = await writerProvider.generateNewsletter(prep)
    pipelineDebugger.record({
      stage: "Writer",
      startedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: 1,
      firstSample: `${label}: ${result.newsletter.title}`,
    })
    return result
  } catch (error) {
    pipelineDebugger.record({
      stage: "Writer",
      startedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: 0,
      firstSample: label,
      errors: [error instanceof Error ? error.message : "Unknown Writer error"],
    })
    throw error
  }
}

export async function uploadDocument(
  req: Request,
  res: Response<UploadSuccessResponse | UploadErrorResponse>,
  next: NextFunction,
) {
  console.log("===== UPLOAD CONTROLLER HIT =====");
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" })
    return
  }

  pipelineDebugger.startRun(`${req.file.originalname}-${Date.now()}`)

  try {
    const pdfExtractionStartedAt = Date.now()
    const { pages, textLength, extractedText } = await extractPdfText(req.file.path)
    pipelineDebugger.record({
      stage: "PDF Extraction",
      startedAt: pdfExtractionStartedAt,
      endedAt: Date.now(),
      inputCount: 1,
      outputCount: extractedText.length > 0 ? 1 : 0,
      firstSample: extractedText,
    })

    const textCleaningStartedAt = Date.now()
    const cleanText = cleanExtractedText(extractedText)
    pipelineDebugger.record({
      stage: "Text Cleaning",
      startedAt: textCleaningStartedAt,
      endedAt: Date.now(),
      inputCount: extractedText.length,
      outputCount: cleanText.length,
      firstSample: cleanText,
    })

    // Deterministic, code-side document-level status detection — replaces
    // asking the model to infer this. Applied to features after extraction
    // (below), filling only status: null; never overwrites a status the
    // extraction/Future-Scope pass already set.
    const documentStatus = detectDocumentStatus(cleanText)
    console.log(`[document.controller] detected document status: ${documentStatus}`)

    const groqProvider = new GroqProvider()

    // Route based on whether this document fits the existing single-pass
    // path unchanged. Anything that fits keeps running down the exact
    // same code it always has — this is the regression guarantee. Only a
    // document too large for a single call goes down the chunked path.
    const systemPrompt = loadExtractorPromptForChunking()
    const route = routeExtraction(systemPrompt, cleanText, env.groqMaxOutputTokens)
    const documentTitle = cleanText.split("\n")[0]?.trim() || "(untitled)"
    const activeLlm = getActiveLlmConfig()
    console.log("==========================")
    console.log("DOCUMENT")
    console.log("==========================")
    console.log(`Document title: ${documentTitle}`)
    console.log(`Route chosen: ${route.path}`)
    console.log(`Provider: ${activeLlm.provider}`)
    console.log(
      `[document.controller] route: ${route.path} (estimated ${route.estimatedTotalTokens} tokens, budget ${route.budgetTokens})`,
    )

    const featureExtraction =
      route.path === "single_pass"
        ? await extractFeaturesWithFutureScopePass(groqProvider, cleanText)
        : await extractFeaturesChunkedLive(groqProvider, cleanText)

    // Fill ONLY missing (null) statuses with the deterministic document
    // default — never overwrites a status the extraction/Future-Scope pass
    // already set (e.g. Future Scope items already carry "planned" by now).
    for (const feature of featureExtraction.features) {
      if (feature.status === null) {
        feature.status = documentStatus
      }
    }

    const newsletterBuilderStartedAt = Date.now()
    const builderOutput = buildNewsletter(featureExtraction)
    pipelineDebugger.record({
      stage: "Newsletter Builder",
      startedAt: newsletterBuilderStartedAt,
      endedAt: Date.now(),
      inputCount: featureExtraction.features.length,
      outputCount: builderOutput.whatsNew.length + builderOutput.comingSoon.length + builderOutput.unclassified.length,
      firstSample: builderOutput.whatsNew[0] ?? builderOutput.comingSoon[0] ?? builderOutput.unclassified[0],
    })
    console.log("==========================")
    console.log("BUILDER INPUT")
    console.log("==========================")
    for (const feature of featureExtraction.features) {
      console.log(`Title: ${feature.title}`)
      console.log(`Status: ${feature.status}`)
    }
    console.log("==========================")
    console.log("BUILDER OUTPUT")
    console.log("==========================")
    console.log(`What's New count: ${builderOutput.whatsNew.length}`)
    console.log(`Coming Soon count: ${builderOutput.comingSoon.length}`)
    console.log(`Unclassified count: ${builderOutput.unclassified.length}`)
    console.log("==========================")
    console.log("END")
    console.log("==========================")
    const writerProvider = new WriterProvider()

    // A "mixed" release now gets two separate, independently-generated
    // newsletters instead of one combined document — each slice looks
    // like a standalone whats_new/coming_soon Builder output to the
    // Writer, so its existing per-type structure/validation applies
    // unchanged to each.
    // The Verifier (see newsletterVerifier.ts) runs AFTER the Writer, BEFORE
    // the response goes out — detect-and-report only, never blocking. It
    // needs the exact sourceItems the Writer's prompt was built from (kept
    // around from prepareWriterPrompt here, rather than re-derived), so it
    // compares against what the model actually saw, not an approximation.
    const documentContext = {
      problemStatement: builderOutput.metadata.problemStatement,
      whyBuilt: builderOutput.metadata.whyBuilt,
      releasePlan: builderOutput.metadata.releasePlan,
    }

    const whatsNewPrep = builderOutput.whatsNew.length > 0 ? prepareWriterPrompt(sliceForWhatsNew(builderOutput)) : null
    const whatsNewResult = whatsNewPrep ? await generateNewsletterWithRecording(writerProvider, whatsNewPrep, "What's New") : null

    const comingSoonPrep = builderOutput.comingSoon.length > 0 ? prepareWriterPrompt(sliceForComingSoon(builderOutput)) : null
    const comingSoonResult = comingSoonPrep ? await generateNewsletterWithRecording(writerProvider, comingSoonPrep, "Coming Soon") : null

    // Both Writer calls run before verification (not interleaved) so that
    // when both newsletters exist, verifyNewsletters can run ONE combined
    // Check 3 call instead of two — see newsletterVerifier.ts.
    const { whatsNew: whatsNewVerification, comingSoon: comingSoonVerification } = await verifyNewsletters(
      {
        whatsNew: whatsNewResult && whatsNewPrep ? { newsletter: whatsNewResult.newsletter, sourceItems: whatsNewPrep.sourceItems } : null,
        comingSoon:
          comingSoonResult && comingSoonPrep
            ? { newsletter: comingSoonResult.newsletter, sourceItems: comingSoonPrep.sourceItems }
            : null,
      },
      documentContext,
    )

    const whatsNew =
      whatsNewResult && whatsNewVerification
        ? { newsletter: whatsNewResult.newsletter, metadata: whatsNewResult.metadata, verification: whatsNewVerification }
        : null

    const comingSoon =
      comingSoonResult && comingSoonVerification
        ? { newsletter: comingSoonResult.newsletter, metadata: comingSoonResult.metadata, verification: comingSoonVerification }
        : null

    // Persistence is additive/optional — saveNewsletter never throws (see
    // db/newsletterHistory.ts), so a broken or missing database can never
    // fail a generation that already succeeded. Awaited (not
    // fire-and-forget) only so its own warning log lands before the
    // response, not because the response depends on it succeeding.
    await saveNewsletter({
      sourceFile: req.file.originalname,
      documentTitle: builderOutput.metadata.documentTitle,
      whatsNew: whatsNew?.newsletter ?? null,
      comingSoon: comingSoon?.newsletter ?? null,
      whatsNewVerification: whatsNew?.verification ?? null,
      comingSoonVerification: comingSoon?.verification ?? null,
    })

    pipelineDebugger.finalize()

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
    pipelineDebugger.finalize()
    next(error)
  }
}
