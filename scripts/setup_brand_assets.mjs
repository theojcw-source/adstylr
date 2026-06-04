#!/usr/bin/env node
/**
 * Downloads brand assets from private Supabase bucket 'brand' into public/brand/.
 * Run after cloning: node scripts/setup_brand_assets.mjs
 * Requires SUPABASE_URL and SUPABASE_SECRET_KEY in env (.env.local).
 */
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SECRET_KEY;
const BUCKET = "brand";
const OUT_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "public", "brand");

if (!SUPABASE_URL || !SECRET) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY — check your .env.local");
  process.exit(1);
}

const headers = { Authorization: `Bearer ${SECRET}`, apikey: SECRET };

async function listObjects(prefix = "") {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`List failed: ${await res.text()}`);
  return res.json();
}

async function walk(prefix = "") {
  const items = await listObjects(prefix);
  const files = [];
  for (const item of items) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (!item.id) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

async function download(path) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${BUCKET}/${path}`, { headers });
  if (!res.ok) throw new Error(`Download failed for ${path}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

console.log("Downloading brand assets from Supabase (private bucket)...");
const files = await walk();
for (const path of files) {
  const dest = join(OUT_DIR, path);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, await download(path));
  console.log(`  ✓ ${path}`);
}
console.log(`\n${files.length} files downloaded to public/brand/`);
