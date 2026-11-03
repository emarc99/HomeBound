export function usdCentsToNgn(cents: number, ngnPerUsd: number): number {
  return Math.round((cents / 100) * ngnPerUsd);
}

export function ngnToUsdCents(ngn: number, ngnPerUsd: number): number {
  return Math.round((ngn / ngnPerUsd) * 100);
}

export function centsToUsdString(cents: number): string {
  return (cents / 100).toFixed(2);
}

const ngnFmt = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatNgn(ngn: number): string {
  return ngnFmt.format(ngn);
}

export function formatUsd(cents: number): string {
  return usdFmt.format(cents / 100);
}
