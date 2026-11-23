// Monthly summaries: on the 1st a PDF draft is made for each active client; WAVE can add a note;
// after the delay set in Settings it's emailed to the client's portal users (PDF attached).
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";
import {
  HttpError, json, memberEmails, PORTAL_URL, requireAdmin, requireFunctionSecret, serve, serviceClient,
} from "../_shared/common.ts";
import { esc, plainText, renderEmail, sendEmail } from "../_shared/email.ts";
import { formatMetric, METRICS } from "../_shared/metrics.ts";

type Db = ReturnType<typeof serviceClient>;

function monthStart(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonths(d: Date, n: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function monthName(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
function parseMonth(v: unknown): Date {
  if (typeof v === "string" && /^\d{4}-\d{2}(-01)?$/.test(v)) return new Date(v.slice(0, 7) + "-01T00:00:00Z");
  return addMonths(monthStart(new Date()), -1);
}

// ---------- data ----------
async function gather(db: Db, clientId: string, month: Date) {
  const from = iso(month), to = iso(addMonths(month, 1)), prevFrom = iso(addMonths(month, -1));
  const [client, days, prevDays, dims, metrics, created, done, meetings] = await Promise.all([
    db.from("clients").select("business_name, plan").eq("id", clientId).single(),
    db.from("site_stats_daily").select("day, visits, pageviews").eq("client_id", clientId).gte("day", from).lt("day", to).order("day"),
    db.from("site_stats_daily").select("visits, pageviews").eq("client_id", clientId).gte("day", prevFrom).lt("day", from),
    db.from("site_stats_dims").select("label, pageviews").eq("client_id", clientId).eq("dim", "page").gte("day", from).lt("day", to),
    db.from("monthly_metrics").select("month, metric, value").eq("client_id", clientId).in("month", [prevFrom, from]),
    db.from("requests").select("*", { count: "exact", head: true }).eq("client_id", clientId).gte("created_at", from).lt("created_at", to),
    db.from("requests").select("*", { count: "exact", head: true }).eq("client_id", clientId).eq("status", "done").gte("closed_at", from).lt("closed_at", to),
    db.from("meetings").select("*", { count: "exact", head: true }).eq("client_id", clientId).neq("status", "cancelled").gte("starts_at", from).lt("starts_at", to),
  ]);
  if (!client.data) throw new HttpError(404, "Client not found.");
  const sum = (rows: { visits: number; pageviews: number }[] | null, k: "visits" | "pageviews") =>
    (rows ?? []).reduce((s, r) => s + (r[k] ?? 0), 0);
  const pages: Record<string, number> = {};
  for (const r of dims.data ?? []) pages[r.label] = (pages[r.label] ?? 0) + r.pageviews;
  const cur: Record<string, number> = {}, prev: Record<string, number> = {};
  for (const m of metrics.data ?? []) (m.month === from ? cur : prev)[m.metric] = Number(m.value);
  return {
    business: client.data.business_name as string,
    hasSite: (days.data ?? []).length > 0,
    daily: (days.data ?? []) as { day: string; visits: number }[],
    visits: sum(days.data, "visits"), pageviews: sum(days.data, "pageviews"),
    prevVisits: sum(prevDays.data, "visits"), prevPageviews: sum(prevDays.data, "pageviews"),
    hasPrevSite: (prevDays.data ?? []).length > 0,
    topPages: Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 5),
    cur, prev,
    requestsIn: created.count ?? 0, requestsDone: done.count ?? 0, meetings: meetings.count ?? 0,
  };
}
type Data = Awaited<ReturnType<typeof gather>>;

function change(cur: number, prev: number | undefined, hasPrev = true): string {
  if (!hasPrev || prev == null || prev === 0) return "";
  const pct = Math.round(((cur - prev) / prev) * 100);
  return (pct > 0 ? "+" : "") + pct + "% vs last month";
}

// ---------- PDF ----------
// The built-in PDF fonts only cover Western European characters; fold anything else.
function clean(s: string): string {
  return String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7e\xa0-\xff\n]/g, "");
}

const NAVY = rgb(3 / 255, 13 / 255, 25 / 255), INK = rgb(0.07, 0.13, 0.19), MUTED = rgb(0.36, 0.43, 0.5),
  LINE = rgb(0.86, 0.89, 0.92), BLUE = rgb(0x39 / 255, 0x87 / 255, 0xe5 / 255), CYAN = rgb(0x70 / 255, 0xe5 / 255, 0xf2 / 255);

async function buildPdf(d: Data, month: Date, note: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${d.business} - ${monthName(month)} summary`));
  pdf.setAuthor("WAVE Digital");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 54;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H;

  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(clean(s), { x, y: yy, size, font: f, color });
  const ensure = (need: number) => {
    if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; }
  };
  const wrap = (s: string, size: number, width: number, f: PDFFont = font) => {
    const lines: string[] = [];
    for (const para of clean(s).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/)) {
        const tryLine = line ? line + " " + word : word;
        if (f.widthOfTextAtSize(tryLine, size) > width && line) { lines.push(line); line = word; } else line = tryLine;
      }
      lines.push(line);
    }
    return lines;
  };
  const heading = (s: string) => {
    ensure(60);
    y -= 34;
    text(s, M, y, 14, bold);
    y -= 10;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: LINE });
  };
  const row = (label: string, value: string, note2 = "") => {
    ensure(24);
    y -= 20;
    text(label, M, y, 11, font, MUTED);
    text(value, M + 230, y, 11, bold);
    if (note2) text(note2, M + 330, y, 10, font, MUTED);
  };

  // header band
  page.drawRectangle({ x: 0, y: H - 112, width: W, height: 112, color: NAVY });
  text("WAVE DIGITAL", M, H - 44, 11, bold, CYAN);
  text(`${monthName(month)} summary`, M, H - 74, 22, bold, rgb(0.95, 0.98, 1));
  text(d.business, M, H - 96, 12, font, rgb(0.75, 0.83, 0.88));
  y = H - 112;

  heading("Website");
  if (d.hasSite) {
    row("Visitors", d.visits.toLocaleString("en-US"), change(d.visits, d.prevVisits, d.hasPrevSite));
    row("Page views", d.pageviews.toLocaleString("en-US"), change(d.pageviews, d.prevPageviews, d.hasPrevSite));
    // daily visitors, one column per day
    if (d.daily.length > 1) {
      ensure(110);
      y -= 18;
      text("Visitors per day", M, y, 10, font, MUTED);
      const chartH = 70, chartW = W - 2 * M, base = y - 10 - chartH;
      const max = Math.max(1, ...d.daily.map((r) => r.visits));
      const slot = chartW / d.daily.length, bw = Math.max(2, Math.min(12, slot - 2));
      page.drawLine({ start: { x: M, y: base }, end: { x: W - M, y: base }, thickness: 0.75, color: LINE });
      d.daily.forEach((r, i) => {
        const h = (r.visits / max) * chartH;
        if (h > 0) page.drawRectangle({ x: M + i * slot + (slot - bw) / 2, y: base, width: bw, height: h, color: BLUE });
      });
      text(String(max), W - M - font.widthOfTextAtSize(String(max), 8), base + chartH + 2, 8, font, MUTED);
      y = base - 6;
    }
    if (d.topPages.length) {
      ensure(30 + d.topPages.length * 18);
      y -= 22;
      text("Most visited pages", M, y, 10, font, MUTED);
      for (const [p, n] of d.topPages) {
        y -= 17;
        const label = wrap(p, 10, 380)[0];
        text(label, M, y, 10);
        text(n.toLocaleString("en-US") + " views", M + 400, y, 10, font, MUTED);
      }
    }
  } else {
    ensure(24); y -= 20;
    text("Website stats will appear here once your site is connected to WAVE's analytics.", M, y, 10.5, font, MUTED);
  }

  const groups = [...new Set(METRICS.map((m) => m.group))];
  for (const g of groups) {
    const defs = METRICS.filter((m) => m.group === g && d.cur[m.key] != null);
    if (!defs.length) continue;
    heading(g === "Advertising" ? "Advertising" : g);
    for (const m of defs) {
      row(m.label, formatMetric(m.kind, d.cur[m.key]), m.kind === "rating" ? "" : change(d.cur[m.key], d.prev[m.key]));
    }
    if (g === "Advertising" && d.cur["ads.spend"] != null && d.cur["ads.leads"]) {
      row("Cost per lead", formatMetric("money", d.cur["ads.spend"] / d.cur["ads.leads"]));
    }
  }

  heading("Work with WAVE");
  row("Requests sent", String(d.requestsIn));
  row("Requests completed", String(d.requestsDone));
  row("Meetings", String(d.meetings));

  if (note.trim()) {
    heading("A note from WAVE");
    for (const line of wrap(note, 11, W - 2 * M)) { ensure(18); y -= 16; text(line, M, y, 11); }
  }

  ensure(40);
  y -= 36;
  text("Questions? Reply to this email or open your portal at wavedigital.biz/me", M, y, 9.5, font, MUTED);
  return await pdf.save();
}

// ---------- actions ----------
async function generate(db: Db, clientId: string, month: Date, opts: { keepSent: boolean }) {
  const { data: existing } = await db.from("monthly_summaries").select("*").eq("client_id", clientId).eq("month", iso(month)).maybeSingle();
  if (existing?.status === "sent" && opts.keepSent) return { skipped: "already sent" };
  const d = await gather(db, clientId, month);
  const bytes = await buildPdf(d, month, existing?.admin_note ?? "");
  const path = `${clientId}/summaries/${iso(month).slice(0, 7)}.pdf`;
  const up = await db.storage.from("client-files").upload(path, bytes, { contentType: "application/pdf", upsert: true });
  if (up.error) throw new HttpError(500, up.error.message);
  const { data: settings } = await db.from("admin_settings").select("summary_send_delay_days").single();
  const delay = settings?.summary_send_delay_days ?? 2;
  const row = {
    client_id: clientId, month: iso(month), pdf_path: path, generated_at: new Date().toISOString(), last_error: "",
    status: existing?.status === "sent" ? "sent" : "draft",
    send_after: existing?.send_after ?? new Date(Date.now() + delay * 86400_000).toISOString(),
  };
  const { data, error } = await db.from("monthly_summaries").upsert(row, { onConflict: "client_id,month" }).select("id").single();
  if (error) throw new HttpError(500, error.message);
  return { summary_id: data.id, visits: d.visits };
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function send(db: Db, summaryId: string) {
  const { data: s } = await db.from("monthly_summaries").select("*, clients(business_name)").eq("id", summaryId).single();
  if (!s) throw new HttpError(404, "Summary not found.");
  if (s.status === "sent") return { skipped: "already sent" };
  // deno-lint-ignore no-explicit-any
  const business = (s as any).clients?.business_name ?? "your business";
  const month = new Date(s.month + "T00:00:00Z");
  const to = await memberEmails(db, s.client_id);
  const fail = async (reason: string) => {
    await db.from("monthly_summaries").update({ last_error: reason }).eq("id", s.id);
    return { sent: false, reason };
  };
  if (!to.length) return await fail("Nobody from this client has portal access yet.");
  const file = await db.storage.from("client-files").download(s.pdf_path);
  if (file.error || !file.data) return await fail("The PDF is missing. Regenerate it.");
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const label = monthName(month);
  const link = `${PORTAL_URL}#/stats`;
  const paragraphs = [
    `Here is your ${esc(label)} summary for <strong>${esc(business)}</strong>: website visitors, social media and ads, and the work WAVE did for you. The full report is attached as a PDF.`,
  ];
  if (s.admin_note) paragraphs.push(`<strong>A note from WAVE:</strong><br>${esc(s.admin_note).replace(/\n/g, "<br>")}`);
  const result = await sendEmail({
    to,
    subject: `Your ${label} summary from WAVE Digital`,
    html: renderEmail({ heading: `Your ${label} summary`, paragraphs, button: { label: "See your stats", url: link } }),
    text: plainText(`Your ${label} summary`, [`Here is your ${label} summary for ${business}. The full report is attached as a PDF.`,
      ...(s.admin_note ? ["", "A note from WAVE:", s.admin_note] : [])], link),
    attachments: [{ filename: `WAVE-summary-${s.month.slice(0, 7)}.pdf`, content: toBase64(bytes) }],
  });
  if (!result.sent) return await fail(result.reason ?? "Email failed.");
  await db.from("monthly_summaries").update({ status: "sent", sent_at: new Date().toISOString(), last_error: "" }).eq("id", s.id);
  return { sent: true };
}

serve(async (req) => {
  const db = serviceClient();
  const isCron = !!req.headers.get("x-wave-secret");
  if (isCron) requireFunctionSecret(req); else await requireAdmin(req, db);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const month = parseMonth(body.month);

  switch (body.action) {
    case "generate_all": {
      const { data: clients } = await db.from("clients").select("id").eq("status", "active");
      const results: Record<string, unknown> = {};
      for (const c of clients ?? []) {
        try { results[c.id] = await generate(db, c.id, month, { keepSent: true }); } catch (e) { results[c.id] = { error: (e as Error).message }; }
      }
      return json(req, { month: iso(month), results });
    }
    case "generate":
      if (isCron) throw new HttpError(403, "Not allowed.");
      return json(req, await generate(db, String(body.client_id ?? ""), month, { keepSent: false }));
    case "send":
      if (isCron) throw new HttpError(403, "Not allowed.");
      return json(req, await send(db, String(body.summary_id ?? "")));
    case "send_due": {
      const { data: due } = await db.from("monthly_summaries").select("id").eq("status", "draft").lte("send_after", new Date().toISOString());
      const results: Record<string, unknown> = {};
      for (const s of due ?? []) {
        try { results[s.id] = await send(db, s.id); } catch (e) { results[s.id] = { error: (e as Error).message }; }
      }
      return json(req, { results });
    }
    default:
      throw new HttpError(400, "Unknown action.");
  }
});
