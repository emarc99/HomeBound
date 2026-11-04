import "server-only";
import { APICallError, generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const isGeminiConfigured = () => Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);

/** Primary model first, then fallbacks tried when a model is overloaded or rate-limited. */
export function geminiModelChain(): string[] {
  const primary = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([primary, ...fallbacks])];
}

/** Overloaded, rate-limited, retired for this key, or too slow: worth trying another model. */
function unavailableReason(err: unknown): string | null {
  const cause = (err as { lastError?: unknown }).lastError ?? err;
  if (cause instanceof DOMException && (cause.name === "TimeoutError" || cause.name === "AbortError")) return "timed out";
  if (APICallError.isInstance(cause) && [404, 429, 500, 503].includes(cause.statusCode ?? 0)) return `HTTP ${cause.statusCode}`;
  return null;
}

/** Earlier models get a short leash so one hung model can't stall the upload; the last one gets the full time. */
const FALLBACK_TIMEOUT_MS = 25_000;
const LAST_MODEL_TIMEOUT_MS = 60_000;

export async function withGeminiFallback<T>(
  run: (modelId: string, timeoutMs: number) => Promise<T>,
): Promise<{ result: T; model: string }> {
  const chain = geminiModelChain();
  let lastError: unknown;
  for (const [i, model] of chain.entries()) {
    try {
      const timeoutMs = i === chain.length - 1 ? LAST_MODEL_TIMEOUT_MS : FALLBACK_TIMEOUT_MS;
      return { result: await run(model, timeoutMs), model };
    } catch (err) {
      const reason = unavailableReason(err);
      if (!reason) throw err;
      console.warn(`Gemini model ${model} unavailable (${reason}); trying the next one`);
      lastError = err;
    }
  }
  throw lastError;
}

const PhotoAssessment = z.object({
  verdict: z
    .enum(["pass", "fail", "needs_review"])
    .describe("pass only if the photo clearly shows the work described as done; needs_review if it is unclear or partly visible"),
  confidence: z.number().min(0).max(1),
  observations: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("Plain sentences about what is actually visible, most important first"),
  criteria: z
    .array(
      z.object({
        criterion: z.string(),
        status: z.enum(["met", "not_met", "not_visible"]),
        evidence: z.string().describe("What in the photo supports this, or why it can't be judged"),
      }),
    )
    .describe("One entry per acceptance criterion"),
  authenticity: z
    .enum(["genuine_site_photo", "suspect"])
    .describe("suspect if it looks like a stock image, a render, a screenshot of another screen, or not a building site"),
  authenticityNote: z.string(),
});

export type PhotoAssessment = z.infer<typeof PhotoAssessment>;

export async function assessStagePhoto(input: {
  image: Buffer;
  stageName: string;
  stageDescription: string;
  acceptanceCriteria: string;
  siteLabel: string;
}): Promise<{ assessment: PhotoAssessment; model: string }> {
  const { result, model } = await withGeminiFallback((modelId, timeoutMs) => assess(modelId, timeoutMs, input));
  return { assessment: result, model };
}

async function assess(
  modelId: string,
  timeoutMs: number,
  input: { image: Buffer; stageName: string; stageDescription: string; acceptanceCriteria: string; siteLabel: string },
): Promise<PhotoAssessment> {
  const { output } = await generateText({
    model: google(modelId),
    output: Output.object({ schema: PhotoAssessment }),
    temperature: 0,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(timeoutMs),
    system: [
      "You are a site inspector reviewing progress photos for a house being built in Nigeria.",
      "The owner lives abroad and releases the contractor's payment only when the photo proves the stage is done.",
      "Judge only what is visible. Do not give the benefit of the doubt: if a criterion cannot be seen, mark it not_visible.",
      "Typical Nigerian construction uses sandcrete hollow blocks, concrete strip footings, iron rods, and corrugated or stone-coated roofing.",
    ].join(" "),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: [
              `Site: ${input.siteLabel}`,
              `Stage: ${input.stageName}`,
              `Scope: ${input.stageDescription}`,
              `What counts as done: ${input.acceptanceCriteria}`,
              "Assess this progress photo against each part of 'what counts as done'.",
            ].join("\n"),
          },
          { type: "file", mediaType: "image/jpeg", data: { type: "data", data: input.image } },
        ],
      },
    ],
  });
  return output;
}
