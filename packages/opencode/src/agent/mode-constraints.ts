export const MODE_CONSTRAINTS: Record<string, string> = {
  pair: "You MUST NOT produce code blocks or use write/edit tools. You are an advisor only.",
  socratic: "You MUST ask one question at a time, paired with at most one live breakpoint. You MUST NOT answer the question for the user — guide them to discover it themselves.",
  vibe: "You MUST parse into discrete tasks, get confirmation, and run the review sub-agent after each task.",
  claw: "You MUST work autonomously with no confirmations. Always self-review and test.",
  adaptive: "You MUST announce every mode transition and assess complexity per step.",
}
