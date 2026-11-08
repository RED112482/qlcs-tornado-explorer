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
from matplotlib.colors import BoundaryNorm, ListedColormap, LinearSegmentedColormap, Normalize
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
# Un-dealiased radial velocity, negative=inbound, positive=outbound, in knots.
VEL_CMAP = LinearSegmentedColormap.from_list("native_vel", [
    "#0f522f", "#008e49", "#24ce68", "#91f7b1", "#cdd8da",
    "#dedee0", "#f2c9bc", "#ee6865", "#cb2e3b", "#8c122a"], N=256)
VEL_NORM = Normalize(vmin=-75, vmax=75)

def utc(s: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)

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

def select_lowest_sweep(radar, field):
    """Split-cut volumes can store low-level reflectivity and velocity in different sweeps."""
    valid = []
    for sweep in range(radar.nsweeps):
        first, last = radar.get_start_end(sweep)
        data = np.ma.asarray(radar.fields[field]["data"][first:last + 1])
        count = int(np.ma.count(data))
        if count < 250:
            continue
        elevation = float(np.nanmedian(radar.elevation["data"][first:last + 1]))
        valid.append((elevation, -count, sweep))
    if not valid:
        raise ValueError(f"No valid low-level sweep for {field}")
    return min(valid)[2]


def render(radar, png: Path, moment="reflectivity", max_range_km: float=160, image_size_px: int=2300):
    candidates = (["reflectivity", "REF", "DBZ", "corrected_reflectivity"]
                  if moment == "reflectivity" else ["velocity", "VEL", "VRAD", "corrected_velocity"])
    field = next((name for name in candidates if name in radar.fields), None)
    if field is None:
        raise ValueError(f"Field {moment} unavailable: {list(radar.fields)}")
    sweep = select_lowest_sweep(radar, field)
    first, last = radar.get_start_end(sweep)
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
    mask = np.ma.getmaskarray(values) | ~np.isfinite(values.filled(np.nan))
    if moment == "reflectivity":
        mask |= values.filled(-999) < 5
    else:
        values = values * 1.94384449  # m/s to kt; preserve aliases
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
    cmap = (CMAP if moment == "reflectivity" else VEL_CMAP).copy()
    cmap.set_bad((0,0,0,0))
    norm = NORM if moment == "reflectivity" else VEL_NORM
    ax.pcolormesh(xm, ym, values, cmap=cmap, norm=norm, shading="nearest",
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
    parser.add_argument("--max-files", type=int, default=12, help="Maximum scans to render in one run (1–32); use separate requests for longer cases")
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
    limit = min(max(args.max_files if args.max_files > 0 else 12, 1), 32)
    render_range=int(np.clip(args.range_km,80,230))
    render_pixels=int(np.clip(args.pixels,1400,2800))
    client = boto3.client("s3", region_name="us-east-1", config=Config(signature_version=UNSIGNED))
    scans = list_scans(client, site, start, end)
    if not scans:
        raise SystemExit(f"No Level II files found for {site} during UTC {start}–{end}")
    print(f"Archive inventory: {len(scans)} Level II volumes for {site} during {start.isoformat()} to {end.isoformat()}", flush=True)
    if args.latest:
        chosen = scans[-limit:]
    else:
        positions = np.linspace(0, len(scans)-1, min(limit,len(scans))).astype(int)
        chosen = [scans[i] for i in positions]
    frames = []
    failures = []
    for stamp, key in chosen:
        print("Decoding", key, flush=True)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                raw = Path(tmp)/"nexrad_volume"
                client.download_file(BUCKET, key, str(raw))
                radar = pyart.io.read_nexrad_archive(str(raw))
                relative = Path("data")/site/f"{stamp:%Y%m%d_%H%M%S}.png"
                bounds, angle = render(radar, ROOT/relative, moment="reflectivity",
                                       max_range_km=render_range, image_size_px=render_pixels)
                vel_url, vel_bounds, vel_angle, vel_error = None, None, None, None
                vel_rel = Path("data")/site/f"{stamp:%Y%m%d_%H%M%S}_vel.png"
                try:
                    vel_bounds, vel_angle = render(radar, ROOT/vel_rel, moment="velocity",
                                                   max_range_km=render_range, image_size_px=render_pixels)
                    vel_url="./"+vel_rel.as_posix()
                except Exception as err:
                    vel_error = str(err)
                    print(f"Velocity sweep unavailable at {stamp}: {err}", flush=True)
            frames.append(dict(site=site,time=stamp.isoformat().replace("+00:00","Z"),
                               url="./"+relative.as_posix(),bounds=bounds,
                               elevation_deg=round(angle,2),field="reflectivity",
                               velocity_url=vel_url,velocity_bounds=vel_bounds,
                               velocity_elevation_deg=round(vel_angle,2) if vel_angle is not None else None,
                               velocity_units="kt",velocity_aliased=True,velocity_error=vel_error,
                               render_radius_km=render_range,image_pixels=render_pixels,
                               source="Unidata NEXRAD Level II",s3_key=key))
            print(f"Decoded {len(frames)}/{len(chosen)}", flush=True)
        except Exception as exc:
            # A single corrupt or unsupported historical volume must not
            # discard the entire case; retain all successfully decoded scans.
            failures.append({"key":key,"error":str(exc)})
            print(f"WARNING: Level II volume failed: {key}: {exc}", flush=True)
            continue
    if not frames:
        raise SystemExit(f"Unable to decode any Level II volumes; {len(failures)} scan errors: {failures[:3]}")
    DATA.mkdir(exist_ok=True)
    # Merge retained frames for other sites and dates, retaining bounded history.
    manifest_path = DATA/"manifest.json"
    old = json.loads(manifest_path.read_text()) if manifest_path.exists() else {"frames":[]}
    existing = {(f["site"],f["time"]):f for f in old.get("frames", [])}
    for f in frames:
        existing[(f["site"],f["time"])] = f
    # Preserve historical case diversity instead of dropping older cases by
    # global chronological recency. A bounded per-site/day cap protects repo size.
    by_case = {}
    for frame in sorted(existing.values(), key=lambda f:f["time"]):
        case_key = (frame["site"], frame["time"][:10])
        by_case.setdefault(case_key, []).append(frame)
    merged = sorted((frame for day in by_case.values() for frame in day[-48:]),
                    key=lambda f:(f["site"], f["time"]))
    manifest_path.write_text(json.dumps({"version":1,"updated":dt.datetime.now(dt.timezone.utc).isoformat(),
                                         "frames":merged},indent=2)+"\n")
    print(f"Published {len(frames)}/{len(chosen)} Level II image(s) to {manifest_path}. Decode failures: {len(failures)}",flush=True)

if __name__=="__main__":
    run()
