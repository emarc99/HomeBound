import { sql } from "drizzle-orm";
import { getDb } from "@/db";

export async function GET() {
  const db = await getDb();
  await db.execute(sql`select 1`);
  return Response.json({ ok: true });
}
