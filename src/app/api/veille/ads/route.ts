import { supabase } from "@/lib/supabase";

function toProxyUrl(imageUrl: string) {
  const idx = imageUrl.indexOf("/storage/v1/object/public/images/");
  if (idx >= 0) {
    return `/api/images/${imageUrl.slice(idx + "/storage/v1/object/public/images/".length)}`;
  }
  return imageUrl;
}

type AdMeta = {
  meta_library_id?: string;
  meta_library_url?: string;
  start_date?: string;
  days_active?: number;
  copy_text?: string;
  low_impressions?: boolean;
  impressions_str?: string;
  score?: number;
  firecrawl_url?: string;
  firecrawl_file?: string;
};

type VeilleRow = {
  id: number;
  school_id: string;
  school_name: string;
  tag: string | null;
  image_url: string;
  ad_library_url: string | null;
  source_url: string | null;
  ordinal: number | null;
  captured_at: string;
  metadata: AdMeta;
};

export async function GET() {
  const { data, error } = await supabase
    .from("veille_meta_ads")
    .select("id, school_id, school_name, tag, image_url, ad_library_url, source_url, ordinal, captured_at, metadata")
    .order("school_id")
    .order("ordinal");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const bySchool = new Map<string, VeilleRow[]>();
  for (const row of data as VeilleRow[]) {
    const list = bySchool.get(row.school_id) ?? [];
    list.push(row);
    bySchool.set(row.school_id, list);
  }

  const advertisers = Array.from(bySchool.entries()).map(([schoolId, ads]) => {
    const totalAds = ads.length;

    const groups = ads.map((ad) => {
      const meta = ad.metadata ?? {};
      const ord = ad.ordinal ?? 1;
      const score = meta.score ?? 0;
      const daysActive = meta.days_active ?? 0;
      const copyText = meta.copy_text ?? "";
      const startDate = meta.start_date ?? (ad.captured_at ? ad.captured_at.split("T")[0] : "");

      // Use days_active as reach proxy so the reach badge shows something real
      // A 30-day ad → 30 000, a 5-day ad → 5 000
      const reach = daysActive > 0 ? daysActive * 1000 : 0;

      // Best library URL: per-ad URL from enrichment, then fallback to page URL
      const libUrl =
        meta.meta_library_url ||
        ad.ad_library_url ||
        ad.source_url ||
        "";

      return {
        n: 1,
        r: reach,
        s: startDate,
        b: copyText,
        t: "",
        p: ["facebook"],
        ta: [],
        tg: "All",
        tl: ["France"],
        d: {},
        ids: [meta.meta_library_id ?? String(ad.id)],
        previewUrl: toProxyUrl(ad.image_url),
        adLibraryUrl: libUrl,
        platform_source: "Meta",
        metaRank: ord,
        metaScore: score,
        metaKpis: {
          libraryRank: ord,
          advertiserCreativeCount: totalAds,
          score,
          scoreBasis: "days_active+position",
        },
        daysActive,
        lowImpressions: meta.low_impressions ?? false,
      };
    });

    // Sort groups by real score DESC
    groups.sort((a, b) => (b.metaScore ?? 0) - (a.metaScore ?? 0));

    const totalReach = groups.reduce((s, g) => s + g.r, 0);

    return {
      id: schoolId,
      name: ads[0].school_name,
      tags: ads[0].tag ? [ads[0].tag] : [],
      pageIds: [] as string[],
      platform: "Meta",
      totalAds,
      totalReach,
      payer: "",
      collectedAt: ads[0].captured_at,
      groups,
    };
  });

  // Sort advertisers: most total score first
  advertisers.sort((a, b) => {
    const scoreA = a.groups.reduce((s, g) => s + (g.metaScore ?? 0), 0);
    const scoreB = b.groups.reduce((s, g) => s + (g.metaScore ?? 0), 0);
    return scoreB - scoreA;
  });

  return Response.json({
    collectedAt: new Date().toISOString(),
    advertisers,
  });
}
