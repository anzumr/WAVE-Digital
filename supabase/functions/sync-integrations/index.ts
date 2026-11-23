// Pulls a month's numbers from each client's connected accounts into monthly_metrics (source 'auto').
// Runs on the 1st for last month (before summaries are drafted); WAVE can also run it per client.
import { HttpError, json, requireAdmin, requireFunctionSecret, serve, serviceClient } from "../_shared/common.ts";
import { credentials, facebook, googleAds, googleReviews, instagram, ProviderError, type Values, type Window } from "../_shared/providers.ts";

type Db = ReturnType<typeof serviceClient>;

function monthWindow(v: unknown): Window {
  const now = new Date();
  let from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  if (typeof v === "string" && /^\d{4}-\d{2}$/.test(v)) from = new Date(v + "-01T00:00:00Z");
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  return { from, to: to > now ? now : to };
}

async function readProvider(provider: string, externalId: string, w: Window): Promise<Values> {
  switch (provider) {
    case "instagram": return await instagram(externalId, w);
    case "facebook": return await facebook(externalId);
    case "google_business": return await googleReviews(externalId);
    case "google_ads": return await googleAds(externalId, w);
    default: throw new ProviderError(`Unknown connection ${provider}.`);
  }
}

async function syncClient(db: Db, clientId: string, w: Window) {
  const { data: rows } = await db.from("integrations").select("*").eq("client_id", clientId).eq("enabled", true);
  const month = w.from.toISOString().slice(0, 10);
  const out: Record<string, unknown> = {};
  for (const r of rows ?? []) {
    try {
      const values = await readProvider(r.provider, r.external_id, w);
      // Never overwrite a number WAVE typed in by hand.
      const { data: manual } = await db.from("monthly_metrics").select("metric").eq("client_id", clientId).eq("month", month).eq("source", "manual");
      const keep = new Set((manual ?? []).map((m) => m.metric));
      const upserts = Object.entries(values).filter(([k]) => !keep.has(k))
        .map(([metric, value]) => ({ client_id: clientId, month, metric, value, source: "auto" }));
      if (upserts.length) {
        const { error } = await db.from("monthly_metrics").upsert(upserts);
        if (error) throw new ProviderError(error.message);
      }
      await db.from("integrations").update({ status: "ok", last_error: "", last_synced_at: new Date().toISOString() }).eq("id", r.id);
      out[r.provider] = { ok: true, saved: upserts.length, kept_manual: Object.keys(values).length - upserts.length };
    } catch (e) {
      const msg = e instanceof ProviderError ? e.message : "Unexpected error while syncing.";
      if (!(e instanceof ProviderError)) console.error(e);
      await db.from("integrations").update({ status: "error", last_error: msg.slice(0, 1000) }).eq("id", r.id);
      out[r.provider] = { ok: false, error: msg };
    }
  }
  return out;
}

serve(async (req) => {
  const db = serviceClient();
  const isCron = !!req.headers.get("x-wave-secret");
  if (isCron) requireFunctionSecret(req); else await requireAdmin(req, db);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const w = monthWindow(body.month);
  switch (body.action) {
    case "status": return json(req, credentials());
    case "sync_client": {
      const clientId = String(body.client_id ?? "");
      return json(req, { month: w.from.toISOString().slice(0, 7), results: { [clientId]: await syncClient(db, clientId, w) } });
    }
    case "sync_all": {
      const { data: clients } = await db.from("integrations").select("client_id, clients!inner(status)").eq("enabled", true);
      // deno-lint-ignore no-explicit-any
      const ids = [...new Set((clients ?? []).filter((c: any) => c.clients?.status === "active").map((c) => c.client_id))];
      const results: Record<string, unknown> = {};
      for (const id of ids) results[id] = await syncClient(db, id, w);
      return json(req, { month: w.from.toISOString().slice(0, 7), results });
    }
    default: throw new HttpError(400, "Unknown action.");
  }
});
