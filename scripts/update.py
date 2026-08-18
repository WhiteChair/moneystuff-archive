#!/usr/bin/env python3
"""
Daily update pipeline for Money Stuff Archive.
1. Fetch new articles from NewsletterHunt
2. Classify new articles (with Bankruptcy theme)
3. Update ticker prices + bankrupt company mentions
4. Write updated JSON data files for React build
"""

import urllib.request, re, json, os, sys, time
from html import unescape
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPT_DIR)
import dates as dates_mod        # accurate publication dates from listing pages
import fulltext as ft            # whole-issue text + section headers

REINDEX_DATES    = '--reindex-dates' in sys.argv      # rebuild every date (slow, ~186 pages)
BACKFILL_FULLTEXT = '--backfill-fulltext' in sys.argv  # fetch full text for every issue
BACKFILL_MISSING  = '--backfill-missing' in sys.argv   # lift the per-run cap on new fetches
SRC_DIR    = os.path.join(SCRIPT_DIR, '..', 'src')
HEADERS    = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
NOW        = datetime.now()
NOW_DATE   = NOW.strftime('%Y-%m-%d')

def load_json(path, default):
    try:
        with open(path) as f: return json.load(f)
    except: return default

articles_path   = os.path.join(SCRIPT_DIR, 'articles_current.json')
classified_path = os.path.join(SCRIPT_DIR, 'classified_current.json')
tickers_path    = os.path.join(SCRIPT_DIR, 'tickers_current.json')

articles   = load_json(articles_path, [])
classified = load_json(classified_path, {})
tickers    = load_json(tickers_path, [])

existing_ids = {a['id'] for a in articles}
max_id       = max((int(a['id']) for a in articles if str(a['id']).isdigit()), default=0)
print(f"Existing: {len(articles)} articles, max ID: {max_id}")

# ── Authoritative dates ───────────────────────────────────────────────────────
# The <time datetime="..."> attribute on every /emails/<id> page is hardcoded to
# the same value, and the relative text ("almost 7 years ago") is far too coarse
# to date an issue. The listing pages carry exact day headers, so those win.
print("Building date index" + (" (full rebuild)" if REINDEX_DATES else " (recent pages)") + "...")
index_path = os.path.join(SCRIPT_DIR, 'date_index.json')
try:
    DATE_INDEX = json.load(open(index_path))
except Exception:
    DATE_INDEX = {}
fresh = dates_mod.build_date_index(max_pages=None if REINDEX_DATES else 5)
DATE_INDEX.update(fresh)          # merge: the daily crawl only sees recent pages
with open(index_path, 'w') as f:
    json.dump(DATE_INDEX, f, separators=(',',':'), sort_keys=True)

corrected = 0
for a in articles:
    true_d = DATE_INDEX.get(str(a['id']))
    if true_d and a.get('d') != true_d:
        a['d'] = true_d
        corrected += 1
if corrected:
    print(f"Corrected {corrected} publication dates")

# ── Discover new article IDs ──────────────────────────────────────────────────
def fetch_page_ids(page):
    url = f'https://newsletterhunt.com/newsletters/money-stuff-by-matt-levine?page={page}'
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
        return list(set(re.findall(r'href="/emails/(\d+)"', html)))
    except: return []

# The old rule was `int(i) > max_id` across the 5 newest listing pages, so the
# archive could only ever grow at the front - an issue missed once sat below the
# waterline forever (445 of them did). Take anything the date index lists that
# we don't already have, newest first, capped so a nightly run stays quick.
MAX_NEW_PER_RUN = 60
seen_path = os.path.join(SCRIPT_DIR, 'seen_ids.json')
try:
    seen_ids = set(json.load(open(seen_path)))
except Exception:
    seen_ids = set()

print("Scanning for new articles...")
candidates = sorted([i for i in DATE_INDEX if i not in existing_ids and i not in seen_ids],
                    key=lambda i: DATE_INDEX[i], reverse=True)
new_ids = candidates if BACKFILL_MISSING else candidates[:MAX_NEW_PER_RUN]
print(f"New IDs: {len(new_ids)}" + (f" (of {len(candidates)} outstanding)" if len(candidates) > len(new_ids) else ""))

# ── Fetch full text ───────────────────────────────────────────────────────────
def parse_relative_date(rel):
    rel = rel.lower()
    if 'hour' in rel or 'minute' in rel: return NOW_DATE
    m = re.search(r'(\d+)\s+day', rel)
    if m: return (NOW - timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d')
    m = re.search(r'(\d+)\s+month', rel)
    if m: return (NOW - timedelta(days=int(m.group(1))*30)).strftime('%Y-%m-%d')
    m = re.search(r'(\d+)\s+year', rel)
    if m: return (NOW - timedelta(days=int(m.group(1))*365)).strftime('%Y-%m-%d')
    return NOW_DATE

def fetch_article(aid):
    url = f'https://newsletterhunt.com/emails/{aid}'
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=20) as r:
            html = r.read().decode('utf-8', errors='ignore')
        title_m = re.search(r'<h2[^>]*>\s*(.*?)\s*</h2>', html, re.DOTALL)
        raw_title = re.sub(r'<[^>]+>', '', title_m.group(1)).strip() if title_m else ''
        raw_title = unescape(raw_title)
        title = raw_title.replace('Money Stuff: ', '').replace('Money Stuff ', '')

        # Date: listing index first; relative text only as a last resort.
        date = DATE_INDEX.get(str(aid))
        if not date:
            time_m = re.search(r'<time[^>]*datetime="[^"]*"[^>]*>\s*([^<]+?)\s*</time>', html)
            date = parse_relative_date(time_m.group(1).strip()) if time_m else NOW_DATE

        body = ft.extract_srcdoc(html)
        if not body: return 'skip'
        text, sections = ft.split_sections(body)
        if len(text) < 400: return 'skip'
        # Check the RAW title: the prefix is stripped from `title` above and the
        # masthead is stripped from the body as boilerplate, so neither survives
        # to be matched. The listing mixes in sibling Bloomberg newsletters, so
        # this guard does real work.
        if 'money stuff' not in raw_title.lower() and 'money stuff' not in text[:200].lower(): return 'skip'
        words = text.split()
        return {'id': str(aid), 't': title, 'd': date, 'u': url, 'w': len(words),
                'p': ' '.join(words[:300]),
                '_full': {'id': str(aid), 's': sections, 'w': len(words)}}
    except: return None

FULLTEXT = ft.load_all_store()

if new_ids:
    print(f"Fetching {len(new_ids)} articles...")
    fetched = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for aid, result in zip(new_ids, ex.map(fetch_article, new_ids)):
            if result == 'skip':
                seen_ids.add(str(aid))          # resolved: not a Money Stuff issue
            elif result:
                seen_ids.add(str(aid))
                FULLTEXT[result['id']] = result.pop('_full')
                fetched.append(result)
                print(f"  ✓ {result['d']} | {result['t'][:50]}")
            # result is None => transient failure, leave it to be retried
            time.sleep(0.1)
    articles.extend(fetched)
    with open(seen_path, 'w') as f:
        json.dump(sorted(seen_ids), f, separators=(',', ':'))
for a in articles:
    a.pop('_full', None)

# Dedupe + sort
# Titles arrive from two sources (scrape and Gmail) with different entity
# encoding and curly-vs-straight quotes, so normalise before comparing. With
# dates now correct, same-issue duplicates finally collide on the same key.
def norm_title(t):
    t = unescape(t or '').lower()
    t = t.replace('\u2019', "'").replace('\u2018', "'")
    t = t.replace('\u201c', '"').replace('\u201d', '"').replace('\u2014', ' ')
    return re.sub(r'[^a-z0-9 ]', '', t)[:40].strip()

for a in articles:
    a['t'] = unescape(a.get('t', ''))

best = {}
for a in articles:
    k = (norm_title(a['t']), a.get('d', ''))
    prev = best.get(k)
    if prev is None or (str(a['id']) in FULLTEXT and str(prev['id']) not in FULLTEXT):
        best[k] = a

# NewsletterHunt sometimes ingests one issue many times over (33 consecutive IDs
# all holding the 2021-07-29 Archegos column) and its listing spreads those
# copies across consecutive days - including Saturdays and Sundays, which Money
# Stuff never publishes on. Collapse same-title records sitting inside a short
# window and keep the earliest date, which is the real send date.
def pick(cluster):
    winner = dict(next((c for c in cluster if str(c['id']) in FULLTEXT), cluster[0]))
    winner['d'] = cluster[0]['d']
    return winner

by_title = defaultdict(list)
for a in best.values():
    by_title[norm_title(a['t'])].append(a)

articles, merged = [], 0
for group in by_title.values():
    group.sort(key=lambda x: x.get('d', ''))
    cluster = [group[0]]
    for a in group[1:]:
        span = (datetime.fromisoformat(a['d']) - datetime.fromisoformat(cluster[0]['d'])).days
        if span <= 10:
            cluster.append(a)
        else:
            articles.append(pick(cluster)); cluster = [a]
    if len(cluster) > 1: merged += len(cluster) - 1
    articles.append(pick(cluster))
if merged:
    print(f"Merged {merged} re-ingested copies of issues already held")
articles.sort(key=lambda x: x.get('d', ''), reverse=True)

# ── Full text ─────────────────────────────────────────────────────────────────
if BACKFILL_FULLTEXT:
    FULLTEXT = ft.backfill([a['id'] for a in articles],
                           {a['id']: a['d'] for a in articles}, existing=FULLTEXT)

# "Things happen" is the closing link roundup - real text, but it name-checks
# dozens of unrelated companies and would swamp theme/ticker/doctrine matching.
ROUNDUP = ('things happen', 'elsewhere')

def body(a, roundup=False):
    """Full issue text when we have it, preview otherwise."""
    rec = FULLTEXT.get(str(a['id']))
    if not rec:
        return a.get('p', '')
    if roundup:
        return ft.full_text(rec)
    keep = [s['t'] for s in ft.sections_of(rec)
            if not any(s['h'].lower().startswith(r) for r in ROUNDUP)]
    return ' '.join(keep) if keep else ft.full_text(rec)

with_full = sum(1 for a in articles if str(a['id']) in FULLTEXT)
print(f"Full text available for {with_full}/{len(articles)} articles")

# ── Classify new articles ─────────────────────────────────────────────────────
RULES = {
    "Securities Fraud":       [r'\bsecurities fraud\b',r'\bfraud\b',r'\bfraudulen',r'\bmisled\b',r'\bclass action\b',r'\bponzi\b'],
    "Insider Trading":        [r'\binsider trad',r'\binsider tip',r'\btipped\b',r'\btippee\b',r'\bmaterial non.?public\b',r'\bmnpi\b',r'\b10b5\b'],
    "Musk / Tesla / SpaceX":  [r'\belon\b',r'\bmusk\b',r'\btesla\b',r'\bspacex\b',r'\bxai\b',r'\bgrok\b'],
    "M&A / Mergers":          [r'\bmerger\b',r'\bacquisition\b',r'\btakeover\b',r'\bbuyout\b',r'\blbo\b',r'\bm&a\b',r'\btender offer\b'],
    "Crypto / Blockchain":    [r'\bcrypto\b',r'\bbitcoin\b',r'\bethereum\b',r'\bblockchain\b',r'\bstablecoin\b',r'\bnft\b',r'\bmemecoin\b'],
    "OpenAI / AI":            [r'\bopenai\b',r'\bsam altman\b',r'\bartificial intelligence\b',r'\bchatgpt\b',r'\bllm\b'],
    "Fed / Central Banks":    [r'\bfederal reserve\b',r'\bthe fed\b',r'\binterest rate\b',r'\bmonetary policy\b',r'\binflation\b'],
    "IPOs / Capital Markets": [r'\bipo\b',r'\binitial public offering\b',r'\bspac\b',r'\bunderwriter\b',r'\bdirect listing\b'],
    "Legal / Courts":         [r'\bsupreme court\b',r'\blawsuit\b',r'\bindictment\b',r'\bprosecutor\b',r'\bjury\b',r'\btrial\b',r'\blitigation\b'],
    "Hedge Funds / PE":       [r'\bhedge fund\b',r'\bprivate equity\b',r'\bprivate credit\b',r'\bactivist investor\b'],
    "Regulation / SEC":       [r'\bsec \b',r'\bsecurities and exchange\b',r'\bcftc\b',r'\bregulat',r'\benforcement action\b'],
    "Banking / Crises":       [r'\bsilicon valley bank\b',r'\bsvb\b',r'\bcredit suisse\b',r'\bbank run\b',r'\bbank fail',r'\bfdic\b'],
    "Bankruptcy":             [r'\bbankruptcy\b',r'\bbankrupt\b',r'\bchapter 11\b',r'\bftx\b',r'\bsilvergate\b',r'\bcreditor\b',r'\bdebtor\b',r'\breorganiz',r'\bliquidat',r'\binsolven'],
    "Corporate Governance":   [r'\bboard of director',r'\bceo pay\b',r'\bexecutive compensation\b',r'\bgovernance\b',r'\besg\b'],
    "Options / Derivatives":  [r'\bcall option\b',r'\bput option\b',r'\bout.of.the.money\b',r'\bderivativ',r'\bswap\b',r'\bfutures\b',r'\bwarrant\b'],
}
BAD = [r'^Programming note',r'^Bloomberg Opinion',r'^window\.onload',r'^Matt Levine',r"^Don't feel bad"]
GOOD_SIGNALS = [r'\bi (always|often|sometimes) say\b',r'\bthe (point|lesson|key) (is|here)\b',r'\bhere.s (how|why)\b',r'\bthink about\b',r'\bthe basic\b',r'\bif you\b',r'\bone way to\b']

def classify_one(a):
    text = (a['t'] + ' ' + body(a)).lower()
    scores = defaultdict(int)
    for theme, patterns in RULES.items():
        for pat in patterns:
            if re.search(pat, text, re.I): scores[theme] += 1
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    themes = [t for t,s in ranked[:3] if s > 0] or ['Securities Fraud']
    preview = a.get('p','')
    clean = re.sub(r'Money Stuff\s*|View in browser\s*-->\s*|Bloomberg Opinion.*?Levine\s*','',preview)
    clean = re.sub(r'\s+',' ',clean).strip()
    sents = re.split(r'(?<=[.!?])\s+',clean)
    scored = []
    for s in sents:
        if len(s.strip()) < 50 or any(re.match(p,s.strip()) for p in BAD): continue
        sc = sum(3 if re.search(p,s,re.I) else 0 for p in GOOD_SIGNALS) + min(len(s)//30,5)
        scored.append((sc, s.strip()))
    scored.sort(key=lambda x:-x[0])
    lesson = scored[0][1][:180] if scored else f"Matt's take on {a['t'][:60].lower()}."
    good = [s for _,s in scored[:2]]
    return {'themes': themes[:3], 'lesson': lesson, 'summary': ' '.join(good[:2])[:300]}

RECLASSIFY = '--reclassify' in sys.argv
new_to_classify = articles if RECLASSIFY else [a for a in articles if a['id'] not in classified]
if new_to_classify:
    print(f"Classifying {len(new_to_classify)} new articles...")
    for a in new_to_classify:
        classified[a['id']] = classify_one(a)

# ── Refresh ticker prices ─────────────────────────────────────────────────────
print("Refreshing ticker prices...")
# Live, still-tradeable companies. Matched on whole-issue text by word-boundary
# regex - Levine writes company names, essentially never "$TICKER" cashtags, so
# a name table is the only thing that finds anything.
COMPANY_PATTERNS = {
    'TSLA': [r'Tesla'],            'GS':   [r'Goldman Sachs', r'Goldman'],
    'AAPL': [r'Apple Inc', r'Apple'], 'MSFT': [r'Microsoft'],
    'AMZN': [r'Amazon'],           'GOOGL':[r'Alphabet', r'Google'],
    'META': [r'Meta Platforms', r'Meta\b', r'Facebook'],
    'NFLX': [r'Netflix'],          'UBER': [r'Uber'],
    'ABNB': [r'Airbnb'],           'RIVN': [r'Rivian'],
    'COIN': [r'Coinbase'],         'JPM':  [r'JPMorgan', r'JP Morgan'],
    'BAC':  [r'Bank of America'],  'C':    [r'Citigroup', r'Citibank', r'Citi\b'],
    'MS':   [r'Morgan Stanley'],   'BLK':  [r'BlackRock'],
    'BRK-B':[r'Berkshire'],        'HOOD': [r'Robinhood'],
    'PLTR': [r'Palantir'],         'SNOW': [r'Snowflake'],
    'DB':   [r'Deutsche Bank'],
    # added 2026-08: names the archive is full of but the old table never saw
    'GME':  [r'GameStop'],         'AMC':  [r'AMC Entertainment', r'AMC\b'],
    'NVDA': [r'Nvidia'],           'MSTR': [r'MicroStrategy', r'Strategy Inc'],
    'DJT':  [r'Trump Media'],      'UBS':  [r'UBS\b'],
    'BCS':  [r'Barclays'],         'HSBC': [r'HSBC'],
    'WFC':  [r'Wells Fargo'],      'SCHW': [r'Charles Schwab', r'Schwab'],
    'IBKR': [r'Interactive Brokers'], 'BX': [r'Blackstone'],
    'KKR':  [r'KKR'],              'APO':  [r'Apollo Global', r'Apollo Management'],
    'ARES': [r'Ares Management'],  'BA':   [r'Boeing'],
    'DIS':  [r'Disney'],           'INTC': [r'Intel\b'],
    'PYPL': [r'PayPal'],           'PTON': [r'Peloton'],
    'ZG':   [r'Zillow'],           'OPEN': [r'Opendoor'],
    'SNAP': [r'Snapchat', r'Snap Inc'], 'CVNA': [r'Carvana'],
    'CRCL': [r'Circle Internet'],  }
COMPANY_RES = {t: [re.compile(r'\b' + p + r'\b', re.I) for p in pats]
               for t, pats in COMPANY_PATTERNS.items()}
MIN_ISSUES = 6   # below this a name is a passing reference, not a subject

ticker_mentions = defaultdict(list)
for a in articles:
    content = body(a) + ' ' + a.get('t','')
    for ticker, pats in COMPANY_RES.items():
        if any(p.search(content) for p in pats):
            ticker_mentions[ticker].append({'d':a['d'],'id':a['id'],'t':a['t']})
for t in ticker_mentions:
    ticker_mentions[t].sort(key=lambda m: m['d'], reverse=True)

def fetch_ticker(ticker, mentions):
    if len(mentions) < MIN_ISSUES: return None
    first_date = mentions[-1]['d']
    url = f'https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1mo&range=12y'
    try:
        req = urllib.request.Request(url, headers={'User-Agent':'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
        result = data['chart']['result'][0]
        meta = result['meta']
        timestamps = result['timestamp']
        closes = result['indicators']['quote'][0]['close']
        target_ts = datetime.strptime(first_date, '%Y-%m-%d').timestamp()
        valid = [(t, c) for t,c in zip(timestamps, closes) if c is not None]
        if not valid: return None
        # Companies Matt wrote about before they were listed (Coinbase, Circle,
        # Palantir...) have no price on the first-mention date. Price from the
        # first day the stock actually traded, and say so, rather than silently
        # passing off the IPO price as the 2019 price.
        after = [v for v in valid if v[0] >= target_ts]
        closest = after[0] if after else valid[-1]
        price_then, price_now = closest[1], meta.get('regularMarketPrice')
        if not price_then or not price_now: return None
        price_date = datetime.fromtimestamp(closest[0]).strftime('%Y-%m-%d')
        return {'ticker':ticker,'first_date':first_date,'price_date':price_date,
                # monthly bars land on the 1st, so only flag a real gap
                'priced_late': (datetime.fromtimestamp(closest[0]) -
                                datetime.strptime(first_date, '%Y-%m-%d')).days > 90,
                'price_then':round(price_then,2),
                'price_now':round(price_now,2),'return_pct':round((price_now/price_then-1)*100,1),
                'mention_count':len(mentions),'currency':meta.get('currency','USD'),
                'mentions':mentions[:8]}
    except: return None

new_tickers = []
for ticker, mentions in sorted(ticker_mentions.items(), key=lambda x:-len(x[1])):
    result = fetch_ticker(ticker, mentions)
    if result:
        new_tickers.append(result)
        print(f"  {ticker}: ${result['price_then']} -> ${result['price_now']} ({result['return_pct']:+.0f}%)")
    time.sleep(0.4)
if new_tickers: tickers = new_tickers
print(f"Live tickers: {len(tickers)}")

# ── Dead companies: bankrupt, seized, taken private, wound down ──────────────
# Deliberately NOT priced. Yahoo silently re-points a delisted symbol at whoever
# holds it now (SI returns a live quote that has nothing to do with Silvergate),
# so these carry an event and a date instead of a return.
DEAD_COMPANIES = [
    {"ticker":"TWTR","name":"Twitter","event":"TAKEN PRIVATE","date":"Oct 2022",
     "note":"Musk signed in April 2022, spent the summer trying to get out of it, then closed at $54.20 a share in October. Now X.",
     "patterns":[r'Twitter']},
    {"ticker":"—","name":"Archegos Capital","event":"COLLAPSED","date":"Mar 2021",
     "note":"Bill Hwang's family office blew up on concentrated total return swaps, costing its banks over $10 billion. Credit Suisse took the worst of it. Hwang was convicted of fraud in 2024.",
     "patterns":[r'Archegos']},
    {"ticker":"FTX","name":"FTX","event":"BANKRUPT","date":"Nov 2022",
     "note":"Sam Bankman-Fried's crypto exchange collapsed after a run revealed customer funds at Alameda. SBF sentenced to 25 years.",
     "patterns":[r'FTX', r'Bankman-Fried', r'Alameda Research']},
    {"ticker":"SIVB","name":"Silicon Valley Bank","event":"SEIZED","date":"Mar 2023",
     "note":"Deposits fled after a botched capital raise; regulators closed it in a weekend. Second-largest US bank failure at the time.",
     "patterns":[r'Silicon Valley Bank', r'SVB']},
    {"ticker":"CS","name":"Credit Suisse","event":"FORCED MERGER","date":"Mar 2023",
     "note":"Swiss authorities pushed it into UBS's arms over a weekend and wrote its AT1 bonds to zero while shareholders got stock — the wrong way round, said the AT1 holders.",
     "patterns":[r'Credit Suisse']},
    {"ticker":"BBBY","name":"Bed Bath & Beyond","event":"BANKRUPT","date":"Apr 2023",
     "note":"Meme stock that kept selling shares into its own rally on the way down. Ryan Cohen got out first.",
     "patterns":[r'Bed Bath']},
    {"ticker":"—","name":"Greensill Capital","event":"INSOLVENT","date":"Mar 2021",
     "note":"Supply-chain finance turned into lending against invoices that had not happened yet. Took $10 billion of Credit Suisse client funds down with it.",
     "patterns":[r'Greensill']},
    {"ticker":"REV","name":"Revlon","event":"BANKRUPT","date":"Jun 2022",
     "note":"Filed months after Citi wired lenders $900 million of its own money by mistake and a judge said they could keep it. Emerged May 2023.",
     "patterns":[r'Revlon']},
    {"ticker":"FRC","name":"First Republic","event":"SEIZED","date":"May 2023",
     "note":"Survived March 2023 on a $30 billion deposit infusion from eleven banks, then failed anyway. Sold to JPMorgan.",
     "patterns":[r'First Republic']},
    {"ticker":"HTZ","name":"Hertz","event":"BANKRUPT","date":"May 2020",
     "note":"Then asked the bankruptcy court for permission to sell $500 million of stock that it told buyers was probably worthless. Emerged June 2021.",
     "patterns":[r'Hertz']},
    {"ticker":"NKLA","name":"Nikola","event":"BANKRUPT","date":"Feb 2025",
     "note":"The truck rolled downhill in the promotional video. Founder Trevor Milton was convicted of fraud in 2022 and pardoned in 2025.",
     "patterns":[r'Nikola']},
    {"ticker":"SI","name":"Silvergate","event":"WOUND DOWN","date":"Mar 2023",
     "note":"The bank for crypto companies had a crypto bank run after FTX failed, sold its bond portfolio at a loss to meet withdrawals, then voluntarily liquidated. Holding company filed Chapter 11 in 2024.",
     "patterns":[r'Silvergate']},
    {"ticker":"—","name":"Terra / Luna","event":"COLLAPSED","date":"May 2022",
     "note":"Algorithmic stablecoin that held its peg by promising to print more of the thing backing it. Roughly $40 billion evaporated in a week.",
     "patterns":[r'Terraform', r'TerraUSD', r'Luna\b']},
    {"ticker":"—","name":"Three Arrows Capital","event":"LIQUIDATED","date":"Jun 2022",
     "note":"Crypto hedge fund that borrowed from everyone at once, mostly unsecured. Its default cascaded through the lenders below.",
     "patterns":[r'Three Arrows']},
    {"ticker":"—","name":"Celsius Network","event":"BANKRUPT","date":"Jul 2022",
     "note":"Crypto lender froze withdrawals, then filed. Founder Alex Mashinsky pleaded guilty to fraud.",
     "patterns":[r'Celsius Network', r'Mashinsky']},
    {"ticker":"—","name":"Voyager Digital","event":"BANKRUPT","date":"Jul 2022",
     "note":"Went down on its unsecured loan to Three Arrows. Customers learned the difference between a deposit and a loan to a crypto firm.",
     "patterns":[r'Voyager Digital']},
    {"ticker":"—","name":"BlockFi","event":"BANKRUPT","date":"Nov 2022",
     "note":"Rescued by FTX in July 2022, which was not the rescue it looked like.",
     "patterns":[r'BlockFi']},
    {"ticker":"—","name":"Genesis Global","event":"BANKRUPT","date":"Jan 2023",
     "note":"DCG's lending arm, on the other side of Gemini Earn. The SEC called Earn an unregistered securities offering.",
     "patterns":[r'Genesis Global', r'Genesis Capital']},
    {"ticker":"SBNY","name":"Signature Bank","event":"SEIZED","date":"Mar 2023",
     "note":"Closed by New York regulators two days after SVB. Its crypto-payments network went with it.",
     "patterns":[r'Signature Bank']},
    {"ticker":"WE","name":"WeWork","event":"BANKRUPT","date":"Nov 2023",
     "note":"From a $47 billion valuation and a withdrawn IPO to Chapter 11, with a SPAC in between.",
     "patterns":[r'WeWork']},
    {"ticker":"—","name":"Wirecard","event":"INSOLVENT","date":"Jun 2020",
     "note":"€1.9 billion of cash in Philippine bank accounts turned out not to exist. The COO fled and has not been found.",
     "patterns":[r'Wirecard']},
    {"ticker":"—","name":"Evergrande","event":"LIQUIDATION ORDER","date":"Jan 2024",
     "note":"$300 billion of liabilities. A Hong Kong court ordered liquidation after two years of restructuring talks went nowhere.",
     "patterns":[r'Evergrande']},
    {"ticker":"RIDE","name":"Lordstown Motors","event":"BANKRUPT","date":"Jun 2023",
     "note":"SPAC-era EV maker that sued Foxconn on the way out for failing to fund it.",
     "patterns":[r'Lordstown']},
    {"ticker":"—","name":"Theranos","event":"DISSOLVED","date":"Sep 2018",
     "note":"The blood tests did not work. Elizabeth Holmes got 11 years, Sunny Balwani nearly 13.",
     "patterns":[r'Theranos', r'Elizabeth Holmes']},
    {"ticker":"—","name":"Purdue Pharma","event":"BANKRUPT","date":"Sep 2019",
     "note":"Filed to settle opioid claims. The Supreme Court threw out the plan in 2024 because it released the Sacklers, who had not filed for bankruptcy themselves.",
     "patterns":[r'Purdue Pharma', r'Sackler']},
    {"ticker":"—","name":"Melvin Capital","event":"SHUT DOWN","date":"May 2022",
     "note":"Lost 53% in the January 2021 GameStop squeeze, took $2.75 billion from Citadel and Point72, never recovered, returned the rest.",
     "patterns":[r'Melvin Capital']},
    {"ticker":"SAVE","name":"Spirit Airlines","event":"CEASED OPERATIONS","date":"May 2026",
     "note":"Filed Chapter 11 in November 2024 after the JetBlue merger was blocked on antitrust grounds, emerged in March 2025, filed again that August, and stopped flying altogether on 2 May 2026.",
     "patterns":[r'Spirit Airlines', r'Spirit Aviation']},
    {"ticker":"FSR","name":"Fisker","event":"BANKRUPT","date":"Jun 2024",
     "note":"Second EV company by the same founder to go bankrupt.",
     "patterns":[r'Fisker']},
    {"ticker":"ME","name":"23andMe","event":"BANKRUPT","date":"Mar 2025",
     "note":"Filed with 15 million people's genetic data as an asset on the block.",
     "patterns":[r'23andMe']},
]
DEAD_RES = {d['name']: [re.compile(r'\b' + p + r'\b', re.I) for p in d['patterns']]
            for d in DEAD_COMPANIES}
d_mentions = defaultdict(list)
for a in articles:
    content = body(a) + ' ' + a.get('t','')
    for name, pats in DEAD_RES.items():
        if any(p.search(content) for p in pats):
            d_mentions[name].append({'d':a['d'],'id':a['id'],'t':a['t']})

bankrupt = []
for d in DEAD_COMPANIES:
    ms = sorted(d_mentions[d['name']], key=lambda m: m['d'], reverse=True)
    entry = {k: v for k, v in d.items() if k != 'patterns'}
    entry['mention_count'] = len(ms)
    entry['mentions'] = ms[:8]
    bankrupt.append(entry)
bankrupt.sort(key=lambda b: -b['mention_count'])
print("Dead companies: " + ', '.join(f"{b['name']}:{b['mention_count']}" for b in bankrupt))

# ── Build enriched articles ───────────────────────────────────────────────────
enriched = []
for a in articles:
    c = classified.get(a['id'], {})
    enriched.append({'id':a['id'],'t':a['t'],'d':a['d'],'u':a['u'],'w':a['w'],
                     'themes':c.get('themes',[]),'lesson':c.get('lesson','')[:180],'summary':c.get('summary','')[:300]})

# ── Match articles to legal doctrines ────────────────────────────────────────
doctrines = load_json(os.path.join(SRC_DIR, 'doctrines.json'), [])
doctrine_matches = {}
for d in doctrines:
    pats = [re.compile(p, re.IGNORECASE) for p in d.get('patterns', [])]
    hits = []
    for a in articles:
        text = (a.get('t','') + ' ' + body(a))
        score = sum(1 for p in pats if p.search(text))
        if score > 0:
            hits.append((score, a.get('d',''), a['id']))
    hits.sort(key=lambda h: (h[0], h[1]), reverse=True)
    ids = [h[2] for h in hits[:12]]
    if len(ids) < 6 and d.get('fallback_theme'):
        pad = sorted([a for a in articles if d['fallback_theme'] in classified.get(a['id'],{}).get('themes',[]) and a['id'] not in ids],
                     key=lambda a: a.get('d',''), reverse=True)
        ids += [a['id'] for a in pad[:6-len(ids)]]
    doctrine_matches[d['slug']] = ids
with open(os.path.join(SRC_DIR,'doctrine_matches.json'),'w') as f: json.dump(doctrine_matches, f, separators=(',',':'))
print(f"Doctrine matches: " + ', '.join(f"{k}:{len(v)}" for k,v in doctrine_matches.items()))

# ── Save everything ───────────────────────────────────────────────────────────
with open(articles_path,   'w') as f: json.dump(articles,   f, separators=(',',':'))
with open(classified_path, 'w') as f: json.dump(classified, f, separators=(',',':'))
with open(tickers_path,    'w') as f: json.dump(tickers,    f, separators=(',',':'))

# Only keep full text for issues that survived dedupe - the losing copy of a
# duplicate would otherwise linger in an 'undated' shard forever.
live = {str(a['id']): a['d'] for a in articles}
FULLTEXT = {k: v for k, v in FULLTEXT.items() if k in live}
manifest = ft.save_store(FULLTEXT, live)
print(f"Full-text shards: {manifest['total']} issues across {len(manifest['years'])} years")

os.makedirs(SRC_DIR, exist_ok=True)
with open(os.path.join(SRC_DIR,'articles.json'),'w') as f: json.dump(enriched, f, separators=(',',':'))
with open(os.path.join(SRC_DIR,'tickers.json'), 'w') as f: json.dump(tickers,  f, separators=(',',':'))
with open(os.path.join(SRC_DIR,'bankrupt.json'),'w') as f: json.dump(bankrupt, f, indent=2)

print(f"\n✅ Done: {len(enriched)} articles, {len(classified)} classified, {len(tickers)} tickers, {len(bankrupt)} bankrupt")
