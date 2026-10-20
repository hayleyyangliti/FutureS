#!/usr/bin/env python3
"""Invoke after a successful snapshot sync; never log credentials."""
import json
import os
import stat
import urllib.request
from pathlib import Path

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def main():
    path = Path('/home/admin/OmniData/.hotspot-job.env')
    if stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise RuntimeError('Credential file must have mode 0600')
    values = dict(line.split('=', 1) for line in path.read_text().splitlines()
                  if line and not line.startswith('#') and '=' in line)
    secret = values.get('HOTSPOT_JOB_SECRET', '').strip()
    if not secret:
        raise RuntimeError('HOTSPOT_JOB_SECRET missing')
    request = urllib.request.Request(
        'https://futures-rust.vercel.app/api/internal/hotspot-refresh',
        data=b'{}', method='POST',
        headers={'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json'})
    with urllib.request.build_opener(NoRedirect).open(request, timeout=320) as response:
        result = json.load(response)
        print('Hotspot ranking job:', result.get('status', 'UNKNOWN'),
              'displayed:', result.get('displayed', 'unchanged'))

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Hotspot ranking trigger failed:', type(error).__name__)
        raise SystemExit(1)
