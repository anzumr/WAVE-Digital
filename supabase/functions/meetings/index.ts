// Meetings: record a Calendly booking made inside the portal, and (admin) pull a client's
// bookings from Calendly. Event details need a Calendly personal access token (CALENDLY_TOKEN);
// without it, bookings are still recorded, just without the time.
import { HttpError, json, memberEmails, requireUser, serve, serviceClient } from "../_shared/common.ts";

type Db = ReturnType<typeof serviceClient>;

const EVENT_RE = /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+$/;
const INVITEE_RE = /^https:\/\/api\.calendly\.com\/scheduled_events\/[A-Za-z0-9-]+\/invitees\/[A-Za-z0-9-]+$/;

async function calendly(path: string) {
  const token = Deno.env.get("CALENDLY_TOKEN");
  if (!token) return null;
  const url = path.startsWith("https://") ? path : `https://api.calendly.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  if (!res.ok) {
    console.error("calendly", res.status, await res.text());
    throw new HttpError(502, `Calendly refused the request (${res.status}). Check the Calendly token.`);
  }
  return await res.json();
}

// deno-lint-ignore no-explicit-any
function rowFromEvent(clientId: string, ev: any, createdBy: string | null) {
  const start = ev.start_time ? new Date(ev.start_time) : null;
  const end = ev.end_time ? new Date(ev.end_time) : null;
  return {
    client_id: clientId,
    starts_at: start ? start.toISOString() : null,
    duration_min: start && end ? Math.max(5, Math.min(480, Math.round((+end - +start) / 60000))) : 30,
    topic: String(ev.name ?? "Meeting with WAVE Digital").slice(0, 200),
    status: ev.status === "canceled" ? "cancelled" : "scheduled",
    source: "calendly",
    calendly_event_uri: ev.uri,
    meeting_url: String(ev.location?.join_url ?? "").slice(0, 500),
    created_by: createdBy,
  };
}

async function isMember(db: Db, clientId: string, userId: string) {
  const { count } = await db.from("client_members").select("*", { count: "exact", head: true })
    .eq("client_id", clientId).eq("user_id", userId);
  return (count ?? 0) > 0;
}

async function booked(db: Db, body: Record<string, unknown>, caller: { id: string; role: string }) {
  const clientId = String(body.client_id ?? "");
  const eventUri = String(body.event_uri ?? "");
  const inviteeUri = String(body.invitee_uri ?? "");
  if (!EVENT_RE.test(eventUri)) throw new HttpError(400, "That doesn't look like a Calendly booking.");
  if (caller.role !== "admin" && !(await isMember(db, clientId, caller.id))) throw new HttpError(403, "Not allowed.");

  const { data: existing } = await db.from("meetings").select("id").eq("calendly_event_uri", eventUri).maybeSingle();
  if (existing) return { meeting_id: existing.id, details: true };

  const ev = await calendly(eventUri).catch(() => null);
  let row;
  if (ev?.resource) {
    // Only record bookings the caller actually made.
    if (INVITEE_RE.test(inviteeUri)) {
      const inv = await calendly(inviteeUri).catch(() => null);
      const emails = await memberEmails(db, clientId);
      const invEmail = String(inv?.resource?.email ?? "").toLowerCase();
      if (caller.role !== "admin" && invEmail && !emails.map((e) => e.toLowerCase()).includes(invEmail)) {
        throw new HttpError(403, "That booking belongs to someone else.");
      }
    }
    row = rowFromEvent(clientId, ev.resource, caller.id);
  } else {
    row = {
      client_id: clientId, topic: "Meeting with WAVE Digital", status: "scheduled", source: "calendly",
      calendly_event_uri: eventUri, created_by: caller.id,
    };
  }
  const { data, error } = await db.from("meetings").insert(row).select("id").single();
  if (error) throw new HttpError(400, error.message);
  return { meeting_id: data.id, details: !!ev?.resource };
}

async function sync(db: Db, body: Record<string, unknown>) {
  const clientId = String(body.client_id ?? "");
  if (!Deno.env.get("CALENDLY_TOKEN")) throw new HttpError(400, "Add a Calendly token first (see the setup guide).");
  const me = await calendly("/users/me");
  const org = me?.resource?.current_organization;
  const emails = [...new Set((await memberEmails(db, clientId)).map((e) => e.toLowerCase()))];
  const { data: client } = await db.from("clients").select("contact_email").eq("id", clientId).single();
  if (client?.contact_email) emails.push(client.contact_email.toLowerCase());
  const since = new Date(Date.now() - 180 * 86400_000).toISOString();
  let added = 0, updated = 0;
  for (const email of [...new Set(emails)]) {
    const qs = new URLSearchParams({ organization: org, invitee_email: email, min_start_time: since, count: "100", sort: "start_time:desc" });
    const list = await calendly(`/scheduled_events?${qs}`);
    for (const ev of list?.collection ?? []) {
      const row = rowFromEvent(clientId, ev, null);
      const { data: existing } = await db.from("meetings").select("id, client_id").eq("calendly_event_uri", ev.uri).maybeSingle();
      if (existing) {
        if (existing.client_id !== clientId) continue;
        const { created_by: _c, ...changes } = row;
        await db.from("meetings").update(changes).eq("id", existing.id);
        updated++;
      } else {
        await db.from("meetings").insert(row);
        added++;
      }
    }
  }
  return { added, updated, emails_checked: emails.length };
}

serve(async (req) => {
  const db = serviceClient();
  const caller = await requireUser(req, db);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  switch (body.action) {
    case "booked": return json(req, await booked(db, body, caller));
    case "sync":
      if (caller.role !== "admin" || caller.aal !== "aal2") throw new HttpError(403, "Only WAVE can do that.");
      return json(req, await sync(db, body));
    case "status": return json(req, { calendly_token: !!Deno.env.get("CALENDLY_TOKEN") });
    default: throw new HttpError(400, "Unknown action.");
  }
});
