#!/usr/bin/env python3
"""
Accurate publication dates for NewsletterHunt issues.

Why this exists
---------------
Every /emails/<id> page on NewsletterHunt serves the SAME hardcoded
<time datetime="2020-12-09T11:43:00"> attribute, so the attribute is useless.
The human-readable text inside the tag ("5 days ago", "almost 7 years ago") is
the accurate one, but it is coarse: "almost 7 years ago" collapsed an entire
year of issues onto a single synthetic date. That is what produced clusters
like 104 articles all stamped 2019-04-10.

The listing pages, however, group issues under exact day headers:

    <h1 ...><time datetime="2022-01">August 13</time></h1>       (current year)
    <h1 ...><time datetime="2022-01">March 10, 2025</time></h1>  (prior years)

(The datetime attribute is junk there too - the TEXT is authoritative.)

So we walk the listing pages and build {email_id: 'YYYY-MM-DD'}. Dates descend
monotonically across pages, which gives us a cheap correctness check and lets us
infer the year for headers that omit it.

Usage:
    from dates import build_date_index
    idx = build_date_index(max_pages=3)      # daily run: newest pages only
    idx = build_date_index()                 # full rebuild (~186 pages)

    python3 scripts/dates.py --full          # print a report, write date_index.json
"""

import urllib.request, re, json, os, sys, time
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
HEADERS    = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
LIST_URL   = 'https://newsletterhunt.com/newsletters/money-stuff-by-matt-levine?page={}'
INDEX_PATH = os.path.join(SCRIPT_DIR, 'date_index.json')

MONTHS = {m: i + 1 for i, m in enumerate(
    ['January', 'February', 'March', 'April', 'May', 'June',
     'July', 'August', 'September', 'October', 'November', 'December'])}

# <h1 ...><time ...>HEADER TEXT</time></h1>  or  <article> ... href="/emails/ID"
TOKEN_RE = re.compile(
    r'<h1[^>]*>\s*<time[^>]*>([^<]+)</time>\s*</h1>'   # group 1: date header text
    r'|<article>(.*?)</article>',                       # group 2: one article block
    re.DOTALL)
ID_RE = re.compile(r'href="/emails/(\d+)"')


def parse_header(text, now):
    """'Today' | 'Yesterday' | 'August 13' | 'March 10, 2025' -> date, or None."""
    t = ' '.join(text.split())
    low = t.lower()
    if low == 'today':
        return now.date()
    if low == 'yesterday':
        return (now - timedelta(days=1)).date()
    m = re.match(r'([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$', t)
    if not m:
        return None
    month = MONTHS.get(m.group(1).capitalize())
    if not month:
        return None
    day = int(m.group(2))
    if m.group(3):
        year = int(m.group(3))
    else:
        # No year printed => current year, unless that lands in the future.
        year = now.year
        try:
            if datetime(year, month, day).date() > now.date():
                year -= 1
        except ValueError:
            return None
    try:
        return datetime(year, month, day).date()
    except ValueError:
        return None


def fetch_listing(page, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(LIST_URL.format(page), headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode('utf-8', errors='ignore')
        except Exception:
            if attempt == retries - 1:
                return ''
            time.sleep(1.5 * (attempt + 1))
    return ''


def build_date_index(max_pages=None, now=None, verbose=True, workers=6):
    """Walk listing pages newest-first and return {email_id: 'YYYY-MM-DD'}.

    Pages are fetched concurrently in ordered batches, but processed strictly in
    page order - the descending-date invariant is what makes year inference safe.
    """
    now = now or datetime.now()
    index, current, prev_date, anomalies = {}, None, None, 0
    page = 1
    limit = max_pages or 400
    batch, buffered = max(1, workers), {}

    while page <= limit:
        if page not in buffered:
            wanted = [p for p in range(page, min(page + batch, limit + 1))]
            with ThreadPoolExecutor(max_workers=workers) as ex:
                for p, html in zip(wanted, ex.map(fetch_listing, wanted)):
                    buffered[p] = html
        html = buffered.pop(page, '')
        if not html or '<article>' not in html:
            break
        found_on_page = 0
        for m in TOKEN_RE.finditer(html):
            header, article = m.group(1), m.group(2)
            if header is not None:
                d = parse_header(header, now)
                if d:
                    # Dates must descend as we page back. If one jumps forward,
                    # the year inference was wrong - walk it back a year.
                    if prev_date and d > prev_date:
                        guard = 0
                        while d > prev_date and guard < 20:
                            d = d.replace(year=d.year - 1)
                            guard += 1
                        anomalies += 1
                    current, prev_date = d, d
                continue
            if article and current:
                ids = ID_RE.findall(article)
                if ids:
                    index[ids[0]] = current.strftime('%Y-%m-%d')
                    found_on_page += 1
        if verbose and page % 20 == 0:
            print(f"  ...page {page}, {len(index)} dated so far ({current})")
        if found_on_page == 0:
            break
        page += 1

    if verbose:
        print(f"Date index: {len(index)} issues across {page - 1} pages"
              + (f", {anomalies} year corrections" if anomalies else ""))
    return index


if __name__ == '__main__':
    full = '--full' in sys.argv
    idx = build_date_index(max_pages=None if full else 5)
    with open(INDEX_PATH, 'w') as f:
        json.dump(idx, f, separators=(',', ':'), sort_keys=True)
    dates = sorted(idx.values())
    print(f"Wrote {INDEX_PATH}: {len(idx)} entries, {dates[0]} .. {dates[-1]}")
