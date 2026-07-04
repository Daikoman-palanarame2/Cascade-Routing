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

export class LLMClient {
  async generate(req: LLMRequest): Promise<LLMResponse> {
    const start = Date.now()
    const client = await getClient()

    const messages: ChatMessage[] = [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ]

    try {
      const response = await client.chat.completions.create({
        messages,
        stream: false,
        thinking: { type: "disabled" },
        temperature: req.temperature ?? 0.0,
        max_tokens: req.maxTokens ?? 1024,
      })

      const text = response.choices?.[0]?.message?.content ?? ""
      const promptTokens = estimateTokens(req.systemPrompt + req.userPrompt)
      const completionTokens = estimateTokens(text)
      return {
        text,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      // Re-throw with context — caller's exception guard will escalate
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`LLM generate failed: ${message}`)
    }
  }
}

let _client: LLMClient | null = null
export function getLLM(): LLMClient {
  if (!_client) _client = new LLMClient()
  return _client
}
