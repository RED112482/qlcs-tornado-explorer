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

## v0.9.2 — two-frame QLCS propagation and viewport hover help

The experimental **Downstream evolution** panel supports the following workflow:
1. Select a processed UTC radar scan and draw a candidate leading edge using Freehand or standard Polyline. Click **Capture Scan A**.
2. Advance the archive slider to a later valid Level II scan, trace the new line location, and click **Capture Scan B**.
3. The program reorients the traces if needed, interpolates corresponding fractional arc-length positions, and computes displacement, local motion direction **TOWARD** and speed (kt) from the exact UTC interval. This allows different line sections to move in different directions or stretch between scans, but trace-to-trace correspondence is an **approximation**, not motion tracking of distinct radar features.
4. Choose **Two-frame local vectors** or **Manual direction / forward speed (kt)**, and select 0.5–3 h forecast lead and illustrative uncertainty (km/hour). Yellow dotted lines show movement from the latest line. Intermediate 0.5-hour and final line positions are labeled on the map.
5. The *current* QTor-inspired relative-score colors (green = relatively larger score; red = smaller score, **not zero risk**) are carried forward assuming steady shape, orientation and environment. The projected colored bands are a **conditional persistence/sensitivity visualization**, NOT a calibrated future tornado probability, detected UDCZ, explicit initiation forecast, or verified area of tornado development. The uncertainty slider is NOT a statistically derived confidence interval.

Because future spatial environmental evolution is not forecast by the current version, RAP fields are not evolved with lead time. Actual future QTor calculations would need time-varying RAP/HRRR gridded winds and convective geometry.

User-interface tooltips now appear in a single screen-positioned body portal so they are not clipped by the scrolling sidebar or other sections. Interface text is now Poppins (webfont if available; Arial fallback).

## v0.9.4 — streamlined drawing workflow and shape-preserving propagation

The sidebar now groups related controls into collapsible sections: **Radar & Timeline**, **Track Drawing • Capture A/B**, **Environmental Data**, **Downstream Projection**, **QTor Analysis Settings**, **Map Layers**, and **Save & Export**. Radar, Track Drawing, and Downstream Projection open by default. The capture controls and Next Scan button now sit beside Freehand and the other line tools so users can trace → capture A → advance → redraw → capture B without scrolling between unrelated panels.

The downstream algorithm no longer projects unbounded individual correspondence vectors to create oversized/warped swaths. It calculates a **robust median translational motion** from central line elements, smooths local differential motions, limits departures to 12 kt before blending, and defaults to **90% Scan B shape preservation**. At 100%, all projected line points translate with the same dominant motion vector; lower settings apply modest local variation. This is an illustrative kinematic model, not a validated nowcast.

The large overlapping per-segment quadrilaterals were replaced with one narrow, **line-normal coherent uncertainty ribbon** surrounding the projected line, visually limited to ±16 km. The uncertainty setting is a presentation parameter, not a statistically verified confidence bound. Intermediate 30-minute lines, yellow motion vectors, and green/red relative-score annotations remain available, with the latter retaining their **current** environmental values under a persistence assumption.

**Limitations:** Two freehand traces do not establish one-to-one tracking of storm features. The motion vectors may reflect growth/decay, line deformation, or manual placement error. Temporal changes in RAP/HRRR environment, storm intensity, and tornado occurrence are not predicted.


## v1.0.0 — new-date archive behavior

The GitHub Pages viewer can immediately display only **decoded Level II scans already in** `data/manifest.json`. Changing the date does not itself decode new NEXRAD Level II volumes because the static frontend cannot run Py-ART or use the repository's GitHub Actions write permissions.

For a new UTC date, the viewer now checks the published Level II manifest **first**. If no match is published, it automatically switches and labels the data source as **Iowa Environmental Mesonet Level III single-site base reflectivity**, requests exact archived scan times through the documented `/json/radar.py?operation=list` endpoint, and tries the selected reflectivity product with N0B/N0Q/N0Z fallbacks. Historical Level III remains distinct from genuine native Level II, and neither is invented when a selected time is unavailable. Browser access to IEM is dependent on its live API availability and cross-origin support.

Use **Copy Level II archive request** to copy the current site and selected UTC start/end settings, then **Process genuine Level II on GitHub** to open the manually dispatched decoder workflow. GitHub Pages cannot securely invoke that privileged processing workflow without a separate authenticated server. The site rechecks Level II automatically on subsequent date changes after falling back; the processed-date picker also switches back to Level II.


## v1.1.2 — Simplified analysis and continuous research gradients

The interface now places the line analysis in one **Line Analysis & Gradients** expandable section. Track Drawing includes the **single user-visible Clear entire track & projections** action, which clears the traced line and A/B motion captures plus projection overlays. The Leaflet Draw remove icon and the separate reset action are hidden; existing editing and freehand tracing remain available. The former visible **Segment Assessment** block is removed; required diagnostic elements remain internally hidden for the code that writes/export data.

The colored line has four presentation modes:
- **QTor-inspired**: continuously map the existing research-inspired composite relative index onto a fixed 0–6 red→yellow→green display scale. The values have **not been calibrated to observed mesovortex/tornado frequencies**.
- **Tortuosity enhancement**: geometric tortuosity boost is a continuous 0–1 variable, increasing gradually as the local arc/chord ratio rises above the user-set starting ratio, saturating over 0.12 units. Among line segments that have positive shear-based composite scores, coloring varies from dark green through lime to turquoise. Other locations are muted gray.
- **Weighted relative index**: 70% of normalized QTor-inspired index + 30% of continuous tortuosity enhancement where the index is positive. The 70/30 weights were chosen for visual exploration, **not estimated statistically**. This is NOT a mesovortex-genesis or tornado probability.
- **Off**: hide diagnostic coloring but preserve the editable traced line.

The same active line gradient colors are transferred to the hypothetical downstream persistence corridor. These visualizations **do not calculate forecast probabilities, true spatially sampled QTor, radar-observed UDCZ, or a likelihood trained on historic genesis/null cases**. Turning this into a probabilistic product requires an observed dataset of mesovortex-genesis and null line segments, train/test separation, statistical calibration (for example logistic or isotonic calibration), reliability evaluation and retrospective validation.

The model's continuous tortuosity enhancement and normalized weighted score are **exploratory local implementation choices**, NOT claimed reproduction of exact published QTor statistical coefficients. Relevant published background: [Britt et al. WoFS/QLCS QTor study](https://journals.ametsoc.org/view/journals/wefo/41/4/WAF-D-25-0092.1.xml), [NWS QLCS mesovortex reference sheets](https://www.weather.gov/media/sgf/research/TWIP_QLCS_Reference_Sheets.pdf).


## Help / Illustrated Concept Guide (v1.2.0)

**[Open the illustrated QTor Concept Guide](./help.html)** or use **Help / Concept Guide** at the top of the live Explorer. It provides a printable, responsive one-page **vector diagram** matching the prior conceptual explanation, with the continuous color ramp drawn directly along the QLCS line and focused explanations of the QTor-inspired relative index, tortuosity enhancement, and the exploratory 70/30 weighted relative index.

The guide is a native SVG/HTML illustration, so it remains sharp at any zoom, works without image hosting, and is editable in GitHub. It uses the same color palette as the Explorer. The line-rendering code now draws a thick black halo and continuous score-colored line above radar imagery, using a within-line 10th–90th percentile color stretch to make genuine along-line variations easier to see. Color percentiles are visual-only: numeric scores are unchanged and colors across different drawn lines are not directly comparable. If the line is uniform, its color remains uniform; we do not create false variation. The overlay is above radar/background but beneath wind barbs.

**Scientific caution:** The current blended index uses uncalibrated choices and does not establish mesovortex or tornado probabilities. Tortuosity is geometric, and this experimental continuous enhancement is not a published QTor regression or validated probability model.


## v1.3.1 — Categorical weighted index on line and forecast corridor

Weighted relative index is the default gradient mode, with a toggle to display **three line-relative categories**: **Lower** (red, relative color position < 1/3), **Medium** (yellow, 1/3 to < 2/3), and **Higher** (green, ≥ 2/3). Disabling the toggle restores the smooth continuous color scale. The classification applies consistently to the currently traced line, translucent downstream swept area, and projected future line edge. Contiguous runs receive sparse category labels, and the analysis panel provides a matching three-color legend.

Category boundaries are applied to a **within-line 10th–90th percentile color stretch** of the experimental 70% normalized QTor-inspired / 30% continuous tortuosity blend. Numeric diagnostic values are unchanged. If values are nearly uniform, the renderer uses the middle class instead of inventing a spatial ranking. **The three labels are not statistical probability bins, empirically derived mesovortex-genesis thresholds, or operational warning triggers.** Comparisons between two separately drawn lines require comparing the underlying numeric index, not the categorical colors.


## v1.4.1 — Toggle radar and emphasize favorable downstream areas

The **Radar & Timeline** panel has a **Show radar reflectivity** checkbox that hides/shows the radar pane for *both* decoded Level II and IEM Level III without hiding geographic boundaries, traced lines, wind barbs or downstream analysis. The radar opacity slider continues to work independently when reflectivity is visible.

The **Downstream Projection** section has a new **Higher-favorability downstream fill** slider (15–75%, default 50%). In the three-category weighted view the **Higher** region receives this fill opacity, **Medium** is limited to a lighter tint and **Lower** is lighter still. Colored boundary strokes help delineate individual projected corridor segments. This only changes visualization, not the diagnostic formula or the probability of mesovortex genesis.

### Past Level II cases: source availability versus viewer availability

The NOAA/Unidata public S3 bucket contains archived raw Level II volumes (current bucket `unidata-nexrad-level2`), but **the static GitHub Pages app cannot decode these files by changing the date**. The page only renders genuine Level II scans previously processed by `.github/workflows/process-level2.yml` and published to `data/manifest.json`. Other dates attempt the separately labeled historical IEM Level III fallback, which is not Level II. Each new Level II case must be submitted through the GitHub workflow with the selected UTC window; use the in-page copy button to obtain the settings. For a typical one-hour case request, **12 scans** is the default to avoid timeouts; longer cases should be processed in separate hour-sized windows.

The historical decoder now logs actual S3 volume inventory, continues past individual unreadable/corrupt radar volumes, and retains published frames by radar/day rather than evicting every older case after a global 500-frame cap. The job limit has been extended to 45 minutes, although large requests may still exceed compute/storage limits. **This is a more resilient manual workflow, not automatic on-demand Level II availability.**


## v1.5 — Native Level II reflectivity and radial velocity

**Lowest-tilt display:** The radar selector now supports two genuine Level II moments generated from the original Unidata Level II volumes: Base Reflectivity (**dBZ**) and raw Radial Velocity (**knots**). When a volume contains separate low-level split cuts, the processor independently locates the lowest valid sweep with each moment; the exact elevation of each is shown. Velocity is **raw and may be aliased**; no de-aliasing, spectrum-width filter or inferred rotation is silently applied. Older reflectivity-only PNG frames require reprocessing to obtain the velocity layer. The output is a high-resolution georeferenced rendering of native gates (2300 px), not browser-decoded binary volumes or reconstructed Level III imagery.

**Submit a historical case from the calendar:** Choose radar site and UTC hour range, then click **Process this UTC window · Level II**. The browser opens a pre-filled **GitHub issue**. The user must be signed into GitHub and explicitly click **Submit new issue**. Only issues authored by the repository OWNER and beginning with `[QLCS Level II]` are accepted by `.github/workflows/process-level2-issue.yml`. This workflow validates the request (≤3 h and ≤16 volumes), processes both moments and publishes the images plus `data/manifest.json`. Successful requests are commented on and closed. The Explorer checks for newly published scans while left open, and has a **Check for processed scans** button. There is no token or unauthenticated arbitrary server-side execution exposed in GitHub Pages. If GitHub Issues or Actions are disabled, or GitHub repository permissions block writing from Actions, processing will not start.

**Delayed latest (opt-in):** `.github/workflows/process-level2-live.yml` supports manual `workflow_dispatch` for a site, and an optional scheduled run every ~10 minutes when you set repository Actions variable **`QLCS_LIVE_RADAR_SITE=KMOB`** (or another four-letter radar). Configure it under **GitHub → Repository Settings → Secrets and variables → Actions → Variables**. Scheduled processing is **disabled by default**; the site does not automatically turn this on. The workflow processes up to two newest completed Level II volumes and retains only the 18 most recent `is_live` frames per site, leaving historical cases intact. In Latest mode, use **Check latest processed Level II volume** or switch to the Level III fallback.

GitHub Actions is **not a low-latency real-time radar feed**. Scheduled runs can be delayed or skipped, and decoder time plus Pages deployment adds variable lag. A true research-grade live feed requires a persistent worker consuming the [Unidata realtime Level II chunks bucket and/or AWS notifications](https://registry.opendata.aws/noaa-nexrad/), reconstructing volumes and publishing georeferenced tiles or polar gate data to a cache. A separate backend is required for that; the current static GitHub Pages site cannot offer guaranteed near-live Level II.

**Scientific caveat:** QLCS convergence/velocity couplets require correct interpretation of radial velocity sign, Nyquist folding and range/beam height. Velocity and reflectivity may come from separate lowest-elevation split cuts in the same volume; their timestamps are close but not necessarily identical. The existing QTor-inspired index remains experimental, not a calibrated mesovortex probability.

## v1.6.1 — request missing historical RAP and a faster radar architecture

**Why "RAP not applied: No RAP profile found for KMOB" occurred:** The browser only looked in `data/rap.json`, which initially contained one profile (KHDC, 2024-06-04 21Z). The upstream NOAA RAP archive may still have model analysis data for KMOB and your selected historical hour; a missing entry in this repo is **not evidence of missing RAP data**.

The **Environmental Data** panel now checks for a matching radar site and selected scan UTC time. If the match is not in the repo, it displays **RAP NOT YET CACHED** and a **Retrieve missing RAP F00 on GitHub** button. This opens a prefilled, owner-authorized GitHub issue containing `SITE=KXXX` and `CYCLE_UTC=YYYY-MM-DDTHH:00Z`. After the user signs in and submits the issue, `.github/workflows/process-rap-issue.yml` validates the request, fetches the RAP F00 pressure-level GRIB2 through Herbie's AWS/Google/NOMADS sources, interpolates real 10-m, 1-km and 3-km AGL wind vectors, publishes them to `data/rap.json` and (where decoding succeeds) `data/rap-grid.json`, and requests a Pages rebuild. Click **Check RAP** or **Load time-matched RAP** after the worker completes to apply the actual data. Older model values are flagged as unverified for the newly selected date, not silently reused as time-matched RAP. The inputs remain editable.

This is on-demand **processing via GitHub authentication**, not instant GRIB decoding in a static browser. If no upstream model cycle exists or GRIB interpolation fails, the worker reports failure and the user must keep manual values. For an immediate response when selecting any UTC date, deploy a small authenticated or rate-limited API service with indexed S3 GRIB retrieval, GRIB decoding (eccodes/cfgrib), caching, and JSON response.

### Faster native Level II option: AWS rather than GitHub commits

- **Archive**: `s3://unidata-nexrad-level2` (us-east-1), with site/date UTC keys. Browser calls an AWS API Gateway endpoint carrying radar site, moment and UTC scan window; processor returns cache hits or a processing job ID; S3/CloudFront stores completed georeferenced reflectivity and radial-velocity PNGs or polar sample tiles. Publish a short JSON manifest per case without a Git commit.
- **Processing**: Python/Py-ART in a Fargate container (recommended for large volumes, warm workers and reusable wheels) or a Lambda container (viable for modest, bounded archive jobs but has cold-start/memory/15-minute limits). An SQS queue provides rate limiting and permits deduplicated processing of repeated requests.
- **Real-time**: Subscribe to Unidata NEXRAD Level II notifications and `unidata-nexrad-level2-chunks` or complete volume objects, reconstruct/ingest at a dedicated worker, decode lowest reflectivity/velocity split cuts, publish updates to an S3 cache and provide polling/WebSocket to the viewer.
- **Unidata THREDDS**: Provides remote archived/recent Level II access (retention is shorter than S3 archive); it is a data-access option, not a ready-made native-gate dual-moment map tile service.
- **Mosaics**: Unidata composites and MRMS are good for overview, but a stitched reflectivity mosaic does not preserve each radar's native low-level radial velocity and geometry for QLCS mesovortex analysis.

AWS infrastructure is **not deployed** by this change: a cloud account, cost/usage controls, API endpoint and storage policy are still needed. GitHub-only issue workflows remain the working intermediate solution. References: [AWS NEXRAD open data](https://registry.opendata.aws/noaa-nexrad/), [Unidata Level II access](https://www.unidata.ucar.edu/data/radar-data), and [Herbie RAP historical retrieval](https://herbie.readthedocs.io/en/latest/gallery/noaa_models/rap.html).


## v1.7 — raw Level II velocity palette and experimental local mesovortex-motion vectors

**Velocity quick toggle.** While a **genuine processed Level II** scan with **both moments** is loaded, press the keyboard **period (.)**, **numpad decimal/Del**, or **Delete** to switch Base Reflectivity (dBZ) ⇄ Base Radial Velocity (kt). Input fields and text editing ignore the shortcut. The selector remains available for mouse users. Legacy reflectivity-only frames cannot toggle until velocity is decoded.

**Velocity colors.** The PNG renderer now uses a **21-stop color scale sampled from the user-supplied image**, spanning **−200 to +200 kt** and matching its inbound (negative) green/blue and outbound (positive) red/magenta/orange appearance. The map legend uses the same colors. **Previously processed velocity images are not recolored automatically**: reprocess those archive frames (or future scans) to use the new palette. Raw radar velocities remain un-dealiased and can fold at the Nyquist velocity; the ±200 kt legend is only a presentation scale, not a claim that real observed velocities occupy the full range.

**Mesovortex Motion Scenarios.** A collapsible panel allows:
- Toggle on **click-on-the-line** vectors and optionally plot 3/5/7/9 evenly spaced scenario arrows along the leading edge.
- **Manual deviation**: add a signed clockwise angle to the user-entered QLCS system-motion direction, and set a hypothetical circulation speed in knots.
- **0–1 km steering**: blend QLCS translation with the mean of available 10-m and 1-km **wind-TOWARD vectors**, using user-controlled weights (no established physical regression coefficient).
- **A/B local line motion**: use the existing Capture A / Capture B leading-edge traces to calculate segment-specific line displacement. This describes approximate QLCS line movement, NOT tracked mesovortex/tornado translation.
- **Illustrative northern-flank drift**: mark the bow apex on the drawn line, then add a user-controlled component toward the northern end of the line. The increment is tapered with distance from the marked apex (a geometric sensitivity heuristic, not an empirically supported forecast equation).
- Choose a 5–20 minute arrow lead, click a particular point for a labeled arrow, and see multiple arrows in magenta versus the original **yellow QLCS translation**. The existing single Clear button clears all vectors alongside the track.

**Interpretation:** Mesovortices often develop near/north of a bow apex and may move northward *relative to the bow*, but vortex migration is case-dependent and may not coincide with tornado motion. No available result establishes an operational formula to calculate tornado direction solely from bow geometry and low-level RAP winds. For warning decisions use repeated lowest-level velocity scans, couplet tracking, line segment evolution, tornado debris signatures and official WFO methods. The scenario layer is **research/training only**, not an operational tornado warning projection.

References: [Weisman and Trapp 2003](https://journals.ametsoc.org/view/journals/mwre/131/11/1520-0493_2003_131_2779_lmwsla_2.0.co_2.xml); [Atkins et al. 2004 bow-echo vortices](https://journals.ametsoc.org/view/journals/mwre/132/9/1520-0493_2004_132_2224_vsaewb_2.0.co_2.xml); [NWS QLCS reference sheets](https://www.weather.gov/media/sgf/research/TWIP_QLCS_Reference_Sheets.pdf).
