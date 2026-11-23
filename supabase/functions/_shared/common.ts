// Shared helpers for the WAVE portal edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.0";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const PORTAL_URL = (Deno.env.get("PORTAL_URL") ?? "https://wavedigital.biz/me/").replace(/\/?$/, "/");

const ALLOWED_ORIGINS = ["https://wavedigital.biz", "https://www.wavedigital.biz", "http://localhost:8787"];

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

// Wraps a handler with CORS preflight handling and uniform error responses.
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Use POST" }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.message }, e.status);
      console.error(e);
      return json(req, { error: "Something went wrong. Please try again." }, 500);
    }
  });
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return {};
  }
}

export interface Caller {
  id: string;
  email: string;
  role: "admin" | "client";
  aal: string;
}

// Verifies the caller's session with Supabase Auth and loads their role.
export async function requireUser(req: Request, db: SupabaseClient): Promise<Caller> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Please sign in again.");
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Please sign in again.");
  const { data: profile } = await db.from("profiles").select("role, email").eq("id", data.user.id).single();
  return {
    id: data.user.id,
    email: profile?.email ?? data.user.email ?? "",
    role: profile?.role === "admin" ? "admin" : "client",
    aal: String(jwtPayload(token).aal ?? "aal1"),
  };
}

export async function requireAdmin(req: Request, db: SupabaseClient): Promise<Caller> {
  const caller = await requireUser(req, db);
  if (caller.role !== "admin") throw new HttpError(403, "Only WAVE can do that.");
  if (caller.aal !== "aal2") throw new HttpError(403, "Confirm your two-step code first.");
  return caller;
}

// For calls made by the database (triggers and scheduled jobs).
export function requireFunctionSecret(req: Request) {
  const expected = Deno.env.get("WAVE_FUNCTION_SECRET") ?? "";
  const got = req.headers.get("x-wave-secret") ?? "";
  if (!expected || got.length !== expected.length) throw new HttpError(401, "Not allowed.");
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new HttpError(401, "Not allowed.");
}

// Links in our emails open the portal itself, which exchanges the token only when the page runs.
// (Supabase's own verify links are used up the moment anything opens them, including email
// security scanners that pre-open links, which leaves the real person with an "expired" link.)
export function portalAuthLink(type: "invite" | "recovery", hashedToken: string): string {
  const flow = type === "invite" ? "welcome" : "recovery";
  return `${PORTAL_URL}?flow=${flow}&type=${type}&token_hash=${encodeURIComponent(hashedToken)}`;
}

export const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

export async function adminEmails(db: SupabaseClient): Promise<string[]> {
  const { data: settings } = await db.from("admin_settings").select("admin_notify_email").single();
  const configured = (settings?.admin_notify_email ?? "").trim();
  if (configured) return [configured];
  const { data } = await db.from("profiles").select("email").eq("role", "admin");
  return (data ?? []).map((r) => r.email).filter(Boolean);
}

export async function memberEmails(db: SupabaseClient, clientId: string): Promise<string[]> {
  const { data } = await db.from("client_members").select("profiles(email)").eq("client_id", clientId);
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((r: any) => r.profiles?.email).filter(Boolean);
}
