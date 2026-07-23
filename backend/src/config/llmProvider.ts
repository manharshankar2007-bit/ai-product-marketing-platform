import { env } from "./env"

/**
 * Single resolver for "which LLM backend is active" — every module that
 * constructs a Groq-SDK client (extraction, chunked extraction, Writer,
 * Verifier Check 3) reads its {apiKey, baseURL, model, timeout} from here
 * instead of reaching into env.groq* directly, so the provider swap lives
 * in exactly one place.
 *
 * groq-sdk is a generic OpenAI-compatible client (accepts baseURL/timeout
 * overrides), so Ollama's OpenAI-compatible endpoint is reached with the
 * same `Groq` client class — no new SDK dependency.
 */
export interface ActiveLlmConfig {
  provider: "groq" | "ollama"
  isOllama: boolean
  apiKey: string
  /** undefined = let the groq-sdk client use its own default (https://api.groq.com) — byte-identical to pre-existing behavior when provider is "groq". */
  baseURL: string | undefined
  model: string
  /** undefined = groq-sdk's own default (1 minute) — byte-identical to pre-existing behavior when provider is "groq". */
  timeout: number | undefined
}

// Local inference is slow (minutes per call, per the task). Generous enough
// that a real qwen2.5:14b call on a full chunk never spuriously times out.
const OLLAMA_TIMEOUT_MS = 20 * 60 * 1000

export function getActiveLlmConfig(): ActiveLlmConfig {
  if (env.llmProvider === "ollama") {
    return {
      provider: "ollama",
      isOllama: true,
      apiKey: env.ollamaApiKey,
      baseURL: env.ollamaBaseUrl,
      model: env.ollamaModel,
      timeout: OLLAMA_TIMEOUT_MS,
    }
  }

  return {
    provider: "groq",
    isOllama: false,
    apiKey: env.groqApiKey,
    baseURL: undefined,
    model: env.groqModel,
    timeout: undefined,
  }
}
