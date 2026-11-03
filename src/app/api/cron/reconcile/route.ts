import { reconcilePending } from "@/lib/flows/payments";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401 });
  }
  const result = await reconcilePending("reconcile cron");
  return Response.json(result);
}
