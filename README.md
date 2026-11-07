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