// Unit tests for the response parsers in supabase/functions/_shared/providers.ts.
// Run: node --experimental-strip-types supabase/tests/providers_test.ts   (or: deno test)
import { isoDay, parseAdsTotals, parseIgTotals, parseReviews, thirtyDayWindows } from "../functions/_shared/providers.ts";

let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : `\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`}`);
}

eq("instagram totals", parseIgTotals({ data: [
  { name: "reach", period: "day", total_value: { value: 8400 } },
  { name: "total_interactions", period: "day", total_value: { value: 612 } },
] }), { reach: 8400, total_interactions: 612 });
eq("instagram totals ignore missing values", parseIgTotals({ data: [{ name: "reach" }] }), {});
eq("instagram totals empty body", parseIgTotals(null), {});

eq("google ads totals (int64 as strings, micros)", parseAdsTotals({ results: [
  { metrics: { costMicros: "212500000", impressions: "10450", clicks: "310", conversions: 18.0 } },
  { metrics: { costMicros: "87500000", impressions: "3000", clicks: "100", conversions: 6.4 } },
] }), { "ads.spend": 300, "ads.impressions": 13450, "ads.clicks": 410, "ads.leads": 24 });
eq("google ads totals with no rows", parseAdsTotals({}), { "ads.spend": 0, "ads.impressions": 0, "ads.clicks": 0, "ads.leads": 0 });

eq("google reviews", parseReviews({ averageRating: 4.63, totalReviewCount: 182, reviews: [] }), { "reviews.google.rating": 4.6, "reviews.google.count": 182 });
eq("google reviews missing", parseReviews({}), {});

const oct = thirtyDayWindows({ from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-11-01T00:00:00Z") });
eq("31-day month splits into 30 + 1 days", oct.map((w) => [isoDay(w.from), isoDay(w.to)]), [["2026-10-01", "2026-10-31"], ["2026-10-31", "2026-11-01"]]);
const feb = thirtyDayWindows({ from: new Date("2026-02-01T00:00:00Z"), to: new Date("2026-03-01T00:00:00Z") });
eq("28-day month is one window", feb.length, 1);

console.log(failed ? `\n${failed} failed` : "\nall passed");
if (failed) throw new Error("provider tests failed");
