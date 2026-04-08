#!/usr/bin/env python3
"""Deploy built dist/ to Vercel via API."""
import json, urllib.request, urllib.error, base64, os, time, sys

TOKEN   = os.environ.get('VERCEL_TOKEN', '')
TEAM    = os.environ.get('VERCEL_TEAM_ID', 'team_frtLRzDPA3ZjB3clAnGBHEhH')
PROJECT = os.environ.get('VERCEL_PROJECT_ID', 'prj_tGcny5Zx8up0uXfxSQ9tjZOJoWLk')
DIST    = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'dist')

if not TOKEN:
    print("ERROR: VERCEL_TOKEN not set"); sys.exit(1)

# Collect dist files
files = []
for root, dirs, filenames in os.walk(DIST):
    dirs[:] = [d for d in dirs if d != 'node_modules']
    for fname in filenames:
        fpath = os.path.join(root, fname)
        rel   = os.path.relpath(fpath, DIST)
        with open(fpath, 'rb') as f:
            content = f.read()
        try:
            files.append({'file': rel, 'data': content.decode('utf-8'), 'encoding': 'utf-8'})
        except:
            files.append({'file': rel, 'data': base64.b64encode(content).decode(), 'encoding': 'base64'})

print(f"Deploying {len(files)} files to Vercel...")

payload = json.dumps({
    'name': 'moneystuff-archive', 'files': files,
    'target': 'production', 'project': PROJECT,
    'builds': [{'use': '@vercel/static'}],
}).encode()

req = urllib.request.Request(
    f'https://api.vercel.com/v13/deployments?teamId={TEAM}',
    data=payload,
    headers={'Authorization': f'Bearer {TOKEN}', 'Content-Type': 'application/json'},
    method='POST'
)

try:
    with urllib.request.urlopen(req, timeout=60) as r:
        resp = json.loads(r.read())
except urllib.error.HTTPError as e:
    print(f"Deploy error: {e.code} {e.read().decode()[:300]}"); sys.exit(1)

deploy_id = resp.get('id')
url       = resp.get('url')
print(f"Deployment {deploy_id} initializing: https://{url}")

# Poll for ready
for i in range(30):
    time.sleep(5)
    req2 = urllib.request.Request(
        f'https://api.vercel.com/v13/deployments/{deploy_id}?teamId={TEAM}',
        headers={'Authorization': f'Bearer {TOKEN}'}
    )
    with urllib.request.urlopen(req2, timeout=15) as r:
        d = json.loads(r.read())
    state = d.get('readyState','?')
    print(f"  [{i+1}] {state}")
    if state == 'READY':
        print(f"\n✅ Live: https://moneystuff-archive.vercel.app")
        sys.exit(0)
    if state in ('ERROR','CANCELED'):
        print("Deployment failed"); sys.exit(1)

print("Timed out waiting for deployment"); sys.exit(1)
