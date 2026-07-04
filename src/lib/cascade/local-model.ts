import { getLLM } from "./llm-client"
import { pairwiseAgreement, similarity } from "./similarity"

export interface LocalResult {
  answer: string
  tokensUsed: number
  durationMs: number
  agreement: number
}

const LOCAL_SYSTEM_PROMPT = "You are a helpful and concise assistant. Answer the query directly and accurately.";

export async function localSingleShot(task: string): Promise<LocalResult> {
  const llm = getLLM()
  const response = await llm.local({
    systemPrompt: LOCAL_SYSTEM_PROMPT,
    userPrompt: task,
    temperature: 0.0,
    maxTokens: 1024,
  })
  return {
    answer: response.text.trim(),
    tokensUsed: response.totalTokens,
    durationMs: response.durationMs,
    agreement: 1.0,
  }
}

export async function localCISC(task: string): Promise<LocalResult> {
  const llm = getLLM()
  const response = await llm.local({
    systemPrompt: LOCAL_SYSTEM_PROMPT,
    userPrompt: task,
    temperature: 0.7,
    maxTokens: 1024,
    n: 3,
  })

  const samples = response.samples ?? [response.text]
  const agreement = pairwiseAgreement(samples)

  // Weighted majority vote using P-true confidence
  let bestSample = samples[0]
  let maxWeight = -1

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]
    // 1-token Y/N probe to get P-true confidence
    const pTrueUserPrompt = `Query: ${task}\nCandidate Answer: ${sample}\nIs this answer correct? Reply YES or NO.`
    const probeResponse = await llm.local({
      systemPrompt: "You are a correctness validator. Output YES or NO.",
      userPrompt: pTrueUserPrompt,
      temperature: 0.0,
      maxTokens: 256,
    })
    const isYes = probeResponse.text.trim().toUpperCase().startsWith("YES") ? 1.0 : 0.0

    // Compute average similarity of this sample to all other samples
    let simSum = 0
    for (let j = 0; j < samples.length; j++) {
      if (i !== j) {
        simSum += similarity(sample, samples[j])
      }
    }
    const avgSim = samples.length > 1 ? simSum / (samples.length - 1) : 1.0

    // CISC weighting: combination of P-true and average similarity
    const weight = 0.6 * isYes + 0.4 * avgSim
    if (weight > maxWeight) {
      maxWeight = weight
      bestSample = sample
    }
  }

  return {
    answer: bestSample.trim(),
    tokensUsed: response.totalTokens,
    durationMs: response.durationMs,
    agreement,
  }
}

export async function localRefine(task: string, draft: string): Promise<LocalResult> {
  const llm = getLLM()
  const userPrompt = `Query: ${task}\nDraft Answer: ${draft}\n\nFirst, critique the draft answer for correctness and completeness. Then, provide the refined, corrected final answer.`
  const response = await llm.local({
    systemPrompt: "You are a critical reviewer. Critique the draft and provide the corrected final answer.",
    userPrompt,
    temperature: 0.0,
    maxTokens: 1024,
  })

  const refinedAnswer = response.text.trim()
  const agreement = similarity(refinedAnswer, draft)

  return {
    answer: refinedAnswer,
    tokensUsed: response.totalTokens,
    durationMs: response.durationMs,
    agreement,
  }
}

export async function selfVerify(task: string, answer: string): Promise<boolean> {
  const llm = getLLM()
  const userPrompt = `Query: ${task}\nAnswer: ${answer}\n\nIs this answer correct and complete? Reply with ONLY 'YES' or 'NO'.`
  const response = await llm.local({
    systemPrompt: "You are a correctness validator. Output YES or NO.",
    userPrompt,
    temperature: 0.0,
    maxTokens: 256,
  })
  const text = response.text.trim().toUpperCase()
  return text.startsWith("YES")
}
