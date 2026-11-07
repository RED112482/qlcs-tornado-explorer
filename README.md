# QLCS Tornado Potential Explorer — v0.1

An **experimental, educational** radar-assisted tool for manually tracing a candidate QLCS leading edge and computing **line-relative 0–3 km bulk shear, 0–1 km line-parallel bulk shear, local tortuosity, and a QTor-inspired scalar**. Not a forecast/warning system; **the scalar is not a tornado probability** and has not been objectively verified.

## Deploy on GitHub Pages

1. Create a new public repository named `qlcs-tornado-explorer` in your GitHub account.
2. Upload the files `index.html`, `styles.css`, and `app.js` to the repository root (or push with Git).
3. In **Settings → Pages**, choose **Deploy from a branch**, branch **main**, folder **/(root)**, then save.
4. Navigate to `https://YOUR_USERNAME.github.io/qlcs-tornado-explorer/` after GitHub publishes the site.

No build process, API key, or Python server is needed for the prototype. A browser with internet access is required to load Leaflet, the basemap, and radar images. To test locally: `python -m http.server 8000` and open `http://localhost:8000/`.

## Workflow

1. Use the polyline icon at top left of the map to draw your **candidate convective leading edge**. Click to place vertices; finish by clicking the last point. Use the edit tool to move vertices. **Trace in either direction**; the `Line motion TOWARD` setting chooses the forward normal.
2. Enter representative inflow winds at 0, 1, and 3 km above ground (meteorological wind **FROM** direction in degrees; speed in knots). These are **manual inputs**, not live HRRR/SPC fields.
3. Enter the QLCS motion *toward* azimuth so the tool can pick the forward-facing normal; it does **not** alter bulk shear magnitude.
4. Click **Analyze drawn line**. Read segment metrics and optional threshold highlight. Review reflectivity and ground-truth radar velocity separately before operational decisions.
5. Export a GeoJSON file or import a GeoJSON with a LineString; your session is also cached in localStorage.

## Research context and implementation notes

The Britt et al. (2026) Science Discussion Group presentation describes QTor using **0–3 km line-normal shear**, **0–1 km line-parallel shear**, and a **local tortuosity enhancement**. The presented formula is `QTor = (LN03 / 10 m/s) × (LP01 / 8 m/s) × T`, with shear terms bound to `[0.5,3.0]`, negative LN03 producing zero, and `T=2` when tortuosity >1.05 (otherwise 1). The source work uses WoFS-derived QLCS objects, explicitly defined inflow sampling sectors, and forecast wind fields. The prototype **does not recreate that complete algorithm**: it uses **one user-specified wind profile everywhere** and an approximate along-line sampling scheme. It intentionally uses the label **QTor-inspired**.

- Local orientation: bearing from samples approximately 10 positions before to 10 after each sample.
- Tortuosity: polyline arc distance divided by chord length across five samples on either side. Values are ≥1 for consistently sampled line shapes. The enhancement threshold is adjustable.
- Forward normal: of two perpendicular directions, choose closest to the user-entered line-motion azimuth.
- Line-normal shear: dot product of **3 km minus 0 km wind** and that forward normal (m/s).
- Line-parallel shear: **absolute** dot product of **1 km minus 0 km wind** and tangent direction (m/s). This treatment is a prototype choice and should be checked against the published methods before quantitative comparisons.
- A translucent 40 km forward ribbon indicates the **intended inflow-sampling region**; it does *not* actually sample gridded environmental data in v0.1.
- Score highlight threshold defaults to 2.0 for exploratory visualization and is not calibrated to tornado observations.

## Radar data

The app requests images from the official NOAA/NWS **MRMS-based** ArcGIS **radar_base_reflectivity_time** ImageServer (`exportImage` via a Leaflet grid). This is a **mosaic**, not individual 0.5-degree/base-tilt Level II radar data. It updates nominally at 5-minute intervals, dependent on the upstream service. This prototype does not request or inspect the exact radar valid timestamp and does not support time loops. An unavailable service leaves the line-drawing and analysis controls usable on the basemap. Browser/network CORS and dynamic image export compatibility should be confirmed on a deployed site. The service URL is configurable in `app.js`.

## Next steps

1. Add a proper radar data timestamp, frame selector, and reliability monitoring; optionally switch to MRMS gridded reflectivity with a preprocessing worker.
2. Ingest *spatially varying* HRRR 0/1/3 km winds using a Python worker, bilinear interpolation, and explicit model run/valid times. Compute local line-relative shear **within each forward 40 km inflow sector**, rather than using a single domain-wide profile.
3. Track leading edges over time to obtain observed surge displacement, bow-apex persistence, and uncertainty.
4. Add Level II radial velocity, convergence/rotation candidate detection, and multi-elevation evidence before considering SID/PMD labels.
5. Verify the methodology against published QTor details, a held-out set of both tornadic and non-tornadic QLCS events, and independent radar scrutiny.

## Sources

- Britt et al. (2026) *Forecasting QLCS Tornado Potential using WoFS*, Science Discussion Group presentation supplied with the project.
- Zeringue & Gilmore *Understanding QLCS Tornadogenesis: Types, Challenges, and Polygonology*, supplied with the project.
- NOAA MRMS radar service: https://mapservices.weather.noaa.gov/eventdriven/rest/services/radar/radar_base_reflectivity_time/ImageServer

**Disclaimer:** Experimental situational-awareness/training prototype. Do not rely on this output to issue, withhold, or spatially define tornado warnings. Consult authoritative operational data and procedures.

## Version 0.2 — historical single-site radar and boundary layers

The site offers **KMOB, KEVX, KDGX, KHDC, KLIX, KEOX, KVAX, KTLH, KBMX, KJAN** and IEM N0B or N0Q products. Choose **Historical case** and enter a **UTC start/end time (maximum six hours)**, then **Find archived scans**. IEM's metadata API finds the **exact archived scan timestamps**, which are used for TMS radar tiles. Step through scans with slider/arrows or play. An empty archive response does not imply clear weather; coverage varies by site and date.

**Data distinction:** these IEM radar map tiles represent archived **Level III base-reflectivity products**, not native NEXRAD Level II volume scans or the exact 0.5° raw sweep. They are a convenient quick-review overlay, but Level II decoding and sweep selection are a future integration. NOAA/Unidata's [open Level II archive](https://registry.opendata.aws/noaa-nexrad/) is the input for that future processor. The old MRMS service is no longer used.

The basemap now uses OpenStreetMap's standard public tiles (no commercial basemap API key). State, county, and CWA boundaries come from the public [NWS Reference MapServer](https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer) using layer IDs 3, 2, and 1 respectively. These are *current* boundaries even when reviewing past tornado events. Online service availability and public tile usage policies apply.

**Known constraints:** no NEXRAD Level II raw decoding, no radar velocity, no automatic UDCZ/mesovortex detection, and no objective verification. Manually entered winds drive the research-inspired segment score; it is not a tornado probability. This is research/training only.


## v0.5 — Level II decoder + RAP profile option (2026-11-07)

### What is now implemented
- Flat unlabeled slate/gray land-water map. NWS state, county and CWA **geometries** are requested as GeoJSON (rather than label-rendered map images).
- **Actual NEXRAD Level II** workflow using Unidata's `unidata-nexrad-level2` bucket. Py-ART decodes the **first sweep**, and projected native gate reflectivity is rasterized to georeferenced transparent PNG. This is **not** Level III radar imagery. Raw data remain external to GitHub; processed images are published to `data/`.
- A GitHub Pages radar frame manifest (`data/manifest.json`), historical scan selection and loop controls. Until a workflow run publishes files, Level II mode will correctly report **No processed Level II frame**—it will not pretend that imagery is loading.
- Experimental relative-score guidance: **red** = QTor-inspired index at/above user display threshold; **green** = below threshold; yellow dotted arrows = user-specified **system motion** toward direction. Downstream polygons are illustrative 15–26 km **motion projections**, not a physical tornado probability swath or a verified UDCZ.
- Plotted meteorological wind barbs for 0/1/3 km AGL, **wind FROM direction** and **speed kt**.
- Manual meteorological inputs always editable; optional RAP f00 representative profile import marked with valid time/model and changed to `MANUAL OVERRIDE` when a user edits input.

### Process a real historical Level II case without local Python
1. Open the repository's **Actions** tab.
2. Choose **Process NEXRAD Level II** → **Run workflow**.
3. For the 4 June 2024 SID case enter:
   - `site`: `KHDC`
   - `mode`: `historical`
   - `start_utc`: `2024-06-04T21:00`
   - `end_utc`: `2024-06-04T22:00`
   - `max_scans`: `6`
   - `rap_profile`: optional (unchecked recommended for first radar test).
4. Once the workflow succeeds and commits its generated files, reload GitHub Pages. Select **Level II decoded sweep**, `KHDC`, **Historical case**, the same UTC window, and **Find archived scans**.
5. Adjust the line and compare highlighted segments. The viewer is **research/training only**.

For latest Level II choose `mode=latest` and a radar site; the workflow looks for scans in the previous 90 minutes. It is an **on-demand snapshot**, not a continuous low-latency stream. GitHub Pages alone cannot decode NEXRAD volume files, so new frames require workflow execution. This process can be scheduled later if GitHub Actions quotas allow.

### Local decoder
```bash
pip install -r requirements-radar.txt
python scripts/process_level2.py --site KHDC --start 2024-06-04T21:00 --end 2024-06-04T22:00 --max-files 6
python -m http.server 8000
```
Then open `http://localhost:8000`.

### Optional RAP profile ingestion

The user interface needs: **10-m (0 km proxy), 1-km AGL and 3-km AGL wind vectors** (direction FROM °, speed in kt). For the forward side and yellow arrows it additionally needs **QLCS system motion TOWARD °**. The program computes 0–1 and 0–3 km bulk shear and the line-normal/parallel projections from these vectors. The system motion is separately user-specified; **RAP does not diagnose it**.

The experimental `scripts/process_rap.py` obtains a site-nearest RAP **f00** wind profile from Herbie, attempts to sample 10-m wind, multiple pressure-level wind and height fields, subtracts model terrain, then interpolates wind vectors to **1 and 3 km AGL**. This is a **single representative site profile**, not a full two-dimensional RAP environmental grid along every line segment. The script fails explicitly if required fields/vertical bracketing are missing, and the Actions workflow deliberately allows RAP failure without hiding a successful radar job.

Example:
```bash
python scripts/process_rap.py --site KHDC --time 2024-06-04T21:00
```
This writes `data/rap.json`, which the webpage can load, or you can import a profile from the sidebar. Expected format:

```json
{
  "model": "RAP F00", "valid_time": "2024-06-04T21:00:00Z",
  "site": "KHDC",
  "winds": {
    "dir0": 170, "spd0": 20,
    "dir1": 200, "spd1": 40,
    "dir3": 235, "spd3": 55
  }
}
```

**The JSON above shows only the schema; its example wind values are not historical measurements.** If you load such an example, the tool will interpret it as input, not as verified RAP data. Always verify provenance and time match before making meteorological interpretations.

### Limitations and operational precautions
- Neither native gate rasterization nor this index identifies a verified UDCZ or diagnoses SID/PMD mesovortex structure. Velocity interrogation and quantitative validation are not yet implemented.
- Currently visualizes the *first available elevation sweep*, not a user-selectable full 3-D elevation sequence.
- RAP vertical sampling is optional, experimental and **not yet validated across all historic cycles**; Herbie file names and available pressure fields vary.
- The red/green swaths are **relative, uncalibrated diagnostic zones**, not greater or lower tornado probabilities.
- The radar and RAP decoding workflow has been committed but **has not been run and confirmed successful on this repository** at the time of this update. No Level II images have been generated by this commit.
- The public map services and S3 data source can have outages, missing scans, or changes to endpoint formats. An empty radar overlay is not meteorological evidence of no convection.

Data provenance: [Unidata NEXRAD Level II on AWS](https://registry.opendata.aws/noaa-nexrad/), [Py-ART](https://arm-doe.github.io/pyart/), [RAP via Herbie](https://herbie.readthedocs.io/), [NWS reference GIS](https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer).


## v0.6 — verified archived RAP and high-detail native Level II

The real **RAP F00** 2024-06-04T21:00Z profile at KHDC was retrieved and published in [data/rap.json](data/rap.json). Model wind **FROM** values: 10 m AGL 163.2° at 11.1 kt; 1 km AGL 169.8° at 18.7 kt; 3 km AGL 248.2° at 21.4 kt. Winds at 1/3 km come from vector interpolation of RAP pressure-level winds using the RAP terrain height. These are site-nearest 13-km model estimates, not a spatially varying 40-km ahead-of-line profile or radar observations.

Use **Load time-matched RAP** in the sidebar, or import a JSON profile. Imported JSON is identified as unverified. Manually changing a wind marks it as a **MANUAL OVERRIDE**. System motion remains user-defined; RAP does not calculate it.

The Level II renderer now requests a 160-km radius and 2300×2300 image to preserve finer-scale native reflectivity gates. Its input is the genuine Unidata NEXRAD Level II raw volume. The browser displays a projected PNG generated from those gates; it does not itself decode AR2V files. Updated images only appear after **Process NEXRAD Level II** completes successfully and commits the image/manifest files.

These research-oriented red/green zones are not calibrated tornado probabilities. The model sampling does not verify actual UDCZ convergence or mesovortex formation.


## v0.8 – QTor explanations, freehand tracing and spatial RAP wind-barb grid

- Every major analysis input and display control has a contextual **?** hover/focus explanation or native input hover title.
- **Freehand:** turn on ✎ Freehand, hold the mouse button and trace the convective line, release to finish. The previous line is replaced; the standard editable Leaflet Draw polyline remains available.
- **Green indicates the *larger experimental QTor-inspired relative index***, while **red indicates a smaller index**. Red does **not** mean tornadoes cannot happen; green is **not** a calibrated tornado probability. The downstream red/green shapes are illustrative motion projections, not verified paths or geographic tornado odds.
- **Britt et al. research framework:** 0–3 km line-normal shear × 0–1 km line-parallel shear × conditional tortuosity enhancement, with the individual shear terms normalized by 10 and 8 m/s and bounded at 0.5–3, a positive line-normal contribution required, and a conditional bowing enhancement when tortuosity exceeds the selected threshold. The 40 km forward ribbon represents the intended analysis neighborhood, **not yet a full QTor implementation** because winds used for the line score remain a site-representative profile.
- **Spatial archived RAP grid:** `scripts/process_rap.py` also samples NOAA RAP F00 pressure-level winds/height and 10-m wind at independently selected nearest model grid points, interpolating each point's 1/3 km AGL winds in vector space using its **local** model terrain. The resulting `data/rap-grid.json` for **KHDC 2024-06-04 21Z** contains **121 model-sampled locations** over a roughly 250 km × 250 km plane. Barbs are meteorological wind-FROM barbs with 50/10/5 kt flags/ticks. Select 10 m, 1 km, 3 km or all three and adjust map grid thinning.
- If spatial grid data do not exist for the current site/UTC time, the display switches to **explicitly labeled uniform representative winds repeated at a map grid**. Manual wind overrides likewise disable interpreting the barbs as untouched spatial RAP input.
- **Not a UDCZ detector:** the traced reflectivity edge remains a user-selected proxy, and the index is not an operational warning decision tool. Near-storm inflow sampling and spatially varying QTor scores at each drawn line segment require further implementation and validation.

The repo includes [the actual spatial RAP field file](data/rap-grid.json) and [the verified site profile](data/rap.json).
