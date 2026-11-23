// Pulls website stats for each client from Cloudflare Web Analytics into the portal.
// Needs CLOUDFLARE_API_TOKEN (Account Analytics: Read) and CLOUDFLARE_ACCOUNT_ID, plus each client's
// Web Analytics site tag (set on the client's Stats tab). Runs nightly; WAVE can also run it per client.
import { HttpError, json, requireAdmin, requireFunctionSecret, serve, serviceClient } from "../_shared/common.ts";

type Db = ReturnType<typeof serviceClient>;
const TOP_N = 15;

function day(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function graphql(query: string) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!token) throw new HttpError(400, "Add the Cloudflare API token first (see the setup guide).");
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || out.errors?.length) {
    console.error("cloudflare", res.status, JSON.stringify(out.errors ?? out));
    throw new HttpError(502, `Cloudflare refused the stats request: ${out.errors?.[0]?.message ?? res.status}`);
  }
  return out.data;
}

const DIMS: Record<string, string> = { page: "requestPath", referrer: "refererHost", country: "countryName", device: "deviceType" };

async function syncClient(db: Db, clientId: string, siteTag: string, days: number) {
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID") ?? "";
  if (!/^[a-f0-9]{32}$/i.test(account)) throw new HttpError(400, "Add the Cloudflare account ID first (see the setup guide).");
  if (!/^[a-f0-9]{32}$/i.test(siteTag)) throw new HttpError(400, "That site tag doesn't look right (32 letters and numbers).");
  const end = new Date();
  const start = new Date(Date.now() - (days - 1) * 86400_000);
  const filter = `{ AND: [{ siteTag: "${siteTag}" }, { date_geq: "${day(start)}" }, { date_leq: "${day(end)}" }, { bot: 0 }] }`;
  const parts = Object.entries(DIMS).map(([k, field]) =>
    `${k}: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: 5000, orderBy: [count_DESC]) { count sum { visits } dimensions { date ${field} } }`
  ).join("\n");
  const data = await graphql(`{ viewer { accounts(filter: { accountTag: "${account}" }) {
    total: rumPageloadEventsAdaptiveGroups(filter: ${filter}, limit: 1000, orderBy: [date_ASC]) { count sum { visits } dimensions { date } }
    ${parts}
  } } }`);
  const acct = data?.viewer?.accounts?.[0];
  if (!acct) throw new HttpError(502, "Cloudflare returned no data for this account.");

  // deno-lint-ignore no-explicit-any
  const daily = (acct.total ?? []).map((g: any) => ({
    client_id: clientId, day: g.dimensions.date, pageviews: g.count ?? 0, visits: g.sum?.visits ?? 0,
  }));
  if (daily.length) {
    const { error } = await db.from("site_stats_daily").upsert(daily);
    if (error) throw new HttpError(500, error.message);
  }

  const dimRows: Record<string, unknown>[] = [];
  for (const [dim, field] of Object.entries(DIMS)) {
    const perDay: Record<string, { label: string; pageviews: number; visits: number }[]> = {};
    for (const g of acct[dim] ?? []) {
      const label = String(g.dimensions[field] ?? "").slice(0, 300) || (dim === "referrer" ? "(direct)" : "(unknown)");
      (perDay[g.dimensions.date] ??= []).push({ label, pageviews: g.count ?? 0, visits: g.sum?.visits ?? 0 });
    }
    for (const [d, rows] of Object.entries(perDay)) {
      rows.sort((a, b) => b.pageviews - a.pageviews).slice(0, TOP_N)
        .forEach((r) => dimRows.push({ client_id: clientId, day: d, dim, ...r }));
    }
  }
  await db.from("site_stats_dims").delete().eq("client_id", clientId).gte("day", day(start)).lte("day", day(end));
  for (let i = 0; i < dimRows.length; i += 500) {
    const { error } = await db.from("site_stats_dims").upsert(dimRows.slice(i, i + 500));
    if (error) throw new HttpError(500, error.message);
  }
  return { days: daily.length, breakdown_rows: dimRows.length };
}

async function clientsToSync(db: Db, clientId?: string) {
  let q = db.from("client_private").select("client_id, cloudflare_site_tag, clients!inner(status)").neq("cloudflare_site_tag", "");
  if (clientId) q = q.eq("client_id", clientId);
  const { data, error } = await q;
  if (error) throw new HttpError(500, error.message);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).filter((r: any) => clientId || r.clients?.status !== "cancelled");
}

async function hasData(db: Db, clientId: string) {
  const { count } = await db.from("site_stats_daily").select("*", { count: "exact", head: true }).eq("client_id", clientId);
  return (count ?? 0) > 0;
}

serve(async (req) => {
  const db = serviceClient();
  const isCron = !!req.headers.get("x-wave-secret");
  if (isCron) {
    requireFunctionSecret(req);
  } else {
    await requireAdmin(req, db);
  }
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;

  if (body.action === "status") {
    return json(req, { token: !!Deno.env.get("CLOUDFLARE_API_TOKEN"), account: !!Deno.env.get("CLOUDFLARE_ACCOUNT_ID") });
  }
  if (!Deno.env.get("CLOUDFLARE_API_TOKEN")) {
    if (isCron) return json(req, { skipped: "Cloudflare not configured" });
    throw new HttpError(400, "Add the Cloudflare API token first (see the setup guide).");
  }

  const clientId = body.action === "sync_client" ? String(body.client_id ?? "") : undefined;
  if (body.action !== "sync_all" && !clientId) throw new HttpError(400, "Unknown action.");
  const results: Record<string, unknown> = {};
  for (const row of await clientsToSync(db, clientId)) {
    try {
      const days = (await hasData(db, row.client_id)) && !clientId ? 3 : 90;
      results[row.client_id] = await syncClient(db, row.client_id, row.cloudflare_site_tag, days);
    } catch (e) {
      results[row.client_id] = { error: (e as Error).message };
      if (clientId) throw e;
    }
  }
  if (clientId && !Object.keys(results).length) throw new HttpError(400, "Add this client's Cloudflare site tag first.");
  return json(req, { results });
});
