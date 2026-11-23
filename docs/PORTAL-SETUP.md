# WAVE Portal: setup guide

The portal is built and tested. These steps connect it to accounts only you can create. Do them in
order; each one says what it switches on. Nothing here needs code.

Where secrets go: **Supabase dashboard → your `wave-portal` project → Edge Functions → Secrets**
(older dashboards: Project Settings → Edge Functions). Add each as *name* and *value*. Never paste keys
into a chat, an email or the website.

---

## 1. Your admin login (required)

1. Supabase dashboard → **Authentication → Users → Add user → Create new user**. Enter your email and a
   strong password, tick **Auto Confirm User**, create.
2. Supabase dashboard → **SQL Editor → New query**, paste this with your email, and click **Run**:
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR-EMAIL-HERE';
   ```
3. Open **wavedigital.biz/me** and sign in. The first time, it asks you to scan a QR code with an
   authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…). After that, every admin
   sign-in asks for the 6-digit code.

Lost your phone? Supabase → Authentication → Users → your user → remove the authenticator factor, then
sign in again to set it up anew.

## 2. Emails (strongly recommended)

Switches on: invite emails, "forgot password", request updates, new-file alerts, monthly summaries.
Until this is done, invites show a link for you to copy and send yourself.

1. Sign up at **resend.com** (free: 3,000 emails a month).
2. **Domains → Add domain → `wavedigital.biz`**. Resend shows a few DNS records.
3. At **GoDaddy → My Products → wavedigital.biz → DNS**, add each record exactly as Resend shows it
   (don't change the existing records for your website). Back in Resend, click **Verify** (can take up to
   an hour).
4. Resend → **API Keys → Create API key** (permission: Sending access). Copy it.
5. Supabase secrets: add `RESEND_API_KEY` = the key.
6. Supabase secrets: add `REPLY_TO` = the inbox where you want client replies to land (for example your
   own email). Emails come *from* clientsupport@wavedigital.biz; replies go to this address.

## 3. Website stats (recommended)

Switches on: the nightly website numbers on each client's Stats page and in their summary.

1. Create a free **Cloudflare** account. Host each client site on **Cloudflare Pages** (or keep it where
   it is and add Cloudflare's analytics snippet), then turn on **Web Analytics** for it.
2. For each site, open it in **Web Analytics**. Its **site tag** (32 letters and numbers) is in the page
   address after `siteTag~in=`, and under *Manage site*. In the portal: **Clients → the client → Stats →
   Site tag → Save → Sync now**.
3. Cloudflare → **My Profile → API Tokens → Create Token → Create Custom Token**: permission
   **Account → Account Analytics → Read**, for your account. Copy it.
4. Your **Account ID** is on the right side of the account home page in Cloudflare.
5. Supabase secrets: add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## 4. Billing link (when Stripe is ready)

1. Stripe → **Settings → Billing → Customer portal** → turn it on → copy the **login link**
   (starts with `https://billing.stripe.com/p/login/`).
2. Portal → **Settings → Stripe customer portal link** → paste → Save. Clients' **Manage billing** button
   then works.
3. Optional: on each client's Summary tab, add their Stripe customer ID (`cus_…`) to jump to them in Stripe.

## 5. Meeting times from Calendly (optional)

Bookings made in the portal are always recorded. With a token, the portal also knows the time and the
meeting link, and **Sync from Calendly** works.

1. Calendly → **Integrations & apps → API and webhooks → Personal access tokens → Generate**.
2. Supabase secrets: add `CALENDLY_TOKEN`.
3. In Calendly, set your event's location to **Google Meet** (the site says calls are held there).

## 6. Automatic social, ads and review numbers (optional, takes weeks)

Until these are set up, type the numbers in **Monthly stats** once a month (about 2 minutes per client).
Once connected (**Clients → the client → Connections**), they fill in by themselves on the 1st.

Note: Meta's and Google's developer documentation couldn't be checked while building this, so the first
sync is the real test. If a connection shows a problem, the message on the Connections tab says what the
service answered.

**Instagram and Facebook (Meta)**
1. Create a **Meta Business Manager** for WAVE (business.facebook.com). Ask each client to add WAVE as a
   **partner** on their Facebook Page and Instagram account.
2. At developers.facebook.com, create an app of type **Business**, linked to your Business Manager.
3. Business settings → **Users → System users** → add one, assign it the clients' Pages and Instagram
   accounts and the app, then **Generate token** with the permissions `pages_show_list`,
   `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` and
   `business_management`, set to never expire.
4. Supabase secrets: add `META_ACCESS_TOKEN`. (Optional: `META_API_VERSION`, default `v23.0`, if Meta has
   retired it by then.)

**Google reviews (Business Profile) and Google Ads**
1. In Google Cloud, create a project and enable the **Business Profile** APIs and the **Google Ads API**.
2. Business Profile: request API access with Google's access form (approval takes days to weeks).
3. Google Ads: create a **manager account**, link your clients' Ads accounts to it, and apply for a
   **developer token** (Basic access).
4. Create an **OAuth client**, then get a **refresh token** for your Google account with the scopes
   `https://www.googleapis.com/auth/business.manage` and `https://www.googleapis.com/auth/adwords`.
5. Supabase secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
   `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (your manager account ID).
   Optional: `GOOGLE_ADS_API_VERSION` (default `v21`).

## Sign-ups

Anyone can create an account at wavedigital.biz/me → **Create an account** (email confirmation required):
- **"I'm a current WAVE client"**: waits on **Sign-ups** until you approve and link them to their business
  (the matching client is pre-selected), or decline (their account is deleted). You get an email each time.
- **"I'd like to work with WAVE"**: becomes a **lead** straight away with their own portal (requests,
  meetings, files; no stats or billing). Their project details are their first request, and you get a
  "New lead" email. Change their status to Active on the client page when they sign on.

## 7. Before clients depend on it

- Upgrade Supabase to **Pro ($25/month)**: the free plan pauses after 7 days without activity.
- Delete the Supabase access token you made for setup when you no longer want Claude to change the
  project (supabase.com/dashboard/account/tokens).

---

## How things run on their own

| When | What |
|---|---|
| Every night | Website stats sync from Cloudflare |
| 1st of the month, early | Social, ads and review numbers sync from connected accounts |
| 1st of the month | A PDF summary draft is made for every active client |
| Every day | Summaries past their send date are emailed (set the delay in Settings) |
| On every event | Emails for new requests, updates, files and bookings |

## Where things live

- Portal pages: `me/` (served at wavedigital.biz/me)
- Database changes: `supabase/migrations/` (applied in number order)
- Server functions: `supabase/functions/`
- Tests: `supabase/tests/rls_test.sql` (security rules, runs in a rolled-back transaction) and
  `supabase/tests/providers_test.ts`
