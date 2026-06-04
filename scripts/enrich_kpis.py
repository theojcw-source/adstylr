#!/usr/bin/env python3
"""
Enrichit les KPIs des ads Meta dans Supabase à partir des fichiers .firecrawl/*.json.

Pour chaque école, parse le markdown Firecrawl pour extraire :
- meta_library_id : ID de la bibliothèque Meta
- start_date      : date de début de diffusion
- copy_text       : texte de la publicité
- low_impressions : flag "<100 impressions" (Meta le montre explicitement)
- days_active     : jours depuis le début (signal de performance réelle)

Stratégie de matching :
1. Par image file ID (numéros dans l'URL CDN Facebook) — fiable pour les image ads
2. Par position ordinale en fallback (pour les vidéos sans image dans le markdown)

Usage :
  SUPABASE_URL=xxx SUPABASE_ANON_KEY=xxx python3 scripts/enrich_kpis.py
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

from supabase import create_client

REPO_ROOT = Path(__file__).parent.parent
FIRECRAWL_DIR = REPO_ROOT / ".firecrawl"

SCHOOL_FILES = {
    "brassart": "scrape-brassart-adlibrary.json",
    "gobelins": "scrape-gobelins-adlibrary.json",
    "mjm":      "scrape-mjm-adlibrary.json",
    "rubika":   "scrape-rubika-keyword-adlibrary.json",
    "prepart":  "scrape-prepart-keyword-adlibrary.json",
    "pivaut":   "scrape-pivaut-keyword-adlibrary.json",
}

FRENCH_MONTHS = {
    "janv": 1, "jan": 1, "févr": 2, "fev": 2, "mars": 3, "avr": 4, "mai": 5,
    "juin": 6, "juil": 7, "août": 8, "aout": 8, "sept": 9, "oct": 10,
    "nov": 11, "déc": 12, "dec": 12,
}


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def parse_french_date(s: str) -> str | None:
    """Parse 'XX mois YYYY' or 'XX mois YYYY' → 'YYYY-MM-DD'."""
    if not s:
        return None
    s = s.strip().lower()
    m = re.match(r"(\d{1,2})\s+([a-zéûûôî]+)\.?\s+(\d{4})", s)
    if not m:
        # Try without year (assume current year)
        m2 = re.match(r"(\d{1,2})\s+([a-zéûûôî]+)\.?", s)
        if m2:
            day, month_str = m2.group(1), m2.group(2)[:4]
            month = FRENCH_MONTHS.get(month_str)
            year = datetime.now().year
            if month:
                return f"{year}-{month:02d}-{int(day):02d}"
        return None
    day, month_str, year = m.group(1), m.group(2)[:4], m.group(3)
    month = FRENCH_MONTHS.get(month_str)
    if not month:
        return None
    return f"{year}-{month:02d}-{int(day):02d}"


def extract_fb_file_id(url: str) -> str | None:
    """Extract the numeric file ID from a Facebook CDN URL.
    e.g. .../672153262_1964390981131740_8887029174387339621_n.jpg... → '672153262_1964390981131740_8887029174387339621'
    """
    m = re.search(r"/(\d+_\d+_\d+)_n\.(?:jpg|png|webp)", url)
    return m.group(1) if m else None


def parse_ads_from_markdown(md: str) -> list[dict]:
    """Parse ad blocks from Firecrawl markdown, return list of ad dicts."""
    blocks = md.split("* * *")
    ads = []

    for block in blocks[1:]:  # skip header
        lib_id_m = re.search(r"ID dans la biblioth[eè]que\s*:\s*(\d+)", block)
        if not lib_id_m:
            continue

        lib_id = lib_id_m.group(1)

        start_m = re.search(r"D[eé]but de (?:la )?diffusion le (.+?)(?:\n|\s*·)", block)
        start_raw = start_m.group(1).strip() if start_m else None
        start_date = parse_french_date(start_raw) if start_raw else None

        impr_m = re.search(r"Impressions\s*:\s*\*\*([^*]+)\*\*", block)
        low_impr = "Nombre faible" in block or (impr_m and "<100" in impr_m.group(1))
        impressions_str = impr_m.group(1).strip() if impr_m else (None if not low_impr else "<100")

        copy_m = re.search(r"\*\*Sponsorisé\*\*\s*\n+(.+?)(?:\n\n|\[\!|$)", block, re.DOTALL)
        copy_text = copy_m.group(1).strip()[:400] if copy_m else ""

        # Extract s600x600 image file IDs from this block
        img_ids = set()
        for img_url in re.findall(r"https://scontent[^\s)\"]+", block):
            fid = extract_fb_file_id(img_url)
            if fid and "s60x60" not in img_url and "s60x60" not in img_url:
                img_ids.add(fid)

        ads.append({
            "lib_id": lib_id,
            "start_date": start_date,
            "start_raw": start_raw,
            "copy_text": copy_text,
            "low_impressions": low_impr,
            "impressions_str": impressions_str,
            "img_ids": img_ids,
        })

    return ads


def compute_score(ad_meta: dict, ordinal: int, total: int) -> int:
    """
    Compute a 0–100 performance score using real signals:
    - Position in impression-sorted list (40 pts)
    - Days active (40 pts, capped at 60 days)
    - Low impressions penalty (−40 pts)
    """
    # Position score (ordinal 1 = best = 40 pts)
    position_score = round(40 * (total - ordinal + 1) / total)

    # Days active score
    days = ad_meta.get("days_active", 0) or 0
    days_score = min(40, round(days * 40 / 60))

    # Low impressions penalty
    penalty = -40 if ad_meta.get("low_impressions") else 0

    return max(0, min(100, position_score + days_score + penalty))


def enrich_school(school_id: str, filename: str, supabase_client) -> int:
    """Parse firecrawl file and update Supabase rows. Returns number of rows updated."""
    path = FIRECRAWL_DIR / filename
    if not path.exists():
        log(f"  {school_id}: file not found: {path}")
        return 0

    data = json.loads(path.read_text())
    md = data.get("markdown", "")
    all_page_images = data.get("images", [])

    ads = parse_ads_from_markdown(md)
    log(f"  {school_id}: {len(ads)} ads parsed from markdown")

    # Fetch Supabase rows for this school
    resp = supabase_client.table("veille_meta_ads") \
        .select("id, ordinal, original_image_url, image_hash") \
        .eq("school_id", school_id) \
        .order("ordinal") \
        .execute()
    rows = resp.data
    log(f"  {school_id}: {len(rows)} rows in Supabase")

    # Build lookup: file_id → ad data
    file_id_to_ad: dict[str, dict] = {}
    for ad in ads:
        for fid in ad["img_ids"]:
            file_id_to_ad[fid] = ad

    # Build page-image → block-index mapping (fallback for video ads)
    # Images appear in page order; we can map by position
    page_img_ids = []
    for img_url in all_page_images:
        fid = extract_fb_file_id(img_url)
        if fid:
            page_img_ids.append(fid)

    today = datetime.now().date()
    total = len(rows)
    updated = 0

    for row in rows:
        ordinal = row["ordinal"] or 1
        orig_url = row["original_image_url"] or ""
        row_fid = extract_fb_file_id(orig_url)

        # Try to find matching ad block
        matched_ad = None
        match_method = None

        if row_fid and row_fid in file_id_to_ad:
            matched_ad = file_id_to_ad[row_fid]
            match_method = "file_id"
        elif row_fid and row_fid in page_img_ids:
            # Find which ad corresponds to this page image position
            img_pos = page_img_ids.index(row_fid)
            # Map image position to ad block (roughly)
            block_idx = min(img_pos, len(ads) - 1)
            matched_ad = ads[block_idx]
            match_method = "page_img_pos"
        elif ordinal <= len(ads):
            # Positional fallback
            matched_ad = ads[ordinal - 1]
            match_method = "ordinal"

        if not matched_ad:
            log(f"    row id={row['id']} ordinal={ordinal}: no match found")
            continue

        # Compute days active
        days_active = None
        if matched_ad["start_date"]:
            try:
                start = datetime.strptime(matched_ad["start_date"], "%Y-%m-%d").date()
                days_active = (today - start).days
            except ValueError:
                pass

        ad_meta = {
            "meta_library_id": matched_ad["lib_id"],
            "start_date": matched_ad["start_date"],
            "start_raw": matched_ad["start_raw"],
            "copy_text": matched_ad["copy_text"],
            "low_impressions": matched_ad["low_impressions"],
            "impressions_str": matched_ad["impressions_str"],
            "days_active": days_active,
            "match_method": match_method,
        }
        ad_meta["score"] = compute_score(ad_meta, ordinal, total)
        ad_meta["meta_library_url"] = f"https://www.facebook.com/ads/library/?id={matched_ad['lib_id']}"

        # Update Supabase
        supabase_client.table("veille_meta_ads") \
            .update({"metadata": ad_meta}) \
            .eq("id", row["id"]) \
            .execute()
        updated += 1

    log(f"  {school_id}: {updated}/{total} rows updated")
    return updated


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_SECRET_KEY")

    if not url or not key:
        # Try loading from .env.local
        env_file = REPO_ROOT / ".env.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if "=" in line and not line.startswith("#"):
                    k, _, v = line.partition("=")
                    os.environ[k.strip()] = v.strip()
            url = os.environ.get("SUPABASE_URL")
            key = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("SUPABASE_SECRET_KEY")

    if not url or not key:
        print("ERROR: SUPABASE_URL et SUPABASE_ANON_KEY requis")
        return

    client = create_client(url, key)
    log("=== Enrichissement KPIs Meta Ads ===")
    log(f"Firecrawl dir: {FIRECRAWL_DIR}")

    total_updated = 0
    for school_id, filename in SCHOOL_FILES.items():
        log(f"\n--- {school_id} ---")
        n = enrich_school(school_id, filename, client)
        total_updated += n

    log(f"\n=== Done: {total_updated} rows enriched ===")


if __name__ == "__main__":
    main()
