/**
 * Fireworks Client — real remote model inference via Fireworks AI API.
 *
 * In production this hits https://api.fireworks.ai/inference/v1/chat/completions
 * with FIREWORKS_API_KEY. These tokens are PAID — they count toward
 * the hackathon score.
 *
 * Prefix-cache optimization: Fireworks gives 50% discount on cached
 * input tokens. The escalation prompt structure (static system prompt
 * on top, dynamic payload on bottom) keeps the prefix hash stable
 * so the cache hits across queries.
 *
 * Env vars:
 *   FIREWORKS_API_KEY  — REQUIRED (from AMD AI Developer Program)
 *   FIREWORKS_BASE_URL — default https://api.fireworks.ai/inference/v1
 *   REMOTE_MODEL       — default accounts/fireworks/models/gemma-3-27b-it
 *                        (UPDATE AT KICKOFF)
 */

export interface FireworksRequest {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
}

export interface FireworksResponse {
  text: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cachedPromptTokens?: number // tokens that hit prefix cache (50% discount)
  costTokens: number // actual billable tokens (cached count as 0.5)
  durationMs: number
  model: string
}

const DEFAULT_BASE_URL = "https://api.fireworks.ai/inference/v1"
const DEFAULT_MODEL = "accounts/fireworks/models/gemma-3-27b-it" // UPDATE AT KICKOFF

function getBaseUrl(): string {
  return process.env.FIREWORKS_BASE_URL || DEFAULT_BASE_URL
}

function getModel(): string {
  return process.env.REMOTE_MODEL || DEFAULT_MODEL
}

function getApiKey(): string {
  const key = process.env.FIREWORKS_API_KEY
  if (!key) {
    throw new Error(
      "FIREWORKS_API_KEY is not set. Get it from the AMD AI Developer Program.",
    )
  }
  return key
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Calls the Fireworks AI remote API. These tokens are PAID.
 *
 * The response includes cachedPromptTokens if Fireworks returns
 * prefix-cache hit info — those count at 50% toward the score.
 */
export async function fireworksGenerate(
  req: FireworksRequest,
): Promise<FireworksResponse> {
  const start = Date.now()
  const baseUrl = getBaseUrl()
  const model = getModel()
  const apiKey = getApiKey()

  const body = {
    model,
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ],
    temperature: req.temperature ?? 0.0,
    max_tokens: req.maxTokens ?? 1024,
    stream: false,
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errorBody = await resp.text()
    throw new Error(
      `Fireworks request failed with status ${resp.status}: ${errorBody.slice(0, 200)}`,
    )
  }

  const data = await resp.json()
  const text = data.choices?.[0]?.message?.content ?? ""
  const promptTokens = data.usage?.prompt_tokens ?? estimateTokens(
    req.systemPrompt + req.userPrompt,
  )
  const completionTokens = data.usage?.completion_tokens ?? estimateTokens(text)

  // Fireworks returns prompt_tokens_details.cached_tokens for prefix-cache hits
  const cachedPromptTokens =
    data.usage?.prompt_tokens_details?.cached_tokens ?? 0

  // Cost: cached tokens count at 50%, uncached at 100%, completion at 100%
  const costTokens =
    Math.round((promptTokens - cachedPromptTokens) + cachedPromptTokens * 0.5) +
    completionTokens

  return {
    text,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    cachedPromptTokens,
    costTokens,
    durationMs: Date.now() - start,
    model,
  }
}

/**
 * Health check — used by the /api/cascade/health endpoint.
 * We don't actually call the API (would cost tokens); just verify
 * the API key is set.
 */
export function fireworksHealthCheck(): {
  healthy: boolean
  hasApiKey: boolean
  model: string
} {
  return {
    healthy: Boolean(process.env.FIREWORKS_API_KEY),
    hasApiKey: Boolean(process.env.FIREWORKS_API_KEY),
    model: getModel(),
  }
}
