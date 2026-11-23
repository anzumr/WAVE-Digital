// The monthly numbers WAVE tracks per client. Keep in step with W.METRICS in me/js/stats.js.
export interface MetricDef {
  key: string;
  group: string;
  label: string;
  kind: "count" | "money" | "rating";
}

export const METRICS: MetricDef[] = [
  { key: "social.instagram.followers", group: "Instagram", label: "Followers", kind: "count" },
  { key: "social.instagram.reach", group: "Instagram", label: "Accounts reached", kind: "count" },
  { key: "social.instagram.engagement", group: "Instagram", label: "Interactions", kind: "count" },
  { key: "social.facebook.followers", group: "Facebook", label: "Followers", kind: "count" },
  { key: "social.facebook.reach", group: "Facebook", label: "Reach", kind: "count" },
  { key: "social.facebook.engagement", group: "Facebook", label: "Interactions", kind: "count" },
  { key: "social.tiktok.followers", group: "TikTok", label: "Followers", kind: "count" },
  { key: "social.tiktok.views", group: "TikTok", label: "Video views", kind: "count" },
  { key: "ads.spend", group: "Advertising", label: "Ad spend", kind: "money" },
  { key: "ads.impressions", group: "Advertising", label: "Impressions", kind: "count" },
  { key: "ads.clicks", group: "Advertising", label: "Clicks", kind: "count" },
  { key: "ads.leads", group: "Advertising", label: "Leads", kind: "count" },
  { key: "reviews.google.rating", group: "Google reviews", label: "Rating", kind: "rating" },
  { key: "reviews.google.count", group: "Google reviews", label: "Reviews", kind: "count" },
];

export function formatMetric(kind: MetricDef["kind"], v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "-";
  if (kind === "money") return "$" + v.toLocaleString("en-US", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  if (kind === "rating") return v.toFixed(1);
  return Math.round(v).toLocaleString("en-US");
}
