#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_FILE = path.join(ROOT, "public", "data", "ads.json");
const HISTORY_FILE = path.join(ROOT, "public", "data", "history.json");

async function loadEnvFile(file) {
  try {
    const text = await readFile(file, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Optional in CI.
  }
}

function titleCaseId(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toAdGroup(row) {
  const id = row.image_hash || `${row.school_id}-${row.ordinal}`;
  const rank = Number(row.ordinal || 999);
  const totalForAdvertiser = Number(row.total_for_advertiser || 0);
  const rankScore = Math.max(0, 101 - rank);
  const volumeScore = Math.min(30, Math.round(Math.sqrt(totalForAdvertiser) * 5));
  const metaScore = Math.min(100, rankScore + volumeScore);

  return {
    n: 1,
    r: 0,
    s: row.captured_at || row.imported_at || "",
    b: `${row.school_name} - crea Meta Ads Library`,
    t: row.tag || "",
    p: ["facebook", "instagram"],
    ta: [],
    tg: "All",
    tl: ["France"],
    d: {},
    ids: [id],
    snapshotIds: [id],
    previewUrl: row.image_url,
    adLibraryUrl: row.ad_library_url || row.source_url || "",
    platform_source: "Meta",
    manualSource: "firecrawl_supabase",
    metaKpis: {
      advertiserCreativeCount: totalForAdvertiser,
      libraryRank: rank,
      score: metaScore,
      scoreBasis: "Rang dans Meta Ads Library triee par impressions + volume annonceur",
    },
    metaRank: rank,
    metaScore,
    sourceFile: row.source_file || "",
  };
}

function buildAdvertisers(rows) {
  const grouped = new Map();
  const totalsBySchool = rows.reduce((acc, row) => {
    const schoolId = row.school_id || titleCaseId(row.school_name);
    acc[schoolId] = (acc[schoolId] || 0) + 1;
    return acc;
  }, {});

  for (const row of rows) {
    const schoolId = row.school_id || titleCaseId(row.school_name);
    if (!grouped.has(schoolId)) {
      grouped.set(schoolId, {
        id: schoolId,
        name: row.school_name,
        tags: row.tag ? [row.tag] : [],
        pageIds: [],
        platform: "Meta",
        totalAds: 0,
        totalReach: 0,
        payer: "",
        collectedAt: row.imported_at || new Date().toISOString(),
        groups: [],
      });
    }

    const advertiser = grouped.get(schoolId);
    if (row.tag && !advertiser.tags.includes(row.tag)) advertiser.tags.push(row.tag);
    advertiser.groups.push(toAdGroup({ ...row, total_for_advertiser: totalsBySchool[schoolId] || 0 }));
    advertiser.totalAds += 1;
  }

  return Array.from(grouped.values()).map((advertiser) => ({
    ...advertiser,
    groups: advertiser.groups.sort((a, b) => (b.metaScore ?? 0) - (a.metaScore ?? 0)),
  }));
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.local"));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const table = process.env.SUPABASE_VEILLE_TABLE || "veille_meta_ads";

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env vars");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .order("school_name", { ascending: true })
    .order("ordinal", { ascending: true });

  if (error) throw new Error(error.message);

  const advertisers = buildAdvertisers(data || []);
  const output = {
    collectedAt: new Date().toISOString(),
    advertisers,
  };

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2));

  try {
    await readFile(HISTORY_FILE, "utf8");
  } catch {
    await writeFile(HISTORY_FILE, JSON.stringify({ days: {}, advertisers: {}, groups: {} }, null, 2));
  }

  console.log(`Wrote ${OUTPUT_FILE}`);
  console.log(`${advertisers.length} advertisers, ${advertisers.reduce((sum, item) => sum + item.totalAds, 0)} creatives`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
