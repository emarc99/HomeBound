import "server-only";
import { createHash } from "node:crypto";
import { desc } from "drizzle-orm";
import type { Db } from "@/db";
import { ledgerEvents } from "@/db/schema";

const GENESIS = "0".repeat(64);

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function hashEvent(e: {
  seq: number;
  type: string;
  actor: string;
  projectId: string | null;
  payload: Record<string, unknown>;
  prevHash: string;
}): string {
  return createHash("sha256").update(canonical(e)).digest("hex");
}

export type LedgerInput = {
  projectId: string | null;
  type: string;
  actor: string;
  payload: Record<string, unknown>;
};

export async function appendLedger(db: Db, input: LedgerInput, attempt = 0): Promise<void> {
  const [last] = await db
    .select({ seq: ledgerEvents.seq, hash: ledgerEvents.hash })
    .from(ledgerEvents)
    .orderBy(desc(ledgerEvents.seq))
    .limit(1);
  const seq = (last?.seq ?? 0) + 1;
  const prevHash = last?.hash ?? GENESIS;
  const hash = hashEvent({ seq, prevHash, ...input });
  try {
    await db.insert(ledgerEvents).values({ seq, prevHash, hash, ...input });
  } catch (err) {
    if (attempt < 5) return appendLedger(db, input, attempt + 1);
    throw err;
  }
}

export async function verifyLedger(db: Db): Promise<{ ok: boolean; count: number; brokenAtSeq?: number }> {
  const rows = await db.select().from(ledgerEvents).orderBy(ledgerEvents.seq);
  let prev = GENESIS;
  for (const r of rows) {
    const expected = hashEvent({
      seq: r.seq,
      type: r.type,
      actor: r.actor,
      projectId: r.projectId,
      payload: r.payload,
      prevHash: prev,
    });
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false, count: rows.length, brokenAtSeq: r.seq };
    prev = r.hash;
  }
  return { ok: true, count: rows.length };
}
