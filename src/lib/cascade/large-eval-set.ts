/**
 * Large eval set — 60 queries across 10 categories × 6 queries each.
 *
 * Categories (deliberately diverse to expose heuristic failures):
 *   1. Factual lookup (capitals, dates, definitions)
 *   2. Simple math (arithmetic, unit conversion)
 *   3. Science (physics, chemistry, biology)
 *   4. History (events, causes, timelines)
 *   5. Code explanation (Python, JS, algorithms)
 *   6. Comparison (vs questions, tradeoffs)
 *   7. Reasoning (multi-step, logic)
 *   8. Counterfactual (what-if, alt-history)
 *   9. Ethics/philosophy (frameworks, dilemmas)
 *   10. Synthesis/design (build a system, propose a framework)
 *
 * Each query has a reference answer for the LLM judge. Difficulty
 * labels are PRELIMINARY — the tuning script will measure actual
 * local-model accuracy and may reclassify some.
 */

export interface LargeEvalQuery {
  index: number
  category: string
  task: string
  referenceAnswer: string
  preliminaryDifficulty: "easy" | "medium" | "hard"
}

export const largeEvalSet: LargeEvalQuery[] = [
  // ----- 1. Factual lookup (6) -----
  { index: 0, category: "factual", preliminaryDifficulty: "easy",
    task: "What is the capital of Japan?",
    referenceAnswer: "Tokyo." },
  { index: 1, category: "factual", preliminaryDifficulty: "easy",
    task: "What is the chemical symbol for sodium?",
    referenceAnswer: "Na." },
  { index: 2, category: "factual", preliminaryDifficulty: "easy",
    task: "Who painted the Mona Lisa?",
    referenceAnswer: "Leonardo da Vinci." },
  { index: 3, category: "factual", preliminaryDifficulty: "easy",
    task: "What is the boiling point of water in Celsius at sea level?",
    referenceAnswer: "100°C." },
  { index: 4, category: "factual", preliminaryDifficulty: "easy",
    task: "What is the largest ocean on Earth?",
    referenceAnswer: "The Pacific Ocean." },
  { index: 5, category: "factual", preliminaryDifficulty: "medium",
    task: "What are the three primary colors of light?",
    referenceAnswer: "Red, green, and blue (RGB)." },

  // ----- 2. Simple math (6) -----
  { index: 6, category: "math", preliminaryDifficulty: "easy",
    task: "What is 7 multiplied by 8?",
    referenceAnswer: "56." },
  { index: 7, category: "math", preliminaryDifficulty: "easy",
    task: "What is 144 divided by 12?",
    referenceAnswer: "12." },
  { index: 8, category: "math", preliminaryDifficulty: "medium",
    task: "Solve: a train travels 60km in 45min. What is its speed in km/h?",
    referenceAnswer: "80 km/h. (45 min = 0.75 h; 60 / 0.75 = 80)" },
  { index: 9, category: "math", preliminaryDifficulty: "medium",
    task: "If a recipe needs 2/3 cup of flour and you're tripling it, how much flour do you need?",
    referenceAnswer: "2 cups. (2/3 × 3 = 2)" },
  { index: 10, category: "math", preliminaryDifficulty: "medium",
    task: "What is 15% of 240?",
    referenceAnswer: "36. (0.15 × 240 = 36)" },
  { index: 11, category: "math", preliminaryDifficulty: "hard",
    task: "Solve for x: 2x² + 5x - 3 = 0",
    referenceAnswer: "x = 0.5 or x = -3. (Quadratic formula: x = (-5 ± √(25+24))/4 = (-5 ± 7)/4)" },

  // ----- 3. Science (6) -----
  { index: 12, category: "science", preliminaryDifficulty: "easy",
    task: "Define photosynthesis in one sentence.",
    referenceAnswer: "Photosynthesis is the process by which green plants use sunlight to convert carbon dioxide and water into glucose and oxygen." },
  { index: 13, category: "science", preliminaryDifficulty: "easy",
    task: "What causes the seasons on Earth?",
    referenceAnswer: "The 23.5° tilt of Earth's axis relative to its orbit. As Earth orbits, each hemisphere tilts toward or away from the Sun, changing sunlight intensity." },
  { index: 14, category: "science", preliminaryDifficulty: "medium",
    task: "What is the difference between DNA and RNA?",
    referenceAnswer: "DNA is double-stranded with deoxyribose sugar and thymine; RNA is single-stranded with ribose sugar and uracil. DNA stores genetic info, RNA transmits it." },
  { index: 15, category: "science", preliminaryDifficulty: "medium",
    task: "Explain Newton's third law of motion.",
    referenceAnswer: "For every action, there is an equal and opposite reaction. Forces come in pairs — if object A pushes object B, B pushes A back with equal force in the opposite direction." },
  { index: 16, category: "science", preliminaryDifficulty: "hard",
    task: "Explain quantum entanglement and why Einstein called it 'spooky action at a distance'.",
    referenceAnswer: "Entanglement is when two particles become correlated so that measuring one instantly determines the state of the other, regardless of distance. Einstein found this troubling because it seemed to violate the speed-of-light limit on information transfer — hence 'spooky action at a distance'." },
  { index: 17, category: "science", preliminaryDifficulty: "hard",
    task: "Derive why the sky appears blue during the day and red at sunset.",
    referenceAnswer: "Rayleigh scattering: shorter wavelengths (blue) scatter more than longer ones. During the day, sunlight passes through a thin atmosphere so blue scatters in all directions — we see blue. At sunset, light travels through more atmosphere, blue scatters away, leaving red/orange to reach our eyes." },

  // ----- 4. History (6) -----
  { index: 18, category: "history", preliminaryDifficulty: "easy",
    task: "In what year did World War II end?",
    referenceAnswer: "1945." },
  { index: 19, category: "history", preliminaryDifficulty: "easy",
    task: "Who was the first President of the United States?",
    referenceAnswer: "George Washington." },
  { index: 20, category: "history", preliminaryDifficulty: "medium",
    task: "What were the main causes of World War I?",
    referenceAnswer: "Main causes: militarism, alliances, imperialism, and nationalism (MAIN). The immediate trigger was the assassination of Archduke Franz Ferdinand in 1914." },
  { index: 21, category: "history", preliminaryDifficulty: "medium",
    task: "Explain the significance of the Industrial Revolution.",
    referenceAnswer: "The Industrial Revolution (18th-19th c.) transformed economies from agrarian to industrial, introducing mass production, urbanization, steam power, and mechanized transportation. It dramatically increased productivity, changed labor systems, and laid the foundation for modern capitalism." },
  { index: 22, category: "history", preliminaryDifficulty: "hard",
    task: "If the Treaty of Westphalia had been signed in 1700 instead of 1648, how would the balance of power in 18th-century Europe have differed?",
    referenceAnswer: "A delayed treaty would have prolonged the Thirty Years' War, weakened the Holy Roman Empire, delayed the modern sovereign-state system, and kept the Habsburg bloc dominant longer. The rise of Prussia and maritime powers might have been delayed." },
  { index: 23, category: "history", preliminaryDifficulty: "hard",
    task: "Analyze how the Byzantine Empire's preservation of Greek and Roman texts influenced the Renaissance.",
    referenceAnswer: "Byzantine scholars preserved classical Greek texts lost to Western Europe after Rome's fall. When Constantinople fell in 1453, Byzantine scholars fled to Italy bringing these manuscripts, fueling the Renaissance's revival of classical learning, humanism, and scientific inquiry." },

  // ----- 5. Code explanation (6) -----
  { index: 24, category: "code", preliminaryDifficulty: "easy",
    task: "What does the Python function len() do?",
    referenceAnswer: "len() returns the number of items in an object — the length of a string, list, tuple, dictionary, or other collection." },
  { index: 25, category: "code", preliminaryDifficulty: "medium",
    task: "Explain what this Python code does: def f(n): return n * f(n-1) if n else 1",
    referenceAnswer: "It defines a recursive factorial function. f(n) returns n × f(n-1) for n > 0, and 1 for n = 0 (base case). f(5) = 120." },
  { index: 26, category: "code", preliminaryDifficulty: "medium",
    task: "What is the output of: print([x**2 for x in range(5)])?",
    referenceAnswer: "[0, 1, 4, 9, 16]" },
  { index: 27, category: "code", preliminaryDifficulty: "medium",
    task: "Explain the difference between == and === in JavaScript.",
    referenceAnswer: "== compares values with type coercion (converts types before comparing). === compares both value and type strictly (no coercion). '5' == 5 is true; '5' === 5 is false." },
  { index: 28, category: "code", preliminaryDifficulty: "hard",
    task: "Explain what a closure is in JavaScript with an example.",
    referenceAnswer: "A closure is a function that retains access to variables from its outer scope even after the outer function returns. Example: function counter() { let n = 0; return () => ++n; } — the returned function closes over `n` and increments it on each call." },
  { index: 29, category: "code", preliminaryDifficulty: "hard",
    task: "What is the time and space complexity of quicksort, and when is it worst-case?",
    referenceAnswer: "Average: O(n log n) time, O(log n) space (recursion stack). Worst-case: O(n²) time when the pivot is consistently the smallest or largest element (e.g., already-sorted array with naive pivot selection)." },

  // ----- 6. Comparison (6) -----
  { index: 30, category: "comparison", preliminaryDifficulty: "easy",
    task: "What is the difference between weather and climate?",
    referenceAnswer: "Weather is short-term atmospheric conditions (hours to days); climate is long-term average weather patterns over years or decades." },
  { index: 31, category: "comparison", preliminaryDifficulty: "medium",
    task: "Compare TCP and UDP in two sentences.",
    referenceAnswer: "TCP is connection-oriented, reliable, and ordered — guarantees delivery via handshake and retransmission. UDP is connectionless, unreliable, and unordered — faster but lossy." },
  { index: 32, category: "comparison", preliminaryDifficulty: "medium",
    task: "What is the difference between GET and POST requests?",
    referenceAnswer: "GET retrieves data and sends parameters in the URL (idempotent, cacheable, length-limited). POST submits data in the request body (non-idempotent, not cacheable, no length limit)." },
  { index: 33, category: "comparison", preliminaryDifficulty: "medium",
    task: "Compare SQL and NoSQL databases.",
    referenceAnswer: "SQL databases are relational, schema-fixed, ACID-compliant, and use structured query language (MySQL, PostgreSQL). NoSQL databases are non-relational, schema-flexible, horizontally scalable, and trade some consistency for availability (MongoDB, Redis, Cassandra)." },
  { index: 34, category: "comparison", preliminaryDifficulty: "hard",
    task: "Compare supervised, unsupervised, and reinforcement learning.",
    referenceAnswer: "Supervised: trained on labeled data to predict outputs (classification, regression). Unsupervised: finds patterns in unlabeled data (clustering, dimensionality reduction). Reinforcement: an agent learns by interacting with an environment, receiving rewards/penalties to maximize cumulative reward." },
  { index: 35, category: "comparison", preliminaryDifficulty: "hard",
    task: "Compare utilitarian and deontological ethics.",
    referenceAnswer: "Utilitarianism judges actions by consequences — the right action maximizes aggregate happiness (Mill, Bentham). Deontology judges actions by duty/rules — some acts are wrong regardless of outcome (Kant's categorical imperative)." },

  // ----- 7. Reasoning (6) -----
  { index: 36, category: "reasoning", preliminaryDifficulty: "easy",
    task: "If today is Monday, what day will it be 100 days from now?",
    referenceAnswer: "Wednesday. (100 mod 7 = 2; Monday + 2 = Wednesday)" },
  { index: 37, category: "reasoning", preliminaryDifficulty: "medium",
    task: "What is the time complexity of binary search and why?",
    referenceAnswer: "O(log n). Each comparison halves the search space, so the number of steps is log₂(n)." },
  { index: 38, category: "reasoning", preliminaryDifficulty: "medium",
    task: "If all roses are flowers and some flowers fade quickly, can we conclude that some roses fade quickly?",
    referenceAnswer: "No. We know some flowers fade quickly, but those flowers might not be roses. The syllogism is invalid — we cannot conclude anything about roses specifically." },
  { index: 39, category: "reasoning", preliminaryDifficulty: "hard",
    task: "Solve: You have 8 balls, one is heavier. Using a balance scale, what is the minimum number of weighings to find the heavy one?",
    referenceAnswer: "2 weighings. Split into 3-3-2. Weigh 3 vs 3. If equal, weigh the 2. If unequal, take the heavier 3, weigh 1 vs 1 — if equal, the third is heavy; if unequal, the heavier side is it." },
  { index: 40, category: "reasoning", preliminaryDifficulty: "hard",
    task: "Prove that the square root of 2 is irrational.",
    referenceAnswer: "By contradiction: assume √2 = p/q in lowest terms. Then 2q² = p², so p² is even, so p is even. Let p = 2k. Then 2q² = 4k², so q² = 2k², so q is also even. But p and q can't both be even if p/q is in lowest terms — contradiction." },
  { index: 41, category: "reasoning", preliminaryDifficulty: "hard",
    task: "A farmer must cross a river with a fox, chicken, and bag of grain. The boat holds only the farmer and one item. The fox eats the chicken, the chicken eats the grain if unattended. How does he cross?",
    referenceAnswer: "1) Take chicken across, return alone. 2) Take fox across, bring chicken back. 3) Take grain across, return alone. 4) Take chicken across." },

  // ----- 8. Counterfactual (6) -----
  { index: 42, category: "counterfactual", preliminaryDifficulty: "hard",
    task: "What would have happened if the Library of Alexandria had never burned?",
    referenceAnswer: "Speculative, but plausible effects: preservation of more ancient scientific and literary works, potentially accelerating scientific progress by centuries. However, knowledge transfer depends on more than archives — social, economic, and political factors also drive progress." },
  { index: 43, category: "counterfactual", preliminaryDifficulty: "hard",
    task: "If the Internet had been invented in 1900 instead of 1990, how would society have differed?",
    referenceAnswer: "Earlier global connectivity would have accelerated information sharing, scientific collaboration, and commerce. But without computing infrastructure, it might have been limited to telegraph/telephone-based networks. Two world wars might have unfolded differently with instant communication." },
  { index: 44, category: "counterfactual", preliminaryDifficulty: "hard",
    task: "If penicillin had been discovered in 1850 instead of 1928, how would public health have differed?",
    referenceAnswer: "Earlier antibiotic treatment would have saved millions from bacterial infections, potentially enabling larger populations and faster urbanization. However, antibiotic resistance might have emerged earlier, and the medical infrastructure to deploy it widely would have been lacking." },
  { index: 45, category: "counterfactual", preliminaryDifficulty: "hard",
    task: "What if the Soviet Union had won the Cold War?",
    referenceAnswer: "Speculative: a Soviet victory would likely have expanded communist influence globally, potentially weakening democratic institutions and market economies. The shape of international organizations, trade, and human rights would differ significantly. Nuclear proliferation patterns would change." },
  { index: 46, category: "counterfactual", preliminaryDifficulty: "hard",
    task: "If humans had evolved with two hearts instead of one, how would medicine and biology differ?",
    referenceAnswer: "Redundant hearts would reduce cardiovascular mortality and enable faster recovery from heart damage. Surgery would be more complex. Athletic endurance might increase. Heart disease treatment would focus on managing two organs. Evolutionary tradeoffs in energy use and chest anatomy would result." },
  { index: 47, category: "counterfactual", preliminaryDifficulty: "hard",
    task: "Critically analyze the long-term geopolitical consequences if the Roman Empire had never fallen.",
    referenceAnswer: "A surviving Roman Empire would have centralized European governance, potentially delaying the rise of nation-states, altering the Renaissance, and changing colonial expansion. Religious, linguistic, and legal systems would differ. The Industrial Revolution might have been delayed or accelerated depending on Roman adaptability." },

  // ----- 9. Ethics/philosophy (6) -----
  { index: 48, category: "ethics", preliminaryDifficulty: "easy",
    task: "What is the golden rule?",
    referenceAnswer: "Treat others as you would want to be treated. Found in many ethical and religious traditions." },
  { index: 49, category: "ethics", preliminaryDifficulty: "medium",
    task: "What is the trolley problem?",
    referenceAnswer: "An ethical dilemma: a trolley is heading toward 5 people tied to a track. You can pull a lever to divert it to a track with 1 person. Do you pull it? It tests utilitarian vs deontological reasoning." },
  { index: 50, category: "ethics", preliminaryDifficulty: "hard",
    task: "Critically evaluate the trolley problem from both utilitarian and deontological perspectives, then propose a third framework.",
    referenceAnswer: "Utilitarian: pull the lever (1 death < 5 deaths). Deontology: don't pull (actively killing violates duty). Third framework: virtue ethics asks what a virtuous person would do — likely refusing to treat lives as fungible while seeking a third option." },
  { index: 51, category: "ethics", preliminaryDifficulty: "hard",
    task: "Is it ever morally permissible to lie? Defend your position.",
    referenceAnswer: "Most ethical frameworks permit lying in some cases: utilitarianism (if it prevents greater harm), virtue ethics (if motivated by compassion), care ethics (to protect relationships). Kantian deontology is the strictest — lying is always wrong. The 'white lie' to save a life is a common justified case." },
  { index: 52, category: "ethics", preliminaryDifficulty: "hard",
    task: "Should AI systems have moral status? Argue both sides.",
    referenceAnswer: "Pro: if AI can suffer or have preferences, it may deserve moral consideration; advanced AI might warrant rights. Con: current AI lacks consciousness, subjective experience, or biological basis for moral status; granting rights prematurely could harm humans. The debate hinges on whether consciousness can be substrate-independent." },
  { index: 53, category: "ethics", preliminaryDifficulty: "hard",
    task: "Analyze the ethics of surveillance capitalism.",
    referenceAnswer: "Surveillance capitalism (Shoshana Zuboff) profits from behavioral data extraction without meaningful consent. Ethical concerns: violation of autonomy, manipulation, asymmetry of power, erosion of privacy. Defenders argue users consent via terms of service and receive free services in exchange." },

  // ----- 10. Synthesis/design (6) -----
  { index: 54, category: "synthesis", preliminaryDifficulty: "medium",
    task: "Design a simple voting system that prevents spoilers.",
    referenceAnswer: "Approval voting: voters select all acceptable candidates; the candidate with the most approvals wins. No spoilers (no vote splitting), no wasted votes, resistant to strategic voting." },
  { index: 55, category: "synthesis", preliminaryDifficulty: "hard",
    task: "Design a voting system that is both fair and resistant to strategic voting. Justify your choice.",
    referenceAnswer: "Approval voting or STAR voting. Approval: voters approve all acceptable candidates; most approvals wins. Eliminates spoilers, minimizes wasted votes, strategy-resistant. STAR adds a runoff between top two scored candidates for more expressiveness." },
  { index: 56, category: "synthesis", preliminaryDifficulty: "hard",
    task: "Synthesize a framework for deciding when AI systems should make autonomous medical diagnoses.",
    referenceAnswer: "Three axes: (1) Confidence calibration — defer when uncertainty exceeds a threshold; (2) Stakes — autonomous on low-stakes reversible decisions, defer on high-stakes irreversible ones; (3) Explainability — defer when no interpretable rationale. Human-in-the-loop when AI and physician disagree." },
  { index: 57, category: "synthesis", preliminaryDifficulty: "hard",
    task: "Propose a constitutional amendment to reduce political polarization.",
    referenceAnswer: "Replace plurality voting with approval voting in federal elections. Eliminates spoiler effect, makes third parties viable, incentivizes broader appeal. Pair with independent redistricting commissions." },
  { index: 58, category: "synthesis", preliminaryDifficulty: "hard",
    task: "Design a tax system that is both progressive and efficient.",
    referenceAnswer: "Combine a progressive income tax with a land value tax (LVT) and a consumption tax with rebates. LVT is efficient (land is fixed supply) and progressive (land wealth concentrates). Income tax progressivity funds public goods. Consumption tax with rebates for low-income households." },
  { index: 59, category: "synthesis", preliminaryDifficulty: "hard",
    task: "Develop a philosophical framework reconciling intergenerational climate justice with present-day development rights.",
    referenceAnswer: "Sufficientarianism: present generations owe future generations a world meeting basic needs (clean air, stable climate, biodiversity), but not maximization. Developing nations have a right to develop up to sufficiency. Wealthy nations owe compensation for disproportionate historical emissions. Operationalized via carbon budgets and technology transfers." },
]

export const largeEvalStats = {
  total: largeEvalSet.length,
  byDifficulty: {
    easy: largeEvalSet.filter((q) => q.preliminaryDifficulty === "easy").length,
    medium: largeEvalSet.filter((q) => q.preliminaryDifficulty === "medium").length,
    hard: largeEvalSet.filter((q) => q.preliminaryDifficulty === "hard").length,
  },
  byCategory: largeEvalSet.reduce((acc, q) => {
    acc[q.category] = (acc[q.category] ?? 0) + 1
    return acc
  }, {} as Record<string, number>),
}
