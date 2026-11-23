// "Forgot password" for the portal. Always answers the same way, so it never reveals
// whether an email has an account, and limits how often one address can be sent a link.
import { EMAIL_RE, json, PORTAL_URL, portalAuthLink, serve, serviceClient } from "../_shared/common.ts";
import { emailConfigured, plainText, renderEmail, sendEmail } from "../_shared/email.ts";

const MAX_PER_HOUR = 3;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const email = String(body.email ?? "").trim().toLowerCase();
  const reply = json(req, { ok: true });
  if (!EMAIL_RE.test(email)) return reply;

  const db = serviceClient();
  const key = await sha256(email);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("auth_throttle").select("*", { count: "exact", head: true })
    .eq("key", key).eq("kind", "password_reset").gte("created_at", since);
  if ((count ?? 0) >= MAX_PER_HOUR) return reply;
  await db.from("auth_throttle").insert({ key, kind: "password_reset" });

  const { data: profile } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) return reply;

  const redirectTo = `${PORTAL_URL}?flow=recovery`;
  if (!emailConfigured()) {
    // Before Resend is set up, fall back to Supabase's built-in mailer (only reaches the project's own team).
    await db.auth.resetPasswordForEmail(email, { redirectTo });
    return reply;
  }
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo } });
  if (error || !data) {
    console.error("recovery link failed", error?.message);
    return reply;
  }
  const link = portalAuthLink("recovery", data.properties.hashed_token);
  await sendEmail({
    to: [email],
    subject: "Reset your WAVE portal password",
    html: renderEmail({
      heading: "Reset your password",
      paragraphs: ["Use the button below to choose a new password for the WAVE Digital client portal. The link works once and expires in 24 hours."],
      button: { label: "Choose a new password", url: link },
      footnote: "If you didn't ask for this, you can ignore this email; your password stays the same.",
    }),
    text: plainText("Reset your WAVE portal password", ["Choose a new password with this link (works once, expires in 24 hours):"], link),
  });
  return reply;
});
