#!/usr/bin/env python3
"""Optional RAP f00 profile sampler. Produces browser-readable data/rap.json.

Dependencies: herbie-data, cfgrib, eccodes, numpy.
Uses RAP surface height, 10-m winds and pressure-level U/V/geopotential height;
linearly interpolates vector winds to 1 and 3 km AGL near the radar station.
Failures are explicit: a missing field will NOT be silently substituted.
"""
from __future__ import annotations
import argparse
import datetime as dt
import json
import math
from pathlib import Path
import numpy as np
from herbie import Herbie

ROOT=Path(__file__).resolve().parents[1]
STATIONS={"KMOB":(30.68,-88.24),"KEVX":(30.56,-85.92),"KDGX":(32.28,-89.98),
          "KHDC":(30.52,-90.42),"KLIX":(30.34,-89.83),"KEOX":(31.46,-85.46),
          "KVAX":(30.89,-83.00),"KTLH":(30.40,-84.33),"KBMX":(33.17,-86.77),
          "KJAN":(32.32,-90.08)}
def read_field(H,regex,lat,lon):
    ds=H.xarray(regex)
    if isinstance(ds,list):
        if len(ds)!=1: raise RuntimeError(f"Ambiguous RAP selection: {regex}")
        ds=ds[0]
    keys=list(ds.data_vars)
    if not keys:raise RuntimeError("Missing RAP field: "+regex)
    name=keys[0]
    arr=np.asarray(ds[name].squeeze(),dtype=float)
    latitude=np.asarray(ds.latitude)
    longitude=np.asarray(ds.longitude)
    latitude=np.squeeze(latitude);longitude=np.squeeze(longitude)
    if arr.ndim!=2 or latitude.shape!=arr.shape or longitude.shape!=arr.shape:
        raise RuntimeError(f"Unexpected RAP grid shape for {regex}: {arr.shape}")
    lon_grid=((longitude+180)%360)-180
    ix=np.unravel_index(np.nanargmin((latitude-lat)**2+(lon_grid-lon)**2*np.cos(np.deg2rad(lat))**2),arr.shape)
    return float(arr[ix])
def wind(u,v):
    return {"dir":round(math.degrees(math.atan2(-u,-v))%360,1),
            "spd":round(math.hypot(u,v)*1.943844,1)}
def run():
    p=argparse.ArgumentParser()
    p.add_argument("--time",required=True,help="UTC initialization datetime, rounded down to hour")
    p.add_argument("--site",default="KMOB")
    p.add_argument("--lat",type=float)
    p.add_argument("--lon",type=float)
    a=p.parse_args()
    site=a.site.upper()
    lat,lon=STATIONS.get(site,(None,None))
    if a.lat is not None:lat=a.lat
    if a.lon is not None:lon=a.lon
    if lat is None or lon is None:p.error("Site not in station dictionary; specify --lat and --lon")
    time=dt.datetime.fromisoformat(a.time.replace("Z","+00:00")).astimezone(dt.timezone.utc).replace(minute=0,second=0,microsecond=0)
    h=Herbie(time,model="rap",product="awp130pgrb",fxx=0,priority=["aws","google","nomads"])
    if not h.grib:p.error("RAP f00 file not found for "+str(time))
    u0=read_field(h,"UGRD:10 m above ground",lat,lon)
    v0=read_field(h,"VGRD:10 m above ground",lat,lon)
    terrain=read_field(h,"HGT:surface",lat,lon)
    levels=[(10.,u0,v0)]
    for pressure in (1000,975,950,925,900,850,800,750,700,650,600,500):
        try:
            u=read_field(h,f"UGRD:{pressure} mb",lat,lon)
            v=read_field(h,f"VGRD:{pressure} mb",lat,lon)
            z=read_field(h,f"HGT:{pressure} mb",lat,lon)-terrain
            if z>0 and math.isfinite(z):levels.append((z,u,v))
        except Exception as err:
            print("Skipping missing RAP pressure level",pressure,err,flush=True)
    levels=sorted(levels)
    z=np.array([x[0] for x in levels])
    if len(z)<3 or z[-1]<3000:raise RuntimeError("RAP profile does not bracket 3 km AGL; no result published")
    u=np.array([x[1] for x in levels]);v=np.array([x[2] for x in levels])
    winds={}
    for label,height in (("0",10),("1",1000),("3",3000)):
        w=wind(float(np.interp(height,z,u)),float(np.interp(height,z,v)))
        winds["dir"+label]=w["dir"];winds["spd"+label]=w["spd"]
    profile={"model":"RAP F00","cycle":time.isoformat().replace("+00:00","Z"),
             "valid_time":time.isoformat().replace("+00:00","Z"),"site":site,
             "latitude":lat,"longitude":lon,"terrain_msl_m":round(terrain),
             "source":"RAP AWIP130 13-km pressure-level and 10-m winds, interpolated to AGL",
             "winds":winds,"levels_agl_m":list(np.round(z).astype(int))}
    out=ROOT/"data"/"rap.json";out.parent.mkdir(exist_ok=True)
    old=json.loads(out.read_text()) if out.exists() else {"profiles":[]}
    existing={(x.get("site"),x.get("valid_time")):x for x in old.get("profiles",[])}
    existing[(site,profile["valid_time"])]=profile
    profiles=sorted(existing.values(),key=lambda x:x["valid_time"])[-120:]
    out.write_text(json.dumps({"profiles":profiles},indent=2)+"\n")
    print(json.dumps(profile,indent=2))
if __name__=="__main__":
    run()
