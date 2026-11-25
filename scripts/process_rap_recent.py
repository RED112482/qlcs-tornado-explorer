#!/usr/bin/env python3
"""Try recent RAP F00 analyses backwards until an actual available GRIB is processed.

For live requests only. Does not synthesize or time-shift model wind fields.
The underlying process_rap.py writes provenance with the TRUE cycle timestamp.
"""
from __future__ import annotations
import argparse
import datetime as dt
import subprocess
import sys
from pathlib import Path

parser=argparse.ArgumentParser()
parser.add_argument("--site",required=True)
parser.add_argument("--reference",required=True,help="UTC reference analysis cycle")
parser.add_argument("--hours-back",type=int,default=5)
args=parser.parse_args()
assert 1<=args.hours_back<=6
now=dt.datetime.now(dt.timezone.utc)
ref=dt.datetime.fromisoformat(args.reference.replace("Z","+00:00")).astimezone(dt.timezone.utc)
ref=ref.replace(minute=0,second=0,microsecond=0)
if ref>now or now-ref>dt.timedelta(hours=24):
    parser.error("Latest RAP reference must be in the last 24 hours")
processor=Path(__file__).with_name("process_rap.py")
for delay in range(args.hours_back+1):
    cycle=ref-dt.timedelta(hours=delay)
    stamp=cycle.strftime("%Y-%m-%dT%H:00Z")
    print(f"Checking REAL RAP F00 {stamp} ({delay}h behind selected cycle)",flush=True)
    try:
        result=subprocess.run([sys.executable,str(processor),"--site",args.site,
                               "--time",stamp],check=False,timeout=230)
        if result.returncode==0:
            print(f"Published latest AVAILABLE RAP model analysis {stamp}; age at execution = {(now-cycle).total_seconds()/3600:.2f} h",flush=True)
            sys.exit(0)
        print(f"RAP F00 {stamp} unavailable or decoding failed (exit {result.returncode}); trying older cycle",flush=True)
    except subprocess.TimeoutExpired:
        print(f"RAP {stamp} timed out after 230 s; trying older cycle",flush=True)
raise SystemExit("No valid RAP F00 profile was retrievable/decodable within the requested lookback; manual winds preserved.")
