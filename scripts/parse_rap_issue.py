#!/usr/bin/env python3
"""Validate an owner-authorized RAP wind-profile issue before worker execution."""
from __future__ import annotations
import datetime as dt
import os
import re
import sys

body = os.environ.get("ISSUE_BODY", "")
def field(name):
    match = re.search(r"(?m)^" + re.escape(name) + r"=([^\r\n]+)$", body)
    if not match:
        raise ValueError(f"Missing {name}")
    return match.group(1).strip()
try:
    site = field("SITE").upper()
    cycle = field("CYCLE_UTC")
    latest = re.search(r"(?m)^LATEST=(1|0)\s*$", body)
    latest_mode = latest is not None and latest.group(1) == "1"
    if not re.fullmatch(r"K[A-Z0-9]{3}", site):
        raise ValueError("SITE must be KXXX")
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:00Z", cycle):
        raise ValueError("CYCLE_UTC must be YYYY-MM-DDTHH:00Z")
    instant = dt.datetime.fromisoformat(cycle.replace("Z", "+00:00"))
    now = dt.datetime.now(dt.timezone.utc)
    if instant > now + dt.timedelta(minutes=5):
        raise ValueError("RAP reference cycle cannot be in the future")
    if latest_mode and not (dt.timedelta(0) <= now-instant <= dt.timedelta(hours=24)):
        raise ValueError("Latest-mode reference cycle must be in the past 24 hours")
except Exception as exc:
    print(f"Invalid RAP request: {exc}", file=sys.stderr)
    sys.exit(2)
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as out:
    out.write(f"site={site}\ncycle={cycle}\nlatest={int(latest_mode)}\n")
print(f"Validated owner-authorized RAP request {site} {cycle}, latest={latest_mode}")
