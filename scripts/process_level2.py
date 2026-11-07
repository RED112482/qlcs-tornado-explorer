#!/usr/bin/env python3
"""Decode NOAA/Unidata NEXRAD Level II volumes to georeferenced PNG frames.

Run: python scripts/process_level2.py --site KHDC --start 2024-06-04T21:00 --end 2024-06-04T22:00 --max-files 8
Latest: python scripts/process_level2.py --site KMOB --latest --max-files 3
Source: s3://unidata-nexrad-level2/YYYY/MM/DD/KXXX/
Processed map frames are a visualization of native Level II gates, not resampled Level III.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import re
import tempfile
from pathlib import Path
import numpy as np
import boto3
from botocore import UNSIGNED
from botocore.config import Config
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import BoundaryNorm, ListedColormap
import pyart
from pyproj import Transformer

BUCKET = "unidata-nexrad-level2"
ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
COLORS = ["#00aa00", "#00e500", "#ffff00", "#ffaa00", "#ff6a00", "#ff0000",
          "#bd0000", "#e000a0", "#fd64f0", "#7b00dc", "#4a00a0", "#c4ffff"]
LEVELS = [5, 15, 20, 30, 35, 40, 45, 50, 55, 60, 65, 70, 85]
CMAP = ListedColormap(COLORS)
NORM = BoundaryNorm(LEVELS, CMAP.N)

def utc(s: str) -> dt.datetime:
    return dt.datetime.fromisoformat(s.replace("Z", "+00:00")).replace(tzinfo=dt.timezone.utc)

def dates_in(start, end):
    day = start.date()
    while day <= end.date():
        yield day
        day += dt.timedelta(days=1)

def list_scans(client, site, start, end):
    # Public S3 inventory contains full scans; ignore supplemental MDM files.
    pattern = re.compile(rf"^{site}(\d{{8}})_(\d{{6}})")
    objects = []
    for date in dates_in(start, end):
        prefix = f"{date:%Y/%m/%d}/{site}/"
        for page in client.get_paginator("list_objects_v2").paginate(Bucket=BUCKET, Prefix=prefix):
            for row in page.get("Contents", []):
                key = row["Key"]
                m = pattern.search(key.rsplit("/", 1)[-1])
                if not m:
                    continue
                stamp = dt.datetime.strptime(m[1] + m[2], "%Y%m%d%H%M%S").replace(tzinfo=dt.timezone.utc)
                if start <= stamp <= end and row["Size"] > 100000:
                    objects.append((stamp, key))
    return sorted(objects)

def render(radar, png: Path, max_range_km: float=160, image_size_px: int=2300):
    # First (lowest) elevation sweep; the actual mean angle is recorded.
    sweep = 0
    first, last = radar.get_start_end(sweep)
    candidates = ["reflectivity", "REF", "DBZ", "corrected_reflectivity"]
    field = next((key for key in candidates if key in radar.fields), None)
    if not field:
        raise ValueError("No reflectivity field in this Level II volume: " + str(list(radar.fields)))
    values = np.ma.array(radar.fields[field]["data"][first:last + 1], dtype=float)
    lats, lons, _ = radar.get_gate_lat_lon_alt(sweep)
    # Keep the native range-gate detail in the storm-scale display, rather than
    # shrinking an entire 460-km radius scan into a modest 1400-pixel image.
    gate_ranges = np.asarray(radar.range['data'])
    keep = np.flatnonzero(gate_ranges <= max_range_km*1000)
    if not len(keep):raise RuntimeError('No Level II gates within chosen range')
    ng = min(len(keep),values.shape[1])
    values=values[:,:ng];lats=lats[:,:ng];lons=lons[:,:ng]
    # Guard against masked, non-finite, or very low returns.
    mask = np.ma.getmaskarray(values) | ~np.isfinite(values.filled(np.nan)) | (values.filled(-999) < 5)
    values = np.ma.masked_where(mask, values)
    to_mercator = Transformer.from_crs('EPSG:4326','EPSG:3857',always_xy=True)
    to_geo = Transformer.from_crs('EPSG:3857','EPSG:4326',always_xy=True)
    xm, ym = to_mercator.transform(lons,lats)
    xmin, xmax = float(np.nanmin(xm)), float(np.nanmax(xm))
    ymin, ymax = float(np.nanmin(ym)), float(np.nanmax(ym))
    pad = 1800.0  # small 1.8 km margin in projected coordinates
    xmin -= pad; xmax += pad; ymin -= pad; ymax += pad
    lon_min, lat_min = to_geo.transform(xmin,ymin)
    lon_max, lat_max = to_geo.transform(xmax,ymax)
    bounds = [[lat_min, lon_min], [lat_max, lon_max]]
    size = 10
    dpi=max(120,int(image_size_px/size))
    fig = plt.figure(figsize=(size, size), dpi=dpi, facecolor=(0,0,0,0))
    ax = fig.add_axes([0,0,1,1])
    ax.set_xlim(xmin,xmax)
    ax.set_ylim(ymin,ymax)
    ax.axis("off")
    # Plot native gate centers in EPSG:3857 so Leaflet overlays align precisely;
    # masked/no-echo pixels remain transparent.
    cmap = CMAP.copy()
    cmap.set_bad((0,0,0,0))
    ax.pcolormesh(xm, ym, values, cmap=cmap, norm=NORM, shading="nearest",
                  rasterized=True, antialiased=False)
    png.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(png, transparent=True, facecolor=(0,0,0,0), edgecolor="none",
                pad_inches=0)
    plt.close(fig)
    angle = float(np.nanmedian(radar.elevation["data"][first:last + 1]))
    return bounds, angle

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", required=True)
    parser.add_argument("--start", help="UTC ISO start")
    parser.add_argument("--end", help="UTC ISO end")
    parser.add_argument("--latest", action="store_true", help="Last 90 min")
    parser.add_argument("--max-files", type=int, default=72, help="Maximum scans to process; 0 means all, capped at 96")
    parser.add_argument("--range-km",type=int,default=160,help="Radar radius to render in km (80–230); native gates preserved")
    parser.add_argument("--pixels",type=int,default=2300,help="PNG width/height in pixels (1400–2800)")
    args = parser.parse_args()
    site = args.site.upper()
    if not re.fullmatch(r"K[A-Z0-9]{3}", site):
        parser.error("Site must be four-character NEXRAD ID, e.g. KMOB")
    if args.latest:
        end = dt.datetime.now(dt.timezone.utc)
        start = end - dt.timedelta(minutes=90)
    else:
        if not args.start or not args.end:
            parser.error("Supply --start and --end, or --latest")
        start, end = utc(args.start), utc(args.end)
    if end <= start or end - start > dt.timedelta(hours=6):
        parser.error("Time range must be greater than 0 and at most 6 hours")
    limit = min(max(args.max_files if args.max_files > 0 else 96, 1), 96)
    render_range=int(np.clip(args.range_km,80,230))
    render_pixels=int(np.clip(args.pixels,1400,2800))
    client = boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))
    scans = list_scans(client, site, start, end)
    if not scans:
        raise SystemExit(f"No Level II files found for {site} during UTC {start}–{end}")
    if args.latest:
        chosen = scans[-limit:]
    else:
        positions = np.linspace(0, len(scans)-1, min(limit,len(scans))).astype(int)
        chosen = [scans[i] for i in positions]
    frames = []
    for stamp, key in chosen:
        print("Reading", key, flush=True)
        with tempfile.TemporaryDirectory() as tmp:
            raw = Path(tmp)/"nexrad_volume"
            client.download_file(BUCKET, key, str(raw))
            radar = pyart.io.read_nexrad_archive(str(raw))
            relative = Path("data")/site/f"{stamp:%Y%m%d_%H%M%S}.png"
            bounds, angle = render(radar, ROOT/relative, max_range_km=render_range, image_size_px=render_pixels)
        frames.append(dict(site=site,time=stamp.isoformat().replace("+00:00","Z"),
                           url="./"+relative.as_posix(),bounds=bounds,
                           elevation_deg=round(angle,2),field="reflectivity",render_radius_km=render_range,
                           image_pixels=render_pixels,
                           source="Unidata NEXRAD Level II",s3_key=key))
    DATA.mkdir(exist_ok=True)
    # Merge retained frames for other sites and dates, retaining bounded history.
    manifest_path = DATA/"manifest.json"
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"frames":[]}
    existing = {(f["site"],f["time"]):f for f in old.get("frames", [])}
    for f in frames:
        existing[(f["site"],f["time"])] = f
    merged = sorted(existing.values(),key=lambda f:f["time"])[-500:]
    manifest_path.write_text(json.dumps({"version":1,"updated":dt.datetime.now(dt.timezone.utc).isoformat(),
                                         "frames":merged},indent=2)+"\n")
    print(f"Published {len(frames)} Level II image(s) to {manifest_path}",flush=True)

if __name__=="__main__":
    run()
