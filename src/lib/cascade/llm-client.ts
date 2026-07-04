/**
 * LLM client wrapper — uses z-ai-web-dev-sdk for actual model inference.
 *
 * This single client is used by both the "local" Gemma 4B simulation
 * and the "remote" Fireworks 27B escalation path. They differ in
 * system prompt and temperature, not in the underlying SDK call.
 *
 * In production these would be two separate HTTP clients (vLLM on
 * localhost:8000 for local, Fireworks REST for remote). The shape of
 * the response is identical so the pipeline code doesn't change.
 *
 * Includes a global concurrency limiter + retry-with-backoff so the
 * ablation harness (which fires 100+ calls in quick succession) doesn't
 * trip the z-ai API's 429 rate limit.
 */

import ZAI, { type ChatMessage } from "z-ai-web-dev-sdk"

export interface LLMResponse {
  text: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  durationMs: number
}

export interface LLMRequest {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getClient() {
  if (!_zai) {
    _zai = await ZAI.create()
  }
  return _zai
}

/**
 * Crude token estimator (cl100k_base approximation). Real pipeline
 * uses tiktoken, but for the demo we approximate with 4 chars/token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

// ---------------------------------------------------------------------------
// Concurrency limiter — max 1 concurrent LLM call, plus a 2000ms gap between
// calls to stay under the z-ai free-tier rate limit.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = 1
const MIN_GAP_MS = 2000
let _active = 0
const _queue: Array<() => void> = []
let _lastCallAt = 0

async function acquireSlot(): Promise<void> {
  while (_active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => _queue.push(resolve))
  }
  _active++
  // Enforce minimum gap between calls to avoid bursts
  const now = Date.now()
  const wait = Math.max(0, _lastCallAt + MIN_GAP_MS - now)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  _lastCallAt = Date.now()
}

function releaseSlot(): void {
  _active--
  const next = _queue.shift()
  if (next) next()
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class LLMClient {
  async generate(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now()
    const client = await getClient()

    const messages: ChatMessage[] = [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ]

    // Retry with exponential backoff on 429 / 5xx
    // 5 attempts: 2s, 4s, 8s, 16s = 30s total max backoff
    const MAX_RETRIES = 5
    let lastErr: unknown = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await acquireSlot()
      try {
        const response = await client.chat.completions.create({
          messages,
          stream: false,
          thinking: { type: "disabled" },
          temperature: req.temperature ?? 0.0,
          max_tokens: req.maxTokens ?? 1024,
        })

        const text = response.choices?.[0]?.message?.content ?? ""
        const promptTokens = estimateTokens(
          req.systemPrompt + req.userPrompt,
        )
        const completionTokens = estimateTokens(text)
        return {
          text,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          durationMs: Date.now() - start,
        }
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        // Retry on 429 (rate limit) or 5xx (server error)
        const retryable =
          msg.includes("429") ||
          msg.includes("Too many requests") ||
          msg.includes("503") ||
          msg.includes("502") ||
          msg.includes("500")
        if (!retryable || attempt === MAX_RETRIES) {
          throw new Error(`LLM generate failed: ${msg}`)
        }
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const backoff = Math.min(32000, 2000 * Math.pow(2, attempt))
        await sleep(backoff)
      } finally {
        releaseSlot()
      }
    }
    throw new Error(
      `LLM generate failed after ${MAX_RETRIES + 1} attempts: ${
        lastErr instanceof Error ? lastErr.message : String(lastErr)
      }`,
    )
  }
}

let _client: LLMClient | null = null
export function getLLM(): LLMClient {
  if (!_client) _client = new LLMClient()
  return _client
}
