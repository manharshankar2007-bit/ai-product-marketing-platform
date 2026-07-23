import { Agent, fetch as undiciFetch } from "undici"

/**
 * Minimal Ollama chat-completions client, built on undici's fetch rather
 * than a new SDK dependency (undici already backs Node's own global fetch,
 * this just gets direct access to its Agent so timeouts can be configured —
 * see the note on OLLAMA_TIMEOUT_MS below).
 *
 * Hits Ollama's NATIVE /api/chat endpoint, not the OpenAI-compatible
 * /v1/chat/completions surface — confirmed live that only the native
 * endpoint honors the `format` JSON-Schema constraint (token-level
 * structured output); the OpenAI-compat endpoint silently ignores `format`
 * and returns free-form prose. groq-sdk also can't be pointed at either
 * Ollama endpoint via baseURL alone: it always POSTs to the Groq-specific
 * path "/openai/v1/chat/completions", which 404s against Ollama.
 *
 * This client implements just the one call shape every provider call site
 * uses, translating the native request/response shape to and from the
 * groq-sdk-like `ChatCompletionLike` shape those call sites already parse,
 * so their parsing/validation code is unchanged regardless of provider.
 */
export interface ChatCompletionLike {
  choices: Array<{
    message?: { content?: string | null } | null
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export interface ChatCompletionCreateParamsLike {
  model: string
  temperature?: number
  max_tokens?: number
  response_format?: { type: string }
  /** JSON Schema object — constrains generation at the token level. See src/ai/jsonSchemas.ts. */
  format?: unknown
  messages: Array<{ role: string; content: string }>
}

interface OllamaNativeChatResponse {
  message?: { content?: string | null } | null
  done_reason?: string | null
  prompt_eval_count?: number
  eval_count?: number
}

/**
 * qwen2.5:14b has a 32K architectural context window (confirmed via
 * /api/tags), but Ollama does NOT use that by default — with no `num_ctx`
 * set, it silently truncates every request to its own runtime default
 * (confirmed live: a ~5.8K-token prompt came back reporting
 * prompt_eval_count: 4095 with no num_ctx set, vs. 5791 — the real size —
 * once num_ctx was set explicitly). This was the actual root cause behind
 * every earlier Ollama failure tonight (wrong keys, nested restructuring,
 * missing fields): the model was working from a silently truncated,
 * incomplete prompt, not genuinely failing to follow the schema/instructions
 * it was given in full. 16384 comfortably covers every real prompt in this
 * pipeline (system prompt ~5.8K + largest chunk ~2.2K + header, or the
 * Writer's serialized Builder-output JSON) with headroom to spare, well
 * under the model's real 32K ceiling.
 */
const OLLAMA_NUM_CTX = 16384

export class OllamaChatClient {
  private readonly nativeBaseURL: string
  private readonly dispatcher: Agent

  constructor(
    baseURL: string,
    private readonly timeoutMs: number,
  ) {
    // env.ollamaBaseUrl defaults to ".../v1" (the OpenAI-compat convention,
    // used elsewhere for baseURL-shaped config) — strip that suffix since
    // the native API lives at the server root, not under /v1.
    this.nativeBaseURL = baseURL.replace(/\/v1\/?$/, "")
    // Node's global fetch has its own internal undici headersTimeout
    // (default ~5 minutes) that an AbortSignal does NOT override — a
    // non-streaming request (stream: false) only gets its response headers
    // once the full generation is done, so a slow multi-minute local call
    // hits UND_ERR_HEADERS_TIMEOUT well before timeoutMs, independent of
    // the signal below. A dedicated Agent with matching headers/body
    // timeouts is the only way to actually raise that ceiling.
    this.dispatcher = new Agent({ headersTimeout: timeoutMs, bodyTimeout: timeoutMs })
  }

  chat = {
    completions: {
      create: async (params: ChatCompletionCreateParamsLike): Promise<ChatCompletionLike> => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), this.timeoutMs)

        try {
          const res = await undiciFetch(`${this.nativeBaseURL}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: params.model,
              messages: params.messages,
              // Prefer the real JSON Schema when given; fall back to
              // Ollama's basic "json" mode if only response_format was set
              // (mirrors Groq's json_object, no schema enforcement).
              format: params.format ?? (params.response_format?.type === "json_object" ? "json" : undefined),
              stream: false,
              options: {
                num_ctx: OLLAMA_NUM_CTX,
                ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
                ...(params.max_tokens !== undefined ? { num_predict: params.max_tokens } : {}),
              },
            }),
            signal: controller.signal,
            dispatcher: this.dispatcher,
          })

          if (!res.ok) {
            const text = await res.text()
            throw new Error(`Ollama request failed (${res.status}): ${text}`)
          }

          const native = (await res.json()) as OllamaNativeChatResponse
          return {
            choices: [
              {
                message: { content: native.message?.content ?? null },
                finish_reason: native.done_reason ?? null,
              },
            ],
            usage: {
              prompt_tokens: native.prompt_eval_count,
              completion_tokens: native.eval_count,
              total_tokens: (native.prompt_eval_count ?? 0) + (native.eval_count ?? 0),
            },
          }
        } finally {
          clearTimeout(timer)
        }
      },
    },
  }
}
