/**
 * EnrichedRemoteEscalator — TypeScript port of the Python escalator.
 *
 * Escalates to the "remote" Gemma 3 27B model (here: z-ai SDK with a
 * senior-prompt) carrying the enriched context: junior attempt + critique.
 *
 * CRITICAL — prefix-stable prompt structure:
 *   System prompt is invariant across all escalations so the Fireworks
 *   prefix-cache hash stays stable (50% input discount). Dynamic
 *   runtime data (junior attempt, critique, user query) is pushed to
 *   the BOTTOM of the user payload.
 */

import { getLLM, type LLMResponse } from "./llm-client"

export interface EscalateParams {
  task: string
  localAttempt: string
  critique: string
}

export interface EscalateResult {
  answer: string
  tokensPaid: number
  durationMs: number
  raw: LLMResponse
}

// System prompt is INVARIANT — keeps Fireworks prefix-cache hash stable
const SENIOR_SYSTEM_PROMPT = `You are a senior AI assistant. Review the junior model's attempt and critique, then provide the correct, final answer. Be accurate, complete, and concise. If the junior attempt was correct, confirm it. If it was wrong or incomplete, provide the correct answer with brief reasoning. Keep responses under 250 words.`

export class EnrichedRemoteEscalator {
  async escalate(params: EscalateParams): Promise<EscalateResult> {
    const llm = getLLM()
    const start = Date.now()

    // Format user payload with dynamic content pushed to the bottom
    // so previous instruction chunks match cache line boundaries
    const userPrompt = [
      `INSTRUCTION: Resolve the query completely.`,
      `JUNIOR ATTEMPT:`,
      params.localAttempt || "(no local attempt was made)",
      ``,
      `JUNIOR CRITIQUE:`,
      params.critique,
      ``,
      `USER QUERY:`,
      params.task,
    ].join("\n")

    const response = await llm.generate({
      systemPrompt: SENIOR_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.0,
      maxTokens: 512,
    })

    return {
      answer: response.text.trim(),
      tokensPaid: response.totalTokens,
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
