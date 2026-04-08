#!/usr/bin/env python3
"""
Daily update pipeline for Money Stuff Archive.
1. Fetch new articles from NewsletterHunt
2. Classify new articles with heuristic rules
3. Update ticker prices from Yahoo Finance
4. Write updated JSON data files for the React build
"""

import urllib.request, re, json, os, sys, time
from html import unescape
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_DIR    = os.path.join(SCRIPT_DIR, '..', 'src')
HEADERS    = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'}
NOW        = datetime.utcnow()
NOW_DATE   = NOW.strftime('%Y-%m-%d')

# ── Load existing data ────────────────────────────────────────────────────────
def load_json(path, default):
    try:
        with open(path) as f: return json.load(f)
    except: return default

articles_path    = os.path.join(SCRIPT_DIR, 'articles_current.json')
classified_path  = os.path.join(SCRIPT_DIR, 'classified_current.json')
tickers_path     = os.path.join(SCRIPT_DIR, 'tickers_current.json')

articles    = load_json(articles_path, [])
classified  = load_json(classified_path, {})
tickers     = load_json(tickers_path, [])

existing_ids  = {a['id'] for a in articles}
max_id        = max((int(a['id']) for a in articles), default=0)

print(f"Existing articles: {len(articles)}, max ID: {max_id}")

# ── Fetch new article IDs from NewsletterHunt ─────────────────────────────────
def fetch_page_ids(page):
    url = f'https://newsletterhunt.com/newsletters/money-stuff-by-matt-levine?page={page}'
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
        return list(set(re.findall(r'href="/emails/(\d+)"', html)))
    except: return []

print("Scanning for new articles...")
new_ids = []
for page in range(1, 6):  # check first 5 pages = ~50 most recent
    ids = fetch_page_ids(page)
    fresh = [i for i in ids if int(i) > max_id and i not in existing_ids]
    new_ids.extend(fresh)
    if not fresh and page > 2:
        break
    time.sleep(0.3)

new_ids = list(set(new_ids))
print(f"New article IDs found: {len(new_ids)}")

# ── Fetch full text for new articles ──────────────────────────────────────────
def parse_relative_date(rel):
    rel = rel.lower()
    if 'hour' in rel or 'minute' in rel: return NOW_DATE
    m = re.search(r'(\d+)\s+day', rel)
    if m: return (NOW - timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d')
    m = re.search(r'(\d+)\s+month', rel)
    if m: return (NOW - timedelta(days=int(m.group(1))*30)).strftime('%Y-%m-%d')
    m = re.search(r'(\d+)\s+year', rel)
    if m: return (NOW - timedelta(days=int(m.group(1))*365)).strftime('%Y-%m-%d')
    if 'year' in rel: return (NOW - timedelta(days=365)).strftime('%Y-%m-%d')
    return NOW_DATE

def fetch_article(aid):
    url = f'https://newsletterhunt.com/emails/{aid}'
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=12) as r:
            html = r.read().decode('utf-8', errors='ignore')

        title_m = re.search(r'<h2[^>]*>\s*(.*?)\s*</h2>', html, re.DOTALL)
        raw_title = re.sub(r'<[^>]+>', '', title_m.group(1)).strip() if title_m else ''
        title = raw_title.replace('Money Stuff: ', '').replace('Money Stuff ', '')

        time_m = re.search(r'<time[^>]*datetime="[^"]*"[^>]*>\s*([^<]+?)\s*</time>', html)
        date = parse_relative_date(time_m.group(1).strip()) if time_m else NOW_DATE

        idx = html.find('srcdoc=')
        if idx < 0: return None
        iframe_end = html.find('</iframe>', idx)
        region = html[idx:iframe_end if iframe_end > 0 else idx+60000]
        match = re.search(r'srcdoc="((?:[^"\\]|\\.)*)"', region, re.DOTALL)
        if not match: return None

        decoded = unescape(match.group(1))
        decoded = re.sub(r'<script[^>]*>.*?</script>', '', decoded, flags=re.DOTALL)
        decoded = re.sub(r'<style[^>]*>.*?</style>', '', decoded, flags=re.DOTALL)
        text = re.sub(r'<[^>]+>', ' ', decoded)
        text = re.sub(r'\s+', ' ', text).strip()

        if len(text) < 400: return None
        if 'money stuff' not in text[:100].lower() and 'money stuff' not in title.lower(): return None

        words = text.split()
        return {
            'id': aid, 't': title, 'd': date,
            'u': f'https://newsletterhunt.com/emails/{aid}',
            'w': len(words),
            'p': ' '.join(words[:300])
        }
    except: return None

if new_ids:
    print(f"Fetching {len(new_ids)} new articles...")
    fetched = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for i, result in enumerate(ex.map(fetch_article, new_ids)):
            if result:
                fetched.append(result)
                print(f"  ✓ {result['d']} | {result['t'][:50]}")
            time.sleep(0.1)
    print(f"Successfully fetched: {len(fetched)}")
    articles.extend(fetched)
else:
    print("No new articles to fetch.")

# Sort by date desc, dedupe
seen = set()
deduped = []
for a in sorted(articles, key=lambda x: x.get('d',''), reverse=True):
    k = (a['t'][:40], a['d'])
    if k not in seen:
        seen.add(k)
        deduped.append(a)
articles = deduped

# ── Classify new articles ─────────────────────────────────────────────────────
RULES = {
    "Securities Fraud":       [r'\bsecurities fraud\b',r'\bfraud\b',r'\bfraudulen',r'\bmisled\b',r'\bmisleading\b',r'\bclass action\b',r'\bshareholder lawsuit\b',r'\bponzi\b',r'\baccounting fraud\b'],
    "Insider Trading":        [r'\binsider trad',r'\binsider tip',r'\btipped\b',r'\btippee\b',r'\bmaterial non.?public\b',r'\bmnpi\b',r'\b10b5\b',r'\bpersonal benefit\b',r'\bfront.run'],
    "Musk / Tesla / SpaceX":  [r'\belon\b',r'\bmusk\b',r'\btesla\b',r'\bspacex\b',r'\bxai\b',r'\bgrok\b',r'\bfunding secured\b',r'\btaking tesla private\b'],
    "M&A / Mergers":          [r'\bmerger\b',r'\bacquisition\b',r'\btakeover\b',r'\bbuyout\b',r'\blbo\b',r'\bgoing private\b',r'\bm&a\b',r'\btender offer\b',r'\bstrategic alternative\b'],
    "Crypto / Blockchain":    [r'\bcrypto\b',r'\bbitcoin\b',r'\bethereum\b',r'\bblockchain\b',r'\btoken\b',r'\bdefi\b',r'\bstablecoin\b',r'\bnft\b',r'\bmemecoin\b',r'\btether\b'],
    "OpenAI / AI":            [r'\bopenai\b',r'\bsam altman\b',r'\bartificial intelligence\b',r'\bchatgpt\b',r'\bllm\b',r'\bgpt\b',r'\bai model\b',r'\bai company\b'],
    "Fed / Central Banks":    [r'\bfederal reserve\b',r'\bthe fed\b',r'\bcentral bank\b',r'\binterest rate\b',r'\bmonetary policy\b',r'\bpowell\b',r'\binflation\b',r'\brate hike\b'],
    "IPOs / Capital Markets": [r'\bipo\b',r'\binitial public offering\b',r'\bgoing public\b',r'\bspac\b',r'\bunderwriter\b',r'\bprospectus\b',r'\bs-1\b',r'\bdirect listing\b'],
    "Legal / Courts":         [r'\bsupreme court\b',r'\bfederal court\b',r'\blawsuit\b',r'\bsettl',r'\bindictment\b',r'\bprosecutor\b',r'\bjury\b',r'\btrial\b',r'\bconvict',r'\bplea\b',r'\blitigation\b'],
    "Hedge Funds / PE":       [r'\bhedge fund\b',r'\bprivate equity\b',r'\bactivist investor\b',r'\bprivate credit\b',r'\bshort sell',r'\bcarried interest\b',r'\bfund manager\b'],
    "Regulation / SEC":       [r'\bsec \b',r'\bsecurities and exchange\b',r'\bcftc\b',r'\bfinra\b',r'\bregulat',r'\benforcement action\b',r'\bsarbanes\b',r'\bgensler\b'],
    "Banking / Crises":       [r'\bsilicon valley bank\b',r'\bsvb\b',r'\bcredit suisse\b',r'\bbank run\b',r'\bbank fail',r'\bfdic\b',r'\bbanking crisis\b',r'\bfirst republic\b'],
    "Corporate Governance":   [r'\bboard of director',r'\bceo pay\b',r'\bexecutive compensation\b',r'\bshareholder right',r'\bproxy fight\b',r'\bgovernance\b',r'\bdual class\b',r'\besg\b'],
    "Options / Derivatives":  [r'\bcall option\b',r'\bput option\b',r'\bout.of.the.money\b',r'\bderivativ',r'\bswap\b',r'\bfutures\b',r'\bvolatility\b',r'\bstructured product\b',r'\bwarrant\b'],
}

BAD_LESSON = [r'^Programming note', r'^Bloomberg Opinion', r'^window\.onload', r'^Matt Levine', r"^Don't feel bad", r'^will be off']

def classify_article(article):
    text = (article['t'] + ' ' + article.get('p','')).lower()
    scores = defaultdict(int)
    for theme, patterns in RULES.items():
        for pat in patterns:
            if re.search(pat, text, re.I):
                scores[theme] += 1
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    themes = [t for t,s in ranked[:3] if s > 0] or ['Securities Fraud']

    preview = article.get('p','')
    clean = re.sub(r'Money Stuff\s*','', preview)
    clean = re.sub(r'View in browser\s*-->\s*','', clean)
    clean = re.sub(r'\s+',' ', clean).strip()
    sentences = re.split(r'(?<=[.!?])\s+', clean)
    good = [s.strip() for s in sentences if len(s.strip())>50 and not any(re.match(p,s.strip()) for p in BAD_LESSON)]
    lesson = (good[0][:150] if good else f"Matt's take on {article['t'].lower()[:60]}.")
    summary = ' '.join(good[:2])[:300] if len(good)>=2 else lesson

    return {'themes': themes, 'lesson': lesson, 'summary': summary}

new_to_classify = [a for a in articles if a['id'] not in classified]
if new_to_classify:
    print(f"Classifying {len(new_to_classify)} new articles...")
    for a in new_to_classify:
        classified[a['id']] = classify_article(a)
    print("Done.")

# ── Update ticker prices ──────────────────────────────────────────────────────
print("Refreshing ticker prices...")

COMPANY_TICKERS = {
    'Tesla':'TSLA','Goldman Sachs':'GS','Goldman':'GS','Apple':'AAPL',
    'Microsoft':'MSFT','Amazon':'AMZN','Alphabet':'GOOGL','Meta':'META',
    'Facebook':'META','Netflix':'NFLX','Uber':'UBER','Airbnb':'ABNB',
    'Rivian':'RIVN','Coinbase':'COIN','JPMorgan':'JPM','JP Morgan':'JPM',
    'Bank of America':'BAC','Citigroup':'C','Citi':'C','Morgan Stanley':'MS',
    'BlackRock':'BLK','Berkshire':'BRK-B','Robinhood':'HOOD',
    'Palantir':'PLTR','Snowflake':'SNOW','Deutsche Bank':'DB',
}
TICKER_RE = re.compile(r'\$([A-Z]{1,5})\b')
SKIP = {'I','A','AT','OR','BE','TO','OF','IN','ON','IS','IT','BY','AS','AN','SO','UP','DO','GO','NO'}

ticker_mentions = defaultdict(list)
for a in articles:
    content = a.get('p','') + ' ' + a.get('t','')
    for m in TICKER_RE.finditer(content):
        t = m.group(1)
        if 2<=len(t)<=5 and t not in SKIP:
            ticker_mentions[t].append({'d':a['d'],'id':a['id'],'t':a['t']})
    for company, ticker in COMPANY_TICKERS.items():
        if company.lower() in content.lower():
            ticker_mentions[ticker].append({'d':a['d'],'id':a['id'],'t':a['t']})

# Dedupe mentions per article
for t in list(ticker_mentions.keys()):
    seen_ids = set()
    deduped_mentions = []
    for m in sorted(ticker_mentions[t], key=lambda x: x['d']):
        if m['id'] not in seen_ids:
            seen_ids.add(m['id'])
            deduped_mentions.append(m)
    ticker_mentions[t] = deduped_mentions

# Fetch current prices
def fetch_ticker(ticker, mentions):
    if len(mentions) < 2: return None
    first_date = mentions[0]['d']
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
        closest = min(valid, key=lambda x: abs(x[0]-target_ts))
        price_then = closest[1]
        price_now = meta.get('regularMarketPrice')
        if not price_then or not price_now: return None
        return {
            'ticker': ticker,
            'first_date': first_date,
            'price_then': round(price_then, 2),
            'price_now': round(price_now, 2),
            'return_pct': round((price_now/price_then-1)*100, 1),
            'mention_count': len(mentions),
            'currency': meta.get('currency','USD'),
            'mentions': mentions[:8]
        }
    except: return None

top_tickers = sorted([(t,m) for t,m in ticker_mentions.items() if t not in SKIP], key=lambda x:-len(x[1]))[:25]
new_tickers = []
for ticker, mentions in top_tickers:
    result = fetch_ticker(ticker, mentions)
    if result:
        new_tickers.append(result)
        print(f"  {ticker}: ${result['price_then']} → ${result['price_now']} ({result['return_pct']:+.0f}%)")
    time.sleep(0.4)

tickers = new_tickers
print(f"Tickers updated: {len(tickers)}")

# ── Build enriched articles for React ────────────────────────────────────────
enriched = []
for a in articles:
    c = classified.get(a['id'], {})
    enriched.append({
        'id': a['id'], 't': a['t'], 'd': a['d'], 'u': a['u'], 'w': a['w'],
        'themes': c.get('themes',[]),
        'lesson': c.get('lesson','')[:160],
        'summary': c.get('summary','')[:280],
    })

# ── Save all outputs ──────────────────────────────────────────────────────────
# Update data files in scripts/ (for next run's state)
with open(articles_path,   'w') as f: json.dump(articles,   f, separators=(',',':'))
with open(classified_path, 'w') as f: json.dump(classified, f, separators=(',',':'))
with open(tickers_path,    'w') as f: json.dump(tickers,    f, separators=(',',':'))

# Write to src/ for Vite build
os.makedirs(SRC_DIR, exist_ok=True)
with open(os.path.join(SRC_DIR, 'articles.json'), 'w') as f: json.dump(enriched, f, separators=(',',':'))
with open(os.path.join(SRC_DIR, 'tickers.json'),  'w') as f: json.dump(tickers,  f, separators=(',',':'))

print(f"\n✅ Pipeline complete:")
print(f"   Articles: {len(enriched)}")
print(f"   Classified: {len(classified)}")
print(f"   Tickers: {len(tickers)}")
