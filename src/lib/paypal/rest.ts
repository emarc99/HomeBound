import "server-only";
import { PAYPAL_API_BASE, paypalCredentials } from "./config";

let cached: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const creds = paypalCredentials();
  if (!creds) throw new PaypalNotConfiguredError();
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new PaypalApiError("oauth2/token", res.status, await res.text());
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

export class PaypalNotConfiguredError extends Error {
  constructor() {
    super("PayPal sandbox credentials are not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET).");
  }
}

export class PaypalApiError extends Error {
  constructor(
    public endpoint: string,
    public status: number,
    public body: string,
  ) {
    super(`PayPal ${endpoint} failed with ${status}: ${body.slice(0, 500)}`);
  }
}

export async function paypalFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; requestId?: string } = {},
  attempt = 0,
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(20_000),
  });
  if ((res.status === 429 || res.status >= 500) && attempt < 2) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return paypalFetch<T>(path, init, attempt + 1);
  }
  if (res.status === 401 && attempt === 0) {
    cached = null;
    return paypalFetch<T>(path, init, attempt + 1);
  }
  const text = await res.text();
  if (!res.ok) throw new PaypalApiError(path, res.status, text);
  return (text ? JSON.parse(text) : {}) as T;
}
