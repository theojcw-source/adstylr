#!/usr/bin/env python3
"""
Parse firecrawl scrape files and print SQL UPDATE statements
to enrich veille_meta_ads metadata for non-prepart schools.
Usage: python3 scripts/enrich-veille-kpis.py | psql <connection_string>
Or copy the output into the Supabase SQL editor.
"""

import json
import re
import sys
from datetime import date

FIRECRAWL_DIR = ".firecrawl"
TODAY = date(2026, 6, 4)

FR_MONTHS = {
    'jan': 1, 'janv': 1, 'fév': 2, 'févr': 2, 'mar': 3, 'mars': 3,
    'avr': 4, 'mai': 5, 'juin': 6, 'juil': 7, 'juill': 7,
    'août': 8, 'sep': 9, 'sept': 9, 'oct': 10, 'nov': 11, 'déc': 12,
}

SCHOOL_FILES = {
    'brassart': 'scrape-brassart-adlibrary.json',
    'gobelins': 'scrape-gobelins-adlibrary.json',
    'mjm':      'scrape-mjm-adlibrary.json',
    'pivaut':   'scrape-pivaut-keyword-adlibrary.json',
    'rubika':   'scrape-rubika-keyword-adlibrary.json',
}


def parse_fr_date(raw: str) -> date | None:
    m = re.match(r'(\d+)\s+(\w+)\s+(\d{4})', raw.strip())
    if not m:
        return None
    day, month_str, year = int(m.group(1)), m.group(2).lower()[:5], int(m.group(3))
    month = FR_MONTHS.get(month_str)
    if not month:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def clean_copy(text: str) -> str:
    text = re.sub(r'\[!\[.*?\]\(.*?\)\]\(.*?\)', '', text)
    text = re.sub(r'!\[.*?\]\(.*?\)', '', text)
    text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
    text = re.sub(r'\*\*|\*|__', '', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def parse_ads_from_markdown(md: str) -> list[dict]:
    blocks = re.split(r'\* \* \*', md)
    ads = []
    for block in blocks:
        lib_id_m = re.search(r'ID dans la biblioth[eè]que\s*:\s*(\d+)', block)
        if not lib_id_m:
            continue

        lib_id = lib_id_m.group(1)

        date_m = re.search(r'Début de diffusion le (.+?)[\n\r]', block)
        start_date = None
        days_active = None
        if date_m:
            parsed = parse_fr_date(date_m.group(1))
            if parsed:
                start_date = parsed
                days_active = (TODAY - parsed).days

        # Copy text: everything after **Sponsorisé** until next image/link block
        copy_m = re.search(r'\*\*Sponsorisé\*\*\s*\n+(.*?)(?=\n\[|\n!\[|\Z)', block, re.DOTALL)
        copy = clean_copy(copy_m.group(1)) if copy_m else None
        if copy and len(copy) > 300:
            copy = copy[:300]

        low_impressions = bool(re.search(r'Nombre faible d.impressions', block))
        impressions_m = re.search(r'Impressions?\s*:\s*(\S+)', block)
        impressions_str = impressions_m.group(1) if impressions_m else None

        lib_url = f"https://www.facebook.com/ads/library/?id={lib_id}"

        ads.append({
            'lib_id': lib_id,
            'lib_url': lib_url,
            'start_date': str(start_date) if start_date else None,
            'start_raw': date_m.group(1).strip() if date_m else None,
            'days_active': days_active,
            'copy': copy,
            'low_impressions': low_impressions,
            'impressions_str': impressions_str,
        })
    return ads


def compute_score(days_active: int | None, ordinal: int, total: int) -> int:
    """
    Score 0-100 based on days_active (longevity = spend signal)
    plus a position bonus (Meta sorts by total impressions desc).
    """
    d = days_active or 0
    position_bonus = max(0, total - ordinal)  # earlier = higher impressions
    raw = d + position_bonus
    return min(100, raw)


def main():
    print("-- Auto-generated KPI enrichment for veille_meta_ads")
    print("-- Run on 2026-06-04\n")

    for school_id, filename in SCHOOL_FILES.items():
        path = f"{FIRECRAWL_DIR}/{filename}"
        try:
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        except FileNotFoundError:
            print(f"-- WARNING: {path} not found, skipping {school_id}", file=sys.stderr)
            continue

        md = data.get('markdown', '')
        ads = parse_ads_from_markdown(md)

        if not ads:
            print(f"-- WARNING: no ads parsed for {school_id}", file=sys.stderr)
            continue

        total = len(ads)
        print(f"-- {school_id}: {total} ads parsed from {filename}")

        for i, ad in enumerate(ads):
            ordinal = i + 1
            score = compute_score(ad['days_active'], ordinal, total)

            patch = {
                "meta_library_id": ad['lib_id'],
                "meta_library_url": ad['lib_url'],
                "start_date": ad['start_date'],
                "start_raw": ad['start_raw'],
                "days_active": ad['days_active'],
                "copy_text": ad['copy'],
                "score": score,
                "low_impressions": ad['low_impressions'],
                "impressions_str": ad['impressions_str'],
            }

            # Use dollar-quoting to safely embed arbitrary JSON
            patch_json = json.dumps(patch, ensure_ascii=False)

            print(
                f"UPDATE veille_meta_ads\n"
                f"SET metadata = metadata || $patch${patch_json}$patch$::jsonb\n"
                f"WHERE school_id = '{school_id}' AND ordinal = {ordinal};\n"
            )

        print()

    print("-- Done")


if __name__ == '__main__':
    main()
