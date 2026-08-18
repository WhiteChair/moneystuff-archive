#!/usr/bin/env python3
"""
Full-text + section extraction for Money Stuff issues.

Previously the archive stored only `p` - the first 300 words of each issue
(~2,000 characters). That covers the lead item and nothing else, so everything
below the fold was invisible to search, classification and doctrine matching.

This module pulls the whole issue out of the NewsletterHunt iframe srcdoc and
splits it on the section headers Matt uses ("Goat herding", "Fake comments",
"Things happen", ...). Two email templates are in play:
    2018-2021 issues use <h3> for section headers
    2022+      issues use <h2>
Both are handled.

Storage layout (sharded by year so the daily run only rewrites one small file):
    public/fulltext/<year>.json    {id: {s: [{h, t}], w: words}} - served to the
                                   browser and lazily fetched, and also the
                                   authoritative store (one copy, not two)
    public/fulltext/manifest.json  which years exist, and how many issues each
    src/sections.json              headers only, bundled for instant filtering

Usage:
    python3 scripts/fulltext.py --backfill      # crawl every known issue
    python3 scripts/fulltext.py --shard         # rebuild public/ + src/ from scripts/
"""

import urllib.request, re, json, os, sys, time
from html import unescape
from concurrent.futures import ThreadPoolExecutor

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR    = os.path.join(SCRIPT_DIR, '..', 'src')
PUBLIC_DIR = os.path.join(SCRIPT_DIR, '..', 'public', 'fulltext')
STORE_DIR  = PUBLIC_DIR
HEADERS    = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}

# Boilerplate that appears in every issue and should never be searchable text.
BOILERPLATE = [
    r'You received this message because you are subscribed.*$',
    r'Want to sponsor this newsletter.*$',
    r'Bloomberg L\.P\. 731 Lexington.*$',
    r'If you.{0,3}d like to get Money Stuff in handy email form.*?right here\.',
    r'Like Money Stuff\?.*?right here\.',
    r'View in browser',
    r'Follow Us\s+Get the newsletter.*$',
    r'Like getting this newsletter\?.*$',
    r'Before it.{0,3}s here, it.{0,3}s on the Bloomberg Terminal.{0,600}?Learn more\.',
    r'Subscribe to Bloomberg\.com for unlimited access[^.]{0,120}\.',
    r'Get unlimited access to Bloomberg\.com[^.]{0,120}\.',
    r'^\s*Money Stuff\s+Bloomberg Opinion\s+Money Stuff\s+Matt Levine',
    r'window\.onload\s*=\s*function.*?\}\s*;?',
    r'@media[^{]*\{[^}]*\}',
    r'&lt;!\[CDATA\[.*?\]\]&gt;',
    r'Subscribe to Bloomberg\.com for unlimited access to all our coverage\.',
    r'^\s*Money Stuff\b[\s:.-]*',
]
HEADER_TAG_RE = re.compile(r'<h([23])[^>]*>(.*?)</h\1>', re.DOTALL | re.IGNORECASE)


def strip_tags(html):
    html = re.sub(r'<script[^>]*>.*?</script>', ' ', html, flags=re.DOTALL | re.I)
    html = re.sub(r'<style[^>]*>.*?</style>', ' ', html, flags=re.DOTALL | re.I)
    html = re.sub(r'<!--.*?-->', ' ', html, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', html)
    text = unescape(text).replace('\xa0', ' ')
    # Leftover inline CSS rules that were never inside a <style> block.
    text = re.sub(r'[.#a-zA-Z][-\w. >:\[\]()]*\{[^{}]{0,400}\}', ' ', text)
    # Collapse whitespace BEFORE boilerplate matching: the source HTML wraps
    # these phrases across lines, so single-space patterns would never fire.
    text = re.sub(r'\s+', ' ', text).strip()
    for pat in BOILERPLATE:
        text = re.sub(pat, ' ', text, flags=re.DOTALL | re.I)
    return re.sub(r'\s+', ' ', text).strip()


def extract_srcdoc(page_html):
    idx = page_html.find('srcdoc=')
    if idx < 0:
        return None
    end = page_html.find('</iframe>', idx)
    region = page_html[idx:end if end > 0 else idx + 200000]
    m = re.search(r'srcdoc="((?:[^"\\]|\\.)*)"', region, re.DOTALL)
    return unescape(m.group(1)) if m else None


def full_text(rec):
    """Reassemble an issue from its sections.

    We deliberately do not store a joined copy - it is the same bytes twice, and
    at ~1,000 issues that was 23MB of pure duplication in the repo."""
    parts = [(s['h'] + '. ' + s['t']) if s.get('h') else s.get('t', '')
             for s in sections_of(rec)]
    return ' '.join(p for p in parts if p).strip()


def sections_of(rec):
    return rec.get('s') or rec.get('sections') or []


def dedupe_preheader(lead, first_section):
    """Bloomberg repeats a truncated preview of the issue above the masthead.

    It shows up two ways: repeated inside the lead itself, or as a prefix of the
    first real section. Either way it is the same sentence twice, which inflates
    the corpus and makes search hits land on a stub. Drop the copy."""
    if not lead:
        return lead
    probe = lead[:60]
    if len(probe) > 25:
        again = lead.find(probe, 40)
        if again > 0:                       # repeated within the lead
            lead = lead[again:]
        elif probe in first_section:        # duplicated by the first section
            return ''
    return lead.strip()


def split_sections(body_html):
    """-> (full_text, [{'h': header, 't': section text}, ...])"""
    marks = []
    for m in HEADER_TAG_RE.finditer(body_html):
        h = re.sub(r'<[^>]+>', '', m.group(2))
        h = re.sub(r'\s+', ' ', unescape(h)).strip()
        # Skip the masthead and any junk headers.
        if h and 2 < len(h) < 90 and h.lower() not in ('money stuff', 'bloomberg'):
            marks.append((m.start(), m.end(), h))

    sections, lead = [], ''
    if marks:
        lead = strip_tags(body_html[:marks[0][0]])
        for i, (_, hend, h) in enumerate(marks):
            stop = marks[i + 1][0] if i + 1 < len(marks) else len(body_html)
            t = strip_tags(body_html[hend:stop])
            if t:
                sections.append({'h': h, 't': t})
    else:
        lead = strip_tags(body_html)

    lead = dedupe_preheader(lead, sections[0]['t'] if sections else '')
    parts = [lead] + [s['h'] + '. ' + s['t'] for s in sections]
    full = re.sub(r'\s+', ' ', ' '.join(p for p in parts if p)).strip()
    if lead and len(lead) > 40:
        sections.insert(0, {'h': '', 't': lead})
    return full, sections


def fetch_issue(aid, retries=2):
    url = f'https://newsletterhunt.com/emails/{aid}'
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=25) as r:
                html = r.read().decode('utf-8', errors='ignore')
            body = extract_srcdoc(html)
            if not body:
                return None
            full, sections = split_sections(body)
            if len(full) < 400:
                return None
            return {'id': str(aid), 's': sections, 'w': len(full.split())}
        except Exception:
            if attempt == retries:
                return None
            time.sleep(1.5 * (attempt + 1))
    return None


# ── storage ───────────────────────────────────────────────────────────────────
def shard_path(year):
    return os.path.join(PUBLIC_DIR, f'{year}.json')


def load_shard(year):
    try:
        with open(shard_path(year)) as f:
            return json.load(f)
    except Exception:
        return {}


def save_store(records, dates):
    """records: {id: {...}}; dates: {id: 'YYYY-MM-DD'}. Writes all three layers."""
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    by_year = {}
    for aid, rec in records.items():
        year = (dates.get(aid) or '')[:4] or 'undated'
        by_year.setdefault(year, {})[aid] = {'s': sections_of(rec),
                                             'w': rec.get('w') or rec.get('words') or 0}

    sections_map = {}
    for year, group in by_year.items():
        with open(shard_path(year), 'w') as f:
            json.dump(group, f, separators=(',', ':'))
        for aid, r in group.items():
            hs = [s['h'] for s in r['s'] if s['h']]
            if hs:
                sections_map[aid] = hs

    manifest = {'years': sorted(by_year.keys()),
                'counts': {y: len(g) for y, g in by_year.items()},
                'total': len(records)}
    with open(os.path.join(PUBLIC_DIR, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, separators=(',', ':'))
    os.makedirs(SRC_DIR, exist_ok=True)
    with open(os.path.join(SRC_DIR, 'sections.json'), 'w') as f:
        json.dump(sections_map, f, separators=(',', ':'))
    return manifest


def load_all_store():
    records = {}
    if os.path.isdir(STORE_DIR):
        for fn in sorted(os.listdir(STORE_DIR)):
            if fn.endswith('.json') and fn != 'manifest.json':
                with open(os.path.join(STORE_DIR, fn)) as f:
                    records.update(json.load(f))
    return records


def backfill(article_ids, dates, workers=6, existing=None):
    records = dict(existing or {})
    todo = [a for a in article_ids if str(a) not in records and str(a).isdigit()]
    print(f"Full text: {len(records)} stored, {len(todo)} to fetch")
    done = failed = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for rec in ex.map(fetch_issue, todo):
            if rec:
                records[rec['id']] = rec
                done += 1
            else:
                failed += 1
            if (done + failed) % 50 == 0:
                print(f"  {done + failed}/{len(todo)} fetched ({failed} failed)", flush=True)
    print(f"Fetched {done}, failed {failed}")
    return records


if __name__ == '__main__':
    articles = json.load(open(os.path.join(SCRIPT_DIR, 'articles_current.json')))
    dates = {a['id']: a['d'] for a in articles}
    store = load_all_store()
    if '--backfill' in sys.argv:
        store = backfill([a['id'] for a in articles], dates, existing=store)
    man = save_store(store, dates)
    print("Manifest:", json.dumps(man['counts'], sort_keys=True))
