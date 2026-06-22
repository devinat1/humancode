import { Effect, Schema } from "effect"
import { SocraticPhase } from "../session/socratic-phase"
import * as Tool from "./tool"

export const Parameters = Schema.Struct({
  to: Schema.Literals(SocraticPhase.PHASES).annotate({
    description: "The phase to transition to",
  }),
  reason: Schema.String.annotate({ description: "Brief explanation of why you are transitioning" }),
})

export const TransitionPhaseTool = Tool.define(
  "transitionPhase",
  Effect.gen(function* () {
    return {
      description: [
        "Move to the next phase of the socratic workflow.",
        "Valid phases: PLANNING, HYPOTHESIS, SOCRATIC, SUMMARIZING, CONFIRMING.",
        "Transitions: PLANNING -> HYPOTHESIS|SOCRATIC; HYPOTHESIS -> SOCRATIC; SOCRATIC -> SUMMARIZING; SUMMARIZING -> CONFIRMING; CONFIRMING -> PLANNING (next slice).",
        "Call this when you have completed the work for the current phase.",
      ].join("\n"),
      parameters: Parameters,
      execute: (args: { to: (typeof SocraticPhase.PHASES)[number]; reason: string }, ctx) =>
        Effect.sync(() => {
          const state = SocraticPhase.getOrCreate(ctx.sessionID)
          try {
            const next = SocraticPhase.transition(state, args.to)
            const allowedTools = SocraticPhase.toolsForPhase(next.currentPhase)
            return {
              title: `Phase: ${next.currentPhase}`,
              output: [
                `Transitioned to ${next.currentPhase} (step ${next.currentStep}).`,
                `Reason: ${args.reason}`,
                `Available tools: ${allowedTools.join(", ")}`,
              ].join("\n"),
              metadata: {
                phase: next.currentPhase,
                step: next.currentStep,
                error: false as boolean,
              },
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            return {
              title: "Transition Failed",
              output: message,
              metadata: {
                phase: state.currentPhase,
                step: state.currentStep,
                error: true as boolean,
              },
            }
          }
        }),
    }
  }),
)
