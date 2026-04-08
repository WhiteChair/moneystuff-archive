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
max_id       = max((int(a['id']) for a in articles), default=0)
print(f"Existing: {len(articles)} articles, max ID: {max_id}")

# ── Discover new article IDs ──────────────────────────────────────────────────
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
for page in range(1, 6):
    ids = fetch_page_ids(page)
    fresh = [i for i in ids if int(i) > max_id and i not in existing_ids]
    new_ids.extend(fresh)
    if not fresh and page > 2: break
    time.sleep(0.3)
new_ids = list(set(new_ids))
print(f"New IDs: {len(new_ids)}")

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
        return {'id': aid, 't': title, 'd': date, 'u': url, 'w': len(words), 'p': ' '.join(words[:300])}
    except: return None

if new_ids:
    print(f"Fetching {len(new_ids)} articles...")
    fetched = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        for result in ex.map(fetch_article, new_ids):
            if result:
                fetched.append(result)
                print(f"  ✓ {result['d']} | {result['t'][:50]}")
            time.sleep(0.1)
    articles.extend(fetched)

# Dedupe + sort
seen, deduped = set(), []
for a in sorted(articles, key=lambda x: x.get('d',''), reverse=True):
    k = (a['t'][:40], a['d'])
    if k not in seen: seen.add(k); deduped.append(a)
articles = deduped

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
    text = (a['t'] + ' ' + a.get('p','')).lower()
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

new_to_classify = [a for a in articles if a['id'] not in classified]
if new_to_classify:
    print(f"Classifying {len(new_to_classify)} new articles...")
    for a in new_to_classify:
        classified[a['id']] = classify_one(a)

# ── Refresh ticker prices ─────────────────────────────────────────────────────
print("Refreshing ticker prices...")
COMPANY_TICKERS = {
    'Tesla':'TSLA','Goldman Sachs':'GS','Goldman':'GS','Apple':'AAPL','Microsoft':'MSFT',
    'Amazon':'AMZN','Alphabet':'GOOGL','Meta':'META','Facebook':'META','Netflix':'NFLX',
    'Uber':'UBER','Airbnb':'ABNB','Rivian':'RIVN','Coinbase':'COIN','JPMorgan':'JPM',
    'JP Morgan':'JPM','Bank of America':'BAC','Citigroup':'C','Citi':'C','Morgan Stanley':'MS',
    'BlackRock':'BLK','Berkshire':'BRK-B','Robinhood':'HOOD','Palantir':'PLTR',
    'Snowflake':'SNOW','Deutsche Bank':'DB',
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

for t in list(ticker_mentions.keys()):
    seen_ids, deduped_m = set(), []
    for m in sorted(ticker_mentions[t], key=lambda x: x['d'], reverse=True):
        if m['id'] not in seen_ids: seen_ids.add(m['id']); deduped_m.append(m)
    ticker_mentions[t] = deduped_m

def fetch_ticker(ticker, mentions):
    if len(mentions) < 2: return None
    first_date = sorted(mentions, key=lambda m: m['d'])[0]['d']
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
        price_then, price_now = closest[1], meta.get('regularMarketPrice')
        if not price_then or not price_now: return None
        return {'ticker':ticker,'first_date':first_date,'price_then':round(price_then,2),
                'price_now':round(price_now,2),'return_pct':round((price_now/price_then-1)*100,1),
                'mention_count':len(mentions),'currency':meta.get('currency','USD'),
                'mentions':mentions[:8]}
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

# ── Update bankrupt company mentions ─────────────────────────────────────────
BANKRUPT_DATA = [
    {"ticker":"FTX","name":"FTX","status":"bankrupt","bankruptcy_date":"2022-11-11",
     "note":"Sam Bankman-Fried's crypto exchange collapsed Nov 2022. SBF sentenced to 25 years."},
    {"ticker":"SIVB","name":"Silicon Valley Bank","status":"bankrupt","bankruptcy_date":"2023-03-10",
     "note":"Failed March 2023, second-largest US bank failure. Acquired by First Citizens."},
    {"ticker":"CS","name":"Credit Suisse","status":"bankrupt","bankruptcy_date":"2023-03-19",
     "note":"Forced merger with UBS in March 2023. AT1 bonds wiped to zero."},
    {"ticker":"WE","name":"WeWork","status":"bankrupt","bankruptcy_date":"2023-11-06",
     "note":"Filed Chapter 11 Nov 2023 after spectacular collapse from $47B valuation."},
    {"ticker":"CELH","name":"Celsius Network","status":"bankrupt","bankruptcy_date":"2022-07-13",
     "note":"Crypto lender froze withdrawals and filed bankruptcy July 2022."},
]
B_MATCH = {'FTX':['ftx','sam bankman'],'SIVB':['silicon valley bank','svb'],
           'CS':['credit suisse'],'WE':['wework'],'CELH':['celsius']}
b_mentions = defaultdict(list)
for a in articles:
    content = (a.get('p','') + ' ' + a.get('t','')).lower()
    for ticker, terms in B_MATCH.items():
        if any(t in content for t in terms):
            b_mentions[ticker].append({'d':a['d'],'id':a['id'],'t':a['t']})

bankrupt = []
for b in BANKRUPT_DATA:
    b_copy = dict(b)
    b_copy['mention_count'] = len(b_mentions[b['ticker']])
    b_copy['mentions'] = sorted(b_mentions[b['ticker']], key=lambda m: m['d'], reverse=True)[:8]
    bankrupt.append(b_copy)

# ── Build enriched articles ───────────────────────────────────────────────────
enriched = []
for a in articles:
    c = classified.get(a['id'], {})
    enriched.append({'id':a['id'],'t':a['t'],'d':a['d'],'u':a['u'],'w':a['w'],
                     'themes':c.get('themes',[]),'lesson':c.get('lesson','')[:180],'summary':c.get('summary','')[:300]})

# ── Save everything ───────────────────────────────────────────────────────────
with open(articles_path,   'w') as f: json.dump(articles,   f, separators=(',',':'))
with open(classified_path, 'w') as f: json.dump(classified, f, separators=(',',':'))
with open(tickers_path,    'w') as f: json.dump(tickers,    f, separators=(',',':'))

os.makedirs(SRC_DIR, exist_ok=True)
with open(os.path.join(SRC_DIR,'articles.json'),'w') as f: json.dump(enriched, f, separators=(',',':'))
with open(os.path.join(SRC_DIR,'tickers.json'), 'w') as f: json.dump(tickers,  f, separators=(',',':'))
with open(os.path.join(SRC_DIR,'bankrupt.json'),'w') as f: json.dump(bankrupt, f, indent=2)

print(f"\n✅ Done: {len(enriched)} articles, {len(classified)} classified, {len(tickers)} tickers, {len(bankrupt)} bankrupt")
