"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { stages } from "@/db/schema";
import { FlowError } from "@/lib/flows/payments";
import { findForeman, submitStagePhoto } from "@/lib/flows/evidence";
import { UnsupportedImageError } from "@/lib/evidence/image";
import type { ActionResult } from "./payments";

const MAX_BYTES = 12 * 1024 * 1024;

export async function uploadStagePhotoAction(formData: FormData): Promise<ActionResult<{ verdict: string }>> {
  const stageId = formData.get("stageId");
  const file = formData.get("photo");
  if (typeof stageId !== "string" || !(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a photo to upload." };
  }
  if (file.size > MAX_BYTES) return { ok: false, error: "That photo is over 12 MB. Send a smaller copy." };
  try {
    const [stage] = await (await getDb()).select({ projectId: stages.projectId }).from(stages).where(eq(stages.id, stageId));
    if (!stage) return { ok: false, error: "Stage not found" };
    const foreman = await findForeman(stage.projectId);
    const row = await submitStagePhoto({
      stageId,
      file: Buffer.from(await file.arrayBuffer()),
      uploadedById: foreman?.id ?? null,
      actor: foreman ? `${foreman.name} (foreman)` : "site upload",
    });
    revalidatePath("/");
    return { ok: true, data: { verdict: row.verdict?.verdict ?? "needs_review" } };
  } catch (err) {
    if (err instanceof FlowError || err instanceof UnsupportedImageError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Check the server log." };
  }
}
