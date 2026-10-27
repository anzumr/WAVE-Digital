---
name: WAVE Digital
description: Websites, social media and advertising for small businesses, every plan hung as a priced order ticket on a steel rail.
colors:
  cyan: "#70e5f2"
  cyan-hi: "#a6f1f8"
  cyan-ink: "#0786ad"
  steel: "#a6b3bf"
  steel-face: "#9aa8b5"
  steel-plate: "#b3bfc9"
  steel-edge: "#4f6072"
  ground: "#04111f"
  ground-2: "#071a2d"
  ground-deep: "#030d19"
  ink: "#edf3f7"
  ink-2: "#a7b9c8"
  ink-3: "#8ea3b4"
  hair: "rgba(166,179,191,.2)"
  hair-strong: "rgba(166,179,191,.38)"
  cotton: "#f5f6f3"
  cotton-2: "#e8ecee"
  print: "#0b2341"
  print-2: "#4a5b6d"
  print-3: "#5b6b7c"
  rule: "rgba(11,35,65,.38)"
  err: "#b3261e"
  ok: "#136c45"
typography:
  display:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.625rem, 1.05rem + 4.1vw, 4.75rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.036em"
  headline:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 1.15rem + 2.5vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.06
    letterSpacing: "-0.032em"
  title:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.22
    letterSpacing: "-0.012em"
  lead:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.0625rem, 1rem + 0.3vw, 1.1875rem)"
    fontWeight: 400
    lineHeight: 1.6
  body:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.6
  button:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.005em"
  fine:
    fontFamily: "Schibsted Grotesk, Arial, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  price:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "clamp(28px, 1.6rem + 1.1vw, 46px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.005em"
    fontFeature: '"tnum" 1, "lnum" 1'
  label:
    fontFamily: "Sofia Sans Extra Condensed, Arial Narrow, Roboto Condensed, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.09em"
    fontFeature: '"tnum" 1'
rounded:
  hairline: "1px"
  sm: "2px"
  stamp: "3px"
spacing:
  gutter: "32px"
  gutter-phone: "16px"
  rail: "18px"
  ticket-gap: "16px"
  ticket-pad: "18px"
  section: "128px"
  section-phone: "96px"
components:
  button-fire:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.ground}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "52px"
  button-fire-hover:
    backgroundColor: "{colors.cyan-hi}"
  button-fire-on-cotton-hover:
    backgroundColor: "{colors.print}"
    textColor: "{colors.cyan}"
  button-line:
    backgroundColor: "rgba(4,17,31,.42)"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "52px"
  button-line-hover:
    backgroundColor: "rgba(112,229,242,.14)"
  button-ink:
    backgroundColor: "transparent"
    textColor: "{colors.print}"
    typography: "{typography.button}"
    rounded: "{rounded.sm}"
    padding: "0 22px"
    height: "52px"
  button-ink-hover:
    backgroundColor: "{colors.print}"
    textColor: "{colors.cotton}"
  ticket-pay:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.print}"
    rounded: "{rounded.sm}"
    padding: "0 14px 0 16px"
    height: "48px"
  ticket-pay-hover:
    backgroundColor: "{colors.print}"
    textColor: "{colors.cyan}"
  ticket:
    backgroundColor: "{colors.cotton}"
    textColor: "{colors.print}"
    rounded: "{rounded.hairline}"
    padding: "10px 18px 0"
  ticket-head-featured:
    backgroundColor: "{colors.print}"
    textColor: "{colors.cotton}"
    typography: "{typography.label}"
  rail-plate:
    backgroundColor: "{colors.steel-plate}"
    textColor: "{colors.print}"
    rounded: "{rounded.hairline}"
    padding: "8px 14px 7px"
  stamp:
    backgroundColor: "rgba(245,246,243,.94)"
    textColor: "{colors.cyan-ink}"
    rounded: "{rounded.stamp}"
    padding: "6px 10px 5px 12px"
  docket:
    backgroundColor: "{colors.cotton}"
    textColor: "{colors.print}"
    rounded: "{rounded.sm}"
  go-chip:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.print}"
    rounded: "{rounded.sm}"
    size: "44px"
  go-chip-hover:
    backgroundColor: "{colors.print}"
    textColor: "{colors.cyan}"
  order-pad:
    backgroundColor: "{colors.cotton}"
    textColor: "{colors.print}"
    rounded: "{rounded.sm}"
    padding: "48px 32px 32px"
  input-field:
    backgroundColor: "#ffffff"
    textColor: "{colors.print}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "12px 14px"
    height: "50px"
  nav-link:
    textColor: "{colors.ink-2}"
  nav-link-active:
    textColor: "{colors.ink}"
  nav-cta:
    backgroundColor: "{colors.cyan}"
    textColor: "{colors.ground}"
    rounded: "{rounded.sm}"
    padding: "0 18px"
    height: "40px"
  toast:
    backgroundColor: "{colors.cotton}"
    textColor: "{colors.print}"
    rounded: "{rounded.sm}"
    padding: "8px 6px 8px 14px"
---

# Design System: WAVE Digital

## Overview

**Creative North Star: "The Kitchen Pass"**

WAVE's whole offer is made to order. The site is a fine-dining kitchen pass at night: a deep harbour-navy ground that continues out of the pinned wave hero, a matte blue-grey steel rail running edge to edge, and heavyweight white cotton tickets hung from it, each one itemised, numbered, priced and ready to fire. Diner materials are translated up to fine dining: thermal paper becomes cotton card, the red kitchen stamp becomes the brand cyan.

The system is calm and exact rather than loud. Density is low on the navy and high on the cards: wide bands of dark ground with one headline and one supporting line, then tightly printed tickets with double rules, dotted item rules, tabular figures and perforated stubs. Everything that can be bought or asked for is physical: it hangs, tears, lifts off the rail and gets stamped. Motion is one orchestrated arrival per rail, transform and opacity only, never a loop that costs scrolling.

Confirmed rejections, from the chosen world: the category-default agency landing (glowing gradients, a headline over two buttons on a gradient, rows of same-size icon cards, a "most popular" pricing table), glass and blur, gradient text, eyebrow labels, chrome gloss on metal.

**Key Characteristics:**
- Two material families only: harbour-navy ground with pale ink, and cotton card with navy print.
- One cyan accent, reserved for actions, focus, the active nav underline and the fired stamp.
- Steel rails and the pass edge run past both screen edges; cards hang from them.
- A precise text grotesk for words, an extra-condensed numeric face for prices, ticket numbers and tags.
- Near-square paper corners (1–2px), perforations, tear edges and double rules as the ornament.
- Shadows are contact shadows under hung paper; lifting fades in a pre-drawn shadow, never animates one.

## Colors

A night-kitchen palette: deep navy grounds, matte steel, cotton card and navy print, with a single sea-cyan for anything that acts.

### Primary
- **Sea-Glass Cyan** (cyan): the logo's cyan. Fill of every primary action (Explore Packages, Get Started, ticket pay buttons, Send Inquiry, go chips), the focus ring on navy, the active nav underline and text selection on navy.
- **Spray Cyan** (cyan-hi): hover fill for cyan actions sitting on the navy ground.
- **Stamp Ink Cyan** (cyan-ink): the cyan as it prints on cotton. The "Fired" stamp and small arrow icons on cards, where the light cyan would not hold contrast.

### Secondary
- **Pass Steel** (steel-face): the flat face of every rail, the pad binding and the pass edge, with a faint grain and a 1px dark lip.
- **Tag Steel** (steel-plate): the stamped name tag clipped over the left end of each rail.
- **Slot Shadow Steel** (steel-edge): the dark lip under a rail and the tag's 1px border.
- **Acronym Steel** (steel): the large W / A / V / E letters in the About list; steel used as a typographic color on navy.

### Neutral
- **Harbour Navy** (ground): the page ground, continuous with the hero water; also text on cyan fills.
- **Lower Deck Navy** (ground-2): alternate section band (portfolio, contact) and the open phone menu.
- **Night Water** (ground-deep): the footer and scrollbar track.
- **Foam White** (ink): headings and primary text on navy.
- **Mist** (ink-2): supporting copy, leads and resting nav links on navy.
- **Haze** (ink-3): fine print, notes and the brand acronym line on navy.
- **Hairline** (hair) and **Strong Hairline** (hair-strong): section dividers, the header rule, list rules and quiet control borders on navy.
- **Cotton** (cotton): ticket, docket, order and pad stock; the toast slip.
- **Pressed Cotton** (cotton-2): hover tint on cotton controls.
- **Print Navy** (print): all text and rules printed on cotton; reversed ticket heads and flags; hover fill of cyan actions that sit on cotton.
- **Faded Print** (print-2): secondary print on cotton (notes, rates' units, column heads).
- **Pencil Print** (print-3): placeholder text in the pad.
- **Ruled Print** (rule): double rules and dotted item rules on cotton.

### Status
- **Error Red** (err): invalid fields and error messages, on cotton only.
- **Served Green** (ok): the inquiry success message, on cotton only.

### Named Rules
**The Fire-Only Cyan Rule.** Cyan marks what acts: action fills, focus, the current-section underline and the stamp. It is never a heading color, a section band or decoration.

**The Two Stocks Rule.** Every surface is either navy ground with ink colors or cotton card with print colors. Print never sits on navy and ink never sits on cotton; selection and focus colors swap with the stock (cyan on navy, print navy on cotton).

## Typography

**Display Font:** Schibsted Grotesk (self-hosted variable 400–800, with a size-adjusted Arial fallback)
**Body Font:** Schibsted Grotesk
**Label/Mono Font:** Sofia Sans Extra Condensed (self-hosted 500–800, with Arial Narrow / Roboto Condensed)

**Character:** A precise, slightly newsy grotesk carries every word with tight negative tracking at size; an extra-condensed numeric face does the kitchen printing: prices, ticket numbers, rail tags, column heads and the stamp.

### Hierarchy
- **Display** (700, clamp 42–76px, 1.02, -0.036em): the hero headline only. Over the moving water it carries a soft dark legibility shadow.
- **Headline** (700, clamp 34–52px, 1.06, -0.032em, balanced): section headings, kept to 12–15ch.
- **Title** (700, 18px, 1.22, -0.012em): plan names on tickets; service lines and About items run 18–20px in the same cut.
- **Lead** (400, clamp 17–19px, 1.6, max 34em): the line under a section heading, in Mist.
- **Body** (400, 17px / 16px on phones, 1.6): running text and form input text.
- **Fine** (400, 14px, 1.65, max 64ch): price terms and small print, in Haze.
- **Price** (Sofia 700, clamp 28–46px sized to the ticket's width, 0.92, tabular lining figures): ticket and order-line prices; the unit (/mo, /yr) prints at 0.46em in Faded Print.
- **Label** (Sofia 600, 15px, 0.09em tracking, uppercase, tabular): ticket heads ("No. 01 / Monthly"), order column heads, line references, rail tags (17px, 0.07em) and the stamp (800, 23px, 0.14em).

### Named Rules
**The Printed Numbers Rule.** Every price, ticket number, rail tag and fire mark sets in Sofia Sans Extra Condensed with tabular lining figures. Headings, plan names and running text never do.

**The Standalone Heading Rule.** A section heading stands alone with at most one lead line under it. Nothing small and uppercase is stacked above it.

## Layout

A single centred column, `min(1280px, 100% − 64px)` wide (16px gutters on phones), in full-bleed bands that alternate Harbour Navy and Lower Deck Navy, divided by a 1px hairline. Section bands breathe at 128px top and bottom (96px on phones); content inside cards is tight.

The rail is the spatial spine. Rails, the order hang and the portfolio pass edge are 16–18px steel bars that run past both edges of the screen (the section clips horizontal overflow); cards hang from them with their top 10px tucked under the bar. Plan tickets sit four to a rail with 16px gaps; at 1100px and wider the rates intro becomes a sticky 340px column beside the rails. Below 1100px the monthly rail hangs straight off the bottom of the hero so ticket tops show in the first view, then the intro, then the yearly and one-time rails. Below 860px tickets go two-up (max 300px each, 12px gaps), every further row hanging from its own stretch of rail; below 370px they go one-up. About, Services and Contact use asymmetric two-column grids (roughly 1.15 / 0.85) that stack below 1100px. The header is a 72px sticky bar (64px below 900px, where the links collapse into a menu).

### Named Rules
**The Hung, Not Floating Rule.** Anything orderable (plans, the services order, the inquiry pad, served client dockets) is attached to steel: a rail, a binding or the pass edge. Cards do not float free on the ground.

## Elevation & Depth

Depth is physical and shallow: paper hanging in front of steel in front of water. Cotton cards cast a tight contact shadow plus a short drop below them; rails cast a small shadow onto what hangs under them. There are no ambient glows, no glass, no blur. The pinned hero is the one exception: its water backdrop and the headline's dark legibility shadow belong to the hero alone.

### Shadow Vocabulary
- **Hung paper** (`box-shadow: 0 1px 1px rgba(0,0,0,.3), 0 12px 16px -12px rgba(0,0,0,.75)`): plan tickets and the services order at rest.
- **Standing docket** (`box-shadow: 0 1px 1px rgba(0,0,0,.3), 0 16px 24px -20px rgba(0,0,0,.9)`): portfolio dockets and the toast; the pad uses the same shape at `0 18px 28px -22px`.
- **Lifted ticket** (`box-shadow: 0 22px 22px -16px rgba(0,0,0,.8)` on a pre-drawn layer): faded in with opacity when a ticket is hovered or focused.
- **Rail** (`box-shadow: 0 3px 4px -1px rgba(0,0,0,.5)`): under every rail and the pass edge.
- **Stamp ring** (`box-shadow: inset 0 0 0 2px cotton, inset 0 0 0 3.5px currentColor`): the stamp's double border.

### Named Rules
**The Opacity-Only Shadow Rule.** A state that deepens a shadow fades in a pre-drawn shadow layer; box-shadow and filter are never animated.

## Shapes

Paper and steel, cut square. Corners are near-square: 1px on hung tickets, rail tags and the services order; 2px on buttons, inputs, dockets, the pad and the toast; 3px only on the stamp. The paper carries its own geometry instead of rounding: a zig-zag torn bottom edge (6px tall, 8px pitch) on tickets and the order, a perforated tear line (3px dots on 8px pitch) above every stub with 7px half-round notches cut from each side, a 3px double rule under ticket heads and above the order's total line, and 1.5px dotted rules between items.

### Named Rules
**The Paper Corner Rule.** No radius above 3px and no pills. Character comes from tears, perforations and rules, not from rounding.

## Components

### Buttons
Firm, flat and printed; they press down 1px when used.
- **Shape:** near-square (2px), 52px tall (56px for the consult booking, 54px for the pad submit), 22px side padding, icon gap 10px.
- **Fire (primary):** Sea-Glass Cyan fill with Harbour Navy text, 600 weight. On navy, hover lightens to Spray Cyan. On cotton, hover inverts to Print Navy with cyan text.
- **Line (secondary, on navy):** 1.5px cyan border at 75%, Foam White text over a 42% navy wash, cyan icon. Hover tints the fill cyan at 14% and solidifies the border.
- **Ink (secondary, on cotton):** 1.5px Print Navy border, navy text. Hover fills Print Navy with Cotton text and turns the icon cyan.
- **Focus:** 2px outline at 3px offset; cyan on navy, Print Navy on cotton.

### Plan Ticket (signature)
The order ticket that defines the system.
- **Stock:** Cotton, 18px side padding (14px when two-up), top 10px tucked under the rail, torn bottom edge, hung-paper shadow.
- **Print order:** ticket head (number left, billing period right, Label type, 3px double rule below), plan name (Title), price (Price type), note (600, 14px, Faded Print), item list with 9×2px dash markers under a dotted rule, then the stub.
- **Featured:** the head prints in reverse (Print Navy band, Cotton text) and the badge ("BEST VALUE", the yearly saving) prints as a reversed flag directly above the stub.
- **Stub:** perforation and side notches, then the full-width pay button: cyan fill, Print Navy text, 48px tall, 2px radius, a faint inset bottom edge; hover inverts to navy with cyan text.
- **Lift:** hover or keyboard focus drops the ticket 6px and turns it -1.2° about its top centre (0.5s expo), fading in the lifted shadow.
- **Fire:** using the pay button throws the "Fired" stamp onto the ticket head (scale 1.7 to 1, rotate -14° to -7°, 0.42s expo). Reduced motion: the stamp lands without the throw.
- **Arrival:** the tickets on each rail start bunched off the right end and slide into place once (1.05s expo, 90ms per column).

### Rail Plate
The stamped steel tag clipped over the left end of each rail: Tag Steel, 1px Slot Shadow Steel border, 1px radius, rail name in Sofia 700 uppercase at 17px with 0.07em tracking. Flat and printed, no shine.

### Cards / Containers
- **Served docket:** Cotton, 2px radius, standing-docket shadow, standing on the pass edge. Its top plate is set flat in the client's own colours (their name, cuisine and live address); its stub carries "Explore live website" and a 44px cyan go chip. Hover raises the docket 5px and inverts the chip to navy with cyan.
- **Services order:** one Cotton docket hung from its own rail, 28px padding (18px on phones), Item / Rate column heads under a double rule, lines split by dotted rules, prices right-aligned in Price type with ticket references under them, and the bundle printed as the total line under a double rule in Print Navy.
- **Background:** never navy-on-navy cards; containers on the ground are Cotton or nothing.

### Inputs / Fields
- **Style:** white field, 1.5px slate stroke, 2px radius, 50px tall, 12px 14px padding, 16px text in Print Navy; labels 600 at 15px above. The textarea starts at 140px and resizes vertically. Selects use a navy chevron.
- **Focus:** stroke turns Print Navy plus a 2px Print Navy outline at 2px offset.
- **Error:** Error Red stroke, a faint red wash and an inline circle-alert icon at the right; messages print in a tinted slip with an icon (red, green or navy for error, success, info).
- **Pad:** the fields sit on a Cotton order pad with a steel binding bar (16px) across its top; two columns, one below 760px.

### Navigation
- **Desktop:** links in 500 weight at 15px, Mist at rest, Foam White on hover and when current; the current section gets a 2px cyan underline that draws in from the left (0.35s expo). Get Started is a 40px cyan fill at the end. The header is solid Harbour Navy with a hairline that strengthens once scrolled.
- **Phone (below 900px):** a 48px square toggle with three bars that cross into an X; the menu drops as a Lower Deck Navy panel with 52px rows divided by hairlines and the cyan Get Started full width at the bottom.

### Toast
A Cotton slip with the hung-paper treatment under the header (top left on desktop), info or error icon, and a 44px close control; it slides 16px and fades in.

## Do's and Don'ts

### Do:
- **Do** hang every priced or orderable thing on Cotton from steel: a rail, the pad binding or the pass edge.
- **Do** print prices, ticket numbers, rail tags and stamps in Sofia Sans Extra Condensed with tabular lining figures.
- **Do** keep cyan for actions, focus and the stamp; on Cotton, hover inverts an action to Print Navy with cyan text.
- **Do** animate only transform and opacity, on the expo ease (cubic-bezier(.16,1,.3,1)) for arrivals and lifts and the quick ease (cubic-bezier(.2,.8,.2,1)) for color states.
- **Do** give every motion a reduced-motion state: tickets hang in place, lifts are removed, the stamp lands without the throw.
- **Do** give every control at least a 44px hit area.

### Don't:
- **Don't** add glows, glass, backdrop blur or gradient text; the hero's water backdrop is the only light effect.
- **Don't** stack small uppercase labels above section headings.
- **Don't** round corners past 3px or make pill buttons.
- **Don't** animate box-shadow or filter, or add infinite decorative loops; the hero water is the only loop and it keeps its pause control.
- **Don't** print navy text on the navy ground or pale ink on Cotton.
- **Don't** gloss the steel: one flat face, a faint grain, a 1px dark lip.
- **Don't** lay plans out as rows of same-size icon cards or a highlighted "most popular" pricing column.
