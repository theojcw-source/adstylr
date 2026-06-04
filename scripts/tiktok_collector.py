"""
TikTok Ad Library Scraper
Scrapes ads from library.tiktok.com for given advertiser names.
Uses Playwright to load the page and extract ad data from the JSON responses.
"""

import json
import os
import time
import re
import requests as http_requests
from datetime import datetime

try:
    import vercel_blob
    HAS_BLOB = bool(os.environ.get("BLOB_READ_WRITE_TOKEN"))
except ImportError:
    HAS_BLOB = False


def log(msg):
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def upload_thumbnail_to_blob(image_url, ad_id):
    """Download a thumbnail image and upload it to Vercel Blob for permanent storage."""
    if not HAS_BLOB:
        return None
    try:
        r = http_requests.get(image_url, timeout=15, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        if r.status_code != 200 or len(r.content) < 1000:
            log(f"  TikTok: Failed to download thumbnail for {ad_id}: HTTP {r.status_code}")
            return None
        
        content_type = r.headers.get("content-type", "image/jpeg")
        ext = "jpg" if "jpeg" in content_type else "png" if "png" in content_type else "webp" if "webp" in content_type else "jpg"
        
        resp = vercel_blob.put(
            f"tiktok-thumbs/{ad_id}.{ext}",
            r.content,
            {"addRandomSuffix": "false", "contentType": content_type, "allowOverwrite": "true"},
        )
        blob_url = resp.get("url")
        if blob_url:
            log(f"  TikTok: Uploaded thumbnail for {ad_id}: {blob_url[:80]}...")
        return blob_url
    except Exception as e:
        log(f"  TikTok: Error uploading thumbnail for {ad_id}: {e}")
        return None


def fetch_tiktok_ads(browser, advertiser_name="", biz_ids=None, max_pages=5):
    """Scrape TikTok Ad Library for a given advertiser.
    Uses adv_biz_ids if provided (most precise), otherwise falls back to name search.
    Fetches ads from the last 7 days.
    Returns a list of ad dicts.
    """
    log(f"  TikTok: Searching ads — name='{advertiser_name}', biz_ids={biz_ids}")
    
    context = browser.new_context(
        viewport={"width": 1280, "height": 900},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    )
    page = context.new_page()
    
    all_ads = []
    captured_responses = []
    all_intercepted_urls = []
    
    # Intercept ALL network responses to find the right API endpoint
    def handle_response(response):
        try:
            url = response.url
            status = response.status
            # Log all API-like responses for debugging
            if "library.tiktok.com/api" in url or "api/v1" in url or "api/v2" in url:
                all_intercepted_urls.append(f"[{status}] {url[:150]}")
                if status == 200:
                    try:
                        body = response.json()
                        captured_responses.append({"url": url, "body": body})
                        log(f"  TikTok API intercepted: {url[:100]}... (keys: {list(body.keys()) if isinstance(body, dict) else 'not dict'})")
                    except Exception as e:
                        log(f"  TikTok API response not JSON: {url[:100]}... ({e})")
            elif "tiktok" in url and ("/ad" in url or "search" in url or "query" in url):
                all_intercepted_urls.append(f"[{status}] {url[:150]}")
        except Exception:
            pass
    
    page.on("response", handle_response)
    
    try:
        # Time window: last 7 days
        now_ms = int(time.time() * 1000)
        seven_days_ago_ms = now_ms - (7 * 24 * 60 * 60 * 1000)
        
        # Build URL — prefer biz_ids (query_type=2), fallback to name (query_type=1)
        if biz_ids:
            biz_ids_str = ",".join(str(b) for b in biz_ids) if isinstance(biz_ids, list) else str(biz_ids)
            search_url = (
                f"https://library.tiktok.com/ads?"
                f"region=FR"
                f"&start_time={seven_days_ago_ms}"
                f"&end_time={now_ms}"
                f"&adv_name="
                f"&adv_biz_ids={biz_ids_str}"
                f"&query_type=2"
                f"&sort_type=last_shown_date,desc"
            )
        else:
            search_url = (
                f"https://library.tiktok.com/ads?"
                f"region=FR"
                f"&start_time={seven_days_ago_ms}"
                f"&end_time={now_ms}"
                f"&adv_name={advertiser_name.replace(' ', '+')}"
                f"&adv_biz_ids="
                f"&query_type=1"
                f"&sort_type=last_shown_date,desc"
            )
        
        log(f"  TikTok: Loading {search_url}")
        
        # Try loading with retry — TikTok sometimes blocks on first attempt
        for attempt in range(3):
            if attempt > 0:
                log(f"  TikTok: Retry attempt {attempt + 1}...")
                captured_responses.clear()
                all_intercepted_urls.clear()
                time.sleep(3)
            
            page.goto(search_url, timeout=25000, wait_until="domcontentloaded")
            log(f"  TikTok: Page loaded (attempt {attempt + 1}), waiting for content...")
            time.sleep(4)
            
            # Log page title
            log(f"  TikTok: Page title: '{page.title()}'")
            
            # Accept cookies if banner appears
            try:
                cookie_btn = page.locator("button:has-text('Accept'), button:has-text('Accepter'), [class*='accept']")
                if cookie_btn.count() > 0:
                    cookie_btn.first.click()
                    log(f"  TikTok: Accepted cookies")
                    time.sleep(2)
                    # Reload after accepting cookies
                    page.goto(search_url, timeout=25000, wait_until="domcontentloaded")
                    time.sleep(4)
            except Exception:
                pass
            
            # Wait for API responses
            time.sleep(3)
            
            # Check if we got JSON API responses
            has_data = any(
                isinstance(r.get("body"), dict) and "data" in r.get("body", {})
                for r in captured_responses
            )
            if has_data:
                log(f"  TikTok: Got API data on attempt {attempt + 1}")
                break
            else:
                log(f"  TikTok: No API data on attempt {attempt + 1}")
        
        log(f"  TikTok: Current URL: {page.url[:150]}")
        
        # Debug: log all intercepted URLs
        log(f"  TikTok: {len(all_intercepted_urls)} API URLs intercepted:")
        for u in all_intercepted_urls[:20]:
            log(f"    {u}")
        
        # Debug: log captured responses summary
        log(f"  TikTok: {len(captured_responses)} JSON responses captured")
        for i, resp in enumerate(captured_responses[:5]):
            body = resp["body"]
            if isinstance(body, dict):
                log(f"    Response {i}: url={resp['url'][:80]}..., keys={list(body.keys())}")
                if "data" in body:
                    data = body["data"]
                    if isinstance(data, dict):
                        log(f"      data keys: {list(data.keys())}")
                        # Log first items of any list found in data
                        for dk, dv in data.items():
                            if isinstance(dv, list) and len(dv) > 0:
                                log(f"      data['{dk}']: {len(dv)} items, first item keys: {list(dv[0].keys()) if isinstance(dv[0], dict) else type(dv[0])}")
                                if isinstance(dv[0], dict):
                                    log(f"      first item sample: {json.dumps(dv[0], default=str)[:400]}")
                    elif isinstance(data, list):
                        log(f"      data is a list: {len(data)} items")
                        if data and isinstance(data[0], dict):
                            log(f"      first item keys: {list(data[0].keys())}")
                            log(f"      first item sample: {json.dumps(data[0], default=str)[:400]}")
                if "total" in body:
                    log(f"      total: {body['total']}")
        
        # Try to extract ads from captured API responses
        for resp in captured_responses:
            body = resp["body"]
            if not isinstance(body, dict):
                continue
            
            data = body.get("data", None)
            
            # Try all possible structures:
            # 1. data.ads = [...] (expected from TikTok Commercial Content API)
            # 2. data = [...] (data is directly a list of ads)
            # 3. data.some_other_key = [...] (search results might use a different key)
            
            ads_list = []
            if isinstance(data, dict):
                # Try 'ads' key first
                if "ads" in data:
                    ads_list = data["ads"]
                else:
                    # Try any list in data that looks like ads
                    for key, val in data.items():
                        if isinstance(val, list) and len(val) > 0 and isinstance(val[0], dict):
                            # Check if items look like ads (have id or ad_id)
                            first = val[0]
                            if any(k in first for k in ["id", "ad_id", "ad", "first_shown_date", "advertiser"]):
                                log(f"  TikTok: Found ads in data['{key}'] ({len(val)} items)")
                                ads_list = val
                                break
            elif isinstance(data, list):
                ads_list = data
            
            for ad_item in ads_list:
                ad = parse_tiktok_ad(ad_item)
                if ad:
                    all_ads.append(ad)
        
        log(f"  TikTok: {len(all_ads)} ads extracted from API responses")
        
        # Method 2: If no API responses captured, extract from page DOM
        if not all_ads:
            log(f"  TikTok: No ads from API, trying DOM extraction...")
            
            # Debug: log page content snippet
            page_text = page.evaluate("() => document.body?.innerText?.substring(0, 500) || 'empty'")
            log(f"  TikTok: Page text preview: {page_text[:300]}")
            
            # Debug: count visible elements
            counts = page.evaluate("""() => ({
                imgs: document.querySelectorAll('img').length,
                videos: document.querySelectorAll('video').length,
                divs: document.querySelectorAll('div').length,
                buttons: document.querySelectorAll('button').length,
                links: document.querySelectorAll('a').length,
            })""")
            log(f"  TikTok: DOM elements: {counts}")
            
            all_ads = extract_from_dom(page)
            log(f"  TikTok: {len(all_ads)} ads extracted from DOM")
        
        # Scroll and load more (max 2 scrolls to stay fast)
        for page_num in range(1, 3):
            if not all_ads:
                break
            try:
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(2)
                
                new_count = 0
                for resp in captured_responses:
                    body = resp["body"]
                    if isinstance(body, dict) and "data" in body:
                        for ad_item in body["data"].get("ads", []):
                            ad = parse_tiktok_ad(ad_item)
                            if ad and ad["id"] not in [a["id"] for a in all_ads]:
                                all_ads.append(ad)
                                new_count += 1
                
                if new_count == 0:
                    break
                log(f"  TikTok: Scroll page {page_num + 1}: +{new_count} ads (total: {len(all_ads)})")
            except Exception:
                break
        
        log(f"  TikTok: Found {len(all_ads)} ads for '{advertiser_name}'")
        
        # Extract video thumbnails from the rendered page
        # The page shows video previews — we can grab poster/thumbnail URLs
        if all_ads:
            log(f"  TikTok: Extracting thumbnails and reach from page...")
            time.sleep(2)  # Let videos load
            
            # Extract ad cards data: thumbnails + reach text from the page
            card_data = page.evaluate("""() => {
                const cards = [];
                const thumbnails = [];
                
                // Strategy 1: find ad card containers and extract reach + thumbnail per card
                // TikTok Ad Library renders cards with video/image + metadata text
                const allText = document.body.innerText;
                
                // Find all reach-like text patterns in the page
                const reachPatterns = [];
                const textWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
                while (textWalker.nextNode()) {
                    const text = textWalker.currentValue.trim();
                    // Match patterns like "<1K", "1K", "10K", "100K", "1M", "1K-5K", "10K-50K" etc
                    if (/^[<>~]?\d+[KMkm]?\s*[-–]\s*\d+[KMkm]?$/.test(text) || /^[<>~]?\d+[KMkm]$/.test(text)) {
                        reachPatterns.push(text);
                    }
                    // Also match "Estimated audience: X" or "Impressions: X"
                    if (/impressions?|audience|reach|views/i.test(text) && /\d/.test(text)) {
                        reachPatterns.push(text);
                    }
                }
                
                // Get video posters
                document.querySelectorAll('video').forEach(v => {
                    if (v.poster && v.poster.startsWith('http')) {
                        thumbnails.push({type: 'poster', src: v.poster});
                    }
                });
                // Get large images
                document.querySelectorAll('img').forEach(img => {
                    if (img.src && img.src.startsWith('http') && img.naturalWidth > 80 && img.naturalHeight > 80) {
                        const src = img.src;
                        if (!src.includes('icon') && !src.includes('logo') && !src.includes('avatar') && !src.includes('emoji')) {
                            thumbnails.push({type: 'img', src: src, w: img.naturalWidth, h: img.naturalHeight});
                        }
                    }
                });
                // Background images
                document.querySelectorAll('[class*="card"], [class*="Card"], [class*="ad-"], [class*="creative"]').forEach(el => {
                    const bg = getComputedStyle(el).backgroundImage;
                    if (bg && bg.startsWith('url("http')) {
                        thumbnails.push({type: 'bg', src: bg.slice(5, -2)});
                    }
                });
                
                return {thumbnails, reachPatterns};
            }""")
            
            thumbnails = card_data.get("thumbnails", [])
            reach_patterns = card_data.get("reachPatterns", [])
            
            log(f"  TikTok: Found {len(thumbnails)} thumbnails, {len(reach_patterns)} reach patterns on page")
            for t in thumbnails[:5]:
                log(f"    thumb: {t['type']}: {t['src'][:100]}...")
            for r in reach_patterns[:10]:
                log(f"    reach text: '{r}'")
            
            # Assign reach values from DOM patterns to ads
            if reach_patterns:
                for i, ad in enumerate(all_ads):
                    if ad.get('reach', 0) == 0 and i < len(reach_patterns):
                        parsed = parse_reach_string(reach_patterns[i])
                        if parsed > 0:
                            ad['reach'] = parsed
                            ad['reach_str'] = reach_patterns[i]
                            log(f"  TikTok: Assigned reach '{reach_patterns[i]}' ({parsed}) to ad {ad['id']}")
            
            # Filter to good thumbnails
            good_thumbs = [t['src'] for t in thumbnails if t['type'] in ('poster', 'img') and 'tiktokcdn' in t.get('src', '')]
            if not good_thumbs:
                good_thumbs = [t['src'] for t in thumbnails if t['type'] in ('poster', 'img') and t.get('w', 100) > 50]
            if not good_thumbs:
                good_thumbs = [t['src'] for t in thumbnails if t['type'] in ('poster', 'img')]
            
            # Assign thumbnails to ads that don't have previews, and upload to Blob
            thumb_idx = 0
            for ad in all_ads:
                if not ad.get('previewUrl') and thumb_idx < len(good_thumbs):
                    thumb_url = good_thumbs[thumb_idx]
                    # Upload to Vercel Blob for permanent URL
                    blob_url = upload_thumbnail_to_blob(thumb_url, ad['id'])
                    if blob_url:
                        ad['previewUrl'] = blob_url
                    else:
                        ad['previewUrl'] = thumb_url  # fallback to CDN URL (may expire)
                    log(f"  TikTok: Assigned thumbnail to ad {ad['id']}: {ad['previewUrl'][:80]}...")
                    thumb_idx += 1
    except Exception as e:
        log(f"  TikTok ERROR for '{advertiser_name}': {e}")
    finally:
        context.close()
    
    return all_ads


def parse_tiktok_ad(ad_item):
    """Parse a TikTok ad from the library.tiktok.com API response.
    
    Actual format from api/v1/search:
    {
        "id": "1863061365787986",
        "name": "Galileo Global Education France",  // advertiser name
        "audit_status": "1",
        "type": "2",
        "first_shown_date": 1776729600000,  // timestamp ms
        "last_shown_date": 1776729600000,
        "videos": [{"video_url": "https://library.tiktok.com/api/v1/cdn/..."}],
        "image_urls": [...],
        "reach": "10K",  // or might not exist
        "ad_text": "...",
        "sor_audit_status": "..."
    }
    """
    try:
        # Handle both nested {"ad": {...}} and flat format
        ad_data = ad_item.get("ad", ad_item) if isinstance(ad_item, dict) else ad_item
        if not isinstance(ad_data, dict):
            return None
        
        ad_id = str(ad_data.get("id", ""))
        if not ad_id:
            return None
        
        # Advertiser name — could be in "name", "advertiser.business_name", etc.
        adv_name = ad_data.get("name", "")
        adv_data = ad_item.get("advertiser", {})
        if isinstance(adv_data, dict) and adv_data.get("business_name"):
            adv_name = adv_data["business_name"]
        
        # Parse reach — try multiple fields
        reach_str = ""
        reach_val = 0
        
        # Try estimated_audience first (from library.tiktok.com search API)
        estimated_audience = ad_data.get("estimated_audience", "")
        impression = ad_data.get("impression", "")
        spent = ad_data.get("spent", "")
        
        # Log these fields for debugging
        if estimated_audience or impression or spent:
            log(f"  TikTok ad {ad_id}: estimated_audience={estimated_audience}, impression={impression}, spent={spent}")
        
        # Use estimated_audience as reach (most relevant metric)
        if estimated_audience:
            if isinstance(estimated_audience, (int, float)):
                reach_val = int(estimated_audience)
                reach_str = str(estimated_audience)
            elif isinstance(estimated_audience, str):
                reach_str = estimated_audience
                reach_val = parse_reach_string(estimated_audience)
            elif isinstance(estimated_audience, dict):
                # Might be a range like {"min": "10K", "max": "50K"}
                reach_str = str(estimated_audience.get("max", "") or estimated_audience.get("min", "") or "")
                reach_val = parse_reach_string(reach_str)
        
        # Fallback to impression
        if not reach_val and impression:
            if isinstance(impression, (int, float)):
                reach_val = int(impression)
                reach_str = str(impression)
            elif isinstance(impression, str):
                reach_str = impression
                reach_val = parse_reach_string(impression)
            elif isinstance(impression, dict):
                reach_str = str(impression.get("max", "") or impression.get("min", "") or "")
                reach_val = parse_reach_string(reach_str)
        
        # Fallback to reach field
        if not reach_val:
            reach_data = ad_data.get("reach", "")
            if isinstance(reach_data, dict):
                reach_str = str(reach_data.get("unique_users_seen", "") or reach_data.get("unique_user_seen", "") or "")
            elif isinstance(reach_data, (str, int)):
                reach_str = str(reach_data)
            if not reach_str:
                reach_str = str(ad_data.get("unique_users_seen", "") or ad_data.get("unique_user_seen", "") or "")
            reach_val = parse_reach_string(reach_str)
        
        # Parse spent
        spent_str = ""
        if spent:
            if isinstance(spent, (int, float)):
                spent_str = f"{spent:.0f}€"
            elif isinstance(spent, str):
                spent_str = spent
            elif isinstance(spent, dict):
                spent_str = str(spent.get("max", "") or spent.get("min", "") or "")
        
        # Parse dates — timestamps in milliseconds
        first_shown_raw = ad_data.get("first_shown_date", "")
        last_shown_raw = ad_data.get("last_shown_date", "")
        
        def ts_to_date(ts):
            if not ts:
                return ""
            try:
                if isinstance(ts, (int, float)) and ts > 1000000000000:
                    return datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
                elif isinstance(ts, (int, float)) and ts > 1000000000:
                    return datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
                elif isinstance(ts, str) and len(ts) == 8:
                    return f"{ts[:4]}-{ts[4:6]}-{ts[6:8]}"
                return str(ts)
            except Exception:
                return str(ts)
        
        first_shown = ts_to_date(first_shown_raw)
        last_shown = ts_to_date(last_shown_raw)
        
        # Get image URLs
        image_urls = ad_data.get("image_urls", []) or []
        
        # Get video URLs — format: [{"video_url": "..."}] or [{"url": "..."}]
        videos = ad_data.get("videos", []) or []
        video_urls = []
        for v in videos:
            if isinstance(v, dict):
                vu = v.get("video_url", "") or v.get("url", "")
                if vu:
                    video_urls.append(vu)
            elif isinstance(v, str):
                video_urls.append(v)
        
        # Preview URL: prefer image, then construct video thumbnail
        preview_url = None
        if image_urls:
            preview_url = image_urls[0]
        
        # Ad text/copy — try multiple field names
        ad_text = (ad_data.get("ad_text", "") or ad_data.get("text", "") or 
                   ad_data.get("caption", "") or ad_data.get("ad_title", "") or "")
        
        log(f"  TikTok parsed ad {ad_id}: adv={adv_name[:30]}, reach={reach_str}, spent={spent_str}, images={len(image_urls)}, videos={len(video_urls)}, dates={first_shown}→{last_shown}")
        
        return {
            "id": ad_id,
            "platform": "TikTok",
            "reach": reach_val,
            "reach_str": reach_str,
            "spent": spent_str,
            "first_shown": first_shown,
            "last_shown": last_shown,
            "status": ad_data.get("audit_status", "active"),
            "text": ad_text,
            "image_urls": image_urls,
            "video_urls": video_urls,
            "previewUrl": preview_url,
            "advertiser_name": adv_name,
            "advertiser_id": str(ad_data.get("advertiser_id", "") or ""),
        }
    except Exception as e:
        log(f"  TikTok: Error parsing ad: {e}")
        return None


def extract_from_dom(page):
    """Extract TikTok ad data directly from the page DOM as a fallback."""
    try:
        ads_data = page.evaluate("""() => {
            const ads = [];
            // Try to find ad cards in the page
            const cards = document.querySelectorAll('[class*="AdCard"], [class*="ad-card"], [data-testid*="ad"]');
            cards.forEach(card => {
                try {
                    const id = card.getAttribute('data-ad-id') || card.getAttribute('data-id') || '';
                    const text = card.querySelector('[class*="text"], [class*="copy"], p')?.textContent || '';
                    const img = card.querySelector('img')?.src || '';
                    const video = card.querySelector('video')?.src || card.querySelector('video source')?.src || '';
                    const reach = card.querySelector('[class*="reach"], [class*="impression"]')?.textContent || '';
                    const advertiser = card.querySelector('[class*="advertiser"], [class*="brand"]')?.textContent || '';
                    
                    if (id || text) {
                        ads.push({
                            id: id || 'dom-' + ads.length,
                            text: text.trim(),
                            image_url: img,
                            video_url: video,
                            reach_text: reach.trim(),
                            advertiser: advertiser.trim(),
                        });
                    }
                } catch(e) {}
            });
            return ads;
        }""")
        
        result = []
        for ad in (ads_data or []):
            result.append({
                "id": ad.get("id", ""),
                "platform": "TikTok",
                "reach": parse_reach_string(ad.get("reach_text", "")),
                "reach_str": ad.get("reach_text", ""),
                "first_shown": "",
                "last_shown": "",
                "status": "active",
                "text": ad.get("text", ""),
                "image_urls": [ad["image_url"]] if ad.get("image_url") else [],
                "video_urls": [ad["video_url"]] if ad.get("video_url") else [],
                "previewUrl": ad.get("image_url") or None,
                "advertiser_name": ad.get("advertiser", ""),
                "advertiser_id": "",
            })
        return result
    except Exception as e:
        log(f"  TikTok: DOM extraction error: {e}")
        return []


def parse_reach_string(s):
    """Parse reach strings like '11K', '1.2M', '<1K', '1K-10K', '100K-200K' into numeric values.
    For ranges, uses geometric mean sqrt(min*max) which approximates the median
    of a log-normal distribution (most ads cluster at the low end of each range).
    Examples: 1K-10K -> 3162, 10K-100K -> 31623, 100K-200K -> 141421"""
    import math
    if not s:
        return 0
    s = str(s).strip().upper().replace(",", "").replace("<", "").replace(">", "").replace("~", "")
    
    def _parse_one(v):
        v = v.strip()
        if not v or v == "0":
            return 0
        try:
            if "M" in v:
                return int(float(v.replace("M", "")) * 1_000_000)
            elif "K" in v:
                return int(float(v.replace("K", "")) * 1_000)
            else:
                return int(float(v))
        except (ValueError, TypeError):
            return 0
    
    if "-" in s:
        parts = s.split("-")
        if len(parts) == 2:
            lo = _parse_one(parts[0])
            hi = _parse_one(parts[1])
            if lo > 0 and hi > 0:
                return int(math.sqrt(lo * hi))
            elif hi > 0:
                return int(hi * 0.3)
            elif lo > 0:
                return lo
    
    return _parse_one(s)


def group_tiktok_creatives(ads):
    """Group TikTok ads by creative ID (each ad is unique on TikTok)."""
    groups = {}
    for ad in ads:
        # On TikTok each ad is typically unique, so use ad ID as key
        key = ad["id"]
        
        if key not in groups:
            # Build a proper preview URL from video or image
            preview = ad.get("previewUrl") or None
            video_urls = ad.get("video_urls", [])
            
            # If no image preview but we have a video URL, use it
            # TikTok video CDN URLs can be used as video source
            if not preview and video_urls:
                # Use the video URL directly — the dashboard can show it
                preview = video_urls[0]
            
            # Build specific ad library URL with the advertiser biz_id
            adv_id = ad.get("advertiser_id", "")
            ad_id = ad["id"]
            ad_lib_url = f"https://library.tiktok.com/ads?region=FR&adv_biz_ids={adv_id}&query_type=2" if adv_id else f"https://library.tiktok.com/ads?region=FR"
            
            groups[key] = {
                "n": 1, "r": ad.get("reach", 0), "ids": [ad_id],
                "b": (ad.get("text", "") or ad.get("advertiser_name", "") or "")[:200],
                "t": "",
                "p": ["tiktok"],
                "ta": [], "tg": "All", "tl": ["France"],
                "s": ad.get("first_shown", ""),
                "d": {},
                "previewUrl": preview,
                "adLibraryUrl": ad_lib_url,
                "video_urls": video_urls,
                "platform_source": "TikTok",
                "first_shown": ad.get("first_shown", ""),
                "last_shown": ad.get("last_shown", ""),
            }
        else:
            g = groups[key]
            g["n"] += 1
            g["r"] += ad.get("reach", 0)
            g["ids"].append(ad["id"])
            if ad.get("first_shown") and (not g["s"] or ad["first_shown"] < g["s"]):
                g["s"] = ad["first_shown"]
            if not g["previewUrl"] and ad.get("previewUrl"):
                g["previewUrl"] = ad["previewUrl"]
            g["video_urls"].extend(ad.get("video_urls", []))
    
    result = list(groups.values())
    result.sort(key=lambda x: -x["r"])
    return result


def process_tiktok_advertiser(adv, browser):
    """Process a TikTok advertiser: fetch ads by biz_id or name, filter, group creatives."""
    tiktok_name = adv.get("tiktokName", "")
    tiktok_biz_ids = adv.get("tiktokBizIds", [])
    tiktok_filter = adv.get("tiktokFilter", [])
    
    if not tiktok_name and not tiktok_biz_ids:
        return None
    
    log(f"\n=== TikTok: Processing {adv['name']} (biz_ids: {tiktok_biz_ids}, name: '{tiktok_name}', filter: {tiktok_filter or 'none'}) ===")
    
    ads = fetch_tiktok_ads(browser, advertiser_name=tiktok_name, biz_ids=tiktok_biz_ids or None)
    if not ads:
        log(f"  TikTok: No ads found for {adv['name']}")
        return None
    
    log(f"  TikTok: {len(ads)} total ads retrieved")
    
    # Apply keyword filter if configured (non-empty list)
    if tiktok_filter and len(tiktok_filter) > 0:
        filtered_ads = []
        for ad in ads:
            ad_text = (ad.get("text", "") or "").lower()
            ad_adv = (ad.get("advertiser_name", "") or "").lower()
            ad_id = (ad.get("id", "") or "").lower()
            # Combine all searchable text
            combined = f"{ad_text} {ad_adv} {ad_id}"
            match = any(kw.lower() in combined for kw in tiktok_filter)
            if not match and len(filtered_ads) == 0 and len(ads) <= 5:
                log(f"  TikTok filter debug: ad {ad.get('id','?')} text='{ad_text[:60]}' adv='{ad_adv[:30]}' → no match for {tiktok_filter}")
            if match:
                filtered_ads.append(ad)
        log(f"  TikTok: {len(filtered_ads)}/{len(ads)} ads after keyword filter ({tiktok_filter})")
        if len(filtered_ads) == 0:
            log(f"  TikTok: WARNING — filter removed ALL ads. The ad text might be empty in TikTok's API. Consider removing the tiktokFilter for this advertiser, or using a dedicated biz_id.")
        ads = filtered_ads
    
    if not ads:
        log(f"  TikTok: No ads remaining after filter for {adv['name']}")
        return None
    
    groups = group_tiktok_creatives(ads)
    total_reach = sum(g["r"] for g in groups)
    
    log(f"  TikTok: {len(ads)} ads -> {len(groups)} creative groups, reach: {total_reach}")
    
    return {
        "totalAds": len(ads),
        "totalReach": total_reach,
        "groups": groups,
    }
