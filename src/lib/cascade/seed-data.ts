/**
 * Seed dataset for the meta-router training — v2 with 6 features.
 *
 * Expanded to 24 stratified tasks (8 easy / 8 medium / 8 hard).
 * Each generates 3 training samples (different agreement/verify combos)
 * for a total of 72 training points.
 *
 * Features per sample:
 *   pEasy, agreement, selfVerify, answerLenRatio, judgeScore, isRefined
 *
 * Labels: 1 = local pass, 0 = escalate
 */

import type { MetaFeatures } from "./meta-router"

export interface SeedTask {
  id: string
  label: string
  task: string
  expectedRoute: "cache" | "local" | "refine" | "escalated"
  pEasy: number
  oracleLabel: number
}

export const seedTasks: SeedTask[] = [
  // ----- Easy (8) — local single-shot + self-verify YES -----
  { id: "easy-1", label: "Capital lookup", task: "What is the capital of Australia?", expectedRoute: "local", pEasy: 0.92, oracleLabel: 1 },
  { id: "easy-2", label: "Definition", task: "Define photosynthesis in one sentence.", expectedRoute: "local", pEasy: 0.88, oracleLabel: 1 },
  { id: "easy-3", label: "Simple math", task: "What is 15 multiplied by 12?", expectedRoute: "local", pEasy: 0.85, oracleLabel: 1 },
  { id: "easy-4", label: "Chemical symbol", task: "What is the chemical symbol for gold?", expectedRoute: "local", pEasy: 0.90, oracleLabel: 1 },
  { id: "easy-5", label: "Author lookup", task: "Who wrote the play 'Romeo and Juliet'?", expectedRoute: "local", pEasy: 0.87, oracleLabel: 1 },
  { id: "easy-6", label: "Largest planet", task: "What is the largest planet in our solar system?", expectedRoute: "local", pEasy: 0.89, oracleLabel: 1 },
  { id: "easy-7", label: "Branches of gov", task: "What are the three branches of the United States government?", expectedRoute: "local", pEasy: 0.83, oracleLabel: 1 },
  { id: "easy-8", label: "Speed calc", task: "If a recipe needs 2/3 cup of flour and you're tripling it, how much flour do you need?", expectedRoute: "local", pEasy: 0.81, oracleLabel: 1 },

  // ----- Medium (8) — CISC n=3 + self-verify, may refine -----
  { id: "med-1", label: "Train speed", task: "Solve: a train travels 60km in 45min. What is its speed in km/h?", expectedRoute: "refine", pEasy: 0.61, oracleLabel: 1 },
  { id: "med-2", label: "Code explanation", task: "Explain what this Python code does: def f(n): return n * f(n-1) if n else 1", expectedRoute: "refine", pEasy: 0.55, oracleLabel: 1 },
  { id: "med-3", label: "TCP vs UDP", task: "Compare TCP and UDP in two sentences.", expectedRoute: "refine", pEasy: 0.58, oracleLabel: 1 },
  { id: "med-4", label: "Binary search", task: "What is the time complexity of binary search and why?", expectedRoute: "refine", pEasy: 0.52, oracleLabel: 1 },
  { id: "med-5", label: "Weather vs climate", task: "Explain the difference between weather and climate in one sentence.", expectedRoute: "local", pEasy: 0.72, oracleLabel: 1 },
  { id: "med-6", label: "Seasons", task: "What causes the seasons on Earth?", expectedRoute: "local", pEasy: 0.68, oracleLabel: 1 },
  { id: "med-7", label: "Recursion trace", task: "What is the output of this Python code: print([x**2 for x in range(5)])?", expectedRoute: "local", pEasy: 0.70, oracleLabel: 1 },
  { id: "med-8", label: "HTTP methods", task: "What is the difference between GET and POST requests?", expectedRoute: "refine", pEasy: 0.64, oracleLabel: 1 },

  // ----- Hard (8) — escalate immediately via early-exit -----
  { id: "hard-1", label: "Counterfactual treaty", task: "If the Treaty of Westphalia had been signed in 1700 instead of 1648, how would the balance of power in 18th-century Europe have differed?", expectedRoute: "escalated", pEasy: 0.18, oracleLabel: 0 },
  { id: "hard-2", label: "Trolley problem", task: "Critically evaluate the trolley problem from both utilitarian and deontological perspectives, then propose a third framework that resolves the dilemma.", expectedRoute: "escalated", pEasy: 0.12, oracleLabel: 0 },
  { id: "hard-3", label: "Voting system design", task: "Design a voting system that is both fair (no spoilers, no wasted votes) and resistant to strategic voting. Justify your choice.", expectedRoute: "escalated", pEasy: 0.15, oracleLabel: 0 },
  { id: "hard-4", label: "AI medical framework", task: "Synthesize a framework for deciding when AI systems should make autonomous medical diagnoses versus defer to human physicians.", expectedRoute: "escalated", pEasy: 0.10, oracleLabel: 0 },
  { id: "hard-5", label: "UBI analysis", task: "Analyze the long-term economic consequences of a universal basic income funded by a 10% value-added tax.", expectedRoute: "escalated", pEasy: 0.14, oracleLabel: 0 },
  { id: "hard-6", label: "Constitutional amendment", task: "Propose a constitutional amendment that would reduce political polarization in a two-party system without disenfranchising voters.", expectedRoute: "escalated", pEasy: 0.16, oracleLabel: 0 },
  { id: "hard-7", label: "Roman Empire alt-history", task: "Critically analyze the long-term geopolitical consequences if the Roman Empire had never fallen, including its impact on the Renaissance and the Industrial Revolution.", expectedRoute: "escalated", pEasy: 0.08, oracleLabel: 0 },
  { id: "hard-8", label: "Climate justice", task: "Develop a philosophical framework that reconciles intergenerational climate justice with present-day economic development rights for developing nations.", expectedRoute: "escalated", pEasy: 0.11, oracleLabel: 0 },
]

/**
 * Build the 6-feature training set. For each seed task, synthesize
 * 3 samples with different (agreement, selfVerify, isRefined) combos
 * to teach the classifier the decision boundary.
 */
export function buildTrainingSet(): { features: MetaFeatures[]; labels: number[] } {
  const features: MetaFeatures[] = []
  const labels: number[] = []

  for (const t of seedTasks) {
    if (t.expectedRoute === "local") {
      // Easy: high pEasy, high agreement, selfVerify YES, not refined → PASS
      features.push({
        pEasy: t.pEasy, agreement: 0.92, selfVerify: 1.0,
        answerLenRatio: 0.4, judgeScore: 5, isRefined: false,
      })
      labels.push(1)
      // Variant: slightly lower agreement but still YES
      features.push({
        pEasy: t.pEasy - 0.03, agreement: 0.85, selfVerify: 1.0,
        answerLenRatio: 0.5, judgeScore: 5, isRefined: false,
      })
      labels.push(1)
      // Variant: selfVerify NO → escalate
      features.push({
        pEasy: t.pEasy - 0.05, agreement: 0.70, selfVerify: 0.0,
        answerLenRatio: 0.3, judgeScore: 1, isRefined: false,
      })
      labels.push(0)
    } else if (t.expectedRoute === "refine") {
      // Medium: borderline agreement, selfVerify NO pre-refine → refine
      features.push({
        pEasy: t.pEasy, agreement: 0.55, selfVerify: 0.0,
        answerLenRatio: 0.5, judgeScore: 1, isRefined: false,
      })
      labels.push(0)
      // After refine: higher agreement, selfVerify YES → PASS
      features.push({
        pEasy: t.pEasy, agreement: 0.78, selfVerify: 1.0,
        answerLenRatio: 0.6, judgeScore: 5, isRefined: true,
      })
      labels.push(1)
      // After refine: still NO → escalate
      features.push({
        pEasy: t.pEasy - 0.05, agreement: 0.45, selfVerify: 0.0,
        answerLenRatio: 0.4, judgeScore: 1, isRefined: true,
      })
      labels.push(0)
    } else {
      // Hard: low pEasy, low everything → escalate
      features.push({
        pEasy: t.pEasy, agreement: 0.38, selfVerify: 0.0,
        answerLenRatio: 0.3, judgeScore: 1, isRefined: false,
      })
      labels.push(0)
      features.push({
        pEasy: t.pEasy + 0.02, agreement: 0.42, selfVerify: 0.0,
        answerLenRatio: 0.35, judgeScore: 1, isRefined: false,
      })
      labels.push(0)
      // Even if somehow selfVerify YES on a hard query, low pEasy should still escalate
      features.push({
        pEasy: t.pEasy, agreement: 0.50, selfVerify: 1.0,
        answerLenRatio: 0.4, judgeScore: 4, isRefined: true,
      })
      labels.push(0)
    }
  }

  return { features, labels }
}
