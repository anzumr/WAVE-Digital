// Emails triggered by the database (new requests, request updates, and later phases' events).
// Called only by Postgres triggers with the shared WAVE_FUNCTION_SECRET.
import { adminEmails, json, memberEmails, PORTAL_URL, requireFunctionSecret, serve, serviceClient } from "../_shared/common.ts";
import { emailConfigured, esc, plainText, renderEmail, sendEmail } from "../_shared/email.ts";

type Db = ReturnType<typeof serviceClient>;

const STATUS_LABEL: Record<string, string> = {
  new: "New", in_progress: "In progress", waiting_on_client: "Waiting on you", done: "Done", declined: "Declined",
};
const TYPE_LABEL: Record<string, string> = {
  website: "Website change", social: "Social media", advertising: "Advertising",
  branding: "Logo / branding", broken: "Something's broken", other: "Other",
};

function para(text: string): string {
  return esc(text).replace(/\n/g, "<br>");
}

async function loadRequest(db: Db, id: string) {
  const { data } = await db.from("requests")
    .select("id, ref_no, client_id, type, title, details, page_url, priority, wanted_by, status, clients(business_name), profiles!requests_created_by_fkey(full_name, email)")
    .eq("id", id).single();
  // deno-lint-ignore no-explicit-any
  return data as any;
}

async function requestCreated(db: Db, data: Record<string, string>) {
  const r = await loadRequest(db, data.request_id);
  if (!r) return { skipped: "request not found" };
  const business = r.clients?.business_name ?? "A client";
  const who = r.profiles?.full_name || r.profiles?.email || "the client";
  const link = `${PORTAL_URL}#/admin/requests/${r.id}`;
  const urgent = r.priority === "urgent";
  const lines = [
    `${business} (${who}) sent a ${TYPE_LABEL[r.type] ?? r.type} request${urgent ? ", marked urgent" : ""}.`,
    `Title: ${r.title}`,
    ...(r.wanted_by ? [`Wanted by: ${r.wanted_by}`] : []),
    ...(r.page_url ? [`Page or link: ${r.page_url}`] : []),
    "",
    r.details,
  ];
  return await sendEmail({
    to: await adminEmails(db),
    subject: `${urgent ? "URGENT: " : ""}New request #${r.ref_no} from ${business}: ${r.title}`,
    html: renderEmail({
      heading: `New request #${r.ref_no} from ${business}`,
      paragraphs: [
        `<strong>${esc(who)}</strong> sent a <strong>${esc(TYPE_LABEL[r.type] ?? r.type)}</strong> request${urgent ? ' marked <strong style="color:#b42318">urgent</strong>' : ""}.`,
        `<strong>${esc(r.title)}</strong>`,
        ...(r.wanted_by ? [`Wanted by: ${esc(r.wanted_by)}`] : []),
        ...(r.page_url ? [`Page or link: ${esc(r.page_url)}`] : []),
        para(r.details),
      ],
      button: { label: "Open the request", url: link },
    }),
    text: plainText(`New request #${r.ref_no} from ${business}`, lines, link),
  });
}

async function requestUpdate(db: Db, data: Record<string, string>) {
  const { data: u } = await db.from("request_updates")
    .select("id, kind, from_status, to_status, message, author_id, profiles(full_name, email)")
    .eq("id", data.update_id).single();
  const r = await loadRequest(db, data.request_id);
  if (!u || !r) return { skipped: "not found" };
  const business = r.clients?.business_name ?? "A client";

  if (u.kind === "client_note") {
    // deno-lint-ignore no-explicit-any
    const author = (u as any).profiles?.full_name || (u as any).profiles?.email || "The client";
    const link = `${PORTAL_URL}#/admin/requests/${r.id}`;
    return await sendEmail({
      to: await adminEmails(db),
      subject: `${business} added details to request #${r.ref_no}: ${r.title}`,
      html: renderEmail({
        heading: `More details on request #${r.ref_no}`,
        paragraphs: [`<strong>${esc(author)}</strong> from ${esc(business)} wrote:`, para(u.message)],
        button: { label: "Open the request", url: link },
      }),
      text: plainText(`More details on request #${r.ref_no}`, [`${author} from ${business} wrote:`, "", u.message], link),
    });
  }

  const link = `${PORTAL_URL}#/requests/${r.id}`;
  const statusLine = u.kind === "status" && u.to_status
    ? `Your request is now: ${STATUS_LABEL[u.to_status] ?? u.to_status}.`
    : "WAVE added an update to your request.";
  const paragraphs = [esc(statusLine), `<strong>${esc(r.title)}</strong>`];
  if (u.message) paragraphs.push(para(u.message));
  return await sendEmail({
    to: await memberEmails(db, r.client_id),
    subject: `Update on your request #${r.ref_no}: ${r.title}`,
    html: renderEmail({ heading: `Update on request #${r.ref_no}`, paragraphs, button: { label: "View your request", url: link } }),
    text: plainText(`Update on request #${r.ref_no}`, [statusLine, r.title, ...(u.message ? ["", u.message] : [])], link),
  });
}

async function meetingBooked(db: Db, data: Record<string, string>) {
  const { data: m } = await db.from("meetings")
    .select("id, client_id, starts_at, topic, clients(business_name), profiles(full_name, email)")
    .eq("id", data.meeting_id).single();
  if (!m) return { skipped: "meeting not found" };
  // deno-lint-ignore no-explicit-any
  const mm = m as any;
  const business = mm.clients?.business_name ?? "A client";
  const who = mm.profiles?.full_name || mm.profiles?.email || "Someone";
  const when = m.starts_at
    ? new Date(m.starts_at).toUTCString().replace(" GMT", " UTC")
    : "the time in your Calendly notification";
  const link = `${PORTAL_URL}#/admin/clients/${m.client_id}/meetings`;
  return await sendEmail({
    to: await adminEmails(db),
    subject: `${business} booked a meeting`,
    html: renderEmail({
      heading: `${business} booked a meeting`,
      paragraphs: [`<strong>${esc(who)}</strong> booked “${esc(m.topic)}” for ${esc(when)} from the portal.`],
      button: { label: "Open their meetings", url: link },
    }),
    text: plainText(`${business} booked a meeting`, [`${who} booked "${m.topic}" for ${when} from the portal.`], link),
  });
}

const HANDLERS: Record<string, (db: Db, data: Record<string, string>) => Promise<unknown>> = {
  request_created: requestCreated,
  request_update: requestUpdate,
  meeting_booked: meetingBooked,
};

serve(async (req) => {
  requireFunctionSecret(req);
  const body = await req.json().catch(() => ({})) as { event?: string; data?: Record<string, string> };
  const handler = HANDLERS[body.event ?? ""];
  if (!handler) return json(req, { skipped: `unknown event ${body.event}` });
  if (!emailConfigured()) return json(req, { skipped: "email not configured" });
  const result = await handler(serviceClient(), body.data ?? {});
  return json(req, { event: body.event, result });
});
