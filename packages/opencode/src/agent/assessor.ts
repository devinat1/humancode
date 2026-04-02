export namespace Assessor {
  export type Result = {
    mode: "pair" | "debug" | "vibe" | "claw"
    confidence: number
    reason: string
    complexity: number
  }

  const LEARNING_KEYWORDS = [
    "explain",
    "understand",
    "walk me through",
    "why does",
    "how does",
    "help me learn",
    "teach me",
  ]

  const SCOPE_KEYWORDS: Array<[RegExp, number]> = [
    [/\b(refactor|redesign|rewrite|rebuild|migrate)\b/i, 10],
    [/\b(add|implement|create)\b/i, 5],
    [/\b(fix|typo|rename|update|change)\b/i, 2],
  ]

  const FILE_REF = /[\w/]+\.\w{1,4}\b/g

  function scopeWeight(prompt: string) {
    for (const [pattern, weight] of SCOPE_KEYWORDS) {
      if (pattern.test(prompt)) return weight
    }
    return 2
  }

  function specificity(prompt: string) {
    const refs = prompt.match(FILE_REF)
    if (!refs || refs.length === 0) return 5
    return refs.length * -2
  }

  function complexity(prompt: string) {
    return scopeWeight(prompt) + specificity(prompt)
  }

  function hasLearningIntent(prompt: string) {
    const lower = prompt.toLowerCase()
    return LEARNING_KEYWORDS.some((kw) => lower.includes(kw))
  }

  function taskCount(prompt: string) {
    const parts = prompt
      .split(/\band\b|;|\d+\.\s|\n-\s|\n\*\s/i)
      .filter((s) => s.trim().length > 10)
    return parts.length
  }

  function complexityConfidence(c: number) {
    const margin = Math.min(Math.abs(c - 15), Math.abs(c - 30))
    return Math.min(95, 50 + margin * 3)
  }

  export function analyze(prompt: string): Result {
    if (hasLearningIntent(prompt)) {
      return {
        mode: "pair",
        confidence: 90,
        reason: "Learning intent detected in prompt",
        complexity: complexity(prompt),
      }
    }

    if (taskCount(prompt) >= 2) {
      return {
        mode: "vibe",
        confidence: 85,
        reason: "Multiple distinct tasks detected",
        complexity: complexity(prompt),
      }
    }

    const c = complexity(prompt)
    const confidence = complexityConfidence(c)

    if (c < 15) {
      return {
        mode: "claw",
        confidence,
        reason: `Low complexity score (${c})`,
        complexity: c,
      }
    }

    if (c <= 30) {
      return {
        mode: "vibe",
        confidence,
        reason: `Medium complexity score (${c})`,
        complexity: c,
      }
    }

    return {
      mode: "debug",
      confidence,
      reason: `High complexity score (${c})`,
      complexity: c,
    }
  }
}
