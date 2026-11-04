import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { blobs } from "@/db/schema";

export async function putBlob(db: Db, data: Buffer, mime: string): Promise<string> {
  const key = crypto.randomUUID();
  await db.insert(blobs).values({ key, mime, bytes: data.byteLength, data });
  return key;
}

export async function getBlob(db: Db, key: string) {
  const [row] = await db.select().from(blobs).where(eq(blobs.key, key));
  return row ?? null;
}
