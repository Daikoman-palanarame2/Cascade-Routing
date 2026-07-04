/**
 * EnrichedRemoteEscalator — the paid Fireworks 27B tier.
 *
 * v3 upgrades:
 *   1. Uses tier-aware LLM client (Fireworks in production, z-ai in simulation)
 *   2. Tighter token budget — max 400 tokens
 *   3. Includes local agreement + selfVerify result in hand-off
 *   4. Prefix-stable prompt structure for Fireworks prefix-cache (50% discount)
 *
 * The system prompt is INVARIANT across all escalations so the
 * Fireworks prefix-cache hash stays stable.
 *
 * PAID TOKENS — these count toward the hackathon score.
 */

import { getLLM, type LLMResponse } from "./llm-client"

export interface EscalateParams {
  task: string
  localAttempt: string
  critique: string
  agreement?: number
  selfVerify?: boolean | null
}

export interface EscalateResult {
  answer: string
  tokensPaid: number // REAL billable tokens (cached at 50%)
  durationMs: number
  raw: LLMResponse
}

const SENIOR_SYSTEM_PROMPT = `You are a senior AI assistant. Review the junior model's attempt and confidence signals, then provide the correct final answer. Rules:
- If the junior attempt is correct, confirm it in ONE sentence.
- If the junior attempt is wrong or incomplete, provide the correct answer in under 100 words.
- Do not restate the question. Do not hedge. Be definitive.
- If the junior self-verified as YES, lean toward confirming. If NO, override completely.`

export class EnrichedRemoteEscalator {
  async escalate(params: EscalateParams): Promise<EscalateResult> {
    const llm = getLLM()
    const start = Date.now()

    const agreementStr =
      params.agreement !== undefined ? `${params.agreement.toFixed(2)}` : "N/A"
    const verifyStr =
      params.selfVerify === true
        ? "YES (local confirmed)"
        : params.selfVerify === false
          ? "NO (local rejected)"
          : "N/A"

    const userPrompt = [
      `INSTRUCTION: Resolve the query completely. Be concise.`,
      `JUNIOR ATTEMPT:`,
      params.localAttempt || "(no local attempt was made)",
      ``,
      `JUNIOR CONFIDENCE SIGNALS:`,
      `  n=3 agreement: ${agreementStr}`,
      `  self-verify: ${verifyStr}`,
      `  critique: ${params.critique}`,
      ``,
      `USER QUERY:`,
      params.task,
    ].join("\n")

    // REMOTE tier — PAID TOKENS
    const response = await llm.remote({
      systemPrompt: SENIOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.0,
      maxTokens: 400,
    })

    return {
      answer: response.text.trim(),
      tokensPaid: response.costTokens, // real billable tokens
      durationMs: Date.now() - start,
      raw: response,
    }
  }
}

let _escalator: EnrichedRemoteEscalator | null = null
export function getEscalator(): EnrichedRemoteEscalator {
  if (!_escalator) _escalator = new EnrichedRemoteEscalator()
  return _escalator
}
