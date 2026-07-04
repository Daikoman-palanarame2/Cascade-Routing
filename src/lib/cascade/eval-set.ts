/**
 * Eval set — 12 stratified queries with reference answers.
 *
 * Stratification:
 *   - 4 easy (factual lookup, simple math, definitions)
 *   - 4 medium (multi-step reasoning, code explanation, comparison)
 *   - 4 hard (counterfactuals, ethics, synthesis, long-form analysis)
 *
 * Each query has a `referenceAnswer` that the LLM judge compares the
 * cascade's response against to produce a 0..1 accuracy score.
 *
 * Kept compact (12 queries) so the full ablation harness runs in ~3-4
 * minutes under the z-ai free-tier rate limit. The blueprint calls
 * for 180 seed tasks in production — the harness supports any size.
 */

export interface EvalQuery {
  index: number
  difficulty: "easy" | "medium" | "hard" | "cached"
  task: string
  referenceAnswer: string
}

export const evalSet: EvalQuery[] = [
  // ----- Easy (4) -----
  {
    index: 0,
    difficulty: "easy",
    task: "What is the capital of Australia?",
    referenceAnswer:
      "Canberra, located in the Australian Capital Territory between Sydney and Melbourne.",
  },
  {
    index: 1,
    difficulty: "easy",
    task: "Define photosynthesis in one sentence.",
    referenceAnswer:
      "Photosynthesis is the process by which green plants use sunlight to convert carbon dioxide and water into glucose and oxygen.",
  },
  {
    index: 2,
    difficulty: "easy",
    task: "What is 15 multiplied by 12?",
    referenceAnswer: "180.",
  },
  {
    index: 3,
    difficulty: "easy",
    task: "What is the chemical symbol for gold?",
    referenceAnswer: "Au.",
  },

  // ----- Medium (4) -----
  {
    index: 4,
    difficulty: "medium",
    task: "Solve: a train travels 60km in 45min. What is its speed in km/h?",
    referenceAnswer:
      "80 km/h. (45 min = 0.75 h; 60 km / 0.75 h = 80 km/h)",
  },
  {
    index: 5,
    difficulty: "medium",
    task: "Explain what this Python code does: def f(n): return n * f(n-1) if n else 1",
    referenceAnswer:
      "It defines a recursive factorial function. f(n) returns n × f(n-1) for n > 0, and 1 for n = 0 (the base case). For example, f(5) = 120.",
  },
  {
    index: 6,
    difficulty: "medium",
    task: "Compare TCP and UDP in two sentences.",
    referenceAnswer:
      "TCP is connection-oriented, reliable, and ordered — it guarantees delivery via handshake, acknowledgments, and retransmission. UDP is connectionless, unreliable, and unordered — it sends datagrams without guarantees, making it faster but lossy.",
  },
  {
    index: 7,
    difficulty: "medium",
    task: "What is the time complexity of binary search and why?",
    referenceAnswer:
      "O(log n). Each comparison halves the search space, so the number of steps is log₂(n).",
  },

  // ----- Hard (4) -----
  {
    index: 8,
    difficulty: "hard",
    task: "If the Treaty of Westphalia had been signed in 1700 instead of 1648, how would the balance of power in 18th-century Europe have differed?",
    referenceAnswer:
      "A delayed Treaty of Westphalia would have prolonged the Thirty Years' War, weakened the Holy Roman Empire further, and delayed the establishment of the modern state system based on sovereignty. The Habsburg bloc would likely have remained dominant longer, the Franco-Spanish rivalry would have intensified, and the rise of Prussia and the maritime powers (England, Netherlands) might have been delayed or altered.",
  },
  {
    index: 9,
    difficulty: "hard",
    task: "Critically evaluate the trolley problem from both utilitarian and deontological perspectives, then propose a third framework that resolves the dilemma.",
    referenceAnswer:
      "Utilitarianism: pull the lever — killing one to save five maximizes aggregate welfare. Deontology: do not pull — actively killing one violates the categorical imperative regardless of outcome. Third framework: virtue ethics focuses on the agent's character, asking what a virtuous person would do — likely refusing to treat lives as fungible while seeking a third option.",
  },
  {
    index: 10,
    difficulty: "hard",
    task: "Design a voting system that is both fair (no spoilers, no wasted votes) and resistant to strategic voting. Justify your choice.",
    referenceAnswer:
      "Approval voting. Voters select all acceptable candidates; the candidate with the most approvals wins. It eliminates spoilers (no vote splitting), minimizes wasted votes, and is resistant to strategic voting because approving a true favorite never hurts them. Simpler than ranked-choice and more expressive than plurality.",
  },
  {
    index: 11,
    difficulty: "hard",
    task: "Synthesize a framework for deciding when AI systems should make autonomous medical diagnoses versus defer to human physicians.",
    referenceAnswer:
      "Framework based on three axes: (1) Confidence calibration — AI defers when predictive uncertainty exceeds a validated threshold; (2) Stakes — AI may act autonomously on low-stakes, reversible decisions but defers on high-stakes, irreversible ones; (3) Explainability — AI defers when it cannot produce a clinically interpretable rationale. Combined with mandatory human-in-the-loop for any case where the AI's confidence and the physician's judgment diverge.",
  },

  // ----- Cached (2) — duplicates to demonstrate cache hit savings -----
  {
    index: 12,
    difficulty: "cached",
    task: "What is the capital of Australia?",
    referenceAnswer: "Canberra.",
  },
  {
    index: 13,
    difficulty: "cached",
    task: "What is the chemical symbol for gold?",
    referenceAnswer: "Au.",
  },
]

