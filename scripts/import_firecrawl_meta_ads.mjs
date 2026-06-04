#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const FIRECRAWL_DIR = path.join(ROOT, ".firecrawl");
const OUT_DIR = path.join(ROOT, "data", "manual-meta");

const SOURCES = [
  {
    schoolId: "prepart",
    schoolName: "Prep'Art",
    file: "scrape-prepart-keyword-adlibrary.json",
    tag: "Prepa art",
  },
  {
    schoolId: "mjm",
    schoolName: "MJM Graphic Design",
    file: "scrape-mjm-adlibrary.json",
    tag: "Graphisme/design",
  },
  {
    schoolId: "pivaut",
    schoolName: "Ecole Pivaut",
    file: "scrape-pivaut-keyword-adlibrary.json",
    tag: "Arts appliques",
  },
  {
    schoolId: "gobelins",
    schoolName: "Gobelins",
    file: "scrape-gobelins-adlibrary.json",
    tag: "Animation / image",
  },
  {
    schoolId: "rubika",
    schoolName: "Rubika",
    file: "scrape-rubika-keyword-adlibrary.json",
    tag: "Animation / gaming / 3D",
  },
  {
    schoolId: "brassart",
    schoolName: "Brassart",
    file: "scrape-brassart-adlibrary.json",
    tag: "Arts creatifs",
  },
  {
    schoolId: "artfx",
    schoolName: "ARTFX",
    file: "scrape-artfx-keyword-adlibrary.json",
    tag: "Animation / VFX / 3D",
  },
  {
    schoolId: "atelier-hourde",
    schoolName: "Atelier Hourde",
    file: "scrape-atelier-hourde-keyword-adlibrary.json",
    tag: "Prepa art",
  },
  {
    schoolId: "emca",
    schoolName: "EMCA",
    file: "scrape-emca-keyword-adlibrary.json",
    tag: "Animation",
  },
  {
    schoolId: "cpes-caap",
    schoolName: "CPES-CAAP",
    file: "scrape-cpes-caap-keyword-adlibrary.json",
    tag: "Prepa publique",
  },
  {
    schoolId: "via-ferrata",
    schoolName: "Via Ferrata ENSBA Paris",
    file: "scrape-via-ferrata-keyword-adlibrary.json",
    tag: "Prepa art",
  },
];

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  return {
    commit: args.has("--commit"),
    skipUpload: args.has("--skip-upload"),
    skipInsert: args.has("--skip-insert"),
    maxPerSchool: Number(process.env.META_ADS_MAX_PER_SCHOOL || 60),
    bucket: process.env.SUPABASE_VEILLE_BUCKET || "images",
    table: process.env.SUPABASE_VEILLE_TABLE || "veille_meta_ads",
  };
}

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

function isUsefulMetaImage(url) {
  if (!url.includes("fbcdn.net")) return false;
  if (url.includes("static.xx.fbcdn.net")) return false;
  if (!url.includes("/t39.35426-6/")) return false;
  return !url.includes("s60x60");
}

function contentTypeFromUrl(url) {
  if (url.includes(".png")) return "image/png";
  if (url.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function extFromContentType(contentType) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function publicUrl(supabaseUrl, bucket, storagePath) {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
}

async function readSource(source) {
  const fullPath = path.join(FIRECRAWL_DIR, source.file);
  const json = JSON.parse(await readFile(fullPath, "utf8"));
  const sourceUrl = json.metadata?.sourceURL || json.metadata?.url || "";
  const capturedAt = new Date().toISOString();
  const seen = new Set();
  const images = (json.images || [])
    .filter(isUsefulMetaImage)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    })
    .slice(0, source.max || Number.POSITIVE_INFINITY);

  return images.map((imageUrl, index) => {
    const hash = createHash("sha256").update(`${source.schoolId}:${imageUrl}`).digest("hex");
    return {
      source_platform: "Meta",
      import_source: "firecrawl_manual",
      school_id: source.schoolId,
      school_name: source.schoolName,
      tag: source.tag,
      original_image_url: imageUrl,
      source_url: sourceUrl,
      ad_library_url: sourceUrl,
      source_file: source.file,
      captured_at: capturedAt,
      image_hash: hash,
      ordinal: index + 1,
      metadata: {
        firecrawl_file: source.file,
        firecrawl_url: sourceUrl,
      },
    };
  });
}

async function downloadImage(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed ${res.status}`);
  const contentType = res.headers.get("content-type") || contentTypeFromUrl(url);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, contentType };
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.local"));
  const opts = parseArgs();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL and SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const rows = (await Promise.all(SOURCES.map(readSource))).flat();
  await mkdir(OUT_DIR, { recursive: true });

  const manifestPath = path.join(OUT_DIR, "firecrawl-meta-ads-manifest.json");
  await writeFile(manifestPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2));

  const counts = rows.reduce((acc, row) => {
    acc[row.school_name] = (acc[row.school_name] || 0) + 1;
    return acc;
  }, {});
  console.log("Prepared rows:");
  for (const [school, count] of Object.entries(counts)) console.log(`- ${school}: ${count}`);
  console.log(`Manifest: ${manifestPath}`);

  if (!opts.commit) {
    console.log("Dry run only. Re-run with --commit to upload/insert.");
    return;
  }

  const uploaded = [];
  for (const row of rows) {
    let storagePath = null;
    let storedImageUrl = null;

    if (!opts.skipUpload) {
      const { bytes, contentType } = await downloadImage(row.original_image_url);
      storagePath = `veille/meta_ads/${row.school_id}/${row.image_hash.slice(0, 16)}.${extFromContentType(contentType)}`;
      const { error } = await supabase.storage
        .from(opts.bucket)
        .upload(storagePath, bytes, { contentType, upsert: true });
      if (error) throw new Error(`Storage upload failed for ${row.school_name}: ${error.message}`);
      storedImageUrl = publicUrl(supabaseUrl, opts.bucket, storagePath);
    }

    uploaded.push({
      ...row,
      storage_bucket: opts.bucket,
      storage_path: storagePath,
      image_url: storedImageUrl || row.original_image_url,
      imported_at: new Date().toISOString(),
    });
    console.log(`Uploaded ${uploaded.length}/${rows.length}: ${row.school_name}`);
  }

  const uploadedPath = path.join(OUT_DIR, "firecrawl-meta-ads-uploaded.json");
  await writeFile(uploadedPath, JSON.stringify({ generatedAt: new Date().toISOString(), rows: uploaded }, null, 2));

  if (!opts.skipInsert) {
    const { error } = await supabase.from(opts.table).upsert(uploaded, { onConflict: "image_hash" });
    if (error) throw new Error(`Supabase insert failed in ${opts.table}: ${error.message}`);
    console.log(`Inserted/upserted ${uploaded.length} rows into ${opts.table}.`);
  }

  console.log(`Uploaded manifest: ${uploadedPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
