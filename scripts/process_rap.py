#!/usr/bin/env python3
"""Extract a verified real RAP F00 10 m, 1 km AGL and 3 km AGL wind profile.

Source: NOAA RAP pressure-level AWIP130 GRIB2 via Herbie AWS, UTC.
Do not publish a RAP result unless all required fields and height brackets exist.
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
SITES={"KMOB":(30.68,-88.24),"KEVX":(30.56,-85.92),"KDGX":(32.28,-89.98),
       "KHDC":(30.52,-90.42),"KLIX":(30.34,-89.83),"KEOX":(31.46,-85.46),
       "KVAX":(30.89,-83.00),"KTLH":(30.40,-84.33),"KBMX":(33.17,-86.77),
       "KJAN":(32.32,-90.08)}
PRESSURES=[1000,975,950,925,900,850,800,750,700,650,600,500]
def vector(u,v):
    return round(math.degrees(math.atan2(-u,-v))%360,1),round(math.hypot(u,v)*1.94384449,1)
def sample_dataarray(da,iy,ix):
    if "y" not in da.dims or "x" not in da.dims: return []
    point=da.isel(y=iy,x=ix)
    if "isobaricInhPa" in point.dims:
        return [(float(z),float(v)) for z,v in zip(point.isobaricInhPa.values,np.asarray(point).ravel())]
    level=point.attrs.get("GRIB_level")
    if level is None:
        if "isobaricInhPa" in point.coords:level=float(point.isobaricInhPa)
        elif "heightAboveGround" in point.coords:level=float(point.heightAboveGround)
        else:level=0
    return [(float(level),float(point))]

def write_rap_spatial_grid(groups,site,cycle,origin_lat,origin_lon):
    """Construct a small actual RAP vector grid, never by repeating one site wind.

    Sample each target at the closest native RAP 13-km model point, interpolate
    10-m/pressure-level U/V to 1 and 3 km AGL with its own model terrain.
    """
    prepared=[]
    for ds in groups:
        if ds is None or "latitude" not in ds or "longitude" not in ds:continue
        a=np.asarray(ds.latitude);b=(np.asarray(ds.longitude)+180)%360-180
        if a.ndim!=2 or b.shape!=a.shape:continue
        region=np.where((np.abs(a-origin_lat)<=1.8)&(np.abs(b-origin_lon)<=2.2))
        if not len(region[0]):continue
        prepared.append((ds,region[0],region[1],a[region],b[region]))
    if not prepared:
        print("RAP grid generation skipped: model latitude/longitude missing",flush=True)
        return
    points=[]
    spacing=25.0
    for row in range(-5,6):
        target_lat=origin_lat+row*spacing/111.2
        for col in range(-5,6):
            target_lon=origin_lon+col*spacing/(111.2*math.cos(math.radians(origin_lat)))
            terrain=None;surf={};layers={}
            grid_lat=grid_lon=None
            for ds,ys,xs,lats,lons in prepared:
                distance=(lats-target_lat)**2+((lons-target_lon)*math.cos(math.radians(target_lat)))**2
                idx=int(np.nanargmin(distance));iy=int(ys[idx]);ix=int(xs[idx])
                if grid_lat is None:grid_lat=float(lats[idx]);grid_lon=float(lons[idx])
                for name,da in ds.data_vars.items():
                    short=str(da.attrs.get("GRIB_shortName",name)).lower()
                    typ=str(da.attrs.get("GRIB_typeOfLevel",""))
                    if short in ("u","u10") or name=="u10":component="u"
                    elif short in ("v","v10") or name=="v10":component="v"
                    elif short in ("gh","orog","z") or name in ("gh","orog"):component="z"
                    else:continue
                    if typ=="surface" and component=="z":
                        vals=sample_dataarray(da,iy,ix)
                        if vals:terrain=vals[0][1]
                    elif typ=="heightAboveGround" or name in ("u10","v10"):
                        for height,value in sample_dataarray(da,iy,ix):
                            if abs(height-10)<.5 and component in ("u","v"):surf[component]=value
                    elif typ=="isobaricInhPa" or "isobaricInhPa" in da.dims or "isobaricInhPa" in da.coords:
                        for pressure,value in sample_dataarray(da,iy,ix):
                            if pressure in PRESSURES and np.isfinite(value):
                                layers.setdefault(pressure,{})[component]=value
            if terrain is None or not np.isfinite(terrain) or not all(x in surf for x in ("u","v")):continue
            profile=[(10.,surf["u"],surf["v"])]
            for values in layers.values():
                if all(k in values for k in ("u","v","z")):
                    height=values["z"]-terrain
                    if height>10 and np.isfinite(height):
                        profile.append((float(height),values["u"],values["v"]))
            profile.sort()
            if len(profile)<3 or profile[-1][0]<3000:continue
            z=np.array([a for a,_,_ in profile])
            if np.any(np.diff(z)<=0):continue
            u=np.array([u for _,u,_ in profile]);v=np.array([v for _,_,v in profile])
            winds={}
            for level,height in (("0",10),("1",1000),("3",3000)):
                direction,speed=vector(float(np.interp(height,z,u)),float(np.interp(height,z,v)))
                winds["dir"+level]=direction;winds["spd"+level]=speed
            points.append(dict(row=row+5,col=col+5,lat=round(grid_lat,5),lon=round(grid_lon,5),winds=winds))
    if len(points)<20:
        print("RAP grid generation skipped: only",len(points),"valid model grid locations",flush=True)
        return
    timestamp=cycle.isoformat().replace("+00:00","Z")
    path=ROOT/"data"/"rap-grid.json"
    previous=json.loads(path.read_text()) if path.exists() else {"grids":[]}
    entry=dict(site=site,valid_time=timestamp,model="RAP",product="awp130pgrb",
               source="NOAA RAP F00 13-km GRIB2; nearest native model locations; independent local U/V vertical profiles interpolated to 1/3 km AGL",
               nominal_spacing_km=25,points=points)
    entries={(x.get("site"),x.get("valid_time")):x for x in previous.get("grids",[])}
    entries[(site,timestamp)]=entry
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps({"grids":sorted(entries.values(),key=lambda x:x["valid_time"])[-12:]},indent=2)+"\\n")
    print("Published actual RAP spatial wind grid with",len(points),"locations at",timestamp,flush=True)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--site",default="KHDC")
    p.add_argument("--time",required=True,help="UTC RAP analysis cycle e.g. 2024-06-04T21:00Z")
    p.add_argument("--lat",type=float)
    p.add_argument("--lon",type=float)
    a=p.parse_args()
    site=a.site.upper()
    lat,lon=SITES.get(site,(None,None))
    if a.lat is not None: lat=a.lat
    if a.lon is not None: lon=a.lon
    if lat is None or lon is None:p.error("Unknown site. Supply --lat and --lon.")
    raw=a.time.replace("Z","+00:00")
    cycle=dt.datetime.fromisoformat(raw)
    if cycle.tzinfo is None: p.error("Cycle time must contain a UTC offset or Z")
    cycle=cycle.astimezone(dt.timezone.utc).replace(minute=0,second=0,microsecond=0)
    print("Opening RAP f00",cycle.isoformat(),"site",site,flush=True)
    h=Herbie(cycle.replace(tzinfo=None),model="rap",product="awp130pgrb",fxx=0,priority=["aws","google","nomads"]) # Herbie expects UTC-naive datetime; output remains explicit Z
    if h.grib is None:raise RuntimeError("Archived RAP F00 GRIB is unavailable for this UTC cycle")
    print("GRIB source",h.grib,flush=True)
    wanted="|".join(str(x) for x in PRESSURES)
    regex=r":(?:UGRD|VGRD|HGT):(?:10 m above ground|surface|(?:"+wanted+r") mb):"
    groups=h.xarray(regex)
    if not isinstance(groups,list):groups=[groups]
    print("Fetched RAP dataset groups",len(groups),flush=True)
    layers={};terrain=None;w10={}
    for ds in groups:
        if ds is None or "latitude" not in ds or "longitude" not in ds:continue
        latgrid=np.asarray(ds.latitude);longrid=(np.asarray(ds.longitude)+180)%360-180
        if latgrid.ndim!=2:continue
        metric=(latgrid-lat)**2+((longrid-lon)*math.cos(math.radians(lat)))**2
        iy,ix=np.unravel_index(np.nanargmin(metric),metric.shape)
        for name,da in ds.data_vars.items():
            short=str(da.attrs.get("GRIB_shortName",name)).lower()
            typ=str(da.attrs.get("GRIB_typeOfLevel",""))
            if short in ("u","u10") or name=="u10":component="u"
            elif short in ("v","v10") or name=="v10":component="v"
            elif short in ("gh","orog","z") or name in ("gh","orog"):component="z"
            else:continue
            if typ=="surface" and component=="z":
                values=sample_dataarray(da,iy,ix)
                if values:terrain=values[0][1]
                continue
            if typ=="heightAboveGround" or name in ("u10","v10"):
                for lev,value in sample_dataarray(da,iy,ix):
                    if abs(lev-10)<.5 and component in ("u","v"):w10[component]=value
                continue
            if typ=="isobaricInhPa" or "isobaricInhPa" in da.dims or "isobaricInhPa" in da.coords:
                for pressure,value in sample_dataarray(da,iy,ix):
                    if pressure in PRESSURES and np.isfinite(value):
                        layers.setdefault(pressure,{})[component]=value
    print("RAP decoded pressure levels",sorted(layers),"terrain",terrain,"10-m",w10,flush=True)
    if terrain is None or not np.isfinite(terrain):
        raise RuntimeError("RAP surface terrain height absent; cannot calculate true AGL heights")
    if not all(x in w10 for x in ("u","v")):
        raise RuntimeError("RAP 10-m U/V wind vectors missing")
    profile=[(10.,w10["u"],w10["v"])]
    for pressure,values in layers.items():
        if all(k in values for k in ("u","v","z")):
            height=values["z"]-terrain
            if height>10 and np.isfinite(height):
                profile.append((float(height),values["u"],values["v"]))
    profile.sort()
    if len(profile)<3 or profile[-1][0]<3000:
        raise RuntimeError("RAP pressure-level U/V/Z do not bracket 3000 m AGL; refusing to invent winds")
    z=np.array([item[0] for item in profile])
    u=np.array([item[1] for item in profile])
    v=np.array([item[2] for item in profile])
    if np.any(np.diff(z)<=0):raise RuntimeError("Nonmonotonic RAP vertical heights")
    winds={}
    for level,height in (("0",10),("1",1000),("3",3000)):
        direction,speed=vector(float(np.interp(height,z,u)),float(np.interp(height,z,v)))
        winds["dir"+level]=direction;winds["spd"+level]=speed
    stamp=cycle.isoformat().replace("+00:00","Z")
    result=dict(model="RAP",product="awp130pgrb",forecast_hour=0,cycle=stamp,
                valid_time=stamp,site=site,latitude=lat,longitude=lon,
                terrain_msl_m=round(terrain,1),winds=winds,
                source="NOAA RAP F00 13-km pressure-level GRIB2 + 10 m U/V; site-nearest, linearly interpolated to 1 and 3 km AGL",
                levels_agl_m=[round(float(a),1) for a,_,_ in profile],
                retrieved_utc=dt.datetime.now(dt.timezone.utc).isoformat())
    out=ROOT/"data"/"rap.json";out.parent.mkdir(exist_ok=True)
    old=json.loads(out.read_text()) if out.exists() else {"profiles":[]}
    existing={(x.get("site"),x.get("valid_time")):x for x in old.get("profiles",[])}
    existing[(site,stamp)]=result
    out.write_text(json.dumps({"profiles":sorted(existing.values(),key=lambda x:x["valid_time"])[-150:]},indent=2)+"\n")
    print("Saved verified RAP profile",json.dumps(result,indent=2),flush=True)
    try:
        write_rap_spatial_grid(groups,site,cycle,lat,lon)
    except Exception as err:
        print("Optional spatial RAP grid failed; verified site RAP profile was kept:",repr(err),flush=True)
if __name__=="__main__":main()
