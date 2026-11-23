// Public sign-up for the portal, plus WAVE's approve / convert / decline actions.
//   register (anyone): creates an unconfirmed account and emails a confirmation link
//   complete (the new user, after confirming): prospects become a lead with their own portal;
//            existing clients wait for WAVE to link them to their business
//   approve / make_lead / decline (admin)
import {
  adminEmails, EMAIL_RE, HttpError, json, PORTAL_URL, requireAdmin, requireUser, serve, serviceClient,
} from "../_shared/common.ts";
import { emailConfigured, esc, plainText, renderEmail, sendEmail } from "../_shared/email.ts";

type Db = ReturnType<typeof serviceClient>;
const SERVICES = ["website", "social", "advertising", "branding", "broken", "other"];
const SERVICE_LABEL: Record<string, string> = {
  website: "Website", social: "Social media", advertising: "Advertising", branding: "Logo / branding", broken: "Fix something", other: "Something else",
};

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Allows `max` attempts per key per hour.
async function throttled(db: Db, kind: string, raw: string, max: number) {
  const key = await sha256(raw);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db.from("auth_throttle").select("*", { count: "exact", head: true }).eq("kind", kind).eq("key", key).gte("created_at", since);
  if ((count ?? 0) >= max) return true;
  await db.from("auth_throttle").insert({ kind, key });
  return false;
}

function confirmLink(hashedToken: string) {
  return `${PORTAL_URL}?flow=signup&type=signup&token_hash=${encodeURIComponent(hashedToken)}`;
}

async function register(req: Request, db: Db, b: Record<string, unknown>) {
  const ok = json(req, { ok: true });
  if (String(b.website ?? "")) return ok; // hidden field: only bots fill it in
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const fullName = String(b.full_name ?? "").trim().slice(0, 120);
  const kind = b.kind === "existing" ? "existing" : "prospect";
  const business = String(b.business_name ?? "").trim().slice(0, 120);
  const service = SERVICES.includes(String(b.service)) ? String(b.service) : "";
  const details = String(b.details ?? "").trim().slice(0, 5000);
  const phone = String(b.phone ?? "").trim().slice(0, 40);
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!fullName) throw new HttpError(400, "Enter your name.");
  if (!business) throw new HttpError(400, "Enter your business name.");
  if (password.length < 10 || !/[a-z]/i.test(password) || !/[0-9]/.test(password)) {
    throw new HttpError(400, "Use a password of at least 10 characters with letters and numbers.");
  }
  if (kind === "prospect" && !details) throw new HttpError(400, "Tell us a little about what you need.");
  if (!emailConfigured()) throw new HttpError(503, "Sign-up isn't available right now. Please email clientsupport@wavedigital.biz.");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (await throttled(db, "signup_ip", ip, 8) || await throttled(db, "signup_email", email, 3)) {
    throw new HttpError(429, "Too many sign-up attempts. Please try again in an hour.");
  }

  // An existing account gets a friendly email instead, and the page says the same thing either way.
  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    await sendEmail({
      to: [email],
      subject: "You already have a WAVE portal account",
      html: renderEmail({ heading: "You already have an account",
        paragraphs: ["Someone (probably you) tried to sign up for the WAVE Digital client portal with this email, but it already has an account. Sign in instead, or use “Forgot password” if you don't remember it."],
        button: { label: "Sign in", url: PORTAL_URL } }),
      text: plainText("You already have an account", ["This email already has a WAVE portal account. Sign in, or use Forgot password."], PORTAL_URL),
    });
    return ok;
  }

  const { data, error } = await db.auth.admin.generateLink({
    type: "signup", email, password,
    options: { data: { full_name: fullName }, redirectTo: `${PORTAL_URL}?flow=signup` },
  });
  if (error || !data?.user) {
    console.error("signup generateLink", error?.message);
    throw new HttpError(400, "We couldn't create that account. Please try again or email clientsupport@wavedigital.biz.");
  }
  const userId = data.user.id;
  await db.from("profiles").update({ full_name: fullName }).eq("id", userId);
  const { error: rowError } = await db.from("signup_requests").insert({
    user_id: userId, kind, business_name: business, phone, service, details,
  });
  if (rowError) {
    await db.auth.admin.deleteUser(userId);
    throw new HttpError(500, "We couldn't save your sign-up. Please try again.");
  }
  const link = confirmLink(data.properties.hashed_token);
  const sent = await sendEmail({
    to: [email],
    subject: "Confirm your email for the WAVE portal",
    html: renderEmail({
      heading: "Confirm your email",
      paragraphs: [`Hi ${esc(fullName.split(" ")[0])}, thanks for signing up to the WAVE Digital client portal.`,
        "Click the button to confirm your email address. The link works once and expires in 24 hours."],
      button: { label: "Confirm my email", url: link },
      footnote: "If you didn't sign up, you can ignore this email and no account will be activated.",
    }),
    text: plainText("Confirm your email", ["Thanks for signing up to the WAVE Digital client portal.", "Confirm your email with this link (works once, expires in 24 hours):"], link),
  });
  if (!sent.sent) {
    await db.auth.admin.deleteUser(userId);
    throw new HttpError(503, "We couldn't send the confirmation email. Please try again later or email clientsupport@wavedigital.biz.");
  }
  return ok;
}

async function complete(req: Request, db: Db) {
  const caller = await requireUser(req, db);
  const { data: u } = await db.auth.admin.getUserById(caller.id);
  if (!u?.user?.email_confirmed_at) throw new HttpError(403, "Confirm your email first.");
  const { data: s } = await db.from("signup_requests").select("*").eq("user_id", caller.id).maybeSingle();
  if (!s) return { status: "none" };
  if (s.status !== "unconfirmed") return { status: s.status, client_id: s.client_id };
  const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", caller.id).single();
  const who = profile?.full_name || profile?.email || "Someone";
  const link = `${PORTAL_URL}#/admin/signups`;

  if (s.kind === "existing") {
    await db.from("signup_requests").update({ status: "pending" }).eq("id", s.id);
    await sendEmail({
      to: await adminEmails(db),
      subject: `${s.business_name} signed up as a current client`,
      html: renderEmail({ heading: "A client signed up",
        paragraphs: [`<strong>${esc(who)}</strong> (${esc(profile?.email ?? "")}) says they're a current client: <strong>${esc(s.business_name)}</strong>.`,
          "Approve them to link their account to the right business, or decline if you don't know them."],
        button: { label: "Review sign-ups", url: link } }),
      text: plainText("A client signed up", [`${who} (${profile?.email}) says they're a current client: ${s.business_name}.`], link),
    });
    return { status: "pending" };
  }

  const clientId = await createLead(db, s, profile, caller.id);
  await sendEmail({
    to: await adminEmails(db),
    subject: `New lead: ${s.business_name}`,
    html: renderEmail({ heading: `New lead: ${s.business_name}`,
      paragraphs: [`<strong>${esc(who)}</strong> (${esc(profile?.email ?? "")}${s.phone ? ", " + esc(s.phone) : ""}) signed up and wants help with <strong>${esc(SERVICE_LABEL[s.service] ?? "a project")}</strong>.`,
        esc(s.details).replace(/\n/g, "<br>")],
      button: { label: "Open the lead", url: `${PORTAL_URL}#/admin/clients/${clientId}` } }),
    text: plainText(`New lead: ${s.business_name}`, [`${who} (${profile?.email}) wants help with ${SERVICE_LABEL[s.service] ?? "a project"}.`, "", s.details], `${PORTAL_URL}#/admin/clients/${clientId}`),
  });
  return { status: "converted", client_id: clientId };
}

// deno-lint-ignore no-explicit-any
async function createLead(db: Db, s: any, profile: any, userId: string) {
  const { data: c, error } = await db.from("clients").insert({
    business_name: s.business_name, contact_name: profile?.full_name ?? "", contact_email: profile?.email ?? "",
    contact_phone: s.phone ?? "", status: "lead", plan: "", monthly_amount: 0, billing_cycle: "none",
  }).select("id").single();
  if (error || !c) throw new HttpError(500, "We couldn't set up your portal. Please contact WAVE.");
  await db.from("client_members").insert({ client_id: c.id, user_id: userId, role: "owner" });
  if (s.details) {
    await db.from("requests").insert({
      client_id: c.id, created_by: userId, type: SERVICES.includes(s.service) ? s.service : "other",
      title: `New project: ${SERVICE_LABEL[s.service] ?? "inquiry"}`.slice(0, 140), details: s.details,
    });
  }
  await db.from("signup_requests").update({ status: "converted", client_id: c.id, decided_at: new Date().toISOString() }).eq("id", s.id);
  return c.id;
}

async function loadSignup(db: Db, id: string) {
  const { data: s } = await db.from("signup_requests").select("*, profiles(full_name, email)").eq("id", id).single();
  if (!s) throw new HttpError(404, "That sign-up no longer exists.");
  return s;
}

async function approve(db: Db, b: Record<string, unknown>) {
  const s = await loadSignup(db, String(b.signup_id ?? ""));
  const clientId = String(b.client_id ?? "");
  const { data: c } = await db.from("clients").select("id, business_name").eq("id", clientId).single();
  if (!c) throw new HttpError(400, "Choose the client this person belongs to.");
  await db.from("client_members").upsert({ client_id: clientId, user_id: s.user_id, role: b.member_role === "owner" ? "owner" : "member" });
  await db.from("signup_requests").update({ status: "approved", client_id: clientId, decided_at: new Date().toISOString() }).eq("id", s.id);
  // deno-lint-ignore no-explicit-any
  const email = (s as any).profiles?.email;
  const sent = email ? await sendEmail({
    to: [email], subject: `You're in: ${c.business_name} on the WAVE portal`,
    html: renderEmail({ heading: "Your portal is ready", paragraphs: [`WAVE approved your account. You can now see <strong>${esc(c.business_name)}</strong> in the client portal: stats, requests, meetings, billing and files.`],
      button: { label: "Open the portal", url: PORTAL_URL } }),
    text: plainText("Your portal is ready", [`WAVE approved your account. You can now see ${c.business_name} in the client portal.`], PORTAL_URL),
  }) : { sent: false };
  return { approved: true, emailed: sent.sent };
}

async function makeLead(db: Db, b: Record<string, unknown>) {
  const s = await loadSignup(db, String(b.signup_id ?? ""));
  // deno-lint-ignore no-explicit-any
  const clientId = await createLead(db, s, (s as any).profiles, s.user_id);
  return { client_id: clientId };
}

async function decline(db: Db, b: Record<string, unknown>) {
  const s = await loadSignup(db, String(b.signup_id ?? ""));
  const { count } = await db.from("client_members").select("*", { count: "exact", head: true }).eq("user_id", s.user_id);
  const { data: p } = await db.from("profiles").select("role").eq("id", s.user_id).single();
  if ((count ?? 0) === 0 && p?.role !== "admin") {
    await db.auth.admin.deleteUser(s.user_id); // also removes the sign-up row
  } else {
    await db.from("signup_requests").update({ status: "declined", decided_at: new Date().toISOString() }).eq("id", s.id);
  }
  return { declined: true };
}

serve(async (req) => {
  const db = serviceClient();
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  switch (body.action) {
    case "register": return await register(req, db, body);
    case "complete": return json(req, await complete(req, db));
    case "approve": await requireAdmin(req, db); return json(req, await approve(db, body));
    case "make_lead": await requireAdmin(req, db); return json(req, await makeLead(db, body));
    case "decline": await requireAdmin(req, db); return json(req, await decline(db, body));
    default: throw new HttpError(400, "Unknown action.");
  }
});
