import { countTokens } from "./tokenizer"
import type { ExtractionRoute } from "./types"

export const TPM_LIMIT = 12_000
export const SAFETY_MARGIN_FRACTION = 0.15
/** Flat reserve: 15% of the TPM ceiling itself, per the verified design — not 15% of the estimate. */
export const SAFETY_MARGIN_TOKENS = Math.round(TPM_LIMIT * SAFETY_MARGIN_FRACTION)

/**
 * Decides whether a document fits the existing, unchanged single-pass
 * extraction path, or needs the chunked path. This is the regression
 * guarantee: any document that fits keeps running down the identical
 * code (groqProvider.ts / futureScopePass.ts) it runs down today — this
 * function makes the decision but never touches that path itself.
 */
export function routeExtraction(
  systemPrompt: string,
  documentText: string,
  maxOutputTokens: number,
): ExtractionRoute {
  const promptTokens = countTokens(systemPrompt)
  const documentTokens = countTokens(documentText)
  const estimatedTotalTokens = promptTokens + documentTokens + maxOutputTokens
  const budgetTokens = TPM_LIMIT - SAFETY_MARGIN_TOKENS

  const base = {
    promptTokens,
    documentTokens,
    maxOutputTokens,
    estimatedTotalTokens,
    tpmLimit: TPM_LIMIT,
    safetyMarginTokens: SAFETY_MARGIN_TOKENS,
    budgetTokens,
  }

  if (estimatedTotalTokens <= budgetTokens) {
    return { ...base, path: "single_pass" }
  }

  return { ...base, path: "chunked", overBy: estimatedTotalTokens - budgetTokens }
}
