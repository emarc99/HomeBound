import "server-only";
import { paypalFetch } from "./rest";

export type PayoutItemStatus =
  | "SUCCESS"
  | "FAILED"
  | "PENDING"
  | "UNCLAIMED"
  | "RETURNED"
  | "ONHOLD"
  | "BLOCKED"
  | "REFUNDED"
  | "REVERSED"
  | "DENIED";

type PayoutBatchResponse = {
  batch_header: { payout_batch_id: string; batch_status: string; sender_batch_header?: { sender_batch_id: string } };
  items?: {
    payout_item_id: string;
    transaction_status?: PayoutItemStatus;
    payout_item: { sender_item_id?: string };
    errors?: { name?: string; message?: string };
  }[];
};

export async function sendPayout(input: {
  paymentId: string;
  receiverEmail: string;
  amountUsd: string;
  note: string;
  subject: string;
}): Promise<{ batchId: string; batchStatus: string }> {
  const res = await paypalFetch<PayoutBatchResponse>("/v1/payments/payouts", {
    method: "POST",
    requestId: `payout-${input.paymentId}`,
    body: {
      sender_batch_header: {
        sender_batch_id: input.paymentId,
        email_subject: input.subject,
        email_message: input.note,
      },
      items: [
        {
          recipient_type: "EMAIL",
          receiver: input.receiverEmail,
          amount: { value: input.amountUsd, currency: "USD" },
          sender_item_id: input.paymentId,
          note: input.note.slice(0, 4000),
        },
      ],
    },
  });
  return { batchId: res.batch_header.payout_batch_id, batchStatus: res.batch_header.batch_status };
}

export async function getPayoutBatch(batchId: string): Promise<{
  batchStatus: string;
  items: { itemId: string; senderItemId: string | null; status: PayoutItemStatus | null; error: string | null }[];
}> {
  const res = await paypalFetch<PayoutBatchResponse>(`/v1/payments/payouts/${batchId}`);
  return {
    batchStatus: res.batch_header.batch_status,
    items: (res.items ?? []).map((i) => ({
      itemId: i.payout_item_id,
      senderItemId: i.payout_item.sender_item_id ?? null,
      status: i.transaction_status ?? null,
      error: i.errors?.message ?? i.errors?.name ?? null,
    })),
  };
}
