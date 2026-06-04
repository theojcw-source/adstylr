#!/usr/bin/env node
/**
 * Uploads public/brand/ assets to Supabase storage bucket 'brand'.
 * Run once before git-filter-repo to preserve assets in Supabase.
 * Usage: node scripts/upload_brand_to_supabase.mjs
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "brand";
const BRAND_DIR = new URL("../public/brand", import.meta.url).pathname;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in env");
  process.exit(1);
}

async function createBucket() {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json",
      apikey: SUPABASE_SECRET_KEY,
    },
    body: JSON.stringify({
      id: BUCKET,
      name: BUCKET,
      public: true,
      allowed_mime_types: null,
      file_size_limit: 52428800,
    }),
  });
  const body = await res.json();
  if (res.ok || body.error === "The resource already exists") {
    console.log(`Bucket '${BUCKET}': ready`);
  } else {
    console.error("Failed to create bucket:", body);
    process.exit(1);
  }
}

function walkDir(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function getMime(filePath) {
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ttf")) return "font/ttf";
  if (filePath.endsWith(".otf")) return "font/otf";
  if (filePath.endsWith(".json")) return "application/json";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function uploadFile(localPath) {
  const storagePath = relative(BRAND_DIR, localPath);
  const mime = getMime(localPath);
  const body = readFileSync(localPath);

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        apikey: SUPABASE_SECRET_KEY,
        "Content-Type": mime,
        "x-upsert": "true",
      },
      body,
    }
  );

  if (res.ok) {
    console.log(`  ✓ ${storagePath}`);
  } else {
    const err = await res.json().catch(() => ({}));
    console.error(`  ✗ ${storagePath}: ${JSON.stringify(err)}`);
  }
}

await createBucket();

const files = walkDir(BRAND_DIR);
console.log(`\nUploading ${files.length} files to bucket '${BUCKET}'...`);
for (const f of files) {
  await uploadFile(f);
}
console.log("\nDone.");
