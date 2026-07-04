/**
 * LLM Client — dispatcher that routes to the right backend.
 *
 * Two modes:
 *   1. SIMULATION (default) — both local + remote use z-ai SDK.
 *      Used for demo/control-panel when vLLM + Fireworks aren't available.
 *      Token counts are FAKE (estimated).
 *
 *   2. PRODUCTION (SIMULATE_LOCAL=false) — local uses vLLM on
 *      localhost:8000, remote uses Fireworks AI API.
 *      Token counts are REAL. This is the mode the hackathon scoring
 *      environment runs in.
 *
 * The pipeline calls `getLLM("local")` or `getLLM("remote")` and the
 * dispatcher figures out which backend to use. The pipeline code
 * doesn't change between modes.
 *
 * Env vars:
 *   SIMULATE_LOCAL     — "true" (default) or "false"
 *   VLLM_BASE_URL      — vLLM server URL (production mode)
 *   LOCAL_MODEL        — local model name (UPDATE AT KICKOFF)
 *   FIREWORKS_API_KEY  — Fireworks API key (production mode)
 *   FIREWORKS_BASE_URL — Fireworks API URL
 *   REMOTE_MODEL       — remote model name (UPDATE AT KICKOFF)
 *   ZAI_API_KEY        — z-ai key (simulation mode, auto-provided)
 */

import ZAI, { type ChatMessage } from "z-ai-web-dev-sdk"
import { vllmGenerate } from "./vllm-client"
import { fireworksGenerate } from "./fireworks-client"

export type LLMTier = "local" | "remote"

export interface LLMResponse {
  text: string
  samples?: string[] // present when n > 1 (vLLM batched mode)
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costTokens: number // billable tokens (local = 0, remote = real cost)
  durationMs: number
  model: string
}

export interface LLMRequest {
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxTokens?: number
  n?: number // number of samples (only supported by local vLLM)
}

function isSimulationMode(): boolean {
  return process.env.SIMULATE_LOCAL !== "false"
}

export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

// ---------------------------------------------------------------------------
// Simulation backend — z-ai SDK (used for demo)
// ---------------------------------------------------------------------------

let _zai: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZai() {
  if (!_zai) _zai = await ZAI.create()
  return _zai
}

// Concurrency limiter for simulation mode (z-ai free tier)
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

async function zaiGenerate(
  req: LLMRequest,
  tier: LLMTier,
): Promise<LLMResponse> {
  const start = Date.now()
  const client = await getZai()

  const messages: ChatMessage[] = [
    { role: "system", content: req.systemPrompt },
    { role: "user", content: req.userPrompt },
  ]

  // For n > 1 in simulation mode, fire n sequential calls (vLLM does this
  // in one batched forward pass in production)
  const n = req.n ?? 1
  const samples: string[] = []

  const MAX_RETRIES = 5
  for (let sampleIdx = 0; sampleIdx < n; sampleIdx++) {
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
        samples.push(text)
        break
      } catch (err) {
        lastErr = err
        const msg = err instanceof Error ? err.message : String(err)
        const retryable =
          msg.includes("429") || msg.includes("Too many requests") ||
          msg.includes("503") || msg.includes("502") || msg.includes("500")
        if (!retryable || attempt === MAX_RETRIES) {
          throw new Error(`LLM generate failed: ${msg}`)
        }
        const backoff = Math.min(32000, 2000 * Math.pow(2, attempt))
        await sleep(backoff)
      } finally {
        releaseSlot()
      }
    }
  }

  const text = samples[0] ?? ""
  const promptTokens = estimateTokens(req.systemPrompt + req.userPrompt)
  const completionTokens = estimateTokens(samples.join(""))
  const model = tier === "local" ? "gemma-3-4b-it (simulated)" : "gemma-3-27b-it (simulated)"
  // In simulation mode, local = 0 cost, remote = estimated cost
  const costTokens = tier === "local" ? 0 : promptTokens + completionTokens

  return {
    text,
    samples: n > 1 ? samples : undefined,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    costTokens,
    durationMs: Date.now() - start,
    model,
  }
}

// ---------------------------------------------------------------------------
// Production backends — vLLM (local) + Fireworks (remote)
// ---------------------------------------------------------------------------

async function vllmLocalGenerate(req: LLMRequest): Promise<LLMResponse> {
  const r = await vllmGenerate({
    systemPrompt: req.systemPrompt,
    userPrompt: req.userPrompt,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
    n: req.n,
  })
  return {
    text: r.samples[0]?.text ?? "",
    samples: r.samples.map((s) => s.text),
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    costTokens: 0, // LOCAL TOKENS ARE FREE
    durationMs: r.durationMs,
    model: r.model,
  }
}

async function fireworksRemoteGenerate(req: LLMRequest): Promise<LLMResponse> {
  const r = await fireworksGenerate({
    systemPrompt: req.systemPrompt,
    userPrompt: req.userPrompt,
    temperature: req.temperature,
    maxTokens: req.maxTokens,
  })
  return {
    text: r.text,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    totalTokens: r.totalTokens,
    costTokens: r.costTokens, // REAL billable tokens (cached at 50%)
    durationMs: r.durationMs,
    model: r.model,
  }
}

// ---------------------------------------------------------------------------
// Public API — the pipeline calls this
// ---------------------------------------------------------------------------

export class LLMClient {
  async generate(req: LLMRequest, tier: LLMTier = "local"): Promise<LLMResponse> {
    if (isSimulationMode()) {
      return zaiGenerate(req, tier)
    }
    // Production mode
    if (tier === "local") {
      return vllmLocalGenerate(req)
    }
    return fireworksRemoteGenerate(req)
  }

  /** Convenience: generate with local tier (free tokens). */
  async local(req: LLMRequest): Promise<LLMResponse> {
    return this.generate(req, "local")
  }

  /** Convenience: generate with remote tier (paid tokens). */
  async remote(req: LLMRequest): Promise<LLMResponse> {
    return this.generate(req, "remote")
  }
}

let _client: LLMClient | null = null
export function getLLM(): LLMClient {
  if (!_client) _client = new LLMClient()
  return _client
}

export function getMode(): "simulation" | "production" {
  return isSimulationMode() ? "simulation" : "production"
}
