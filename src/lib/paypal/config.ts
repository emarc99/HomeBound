import "server-only";

export const PAYPAL_API_BASE =
  process.env.PAYPAL_ENVIRONMENT === "PRODUCTION" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export function paypalCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isPaypalConfigured(): boolean {
  return paypalCredentials() !== null;
}

export function appBaseUrl(): string {
  return (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
