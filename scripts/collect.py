#!/usr/bin/env python3
"""
Veille SMA — Script de collecte quotidienne
Recupere les pubs Meta Ad Library, prend les screenshots, uploade sur Vercel Blob,
et met a jour data/ads.json dans le repo.
"""

import os
import sys
import json
import time
import hashlib
from pathlib import Path
from datetime import datetime

import requests
import vercel_blob
from playwright.sync_api import sync_playwright

# Import TikTok collector module
from tiktok_collector import process_tiktok_advertiser

# --- CONFIG ---
META_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
BLOB_TOKEN = os.environ.get("BLOB_READ_WRITE_TOKEN", "")

# Only require tokens when running in meta or all mode (not tiktok-only)
_mode = sys.argv[2] if len(sys.argv) > 2 and sys.argv[1] == "--mode" else "all"
if _mode != "tiktok":
    if not META_TOKEN:
        print("ERROR: META_ACCESS_TOKEN is missing", file=sys.stderr)
        sys.exit(1)
    if not BLOB_TOKEN:
        print("ERROR: BLOB_READ_WRITE_TOKEN is missing", file=sys.stderr)
        sys.exit(1)

# vercel_blob reads token from env var BLOB_READ_WRITE_TOKEN automatically
REPO_ROOT = Path(__file__).parent.parent
PUBLIC_DATA_DIR = REPO_ROOT / "public" / "data"
PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)
CONFIG_FILE = REPO_ROOT / "data" / "advertisers.json"  # config stays in /data
OUTPUT_FILE = PUBLIC_DATA_DIR / "ads.json"  # output goes to /public/data (served statically)
SCREENSHOTS_DIR = REPO_ROOT / "data" / "screenshots"  # temp local, uploaded to blob
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
(REPO_ROOT / "data").mkdir(exist_ok=True)

META_API_VERSION = "v25.0"
META_BASE_URL = f"https://graph.facebook.com/{META_API_VERSION}/ads_archive"

AD_FIELDS = [
    "id", "ad_delivery_start_time", "ad_delivery_stop_time",
    "ad_creative_bodies", "ad_creative_link_titles", "ad_creative_link_descriptions",
    "ad_creative_link_captions", "ad_snapshot_url",
    "publisher_platforms", "languages",
    "page_id", "page_name",
    "target_ages", "target_gender", "target_locations",
    "eu_total_reach", "age_country_gender_reach_breakdown",
    "beneficiary_payers",
]


def log(msg):
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def load_advertisers():
    """Load the list of advertisers to track from data/advertisers.json."""
    if not CONFIG_FILE.exists():
        # Default config with ESG Rennes
        default = [
            {
                "id": "esg",
                "name": "ESG Rennes",
                "tags": ["Ecoles de commerce"],
                "pageId": "278213829757",
                "platform": "Meta",
            }
        ]
        CONFIG_FILE.write_text(json.dumps(default, ensure_ascii=False, indent=2))
        return default
    return json.loads(CONFIG_FILE.read_text())


def fetch_ads(page_id, max_pages=20):
    """Fetch all active ads for a given page_id from Meta Ad Library API."""
    all_ads = []
    url = META_BASE_URL
    params = {
        "access_token": META_TOKEN,
        "ad_reached_countries": "['FR']",
        "search_page_ids": f"[{page_id}]",
        "ad_active_status": "ACTIVE",
        "fields": ",".join(AD_FIELDS),
        "limit": 25,
    }
    page_count = 0
    while url and page_count < max_pages:
        page_count += 1
        log(f"  Fetching page {page_count} for page_id={page_id}")
        try:
            r = requests.get(url, params=params if page_count == 1 else None, timeout=30)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            log(f"  ERROR fetching page {page_count}: {e}")
            break

        ads = data.get("data", [])
        all_ads.extend(ads)
        log(f"  Got {len(ads)} ads (total: {len(all_ads)})")

        # Pagination
        next_url = data.get("paging", {}).get("next")
        if not next_url:
            break
        url = next_url
        params = None  # next URL already has all params
        time.sleep(0.5)  # be gentle with API

    return all_ads


def group_creatives(ads):
    """Group ads by creative (based on first 80 chars of body)."""
    groups = {}
    for ad in ads:
        body = (ad.get("ad_creative_bodies") or [""])[0]
        key = body[:80]
        if key not in groups:
            groups[key] = {
                "n": 0, "r": 0, "ids": [], "snapshotIds": [],
                "b": body[:200],
                "t": (ad.get("ad_creative_link_titles") or [""])[0],
                "p": set(),
                "ta": ad.get("target_ages", []),
                "tg": ad.get("target_gender", ""),
                "tl": [l.get("name", "") for l in (ad.get("target_locations") or [])],
                "s": ad.get("ad_delivery_start_time", ""),
                "d": {},
                "snapshotUrls": [],
            }
        g = groups[key]
        g["n"] += 1
        g["r"] += (ad.get("eu_total_reach", 0) or 0)
        g["ids"].append(ad["id"])
        g["snapshotIds"].append(ad["id"])
        snap_url = ad.get("ad_snapshot_url")
        if snap_url:
            g["snapshotUrls"].append(snap_url)
        g["p"].update(ad.get("publisher_platforms", []))
        # Track earliest start date
        s = ad.get("ad_delivery_start_time", "")
        if s and (not g["s"] or s < g["s"]):
            g["s"] = s
        # Aggregate demographics
        for entry in (ad.get("age_country_gender_reach_breakdown") or []):
            for ag in entry.get("age_gender_breakdowns", []):
                ar = ag.get("age_range", "")
                if ar == "Unknown":
                    continue
                if ar not in g["d"]:
                    g["d"][ar] = [0, 0, 0]
                g["d"][ar][0] += ag.get("male", 0)
                g["d"][ar][1] += ag.get("female", 0)
                g["d"][ar][2] += ag.get("unknown", 0)

    # Convert sets to lists
    result = []
    for key, g in groups.items():
        g["p"] = sorted(list(g["p"]))
        result.append(g)
    # Sort by reach desc
    result.sort(key=lambda x: -x["r"])
    return result


def extract_ad_image_url(page, ad_id, snapshot_url):
    """Extract the ad creative image URL and lead form questions using Playwright.
    Returns a dict with 'image_url' and 'lead_form_questions'."""
    result = {"image_url": None, "lead_form_questions": []}
    try:
        if not snapshot_url:
            return result
        log(f"  Extracting image for ad {ad_id}")
        
        # Navigate to the snapshot URL (contains valid token, renders ad creative)
        page.goto(snapshot_url, timeout=30000, wait_until="domcontentloaded")
        time.sleep(3)
        
        # Extract all image URLs from the rendered page
        img_urls = page.evaluate("""() => {
            const results = [];
            document.querySelectorAll('img').forEach(img => {
                if (img.src && img.src.startsWith('https://') && img.naturalWidth > 50) {
                    results.push({src: img.src, w: img.naturalWidth, h: img.naturalHeight});
                }
            });
            document.querySelectorAll('*').forEach(el => {
                const bg = getComputedStyle(el).backgroundImage;
                if (bg && bg.startsWith('url("https://')) {
                    results.push({src: bg.slice(5, -2), w: 0, h: 0});
                }
            });
            document.querySelectorAll('video').forEach(v => {
                if (v.poster && v.poster.startsWith('https://')) {
                    results.push({src: v.poster, w: v.videoWidth || 100, h: v.videoHeight || 100});
                }
            });
            return results;
        }""")
        
        if img_urls:
            good_imgs = [
                img for img in img_urls
                if 'emoji' not in img['src'] 
                and 'icon' not in img['src']
                and 'logo' not in img['src']
                and 'empty' not in img['src']
                and 'static' not in img['src']
                and 'rsrc.php' not in img['src']
            ]
            if good_imgs:
                good_imgs.sort(key=lambda x: -(x.get('w', 0) * x.get('h', 0)))
                result["image_url"] = good_imgs[0]['src']
                log(f"  Found image: {result['image_url'][:80]}...")
        
        # Extract lead form questions if present
        # Facebook renders lead forms with input fields, labels, select dropdowns
        lead_data = page.evaluate("""() => {
            const questions = [];
            const body = document.body?.innerText || '';
            
            // Strategy 1: Find form-like elements (inputs, selects, textareas with labels)
            const formElements = document.querySelectorAll('input, select, textarea');
            formElements.forEach(el => {
                // Skip hidden/tiny elements
                if (el.offsetHeight < 5 || el.type === 'hidden') return;
                
                // Find the label — could be a <label>, aria-label, placeholder, or nearby text
                let label = '';
                if (el.getAttribute('aria-label')) label = el.getAttribute('aria-label');
                else if (el.getAttribute('placeholder')) label = el.getAttribute('placeholder');
                else if (el.id) {
                    const labelEl = document.querySelector('label[for="' + el.id + '"]');
                    if (labelEl) label = labelEl.textContent.trim();
                }
                // Try parent/sibling text
                if (!label) {
                    const parent = el.closest('div, fieldset, section');
                    if (parent) {
                        const textNodes = parent.querySelectorAll('span, label, div, p');
                        for (const tn of textNodes) {
                            const t = tn.textContent.trim();
                            if (t && t.length > 2 && t.length < 200 && !t.includes('\\n')) {
                                label = t;
                                break;
                            }
                        }
                    }
                }
                
                if (label) {
                    const type = el.tagName.toLowerCase() === 'select' ? 'select' : 
                                 el.type === 'email' ? 'email' :
                                 el.type === 'tel' ? 'phone' :
                                 el.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text';
                    
                    // Get select options if applicable
                    let options = [];
                    if (el.tagName.toLowerCase() === 'select') {
                        el.querySelectorAll('option').forEach(opt => {
                            if (opt.value && opt.textContent.trim()) options.push(opt.textContent.trim());
                        });
                    }
                    
                    questions.push({label, type, options: options.length ? options : undefined});
                }
            });
            
            // Strategy 2: Look for common lead form text patterns in page content
            // Facebook lead forms often show questions as text blocks
            const patterns = [
                /(?:pr[eé]nom|first\s*name)/i,
                /(?:nom|last\s*name|family)/i,
                /(?:e-?mail|courriel)/i,
                /(?:t[eé]l[eé]phone|phone|num[eé]ro)/i,
                /(?:ville|city|code\s*postal)/i,
                /(?:formation|programme|cursus|dipl[oô]me)/i,
                /(?:niveau\s*d'[eé]tudes?|bac|licence|master)/i,
                /(?:alternance|initial|apprentissage)/i,
                /(?:campus|ville\s*souhait)/i,
                /(?:date\s*de\s*naissance|birthday)/i,
                /(?:comment\s*(?:avez-vous|nous|as-tu))/i,
            ];
            
            // Check if any pattern appears in visible text near form elements
            const hasForm = body.toLowerCase().includes('formulaire') || 
                           body.toLowerCase().includes('inscription') ||
                           body.toLowerCase().includes('candidat') ||
                           body.toLowerCase().includes('submit') ||
                           body.toLowerCase().includes('envoyer') ||
                           formElements.length > 2;
            
            return {questions, hasForm, formElementCount: formElements.length};
        }""")
        
        if lead_data.get("questions"):
            # Deduplicate by label
            seen = set()
            unique_questions = []
            for q in lead_data["questions"]:
                key = q["label"].lower().strip()
                if key not in seen and len(key) > 1:
                    seen.add(key)
                    unique_questions.append(q)
            result["lead_form_questions"] = unique_questions
            if unique_questions:
                log(f"  Found {len(unique_questions)} lead form questions for ad {ad_id}")
                for q in unique_questions[:5]:
                    log(f"    Q: {q['label']} ({q['type']})")
        
        if not result["image_url"]:
            log(f"  No image found for ad {ad_id}, page title: {page.title()}")
        
        return result
    except Exception as e:
        log(f"  ERROR extracting {ad_id}: {e}")
        return result


def upload_to_blob(file_path, ad_id):
    """Upload a screenshot to Vercel Blob and return the public URL."""
    try:
        with open(file_path, "rb") as f:
            data = f.read()
        # Use a stable path so re-uploads overwrite
        resp = vercel_blob.put(
            f"screenshots/{ad_id}.png",
            data,
            {"addRandomSuffix": "false", "contentType": "image/png", "allowOverwrite": "true"},
        )
        return resp.get("url")
    except Exception as e:
        log(f"  ERROR uploading {ad_id}: {e}")
        return None


def process_advertiser(adv, browser):
    """Fetch ads + capture screenshots for one advertiser (supports multiple pageIds)."""
    # Support both "pageId" (single) and "pageIds" (array)
    page_ids = adv.get("pageIds", [])
    if not page_ids:
        single = adv.get("pageId", "")
        if single:
            page_ids = [single]
    if not page_ids:
        log(f"  No pageId(s) for {adv['name']}, skipping")
        return None

    log(f"\n=== Processing {adv['name']} ({len(page_ids)} page(s): {', '.join(page_ids)}) ===")

    # Fetch ads from all pages
    all_ads = []
    for pid in page_ids:
        ads = fetch_ads(pid)
        log(f"  Page {pid}: {len(ads)} ads")
        all_ads.extend(ads)

    if not all_ads:
        log(f"  No ads found for {adv['name']}")
        return None

    log(f"  Total ads retrieved: {len(all_ads)}")
    groups = group_creatives(all_ads)
    log(f"  Grouped into {len(groups)} unique creatives")

    total_reach = sum(g["r"] for g in groups)

    # Store the Ad Library link for each creative (for "Voir la pub" button)
    # AND extract creative images via Playwright — only for top 10 creatives (by reach) to save time
    context = browser.new_context(
        viewport={"width": 500, "height": 700},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    pw_page = context.new_page()
    
    preview_count = 0
    max_previews = 5  # Top 5 creatives get preview images
    
    for g in groups:
        if g["ids"]:
            g["adLibraryUrl"] = f"https://www.facebook.com/ads/library/?id={g['ids'][0]}"
        # Try to extract the image + lead form questions — only for top creatives
        if preview_count < max_previews and g.get("snapshotUrls"):
            ad_id = g["ids"][0]
            snap_url = g["snapshotUrls"][0]
            extracted = extract_ad_image_url(pw_page, ad_id, snap_url)
            if extracted.get("image_url"):
                g["previewUrl"] = extracted["image_url"]
            if extracted.get("lead_form_questions"):
                g["leadFormQuestions"] = extracted["lead_form_questions"]
            preview_count += 1
            time.sleep(0.5)
    
    context.close()
    log(f"  Extracted {preview_count} previews for {adv['name']}")

    # Extract payer info from first ad
    payer = ""
    for ad in all_ads:
        bp = ad.get("beneficiary_payers", [])
        if bp:
            payer = bp[0].get("payer", "") if isinstance(bp[0], dict) else ""
            break

    return {
        "id": adv["id"],
        "name": adv["name"],
        "tags": adv.get("tags", []),
        "pageIds": page_ids,
        "platform": "Meta",
        "totalAds": len(all_ads),
        "totalReach": total_reach,
        "payer": payer,
        "collectedAt": datetime.now().isoformat(timespec="seconds"),
        "groups": groups,
        "tiktokBizIds": adv.get("tiktokBizIds", []),
        "tiktokFilter": adv.get("tiktokFilter", []),
    }


def process_advertiser_full(adv, browser):
    """Process an advertiser for both Meta and TikTok."""
    result = None
    
    # Meta collection
    page_ids = adv.get("pageIds", [])
    if not page_ids:
        single = adv.get("pageId", "")
        if single:
            page_ids = [single]
    
    if page_ids:
        result = process_advertiser(adv, browser)
    
    # TikTok collection (if tiktokName or tiktokBizIds is configured)
    tiktok_name = adv.get("tiktokName", "")
    tiktok_biz_ids = adv.get("tiktokBizIds", [])
    if tiktok_name or tiktok_biz_ids:
        tiktok_result = process_tiktok_advertiser(adv, browser)
        if tiktok_result:
            if result:
                # Merge TikTok data into existing Meta result
                result["tiktok"] = {
                    "totalAds": tiktok_result["totalAds"],
                    "totalReach": tiktok_result["totalReach"],
                    "groups": tiktok_result["groups"],
                }
                # Add TikTok groups to main groups list (marked with platform=tiktok)
                for g in tiktok_result["groups"]:
                    g["platform_source"] = "TikTok"
                    result["groups"].append(g)
                result["totalAds"] += tiktok_result["totalAds"]
                result["totalReach"] += tiktok_result["totalReach"]
            else:
                # TikTok only (no Meta pages configured)
                result = {
                    "id": adv["id"],
                    "name": adv["name"],
                    "tags": adv.get("tags", []),
                    "pageIds": [],
                    "platform": "TikTok",
                    "totalAds": tiktok_result["totalAds"],
                    "totalReach": tiktok_result["totalReach"],
                    "payer": "",
                    "collectedAt": datetime.now().isoformat(timespec="seconds"),
                    "groups": tiktok_result["groups"],
                    "tiktok": tiktok_result,
                }
    
    if not result:
        log(f"  No Meta pages or TikTok name configured for {adv['name']}")
    
    return result


HISTORY_FILE = REPO_ROOT / "public" / "data" / "history.json"


def load_history():
    """Load reach history from previous runs."""
    if HISTORY_FILE.exists():
        try:
            return json.loads(HISTORY_FILE.read_text())
        except Exception:
            return {"days": {}, "advertisers": {}}
    return {"days": {}, "advertisers": {}}


def update_history(history, results):
    """Add today's reach data to the history and compute 7-day reach by creative delta.
    
    Reach 7j calculation:
    - Each day, we record the cumulative reach per creative (from Meta API)
    - Daily reach = today's cumulative - yesterday's cumulative (per creative)
    - Reach 7j = sum of daily deltas over last 7 days (per creative)
    - Advertiser reach 7j = sum of all its creatives' reach 7j
    """
    today = datetime.now().strftime("%Y-%m-%d")

    # Initialize history structures if needed
    if "groups" not in history:
        history["groups"] = {}

    for adv in results:
        adv_id = adv["id"]
        adv_reach = adv["totalReach"]
        adv_ads = adv["totalAds"]

        # Store advertiser-level daily snapshot
        if adv_id not in history["advertisers"]:
            history["advertisers"][adv_id] = {}
        history["advertisers"][adv_id][today] = {
            "reach": adv_reach,
            "ads": adv_ads,
        }

        # Store per-creative daily reach snapshots
        adv_reach_7d = 0
        adv_delta_1d = 0

        for g in adv.get("groups", []):
            # Use ad ID as key (more stable than text body)
            gid = g["ids"][0] if g.get("ids") else g.get("b", "")[:60]
            group_key = f"{adv_id}:{gid}"
            cumulative_reach = g["r"]

            if group_key not in history["groups"]:
                history["groups"][group_key] = {}
            history["groups"][group_key][today] = cumulative_reach

            # Compute daily delta for this creative
            group_dates = sorted(history["groups"][group_key].keys())
            
            # Delta vs yesterday (J-1)
            if len(group_dates) >= 2:
                yesterday = group_dates[-2]
                yesterday_reach = history["groups"][group_key][yesterday]
                daily_delta = max(0, cumulative_reach - yesterday_reach)
                adv_delta_1d += daily_delta
            
            # 7-day reach = sum of daily deltas over last 7 days
            if len(group_dates) >= 2:
                # Get dates for last 7 days
                last_dates = group_dates[-8:]  # need 8 to compute 7 deltas
                group_7d = 0
                for i in range(1, len(last_dates)):
                    d_prev = history["groups"][group_key][last_dates[i-1]]
                    d_curr = history["groups"][group_key][last_dates[i]]
                    group_7d += max(0, d_curr - d_prev)
                adv_reach_7d += group_7d
            else:
                # First day — no delta available, use 0
                pass

        # Set advertiser-level metrics
        if adv_reach_7d > 0:
            adv["reach7d"] = adv_reach_7d
        else:
            # Not enough history yet — show total reach as placeholder
            adv["reach7d"] = adv_reach

        adv["reachDelta"] = adv_delta_1d
        adv["reachDeltaPct"] = round(adv_delta_1d / max(adv_reach - adv_delta_1d, 1) * 100, 1) if adv_delta_1d else 0

    # Keep only last 90 days of history to avoid bloat
    for adv_id, adv_hist in history["advertisers"].items():
        adv_dates = sorted(adv_hist.keys())
        if len(adv_dates) > 90:
            for old_date in adv_dates[:-90]:
                del adv_hist[old_date]
    for gk, gh in list(history["groups"].items()):
        g_dates = sorted(gh.keys())
        if len(g_dates) > 90:
            for old_date in g_dates[:-90]:
                del gh[old_date]
        # Remove empty groups
        if not gh:
            del history["groups"][gk]

    return history


def main():
    import sys
    mode = "all"
    if len(sys.argv) > 1 and sys.argv[1] == "--mode":
        mode = sys.argv[2] if len(sys.argv) > 2 else "all"
    
    log(f"=== Veille SMA — Collecte quotidienne (mode: {mode}) ===")
    advertisers = load_advertisers()
    log(f"Loaded {len(advertisers)} advertiser(s) to track")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)

        results = []
        for adv in advertisers:
            try:
                if mode == "meta":
                    # Meta only — skip TikTok
                    page_ids = adv.get("pageIds", [])
                    if not page_ids:
                        single = adv.get("pageId", "")
                        if single:
                            page_ids = [single]
                    if page_ids:
                        result = process_advertiser(adv, browser)
                        if result:
                            results.append(result)
                    else:
                        log(f"  Skipping {adv['name']} (no Meta pageIds)")
                elif mode == "tiktok":
                    # TikTok only
                    tiktok_biz_ids = adv.get("tiktokBizIds", [])
                    tiktok_name = adv.get("tiktokName", "")
                    if tiktok_biz_ids or tiktok_name:
                        tiktok_result = process_tiktok_advertiser(adv, browser)
                        if tiktok_result:
                            results.append({
                                "id": adv["id"],
                                "name": adv["name"],
                                "tags": adv.get("tags", []),
                                "pageIds": [],
                                "platform": "TikTok",
                                "totalAds": tiktok_result["totalAds"],
                                "totalReach": tiktok_result["totalReach"],
                                "payer": "",
                                "collectedAt": datetime.now().isoformat(timespec="seconds"),
                                "groups": tiktok_result["groups"],
                                "tiktok": tiktok_result,
                            })
                    else:
                        log(f"  Skipping {adv['name']} (no TikTok config)")
                else:
                    # All — both Meta and TikTok
                    result = process_advertiser_full(adv, browser)
                    if result:
                        results.append(result)
            except Exception as e:
                log(f"ERROR processing {adv['name']}: {e}")

        browser.close()

    if mode == "tiktok":
        # TikTok mode: write to a separate file, merge later with Meta data
        tiktok_file = REPO_ROOT / "public" / "data" / "tiktok.json"
        if not results:
            log(f"\nNo TikTok data collected — keeping existing {tiktok_file}")
            log("Done.")
            return
        output = {
            "collectedAt": datetime.now().isoformat(timespec="seconds"),
            "advertisers": results,
        }
        tiktok_file.write_text(json.dumps(output, ensure_ascii=False, indent=2))
        log(f"\nWrote {tiktok_file} ({len(results)} TikTok advertiser(s))")
    elif mode == "meta":
        # Ensure ALL advertisers from config appear in results, even without data
        result_ids = {r["id"] for r in results}
        for adv in advertisers:
            if adv["id"] not in result_ids:
                results.append({
                    "id": adv["id"],
                    "name": adv["name"],
                    "tags": adv.get("tags", []),
                    "pageIds": adv.get("pageIds", []),
                    "platform": "Meta",
                    "totalAds": 0,
                    "totalReach": 0,
                    "payer": "",
                    "collectedAt": datetime.now().isoformat(timespec="seconds"),
                    "groups": [],
                    "tiktokBizIds": adv.get("tiktokBizIds", []),
                    "tiktokFilter": adv.get("tiktokFilter", []),
                })
                log(f"  Added {adv['name']} to results (no data yet)")

        # Meta mode: write ads.json, then merge TikTok data if available
        tiktok_file = REPO_ROOT / "public" / "data" / "tiktok.json"
        if tiktok_file.exists():
            try:
                tiktok_data = json.loads(tiktok_file.read_text())
                tiktok_advs = {a["id"]: a for a in tiktok_data.get("advertisers", [])}
                log(f"Merging {len(tiktok_advs)} TikTok advertiser(s) into Meta data")
                for result in results:
                    tk = tiktok_advs.get(result["id"])
                    if tk:
                        result["tiktok"] = tk.get("tiktok", {})
                        for g in tk.get("groups", []):
                            g["platform_source"] = "TikTok"
                            result["groups"].append(g)
                        result["totalAds"] += tk.get("totalAds", 0)
                        result["totalReach"] += tk.get("totalReach", 0)
                # Add TikTok-only advertisers (no Meta pages)
                meta_ids = {r["id"] for r in results}
                for tk_id, tk_adv in tiktok_advs.items():
                    if tk_id not in meta_ids:
                        results.append(tk_adv)
            except Exception as e:
                log(f"Warning: could not merge TikTok data: {e}")

        # Update history and write
        history = load_history()
        history = update_history(history, results)
        output = {
            "collectedAt": datetime.now().isoformat(timespec="seconds"),
            "advertisers": results,
        }
        OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2))
        HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2))
        log(f"\nWrote {OUTPUT_FILE} ({len(results)} advertiser(s), {sum(a['totalAds'] for a in results)} ads total)")
        log(f"Wrote {HISTORY_FILE} ({len(history['days'])} day(s) of history)")
    else:
        # All mode (legacy)
        history = load_history()
        history = update_history(history, results)
        output = {
            "collectedAt": datetime.now().isoformat(timespec="seconds"),
            "advertisers": results,
        }
        OUTPUT_FILE.write_text(json.dumps(output, ensure_ascii=False, indent=2))
        HISTORY_FILE.write_text(json.dumps(history, ensure_ascii=False, indent=2))
        log(f"\nWrote {OUTPUT_FILE} ({len(results)} advertiser(s), {sum(a['totalAds'] for a in results)} ads total)")
        log(f"Wrote {HISTORY_FILE} ({len(history['days'])} day(s) of history)")

    log("Done.")


if __name__ == "__main__":
    main()
