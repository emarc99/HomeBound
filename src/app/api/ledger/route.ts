import { getDb } from "@/db";
import { verifyLedger } from "@/lib/ledger";
import { getHeroProject, getLedger } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 500);
  const project = await getHeroProject();
  if (!project) return Response.json({ error: "No project" }, { status: 404 });
  const [events, integrity] = await Promise.all([getLedger(project.id, limit), verifyLedger(await getDb())]);
  return Response.json({ projectId: project.id, integrity, events });
}
