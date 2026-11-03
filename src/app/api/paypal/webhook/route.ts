import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments, webhookEvents } from "@/db/schema";
import { verifyWebhookSignature } from "@/lib/paypal/webhooks";
import { applyCaptureStatus, applyPayoutItemStatus, completeFunding } from "@/lib/flows/payments";
import type { PayoutItemStatus } from "@/lib/paypal/payouts";

type WebhookEvent = {
  id: string;
  event_type: string;
  resource: Record<string, unknown> & {
    id?: string;
    status?: string;
    custom_id?: string;
    transaction_status?: PayoutItemStatus;
    payout_item_id?: string;
    payout_item?: { sender_item_id?: string };
    purchase_units?: { custom_id?: string }[];
    errors?: { message?: string };
  };
};

export async function POST(req: Request) {
  const raw = await req.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const verified = await verifyWebhookSignature(req.headers, raw).catch(() => false);
  if (!verified) return new Response("signature not verified", { status: 400 });

  const db = await getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: event.id, type: event.event_type, resourceId: event.resource?.id ?? null, verified, payload: event as never })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) return new Response("duplicate", { status: 200 });

  const r = event.resource;
  const actor = "PayPal webhook";
  try {
    if (event.event_type === "CHECKOUT.ORDER.APPROVED") {
      const paymentId = r.purchase_units?.[0]?.custom_id;
      if (paymentId) await completeFunding(paymentId, actor);
    } else if (event.event_type.startsWith("PAYMENT.CAPTURE.")) {
      const paymentId = r.custom_id;
      if (paymentId) {
        const [p] = await db.select().from(payments).where(eq(payments.id, paymentId));
        if (p) await applyCaptureStatus(db, p.id, r.id ?? null, r.status ?? null, actor);
      }
    } else if (event.event_type.startsWith("PAYMENT.PAYOUTS-ITEM.")) {
      const paymentId = r.payout_item?.sender_item_id;
      if (paymentId && r.transaction_status) {
        await applyPayoutItemStatus(db, paymentId, r.transaction_status, r.payout_item_id ?? null, actor, r.errors?.message);
      }
    }
    await db.update(webhookEvents).set({ processedAt: new Date() }).where(eq(webhookEvents.id, event.id));
  } catch (err) {
    console.error(`webhook ${event.id} processing failed`, err);
    await db.delete(webhookEvents).where(eq(webhookEvents.id, event.id));
    return new Response("processing failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
}
