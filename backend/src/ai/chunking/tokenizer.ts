// llama3-tokenizer-js's package.json declares "type": "module" (ESM-only)
// with no "exports" map, which conflicts with this backend's
// "type": "commonjs" + moduleResolution "node16" — a static `import`
// cannot require() an ESM-only entry point. The package also ships a
// `.cjs` bundle (Node always treats .cjs as CommonJS regardless of
// package-level "type"), so that exact file is required directly instead
// of the package's default ESM entry. This keeps countTokens synchronous
// — needed since router.ts/chunker.ts call it as a plain function, not
// through a dynamic-import/async boundary.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const llama3Tokenizer = require("llama3-tokenizer-js/bundle/commonjs-llama3-tokenizer-with-baked-data.cjs")
  .llama3Tokenizer as { encode: (text: string) => number[] }

/**
 * Real Llama 3 tokenizer (llama3-tokenizer-js — pure JS, zero deps, no
 * network access, installs cleanly from npm). Validated against Groq's own
 * reported usage for llama-3.3-70b-versatile: this module's estimate for
 * the target document + system prompt + max output came to 17222 tokens;
 * Groq's actual 413 error for the same request reported "Requested 17269"
 * — within ~0.3%. Used as the primary estimator throughout the chunking
 * subsystem instead of the conservative chars/3 heuristic used elsewhere
 * in this codebase (see groqProvider.ts's CHARS_PER_TOKEN_ESTIMATE), which
 * overestimates badly enough on the ~22K-char extractor.md system prompt
 * (8483 vs the real 5025) that it would leave zero or negative chunk
 * budget — see chunker.ts.
 */
export function countTokens(text: string): number {
  return llama3Tokenizer.encode(text).length
}

/**
 * Conservative fallback estimator, kept only for the scenario where
 * llama3-tokenizer-js is unavailable. Not used by default — see
 * countTokens above for why the real tokenizer is required here, not just
 * preferred.
 */
export function countTokensConservative(text: string): number {
  return Math.ceil((text.length / 3) * 1.15)
}
