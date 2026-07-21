import "dotenv/config"
import { extractPdfText } from "./src/services/pdfExtractor"
import { cleanExtractedText } from "./src/services/textCleaner"
import { env } from "./src/config/env"
import { GroqProvider } from "./src/ai/providers/groqProvider"
import { extractFeaturesWithFutureScopePass } from "./src/ai/futureScopePass"
import { routeExtraction } from "./src/ai/chunking/router"
import { loadExtractorPromptForChunking, extractFeaturesChunkedLive } from "./src/ai/chunking/liveChunkedPipeline"
import { buildNewsletter } from "./src/newsletter/builder"
import type { NewsletterBuilderOutput } from "./src/newsletter/types"
import { prepareWriterPrompt } from "./src/writer/writerEngine"
import { WriterProvider } from "./src/writer/writerProvider"

const PDF_PATH = process.argv[2]
if (!PDF_PATH) {
  console.error("Usage: tsx scratch-test-status-fix.ts <path-to-pdf>")
  process.exit(1)
}

function sliceForWhatsNew(b: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return { ...b, newsletterType: "whats_new", comingSoon: [] }
}
function sliceForComingSoon(b: NewsletterBuilderOutput): NewsletterBuilderOutput {
  return { ...b, newsletterType: "coming_soon", whatsNew: [], unclassified: [], uiChanges: [], enhancements: [], bugFixes: [], knownLimitations: [] }
}

async function main() {
  console.log(`[test] PDF: ${PDF_PATH}`)
  const { pages, textLength, extractedText } = await extractPdfText(PDF_PATH)
  const cleanText = cleanExtractedText(extractedText)
  console.log(`[test] pages=${pages} chars=${textLength}`)

  const groqProvider = new GroqProvider()
  const systemPrompt = loadExtractorPromptForChunking()
  const route = routeExtraction(systemPrompt, cleanText, env.groqMaxOutputTokens)
  console.log(`[test] route: ${route.path} (estimated ${route.estimatedTotalTokens}, budget ${route.budgetTokens})`)

  const featureExtraction =
    route.path === "single_pass"
      ? await extractFeaturesWithFutureScopePass(groqProvider, cleanText)
      : await extractFeaturesChunkedLive(groqProvider, cleanText)

  console.log(`\n=== EXTRACTION COMPLETE — ${featureExtraction.features.length} features ===`)
  console.log("problemStatement:", featureExtraction.problemStatement)
  console.log("whyBuilt:", featureExtraction.whyBuilt)
  console.log("releasePlan:", JSON.stringify(featureExtraction.releasePlan))
  console.log("\n--- Every feature's status ---")
  const counts: Record<string, number> = {}
  for (const f of featureExtraction.features) {
    const s = f.status ?? "null"
    counts[s] = (counts[s] ?? 0) + 1
    console.log(`  [${s}] ${f.title}`)
  }
  console.log("\n--- Status distribution ---", JSON.stringify(counts))

  const builderOutput = buildNewsletter(featureExtraction)
  console.log(
    `\n=== BUILDER — newsletterType=${builderOutput.newsletterType} whatsNew=${builderOutput.whatsNew.length} comingSoon=${builderOutput.comingSoon.length} unclassified=${builderOutput.unclassified.length} ===`,
  )
  if (builderOutput.warnings.length > 0) {
    console.log("Builder warnings:", JSON.stringify(builderOutput.warnings, null, 2))
  }

  const writerProvider = new WriterProvider()

  if (builderOutput.whatsNew.length > 0) {
    console.log("\n=== WRITER: What's New ===")
    const result = await writerProvider.generateNewsletter(prepareWriterPrompt(sliceForWhatsNew(builderOutput)))
    console.log(JSON.stringify(result.newsletter, null, 2))
    console.log("tokens:", result.metadata.totalTokens)
  } else {
    console.log("\n(no What's New content)")
  }

  if (builderOutput.comingSoon.length > 0) {
    console.log("\n=== WRITER: Coming Soon ===")
    const result = await writerProvider.generateNewsletter(prepareWriterPrompt(sliceForComingSoon(builderOutput)))
    console.log(JSON.stringify(result.newsletter, null, 2))
    console.log("tokens:", result.metadata.totalTokens)
  } else {
    console.log("\n(no Coming Soon content)")
  }
}

main().catch((err) => {
  console.error("[test] FAILED:", err)
  process.exit(1)
})
