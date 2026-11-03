import type { NextRequest } from "next/server";
import { completeFunding } from "@/lib/flows/payments";
import { appBaseUrl } from "@/lib/paypal/config";

export async function GET(req: NextRequest) {
  const paymentId = req.nextUrl.searchParams.get("paymentId");
  const base = appBaseUrl();
  if (!paymentId) return Response.redirect(`${base}/?error=missing_payment`, 303);
  try {
    const { status } = await completeFunding(paymentId, "owner (PayPal return)");
    return Response.redirect(`${base}/?funded=${encodeURIComponent(status)}`, 303);
  } catch (err) {
    console.error("PayPal return failed", err);
    return Response.redirect(`${base}/?error=capture_failed`, 303);
  }
}
