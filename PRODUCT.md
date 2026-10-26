# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Owners of small businesses who need to be found and chosen online, usually non-technical, short on time and price-conscious:

- restaurants and food businesses (both current clients are restaurants);
- local small businesses of any kind;
- startups and solo founders getting online for the first time.

They judge WAVE Digital on a phone or a laptop in the gaps of running their business, comparing it with bigger agencies and with doing it themselves.

## Product Purpose

WAVE Digital (Web · Ads · Visibility · Engagement) builds and runs the online presence of small businesses. Mission, in the owner's words: "At WAVE Digital, our mission is to help small businesses grow by creating powerful online experiences and driving real customer results through websites, ads, and social media."

The site succeeds when a visitor understands the offer and its prices within seconds, trusts WAVE with their business, and acts: subscribes or pays through Stripe checkout, sends an inquiry, or books a free consultation.

## Positioning

What a bigger agency cannot truthfully claim, all four confirmed by the owner:

- **Everything in one place:** website, social media and advertising handled together, including one monthly bundle.
- **Personal and hands-on:** clients work directly with the person doing the work, not an account manager.
- **Small-business pricing:** professional work at published prices a small business can afford.
- **Fast to launch:** online and finding customers quickly, without a long agency process.

## Operating Context

Visitors arrive from search, social media and word of mouth. The business is based locally (city not yet stated) and also works with clients remotely.

Live at https://wavedigital.biz, served by GitHub Pages from the `main` branch of anzumr/WAVE-Digital. Checkout runs on Stripe Payment Links, inquiries on Formspree, consultations on Calendly (Google Meet). The owner reviews the site on a Windows laptop in Chrome.

## Capabilities and Constraints

- Static site: plain HTML, CSS and vanilla JavaScript loaded as classic scripts; no framework, no build step, no server. Must also open straight from disk (`file://`) for previews.
- Services: Website Creation, Social Media, Advertising, Logo & Rebranding, Business Advice (custom quote).
- Prices (USD), verbatim and binding:
  - Monthly: Website Creation $100–$150/mo (+$100 one-time signup fee); Social Media Maintenance $100/mo (+$350 one-time creation/setup); Advertising $150/mo (ad spend separate); Full WAVE Package $350/mo (website + social media + advertising, "BEST VALUE").
  - Yearly: Website Creation $1,000/yr; Full WAVE Package $3,000/yr ("SAVE $1,200/YEAR VS MONTHLY").
  - One-time: Website Signup $100; Social Media Creation $350; Logo / Rebranding $250.
- Integrations configured in `script.js` (`CONFIG`): Formspree endpoint (live), Calendly booking link (live), nine Stripe Payment Link slots and a Stripe customer-portal link (pending). `thank-you.html` is Stripe's after-payment page.
- Performance: the site must scroll smoothly on an ordinary Windows laptop in Chrome. The owner has reported scroll lag caused by the animated hero.
- Open decision: the city or region to name for local search.

## Brand Commitments

- Name: WAVE Digital; the acronym Web · Ads · Visibility · Engagement.
- Logo: a hand formed from a breaking wave (`wave-logo.png` / `.webp`), always shown whole.
- The animated wave hero (`wave-bg.js`): the tide rolls in and splashes, the logo rises from the water, and the water answers the pointer. The owner pinned it: keep it.
- Voice: premium and polished; calm, refined, quietly expert.

## Evidence on Hand

- Two real client websites: Ensō no Sato (https://www.ensonosato.com/, Japanese dining) and No.1 Halal Kitchen (https://www.no1halalkitchen.com/, halal American-Chinese fusion). No screenshots of them are on hand.
- The published prices above.
- Not on hand, never to be invented: testimonials, reviews, client counts, results or metrics, case-study numbers, team names or photos, a phone number, a street address, an email address.

## Product Principles

1. The offer and its prices are unmistakable; show, never hype.
2. One partner for the whole online presence: the services read as one connected job, not a menu.
3. Every action (pay, ask, book) is reachable within seconds on a phone.
4. Trust is earned with real work and honest numbers, never invented proof.
5. Smooth on ordinary hardware: motion never costs scrolling.

## Accessibility & Inclusion

WCAG 2.2 AA. Respect reduced-motion preferences and keep a visible pause control for looping motion.
