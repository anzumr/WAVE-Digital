// Branded emails sent through Resend. Without RESEND_API_KEY nothing is sent and callers are told why.

export interface Attachment {
  filename: string;
  content: string; // base64
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export function emailConfigured(): boolean {
  return !!Deno.env.get("RESEND_API_KEY");
}

export async function sendEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  attachments?: Attachment[];
}): Promise<SendResult> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { sent: false, reason: "Email sending is not set up yet (no Resend key)." };
  const to = [...new Set(opts.to.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (!to.length) return { sent: false, reason: "No recipient." };
  const from = Deno.env.get("EMAIL_FROM") ?? "WAVE Digital <clientsupport@wavedigital.biz>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
      reply_to: Deno.env.get("REPLY_TO") || undefined,
      attachments: opts.attachments,
    }),
  });
  if (!res.ok) {
    console.error("resend error", res.status, await res.text());
    return { sent: false, reason: `The email service refused the message (${res.status}).` };
  }
  return { sent: true };
}

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// A simple, table-based layout that renders in every mail client.
export function renderEmail(o: {
  heading: string;
  paragraphs: string[]; // already-escaped HTML
  button?: { label: string; url: string };
  footnote?: string;
}): string {
  const paras = o.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#1d3446">${p}</p>`)
    .join("");
  const button = o.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:22px 0 8px"><tr><td style="border-radius:8px;background:#70e5f2">
         <a href="${esc(o.button.url)}" style="display:inline-block;padding:13px 24px;font-size:15px;font-weight:700;color:#062335;text-decoration:none">${esc(o.button.label)}</a>
       </td></tr></table>`
    : "";
  const foot = o.footnote
    ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5b6f80">${o.footnote}</p>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef3f6">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f6;padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<tr><td style="background:#030d19;padding:20px 28px;font-size:16px;font-weight:800;letter-spacing:.06em;color:#f1fbff">WAVE DIGITAL</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#030d19">${esc(o.heading)}</h1>
${paras}${button}${foot}
</td></tr>
<tr><td style="padding:16px 28px;background:#f6f9fb;font-size:12px;line-height:1.5;color:#5b6f80">WAVE Digital · Web, Ads, Visibility, Engagement · <a href="https://wavedigital.biz" style="color:#0b6fa8">wavedigital.biz</a></td></tr>
</table></td></tr></table></body></html>`;
}

export function plainText(heading: string, lines: string[], link?: string): string {
  return [heading, "", ...lines, ...(link ? ["", link] : []), "", "WAVE Digital · wavedigital.biz"].join("\n");
}
