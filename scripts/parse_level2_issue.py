#!/usr/bin/env python3
"""Validate a GitHub issue request for an archived Level II time window.

Only numerical/site values are emitted to GitHub Actions outputs. The caller
must separately authorize the GitHub issue author (repository owner).
"""
from __future__ import annotations

import datetime as dt
import os
import re
import sys

body = os.environ.get("ISSUE_BODY", "")
def get(name: str) -> str:
    found = re.search(r"(?m)^" + re.escape(name) + r"=([^\r\n]+)$", body)
    if not found:
        raise ValueError(f"Missing request field: {name}")
    return found.group(1).strip()

try:
    site = get("SITE").upper()
    start = get("START_UTC")
    end = get("END_UTC")
    limit = int(get("MAX_SCANS"))
    if not re.fullmatch(r"K[A-Z0-9]{3}", site):
        raise ValueError("Invalid 4-character site")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z", start) or not re.fullmatch(
        r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z", end
    ):
        raise ValueError("Timestamps must be YYYY-MM-DDTHH:MMZ")
    t0 = dt.datetime.fromisoformat(start.replace("Z", "+00:00"))
    t1 = dt.datetime.fromisoformat(end.replace("Z", "+00:00"))
    if not (dt.timedelta(minutes=1) <= t1 - t0 <= dt.timedelta(hours=3)):
        raise ValueError("Time window must be 1 minute to 3 hours")
    if t1 > dt.datetime.now(dt.timezone.utc) + dt.timedelta(minutes=5):
        raise ValueError("Historical request cannot target a future date")
    if not 1 <= limit <= 16:
        raise ValueError("MAX_SCANS must be 1–16")
except Exception as exc:
    print(f"Invalid Level II request: {exc}", file=sys.stderr)
    sys.exit(2)

result = {"site": site, "start": start, "end": end, "limit": str(limit)}
output = os.environ["GITHUB_OUTPUT"]
with open(output, "a", encoding="utf-8") as stream:
    for key, value in result.items():
        stream.write(f"{key}={value}\n")
print(f"Authorized request values validated: {site} {start}–{end}; up to {limit} volumes")
