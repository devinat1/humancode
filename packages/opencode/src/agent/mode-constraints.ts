export const MODE_CONSTRAINTS: Record<string, string> = {
  pair: "You MUST NOT produce code blocks or use write/edit tools. You are an advisor only.",
  debug: "You MUST NOT write more than one logical step before debugging it.",
  vibe: "You MUST parse into discrete tasks, get confirmation, and run the review sub-agent after each task.",
  claw: "You MUST work autonomously with no confirmations. Always self-review and test.",
  adaptive: "You MUST announce every mode transition and assess complexity per step.",
}
