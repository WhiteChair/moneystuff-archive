# Money Stuff Archive

Unofficial archive of Matt Levine's Money Stuff newsletter (Bloomberg Opinion).
851+ issues classified by theme, with key lessons extracted and ticker tracking.

**Live site:** https://moneystuff-archive.vercel.app

## Setup (one-time)

1. Fork/clone this repo to your GitHub account
2. Add these GitHub repository secrets (Settings → Secrets → Actions):
   - `VERCEL_TOKEN` — your Vercel token
   - `GH_TOKEN` — GitHub personal access token with `repo` scope (for committing data updates back)
3. The workflow runs automatically at **2:00 AM EST** daily

## Manual trigger

Go to Actions → Daily Update → Run workflow

## Local development

```bash
npm install
python3 scripts/update.py   # fetch latest articles & rebuild data
npm run build               # build production bundle
npm run dev                 # dev server at localhost:5173
```

## Stack

- React + Vite (frontend)
- D3 (bubble chart)
- Python (scraper + classifier + ticker fetcher)
- Yahoo Finance API (ticker prices, no key needed)
- NewsletterHunt (article source)
- GitHub Actions (daily automation)
- Vercel (hosting)
