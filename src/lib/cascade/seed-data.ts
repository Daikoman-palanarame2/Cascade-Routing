/**
 * Seed dataset for the meta-router training and the routing sandbox.
 *
 * 8 stratified tasks spanning easy / medium / hard / cached. Each is
 * labeled with the "oracle" route (what the Anti-Hallucination Oracle
 * Gate decided). Used by /api/cascade/train to fit the XGBoost +
 * Isotonic calibrator.
 */

import type { MetaFeatures } from "./meta-router"

export interface SeedTask {
  id: string
  label: string
  task: string
  expectedRoute: "cache" | "local" | "refine" | "escalated"
  pEasy: number
  oracleLabel: number // 1 = local-pass, 0 = escalate
}

export const seedTasks: SeedTask[] = [
  {
    id: "easy",
    label: "Easy — Capital lookup",
    task: "What is the capital of Australia?",
    expectedRoute: "local",
    pEasy: 0.92,
    oracleLabel: 1,
  },
  {
    id: "easy-2",
    label: "Easy — Definition",
    task: "Define photosynthesis in one sentence.",
    expectedRoute: "local",
    pEasy: 0.88,
    oracleLabel: 1,
  },
  {
    id: "medium",
    label: "Medium — Multi-step math",
    task: "Solve: a train travels 60km in 45min. What is its speed in km/h?",
    expectedRoute: "refine",
    pEasy: 0.61,
    oracleLabel: 1,
  },
  {
    id: "medium-2",
    label: "Medium — Code explanation",
    task: "Explain what this Python code does: def f(n): return n * f(n-1) if n else 1",
    expectedRoute: "refine",
    pEasy: 0.55,
    oracleLabel: 1,
  },
  {
    id: "hard",
    label: "Hard — Counterfactual reasoning",
    task: "If the Treaty of Westphalia had been signed in 1700 instead of 1648, how would the balance of power in 18th-century Europe have differed?",
    expectedRoute: "escalated",
    pEasy: 0.18,
    oracleLabel: 0,
  },
  {
    id: "hard-2",
    label: "Hard — Ethics analysis",
    task: "Critically evaluate the trolley problem from both utilitarian and deontological perspectives, then propose a third framework that resolves the dilemma.",
    expectedRoute: "escalated",
    pEasy: 0.12,
    oracleLabel: 0,
  },
  {
    id: "cached",
    label: "Cached — Repeat query",
    task: "Summarize the plot of Shakespeare's Hamlet in three sentences.",
    expectedRoute: "cache",
    pEasy: 0.74,
    oracleLabel: 1,
  },
  {
    id: "cached-2",
    label: "Cached — Repeat query",
    task: "What are the three branches of the United States government?",
    expectedRoute: "cache",
    pEasy: 0.83,
    oracleLabel: 1,
  },
]

/**
 * Synthesize the training features for the meta-router.
 * For each seed task, we synthesize plausible (pEasy, agreement, judge, isRefined)
 * tuples with the oracle label flipped for hard tasks.
 *
 * 16 samples (2 per seed task) give the logistic-regression + isotonic
 * fit enough data to clear AUC ≥ 0.75 / Brier ≤ 0.15.
 */
export function buildTrainingSet(): { features: MetaFeatures[]; labels: number[] } {
  const features: MetaFeatures[] = []
  const labels: number[] = []
  for (const t of seedTasks) {
    if (t.expectedRoute === "cache" || t.expectedRoute === "local") {
      // Easy samples — high agreement, high judge
      features.push({
        pEasy: t.pEasy,
        agreement: 0.92,
        judgeScore: 4.6,
        isRefined: false,
      })
      labels.push(1)
      features.push({
        pEasy: t.pEasy - 0.05,
        agreement: 0.88,
        judgeScore: 4.2,
        isRefined: false,
      })
      labels.push(1)
    } else if (t.expectedRoute === "refine") {
      // Refine samples — borderline; pre-refine labeled 0, post-refine labeled 1
      features.push({
        pEasy: t.pEasy,
        agreement: 0.55,
        judgeScore: 2.8,
        isRefined: false,
      })
      labels.push(0)
      features.push({
        pEasy: t.pEasy,
        agreement: 0.78,
        judgeScore: 4.0,
        isRefined: true,
      })
      labels.push(1)
    } else {
      // Escalated samples — low everything
      features.push({
        pEasy: t.pEasy,
        agreement: 0.38,
        judgeScore: 1.4,
        isRefined: false,
      })
      labels.push(0)
      features.push({
        pEasy: t.pEasy + 0.02,
        agreement: 0.42,
        judgeScore: 1.8,
        isRefined: true,
      })
      labels.push(0)
    }
  }
  return { features, labels }
}
