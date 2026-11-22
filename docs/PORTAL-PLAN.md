# WAVE Portal: design plan

Status: draft for review, nothing built yet
Address: `wavedigital.biz/me`

## 1. What it is

A private, WAVE-branded area of the website with two kinds of login:

- **You (admin):** see every client, their requests, stats, files and billing, plus an overview of the whole business.
- **Your clients:** see only their own business: stats, requests, meetings, billing and files.

The public marketing site stays exactly as it is. The portal is a separate set of pages under `/me` in the same style.

## 2. How it fits together

| Piece | What it does | Service | Cost to start |
|---|---|---|---|
| Portal pages | The screens you and clients see | Your existing site on GitHub Pages, at `/me` | Free |
| Logins | Email and password, invite-only, password reset | Supabase Auth | Free |
| Database | Clients, requests, stats, meetings | Supabase (Postgres) | Free |
| File storage | Request screenshots, brand assets, deliverables | Supabase Storage (1 GB free) | Free |
| Background jobs | Nightly stats collection, sending emails | Supabase Edge Functions plus a scheduled job | Free |
| Client websites | Hosting every client site you build | Cloudflare Pages | Free |
| Website stats | Visitors, pages, devices, countries | Cloudflare Web Analytics | Free |
| Emails | Invites, "new request", "request done" | Resend (3,000 emails a month free) | Free |
| Billing | Plan, invoices, update card, cancel | Stripe customer portal | Stripe's usual card fees only |
| Meetings | Booking calls | Your existing Calendly | Free |

**Total to start: $0 a month.** Once paying clients rely on the portal, upgrade Supabase to Pro ($25 a month), because the free plan pauses a project after 7 days with no activity. Everything else stays free at 10+ clients.

Why the pages can live on GitHub Pages safely: the pages contain no secrets. Every piece of data comes from Supabase, and Supabase's database rules (section 6) decide what each logged-in person is allowed to see. The browser cannot get around them.

## 3. Who logs in

- **Admin:** you. Protected with two-step verification (an authenticator app code).
- **Client users:** invited by you only. There is no public sign-up page. One client business can have more than one login (for example an owner and a manager), all seeing the same business.

## 4. Screens

### Your admin side

1. **Overview**
   - Monthly recurring revenue, active clients, open requests, requests waiting on you, overdue payments
   - The latest activity across all clients
2. **Clients**
   - A table: business, plan, monthly amount, status (active, paused, cancelled), open requests, last activity
   - An "Add client" button, which also sends the invite email
3. **Client page**, with tabs:
   - **Summary:** contact details, plan, start date, their website and domain, private notes only you see
   - **Requests:** this client's requests
   - **Stats:** the same charts the client sees, plus the monthly entry form
   - **Meetings:** past and upcoming calls
   - **Files:** shared folder
   - **Billing:** Stripe customer and plan; link to their Stripe page
   - **People:** who from that business can log in; invite or remove someone
4. **Requests inbox**
   - Every request from every client, filtered by status, client and type
   - Open one to change its status and add an update the client will see
5. **Monthly stats entry**
   - One quick form per client per month for social, ads and reviews numbers, until those are automatic
6. **Settings**
   - Your profile, two-step verification, email templates

### Client side

1. **Home**
   - A greeting, their plan, this month's key numbers, open requests, the next meeting
   - Buttons: "New request", "Book a meeting"
2. **Stats**
   - Website: visitors, page views, top pages, devices, where visitors come from (last 30 days, with a month-to-month comparison)
   - Social: followers, reach, engagement per platform
   - Ads: spend, impressions, clicks, leads, cost per lead
   - Reviews: Google rating and number of reviews
   - A monthly summary they can download as a PDF
3. **Requests**
   - Their requests and each one's status
   - The "New request" form (section 5)
4. **Meetings**
   - "Book a meeting" opens your Calendly with their name and email filled in
   - A list of their past and upcoming meetings
5. **Billing**
   - Their plan and price, and a "Manage billing" button that opens Stripe (invoices, card, cancel)
6. **Files**
   - Download deliverables (logo files, brand assets)
   - Upload things you ask for (photos, menus)
7. **Account**
   - Name, password, email preferences

## 5. The request form

| Field | Type | Notes |
|---|---|---|
| Type | Choice | Website change, Social media, Advertising, Logo / branding, Something's broken, Other |
| Title | Short text | Required |
| Details | Long text | Required |
| Page or link | URL | Optional; which page or post this is about |
| Priority | Normal / Urgent | Urgent highlights it in your inbox and emails you right away |
| Wanted by | Date | Optional |
| Attachments | Up to 5 files, 10 MB each | Screenshots, photos, documents |

**What happens after:**
- **Statuses:** New → In progress → Waiting on client → Done (or Declined, with a reason).
- **Updates:** you can add an update with each status change, and the client sees it on the request.
- **Emails:** you get an email for every new request. The client gets one when the status changes or you add an update.

This is not a chat: clients can't send messages outside a request. A client can add more details to their own open request.

## 6. Keeping clients' data separate

- **Row-level security:** every table that holds client data has a `client_id`, and database rules allow a logged-in client user to read or write only the rows of the business they belong to. Admin rules allow you everything. These rules run inside the database, so they hold even if someone edits the page in their browser.
- **Invite-only accounts:** public sign-ups are switched off.
- **Files:** stored in folders named by client, with the same rule: a client can open only their own folder.
- **Secret keys stay off the website:** the Cloudflare, Resend and Stripe keys live only in Supabase's server-side secrets, used by the background jobs. They never appear in a page.
- **Two-step verification:** required for your admin login.
- **Activity log:** a record of important actions (who changed what, and when).

## 7. What's stored

| Table | Holds |
|---|---|
| `profiles` | Each login: name, email, role (admin or client) |
| `clients` | Each business: name, contact, plan, monthly amount, status, website, Cloudflare site ID, Stripe customer ID, private notes |
| `client_members` | Which logins belong to which business |
| `requests` | Type, title, details, link, priority, wanted-by date, status, created and updated dates |
| `request_updates` | Status changes and your updates on each request |
| `files` | File name, folder, who uploaded it and when (the file itself is in storage) |
| `meetings` | Date, time, topic and notes per client |
| `site_stats_daily` | Website numbers per client per day, collected automatically |
| `monthly_stats` | Social, ads and reviews numbers per client per month (entered by you for now) |
| `activity_log` | Who did what, and when |

## 8. Where the stats come from

| Stats | First version | Later |
|---|---|---|
| Website | Automatic every night from Cloudflare Web Analytics, for sites hosted on your Cloudflare | Already automatic |
| Social | You enter them once a month (2 minutes per client) | Automatic through the Meta (Instagram, Facebook) connection, after Meta approves the app (weeks) |
| Ads | Same monthly form | Automatic through Google Ads and Meta Ads, after their approval |
| Google reviews | Same monthly form | Automatic through Google Business Profile, after Google approves access |

Clients see the same charts whichever way the numbers arrive.

**Meetings:** the first version opens Calendly, and you log the meeting on the client's page (or the client marks it). Adding bookings automatically needs Calendly's webhooks, which are only on paid Calendly plans, so that comes later if you upgrade.

## 9. Moving client sites to Cloudflare

For each client site:
1. Put the site's files in a WAVE GitHub repository (I can do this).
2. Connect that repository to Cloudflare Pages (free); every update then goes live automatically.
3. Turn on Cloudflare Web Analytics for it.
4. Point the client's domain at it. You change DNS records at GoDaddy, or move the domain's DNS to Cloudflare, which is also free and makes later changes easier.
5. Note the site's Cloudflare ID on the client's portal page, so their stats start appearing the next night.

We need to know where each current client site lives now before moving it.

## 10. Build order

| Phase | What you get | Usable on its own |
|---|---|---|
| 1. Foundations | Supabase set up, database and security rules, login page, admin "Clients" list and "Add client" with invite email, empty client home | Yes: you can invite clients |
| 2. Requests | The request form, client request list, your inbox, statuses and updates, email notices | Yes: the most useful part for clients |
| 3. Meetings and billing | "Book a meeting" (Calendly), meeting list, Stripe "Manage billing" | Yes |
| 4. Stats | Nightly Cloudflare website stats, monthly entry form, client charts, PDF summary | Yes |
| 5. Files and overview | Shared files per client, your business overview, activity log | Yes |
| 6. Automatic social, ads and reviews | Meta, Google Ads and Google Business Profile connections | After approvals |

After phase 2 you have something to show clients.

## 11. What you'll need to do

These need your own accounts; I'll walk you through each step:

1. **Supabase:** create a free account and a project named "wave-portal". Give me access through the secure credential form (never paste keys in chat).
2. **Cloudflare:** create a free account. Later, an API token so the nightly job can read website stats.
3. **Resend:** create a free account. Add a few DNS records at GoDaddy so emails come from `@wavedigital.biz`.
4. **Stripe:** when you set up Stripe, turn on the customer portal.
5. **Client sites:** tell me where each current client site is hosted now.

## 12. Decisions

1. **Request history:** clients see all their past requests.
2. **Email address:** portal emails come from `clientsupport@wavedigital.biz`. Resend sends from it. Replies are forwarded to your own inbox for free with Cloudflare Email Routing (needs the domain's DNS on Cloudflare), so no paid mailbox is needed to start.
3. **File uploads:** both. Clients can upload files any time, and you can also ask for specific files (a "requested files" checklist on their Files page).
4. **Monthly summary:** emailed to each client automatically at the start of every month (with the PDF attached and a link to their Stats page), and also downloadable from the portal. You can preview and adjust it before it goes out, for example to add a note.
