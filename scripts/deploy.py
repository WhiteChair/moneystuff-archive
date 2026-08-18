#!/usr/bin/env python3
"""Deploy built dist/ to Vercel via API.

Files are uploaded individually to /v2/files keyed by SHA1, then the deployment
references them by digest. The previous version inlined every file's bytes into
a single JSON body, which was fine for a ~2MB bundle but fails once the
full-text shards (~25MB) are in dist/. Uploading by digest also lets Vercel skip
shards whose contents haven't changed since the last deploy.
"""
import json, urllib.request, urllib.error, hashlib, os, time, sys
from concurrent.futures import ThreadPoolExecutor

TOKEN   = os.environ.get('VERCEL_TOKEN', '')
TEAM    = os.environ.get('VERCEL_TEAM_ID', 'team_frtLRzDPA3ZjB3clAnGBHEhH')
PROJECT = os.environ.get('VERCEL_PROJECT_ID', 'prj_tGcny5Zx8up0uXfxSQ9tjZOJoWLk')
DIST    = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')

if not TOKEN:
    print("ERROR: VERCEL_TOKEN not set"); sys.exit(1)


def collect():
    out = []
    for root, dirs, filenames in os.walk(DIST):
        dirs[:] = [d for d in dirs if d != 'node_modules']
        for fname in filenames:
            fpath = os.path.join(root, fname)
            with open(fpath, 'rb') as f:
                content = f.read()
            out.append({'file': os.path.relpath(fpath, DIST).replace(os.sep, '/'),
                        'sha': hashlib.sha1(content).hexdigest(),
                        'size': len(content),
                        'bytes': content})
    return out


def upload(entry, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                f'https://api.vercel.com/v2/files?teamId={TEAM}',
                data=entry['bytes'],
                headers={'Authorization': f'Bearer {TOKEN}',
                         'Content-Type': 'application/octet-stream',
                         'x-vercel-digest': entry['sha'],
                         'Content-Length': str(entry['size'])},
                method='POST')
            with urllib.request.urlopen(req, timeout=120) as r:
                r.read()
            return None
        except urllib.error.HTTPError as e:
            body = e.read().decode()[:200]
            if attempt == retries - 1:
                return f"{entry['file']}: {e.code} {body}"
            time.sleep(2 * (attempt + 1))
        except Exception as e:
            if attempt == retries - 1:
                return f"{entry['file']}: {e}"
            time.sleep(2 * (attempt + 1))
    return None


files = collect()
print(f"Uploading {len(files)} files ({sum(f['size'] for f in files)/1e6:.1f} MB)...")

errors = [e for e in ThreadPoolExecutor(max_workers=6).map(upload, files) if e]
if errors:
    print("Upload errors:"); [print("  " + e) for e in errors[:10]]
    sys.exit(1)

payload = json.dumps({
    'name': 'moneystuff-archive',
    'files': [{'file': f['file'], 'sha': f['sha'], 'size': f['size']} for f in files],
    'target': 'production', 'project': PROJECT,
    'builds': [{'use': '@vercel/static'}],
}).encode()

req = urllib.request.Request(
    f'https://api.vercel.com/v13/deployments?teamId={TEAM}',
    data=payload,
    headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
    method='POST')

try:
    with urllib.request.urlopen(req, timeout=120) as r:
        resp = json.loads(r.read())
except urllib.error.HTTPError as e:
    print(f"Deploy error: {e.code} {e.read().decode()[:400]}"); sys.exit(1)

deploy_id, url = resp.get('id'), resp.get('url')
print(f"Deployment {deploy_id} initializing: https://{url}")

for i in range(40):
    time.sleep(5)
    req2 = urllib.request.Request(
        f'https://api.vercel.com/v13/deployments/{deploy_id}?teamId={TEAM}',
        headers={'Authorization': f'Bearer {TOKEN}'})
    with urllib.request.urlopen(req2, timeout=15) as r:
        d = json.loads(r.read())
    state = d.get('readyState', '?')
    print(f"  [{i+1}] {state}")
    if state == 'READY':
        print("\n✅ Live: https://moneystuff-archive.vercel.app"); sys.exit(0)
    if state in ('ERROR', 'CANCELED'):
        print("Deployment failed"); sys.exit(1)

print("Timed out waiting for deployment"); sys.exit(1)
