"use server";

import { revalidatePath } from "next/cache";
import {
  FlowError,
  reconcilePending,
  releaseLaborPayout,
  releaseMaterialPayout,
  releaseInspectionPayout,
  startStageFunding,
} from "@/lib/flows/payments";
import { PaypalApiError, PaypalNotConfiguredError } from "@/lib/paypal/rest";

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function toError(err: unknown): string {
  if (err instanceof FlowError || err instanceof PaypalNotConfiguredError) return err.message;
  if (err instanceof PaypalApiError) return `PayPal rejected the request (${err.status}). ${err.body.slice(0, 200)}`;
  console.error(err);
  return "Something went wrong. Check the server log.";
}

const OWNER = "Tunde Adeyemi (owner)";

export async function fundStageAction(stageId: string): Promise<ActionResult<{ approveUrl: string }>> {
  try {
    return { ok: true, data: await startStageFunding(stageId, OWNER) };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function releaseLaborAction(stageId: string, overrideReason?: string): Promise<ActionResult> {
  try {
    await releaseLaborPayout(stageId, OWNER, overrideReason);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function releaseMaterialAction(materialRequestId: string): Promise<ActionResult> {
  try {
    await releaseMaterialPayout(materialRequestId, OWNER);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function releaseInspectionAction(inspectionId: string): Promise<ActionResult> {
  try {
    await releaseInspectionPayout(inspectionId, OWNER);
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

export async function refreshPaymentsAction(): Promise<ActionResult<{ checked: number; updated: number }>> {
  try {
    const data = await reconcilePending("owner refresh");
    revalidatePath("/");
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
