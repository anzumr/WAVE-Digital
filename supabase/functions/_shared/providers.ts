// Readers for the outside services the portal can pull numbers from. Each returns metric values
// keyed like monthly_metrics.metric. The response parsing is kept in small pure functions so it can be
// tested without live accounts. API versions are settings (secrets) because both companies retire
// old versions every year or so.

export type Values = Record<string, number>;
export interface Window { from: Date; to: Date } // [from, to): one calendar month, UTC

const META_VERSION = () => Deno.env.get("META_API_VERSION") || "v23.0";
const ADS_VERSION = () => Deno.env.get("GOOGLE_ADS_API_VERSION") || "v21";

export class ProviderError extends Error {}

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    const b = body as any;
    const msg = b?.error?.message ?? b?.error_description ?? (typeof b === "string" ? b.slice(0, 200) : `HTTP ${res.status}`);
    throw new ProviderError(`${new URL(url).hostname} said: ${msg}`);
  }
  return body;
}

// ---------- pure parsers (unit-tested in supabase/tests/providers_test.ts) ----------

// Instagram user insights with metric_type=total_value: { data: [{ name, total_value: { value } }] }
// deno-lint-ignore no-explicit-any
export function parseIgTotals(body: any): Values {
  const out: Values = {};
  for (const d of body?.data ?? []) {
    const v = Number(d?.total_value?.value);
    if (Number.isFinite(v)) out[d.name] = (out[d.name] ?? 0) + v;
  }
  return out;
}

// Google Ads search results: { results: [{ metrics: { costMicros: "1230000", impressions: "456", clicks: "7", conversions: 1.5 } }] }
// deno-lint-ignore no-explicit-any
export function parseAdsTotals(body: any): Values {
  const sum = { cost: 0, impressions: 0, clicks: 0, conversions: 0 };
  for (const r of body?.results ?? []) {
    const m = r?.metrics ?? {};
    sum.cost += Number(m.costMicros ?? 0) / 1e6;
    sum.impressions += Number(m.impressions ?? 0);
    sum.clicks += Number(m.clicks ?? 0);
    sum.conversions += Number(m.conversions ?? 0);
  }
  return {
    "ads.spend": Math.round(sum.cost * 100) / 100,
    "ads.impressions": Math.round(sum.impressions),
    "ads.clicks": Math.round(sum.clicks),
    "ads.leads": Math.round(sum.conversions),
  };
}

// Google Business Profile reviews list: { averageRating: 4.6, totalReviewCount: 182, reviews: [...] }
// deno-lint-ignore no-explicit-any
export function parseReviews(body: any): Values {
  const out: Values = {};
  if (Number.isFinite(Number(body?.averageRating))) out["reviews.google.rating"] = Math.round(Number(body.averageRating) * 10) / 10;
  if (Number.isFinite(Number(body?.totalReviewCount))) out["reviews.google.count"] = Number(body.totalReviewCount);
  return out;
}

// The Instagram insights API allows at most 30 days per request: split a month into windows.
export function thirtyDayWindows(w: Window): Window[] {
  const out: Window[] = [];
  let from = w.from;
  while (from < w.to) {
    const to = new Date(Math.min(+from + 30 * 86400_000, +w.to));
    out.push({ from, to });
    from = to;
  }
  return out;
}

export function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ---------- Meta (Instagram, Facebook): one long-lived token from WAVE's Business Manager system user ----------

function metaToken(): string {
  const t = Deno.env.get("META_ACCESS_TOKEN");
  if (!t) throw new ProviderError("WAVE's Meta access isn't set up yet (META_ACCESS_TOKEN).");
  return t;
}

export async function instagram(igUserId: string, w: Window): Promise<Values> {
  const token = metaToken();
  const base = `https://graph.facebook.com/${META_VERSION()}/${encodeURIComponent(igUserId)}`;
  const user = await getJson(`${base}?fields=followers_count,username&access_token=${encodeURIComponent(token)}`) as { followers_count?: number };
  const totals: Values = {};
  for (const part of thirtyDayWindows(w)) {
    const qs = new URLSearchParams({
      metric: "reach,total_interactions", period: "day", metric_type: "total_value",
      since: String(Math.floor(+part.from / 1000)), until: String(Math.floor(+part.to / 1000)), access_token: token,
    });
    const t = parseIgTotals(await getJson(`${base}/insights?${qs}`));
    for (const [k, v] of Object.entries(t)) totals[k] = (totals[k] ?? 0) + v;
  }
  const out: Values = {};
  if (Number.isFinite(Number(user.followers_count))) out["social.instagram.followers"] = Number(user.followers_count);
  if (totals.reach != null) out["social.instagram.reach"] = totals.reach;
  if (totals.total_interactions != null) out["social.instagram.engagement"] = totals.total_interactions;
  return out;
}

export async function facebook(pageId: string): Promise<Values> {
  const token = metaToken();
  const base = `https://graph.facebook.com/${META_VERSION()}/${encodeURIComponent(pageId)}`;
  // Page fields need the Page's own token, which the system user can fetch for pages assigned to it.
  let pageToken = token;
  try {
    const p = await getJson(`${base}?fields=access_token&access_token=${encodeURIComponent(token)}`) as { access_token?: string };
    if (p.access_token) pageToken = p.access_token;
  } catch { /* fall back to the system user token */ }
  const page = await getJson(`${base}?fields=followers_count,fan_count,name&access_token=${encodeURIComponent(pageToken)}`) as { followers_count?: number; fan_count?: number };
  const followers = page.followers_count ?? page.fan_count;
  if (followers == null) throw new ProviderError("Facebook didn't return a follower count for this Page.");
  return { "social.facebook.followers": Number(followers) };
}

// ---------- Google (Business Profile, Ads): one OAuth refresh token for WAVE's Google account ----------

async function googleAccessToken(): Promise<string> {
  const id = Deno.env.get("GOOGLE_CLIENT_ID"), secret = Deno.env.get("GOOGLE_CLIENT_SECRET"), refresh = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (!id || !secret || !refresh) throw new ProviderError("WAVE's Google access isn't set up yet (Google client ID, secret and refresh token).");
  const body = await getJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, refresh_token: refresh, grant_type: "refresh_token" }),
  }) as { access_token?: string };
  if (!body.access_token) throw new ProviderError("Google didn't return an access token.");
  return body.access_token;
}

export async function googleReviews(location: string): Promise<Values> {
  if (!/^accounts\/\d+\/locations\/\d+$/.test(location)) throw new ProviderError("The location should look like accounts/123/locations/456.");
  const token = await googleAccessToken();
  const body = await getJson(`https://mybusiness.googleapis.com/v4/${location}/reviews?pageSize=1`, { headers: { Authorization: `Bearer ${token}` } });
  const out = parseReviews(body);
  if (!Object.keys(out).length) throw new ProviderError("Google didn't return a rating for this location.");
  return out;
}

export async function googleAds(customerId: string, w: Window): Promise<Values> {
  const dev = Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!dev) throw new ProviderError("WAVE's Google Ads developer token isn't set up yet.");
  const cid = customerId.replace(/-/g, "");
  if (!/^\d{10}$/.test(cid)) throw new ProviderError("The Google Ads customer ID should have 10 digits.");
  const token = await googleAccessToken();
  const last = new Date(+w.to - 86400_000);
  const query = `SELECT metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM customer ` +
    `WHERE segments.date BETWEEN '${isoDay(w.from)}' AND '${isoDay(last)}'`;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "developer-token": dev, "Content-Type": "application/json" };
  const manager = (Deno.env.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID") ?? "").replace(/-/g, "");
  if (manager) headers["login-customer-id"] = manager;
  const body = await getJson(`https://googleads.googleapis.com/${ADS_VERSION()}/customers/${cid}/googleAds:search`, {
    method: "POST", headers, body: JSON.stringify({ query }),
  });
  return parseAdsTotals(body);
}

export function credentials() {
  const google = !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("GOOGLE_REFRESH_TOKEN"));
  return { meta: !!Deno.env.get("META_ACCESS_TOKEN"), google_business: google, google_ads: google && !!Deno.env.get("GOOGLE_ADS_DEVELOPER_TOKEN") };
}
