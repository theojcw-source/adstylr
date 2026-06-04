#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const IMAGES_PROXY = "/api/images";

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
    // .env.local is optional in CI.
  }
}

function storagePathFromUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    const marker = "/storage/v1/object/public/images/";
    const idx = url.pathname.indexOf(marker);
    if (idx >= 0) return decodeURIComponent(url.pathname.slice(idx + marker.length));
    value = url.pathname;
  } catch {
    // Relative path.
  }

  const clean = decodeURIComponent(String(value).split("?")[0] ?? "");
  if (clean.startsWith(`${IMAGES_PROXY}/`)) return clean.slice(`${IMAGES_PROXY}/`.length);
  if (clean.startsWith("/generated/clean/")) return `clean/${path.basename(clean)}`;
  if (clean.startsWith("/generated/branded/")) return `branded/${path.basename(clean)}`;
  return "";
}

function cleanPathCandidates(row) {
  const paths = [row.clean_url, row.url, row.branded_url]
    .map(storagePathFromUrl)
    .filter(Boolean);
  const candidates = new Set();

  for (const storagePath of paths) {
    if (storagePath.startsWith("clean/")) {
      candidates.add(storagePath);
    }
    if (storagePath.startsWith("branded/")) {
      candidates.add(storagePath.replace(/^branded\//, "clean/"));
    }
  }

  return Array.from(candidates);
}

async function storageFileExists(supabase, storagePath) {
  const { data, error } = await supabase.storage.from("images").list(path.dirname(storagePath), {
    limit: 1000,
  });
  if (error) return false;
  const name = path.basename(storagePath);
  return (data ?? []).some((file) => file.name === name);
}

async function main() {
  await loadEnvFile(path.join(ROOT, ".env.local"));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env vars");
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });
  const { data, error } = await supabase
    .from("generations")
    .select("id, url, clean_url, branded_url")
    .is("clean_url", null)
    .limit(1000);

  if (error) throw new Error(error.message);

  let updated = 0;
  let missing = 0;

  for (const row of data ?? []) {
    const candidates = cleanPathCandidates(row);
    let cleanPath = "";
    for (const candidate of candidates) {
      if (await storageFileExists(supabase, candidate)) {
        cleanPath = candidate;
        break;
      }
    }

    if (!cleanPath) {
      missing += 1;
      continue;
    }

    const cleanUrl = `${IMAGES_PROXY}/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
    const result = await supabase
      .from("generations")
      .update({ clean_url: cleanUrl })
      .eq("id", row.id);
    if (result.error) throw new Error(result.error.message);
    updated += 1;
    console.log(`updated ${row.id}: ${cleanUrl}`);
  }

  console.log(`done: ${updated} clean_url updated, ${missing} rows had no matching clean file`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
