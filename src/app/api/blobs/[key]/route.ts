import { getDb } from "@/db";
import { getBlob } from "@/lib/blobs";

export async function GET(_req: Request, ctx: RouteContext<"/api/blobs/[key]">) {
  const { key } = await ctx.params;
  const blob = await getBlob(await getDb(), key);
  if (!blob) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(blob.data), {
    headers: {
      "Content-Type": blob.mime,
      "Content-Length": String(blob.bytes),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
