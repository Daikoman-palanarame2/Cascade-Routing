/**
 * vLLM Client — real local model inference via vLLM on AMD ROCm.
 *
 * In production this hits http://vllm-local:8000/v1/chat/completions
 * (the vLLM container in docker-compose.yml). Local tokens count as
 * ZERO toward the hackathon score.
 *
 * Key advantage: vLLM supports `n` parameter — sample N times in a
 * SINGLE forward pass. This is how ConcurrentCISC n=3 actually costs
 * the same as n=1 in production (one batched forward pass on MI300X).
 *
 * Env vars:
 *   VLLM_BASE_URL  — default http://vllm-local:8000/v1
 *   LOCAL_MODEL    — default google/gemma-3-4b-it (UPDATE AT KICKOFF)
 */

export interface VLLMRequest {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  n?: number // number of samples (for ConcurrentCISC)
}

export interface VLLMSample {
  text: string
  finishReason?: string
}

export interface VLLMResponse {
  samples: VLLMSample[] // 1 if n=1, N if n=N
  promptTokens: number
  completionTokens: number // total across all samples
  totalTokens: number
  durationMs: number
  model: string
}

const DEFAULT_BASE_URL = "http://vllm-local:8000/v1"
const DEFAULT_MODEL = "google/gemma-3-4b-it" // UPDATE AT KICKOFF

function getBaseUrl(): string {
  return process.env.VLLM_BASE_URL || DEFAULT_BASE_URL
}

function getModel(): string {
  return process.env.LOCAL_MODEL || DEFAULT_MODEL
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

/**
 * Calls the local vLLM server. Returns N samples in a single request.
 * Local tokens are FREE — they count as zero toward the hackathon score.
 */
export async function vllmGenerate(req: VLLMRequest): Promise<VLLMResponse> {
  const start = Date.now()
  const baseUrl = getBaseUrl()
  const model = getModel()
  const n = req.n ?? 1

  const body = {
    model,
    messages: [
      { role: "system", content: req.systemPrompt },
      { role: "user", content: req.userPrompt },
    ],
    temperature: req.temperature ?? 0.0,
    max_tokens: req.maxTokens ?? 1024,
    n, // vLLM batched sampling — n=3 costs the same as n=1
    stream: false,
  }

  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const errorBody = await resp.text()
    throw new Error(
      `vLLM request failed with status ${resp.status}: ${errorBody.slice(0, 200)}`,
    )
  }

  const data = await resp.json()
  const choices = data.choices ?? []
  const samples: VLLMSample[] = choices.map((c: any) => ({
    text: c.message?.content ?? "",
    finishReason: c.finish_reason,
  }))

  const promptTokens = data.usage?.prompt_tokens ?? estimateTokens(
    req.systemPrompt + req.userPrompt,
  )
  const completionTokens = data.usage?.completion_tokens ?? samples.reduce(
    (s, x) => s + estimateTokens(x.text), 0,
  )

  return {
    samples,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    durationMs: Date.now() - start,
    model,
  }
}

/**
 * Health check — used by the /api/cascade/health endpoint.
 */
export async function vllmHealthCheck(): Promise<{
  healthy: boolean
  latencyMs: number
  models?: string[]
  error?: string
}> {
  const start = Date.now()
  try {
    const resp = await fetch(`${getBaseUrl()}/models`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!resp.ok) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        error: `HTTP ${resp.status}`,
      }
    }
    const data = await resp.json()
    const models = (data.data ?? []).map((m: any) => m.id)
    return {
      healthy: true,
      latencyMs: Date.now() - start,
      models,
    }
  } catch (err) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
