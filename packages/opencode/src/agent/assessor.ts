import { generateText } from "ai"
import z from "zod"
import { Provider } from "../provider/provider"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import ASSESSOR_PROMPT from "./prompt/assessor.txt"

const log = Log.create({ service: "assessor" })

const ClassifySchema = z.object({
  mode: z.enum(["pair", "socratic", "vibe", "claw"]),
  confidence: z.number().min(0).max(100),
  reason: z.string(),
})

const JSON_SUFFIX = `

Respond with ONLY a JSON object in this exact format, no other text:
{"mode": "pair|socratic|vibe|claw", "confidence": 0-100, "reason": "brief explanation"}`

function parseJSON(text: string): z.infer<typeof ClassifySchema> | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return undefined
  const parsed = ClassifySchema.safeParse(JSON.parse(match[0]))
  return parsed.success ? parsed.data : undefined
}

export namespace Assessor {
  export type Result = {
    mode: "pair" | "socratic" | "vibe" | "claw"
    confidence: number
    reason: string
  }

  export async function assess(input: {
    prompt: string
    providerID: string
    modelID: string
  }): Promise<Result> {
    // Use small model for fast classification, fall back to user's model
    const smallModel = await Provider.getSmallModel(input.providerID)
    const model = smallModel ?? (await Provider.getModel(input.providerID, input.modelID))
    const language = await Provider.getLanguage(model)

    // Phase 1: quick classify
    log.info("phase1", { prompt: input.prompt.slice(0, 100), model: model.id })
    const phase1 = await generateText({
      model: language,
      maxOutputTokens: 256,
      messages: [
        { role: "system", content: ASSESSOR_PROMPT + JSON_SUFFIX },
        { role: "user", content: input.prompt },
      ],
      temperature: 0.2,
    })

    log.info("phase1.raw", { text: phase1.text.trim() })
    const result = parseJSON(phase1.text)

    if (!result) {
      log.warn("phase1.parse-failed", { text: phase1.text.trim() })
      return { mode: "vibe", confidence: 50, reason: "Could not parse assessor response" }
    }

    log.info("phase1.result", { mode: result.mode, confidence: result.confidence, reason: result.reason })

    if (result.confidence >= 80) {
      return result
    }

    // Phase 2: give the model more context and ask again (still uses small model to avoid rate limits)
    log.info("phase2", { reason: result.reason, model: model.id })

    // Gather basic codebase context for the model to reason about
    const dir = Instance.directory
    const phase2 = await generateText({
      model: language,
      maxOutputTokens: 512,
      messages: [
        {
          role: "system",
          content: [
            ASSESSOR_PROMPT,
            "",
            `The project directory is: ${dir}`,
            "",
            `Your initial quick assessment was: mode=${result.mode}, confidence=${result.confidence}%, reason="${result.reason}"`,
            "",
            "Think more carefully about what mode fits best given the user's request. Consider:",
            "- Is this a high-level discussion or trade-off question? → pair",
            "- Is this a simple mechanical task? → claw",
            "- Does this involve multiple steps or features? → vibe",
            "- Does the user want to UNDERSTAND code (trace it, debug it, learn how it works)? → socratic",
            JSON_SUFFIX,
          ].join("\n"),
        },
        { role: "user", content: input.prompt },
      ],
      temperature: 0.2,
    })

    log.info("phase2.raw", { text: phase2.text.trim() })
    const phase2Result = parseJSON(phase2.text)

    if (!phase2Result) {
      log.warn("phase2.parse-failed", { text: phase2.text.trim() })
      return result // Fall back to phase1 result
    }

    log.info("phase2.result", { mode: phase2Result.mode, confidence: phase2Result.confidence, reason: phase2Result.reason })
    return phase2Result
  }
}
