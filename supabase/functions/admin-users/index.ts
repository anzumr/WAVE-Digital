// Admin-only account actions: invite people to a client's portal, resend invites,
// create password-reset links, list and remove portal access.
import {
  EMAIL_RE, HttpError, json, PORTAL_URL, portalAuthLink, requireAdmin, serve, serviceClient,
} from "../_shared/common.ts";
import { esc, plainText, renderEmail, sendEmail } from "../_shared/email.ts";

type Db = ReturnType<typeof serviceClient>;

const WELCOME_URL = `${PORTAL_URL}?flow=welcome`;
const RECOVERY_URL = `${PORTAL_URL}?flow=recovery`;

async function businessName(db: Db, clientId: string): Promise<string> {
  const { data } = await db.from("clients").select("business_name").eq("id", clientId).single();
  if (!data) throw new HttpError(404, "That client no longer exists.");
  return data.business_name;
}

function inviteEmail(name: string, business: string, link: string) {
  const greeting = name ? `Hi ${esc(name)},` : "Hi,";
  const paragraphs = [
    greeting,
    `You've been invited to the WAVE Digital client portal for <strong>${esc(business)}</strong>. ` +
      "In the portal you can see your website stats, send change requests, book meetings and manage billing.",
    "Click the button below to set your password. The link works once and expires in 24 hours.",
  ];
  return {
    subject: `Your WAVE Digital portal for ${business}`,
    html: renderEmail({ heading: "Welcome to your WAVE portal", paragraphs, button: { label: "Set your password", url: link },
      footnote: "If you weren't expecting this, you can ignore this email." }),
    text: plainText("Welcome to your WAVE portal",
      [name ? `Hi ${name},` : "Hi,", `You've been invited to the WAVE Digital client portal for ${business}.`,
        "Set your password with this link (works once, expires in 24 hours):"], link),
  };
}

function accessEmail(business: string) {
  return {
    subject: `You now have access to ${business} in the WAVE portal`,
    html: renderEmail({ heading: "New access in your WAVE portal",
      paragraphs: [`You can now see <strong>${esc(business)}</strong> in the WAVE Digital client portal. Sign in with your usual email and password.`],
      button: { label: "Open the portal", url: PORTAL_URL } }),
    text: plainText("New access in your WAVE portal", [`You can now see ${business} in the WAVE Digital client portal.`], PORTAL_URL),
  };
}

function resetEmail(link: string) {
  return {
    subject: "Reset your WAVE portal password",
    html: renderEmail({ heading: "Reset your password",
      paragraphs: ["Use the button below to choose a new password for the WAVE Digital client portal. The link works once and expires in 1 hour."],
      button: { label: "Choose a new password", url: link },
      footnote: "If you didn't ask for this, you can ignore this email; your password stays the same." }),
    text: plainText("Reset your WAVE portal password", ["Choose a new password with this link (works once, expires in 1 hour):"], link),
  };
}

async function invite(db: Db, body: Record<string, unknown>) {
  const clientId = String(body.client_id ?? "");
  const email = String(body.email ?? "").trim().toLowerCase();
  const fullName = String(body.full_name ?? "").trim().slice(0, 120);
  const memberRole = body.member_role === "owner" ? "owner" : "member";
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const business = await businessName(db, clientId);

  const { data: existing } = await db.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (existing) {
    const { data: authUser } = await db.auth.admin.getUserById(existing.id);
    await db.from("client_members").upsert({ client_id: clientId, user_id: existing.id, role: memberRole });
    if (authUser?.user?.email_confirmed_at) {
      const mail = accessEmail(business);
      const sent = await sendEmail({ to: [email], ...mail });
      return { user_id: existing.id, existing: true, action_link: null, emailed: sent.sent, email_note: sent.reason ?? null };
    }
  }

  const { data, error } = await db.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { full_name: fullName }, redirectTo: WELCOME_URL },
  });
  if (error || !data?.user) throw new HttpError(400, error?.message ?? "Could not create the invite.");
  const userId = data.user.id;
  if (fullName) await db.from("profiles").update({ full_name: fullName }).eq("id", userId);
  const { error: memberError } = await db.from("client_members").upsert({ client_id: clientId, user_id: userId, role: memberRole });
  if (memberError) throw new HttpError(400, memberError.message);

  const link = portalAuthLink("invite", data.properties.hashed_token);
  const sent = await sendEmail({ to: [email], ...inviteEmail(fullName, business, link) });
  return { user_id: userId, existing: !!existing, action_link: link, emailed: sent.sent, email_note: sent.reason ?? null };
}

async function linkFor(db: Db, userId: string, kind: "invite" | "recovery") {
  const { data: u, error } = await db.auth.admin.getUserById(userId);
  if (error || !u?.user?.email) throw new HttpError(404, "That person no longer has an account.");
  const confirmed = !!u.user.email_confirmed_at;
  const type = kind === "invite" && !confirmed ? "invite" : "recovery";
  const { data, error: linkError } = await db.auth.admin.generateLink({
    type,
    email: u.user.email,
    options: { redirectTo: type === "invite" ? WELCOME_URL : RECOVERY_URL },
  } as Parameters<typeof db.auth.admin.generateLink>[0]);
  if (linkError || !data) throw new HttpError(400, linkError?.message ?? "Could not create the link.");
  return { email: u.user.email, type, link: portalAuthLink(type, data.properties.hashed_token) };
}

async function resendInvite(db: Db, body: Record<string, unknown>) {
  const userId = String(body.user_id ?? "");
  const clientId = String(body.client_id ?? "");
  const business = clientId ? await businessName(db, clientId) : "your business";
  const { data: profile } = await db.from("profiles").select("full_name").eq("id", userId).single();
  const r = await linkFor(db, userId, "invite");
  const mail = r.type === "invite" ? inviteEmail(profile?.full_name ?? "", business, r.link) : resetEmail(r.link);
  const sent = await sendEmail({ to: [r.email], ...mail });
  return { action_link: r.link, link_type: r.type, emailed: sent.sent, email_note: sent.reason ?? null };
}

async function resetLink(db: Db, body: Record<string, unknown>) {
  const r = await linkFor(db, String(body.user_id ?? ""), "recovery");
  const sent = body.send_email === false ? { sent: false, reason: "Not emailed." } : await sendEmail({ to: [r.email], ...resetEmail(r.link) });
  return { action_link: r.link, link_type: r.type, emailed: sent.sent, email_note: sent.reason ?? null };
}

async function listMembers(db: Db, body: Record<string, unknown>) {
  const clientId = String(body.client_id ?? "");
  const { data, error } = await db.from("client_members")
    .select("user_id, role, created_at, profiles(email, full_name)")
    .eq("client_id", clientId).order("created_at");
  if (error) throw new HttpError(400, error.message);
  const members = [];
  // deno-lint-ignore no-explicit-any
  for (const m of (data ?? []) as any[]) {
    const { data: u } = await db.auth.admin.getUserById(m.user_id);
    members.push({
      user_id: m.user_id, role: m.role, added_at: m.created_at,
      email: m.profiles?.email ?? "", full_name: m.profiles?.full_name ?? "",
      confirmed: !!u?.user?.email_confirmed_at, last_sign_in_at: u?.user?.last_sign_in_at ?? null,
      invited_at: u?.user?.invited_at ?? null,
    });
  }
  return { members };
}

async function removeMember(db: Db, body: Record<string, unknown>, callerId: string) {
  const clientId = String(body.client_id ?? "");
  const userId = String(body.user_id ?? "");
  if (userId === callerId) throw new HttpError(400, "You can't remove your own admin account here.");
  const { error } = await db.from("client_members").delete().eq("client_id", clientId).eq("user_id", userId);
  if (error) throw new HttpError(400, error.message);
  let accountDeleted = false;
  if (body.delete_account === true) {
    const { count } = await db.from("client_members").select("*", { count: "exact", head: true }).eq("user_id", userId);
    const { data: profile } = await db.from("profiles").select("role").eq("id", userId).single();
    if ((count ?? 0) === 0 && profile?.role !== "admin") {
      const { error: delError } = await db.auth.admin.deleteUser(userId);
      accountDeleted = !delError;
    }
  }
  return { removed: true, account_deleted: accountDeleted };
}

serve(async (req) => {
  const db = serviceClient();
  const caller = await requireAdmin(req, db);
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  switch (body.action) {
    case "invite": return json(req, await invite(db, body));
    case "resend_invite": return json(req, await resendInvite(db, body));
    case "reset_link": return json(req, await resetLink(db, body));
    case "list_members": return json(req, await listMembers(db, body));
    case "remove_member": return json(req, await removeMember(db, body, caller.id));
    default: throw new HttpError(400, "Unknown action.");
  }
});
