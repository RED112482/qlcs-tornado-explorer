'use strict';
// On-page scientific explanations and drag-to-trace freehand polyline.
(function(){
 const $=id=>document.getElementById(id);
 const tips={
  site:'Radar site sets the viewpoint and the Level II archive. A site-representative RAP profile may not match the inflow environment 40 km ahead of every line segment.',
  dataSource:'Decoded Level II images come from genuine NEXRAD Level II volumes, processed into georeferenced reflectivity imagery. The IEM option is a separate Level III fallback.',
  product:'Level III fallback reflectivity product. This selection does NOT change the native Level II sweep.',
  mode:'Latest: use recently available radar. Archive: select a historical UTC/Zulu window and browse its published scans.',
  archiveDate:'Select the UTC/Zulu calendar date. It does not automatically process raw Level II archives; use a date with published scans or the GitHub workflow.',
  archiveStartHour:'First UTC/Zulu hour to include. Select the hour when the QLCS was approaching or underway.',
  archiveEndHour:'Last UTC/Zulu hour. It must be later than the beginning hour; 24Z is midnight the next day.',
  scanSlider:'Move through actual radar volumes in the selected UTC range. The exact scan timestamp is shown in the map.',
  radarOpacity:'Opacity controls the radar overlay visibility. Lower values make boundaries easier to see; higher values emphasize reflectivity.',
  states:'Toggle state borders; these are geographical reference lines, not meteorological features.',
  counties:'Toggle county outlines to locate affected communities without covering the radar with labels.',
  cwas:'Toggle current NWS County Warning Area outlines. They are NOT time-stamped historical CWA boundaries.',
  freehand:'Turn on Freehand; hold the mouse button and trace the QLCS leading edge. Release to complete. This is a reflectivity candidate for the UDCZ, not measured convergence.',
  showInflow:'Shows the illustrative 40-km forward/inflow ribbon used in the research concept. The current environmental winds are sampled at the radar site, not physically sampled at each point in this ribbon.',
  showScores:'Highlight segments whose local QTor-inspired index meets your chosen display threshold. Highlighting is not a tornado probability or warning recommendation.',
  dir0:'10-m wind FROM direction in degrees. 0°=from north, 90°=from east. The 10-m wind is used as the lowest-level proxy in both 0–1 and 0–3 km bulk-shear calculations.',
  spd0:'10-m wind speed in knots. This changes the low-level end of the 0–1 and 0–3 km vector-shear differences.',
  dir1:'1-km AGL wind FROM direction. Together with the 10-m wind, it determines the line-parallel component of 0–1-km bulk shear.',
  spd1:'1-km AGL wind speed in knots. Changes the line-parallel 0–1-km shear magnitude and therefore the QTor-inspired index.',
  dir3:'3-km AGL wind FROM direction. Together with the 10-m wind, it determines the line-normal component of 0–3-km bulk shear.',
  spd3:'3-km AGL wind speed in knots. Affects the line-normal 0–3-km shear magnitude and therefore the QTor-inspired index.',
  motion:'Direction the QLCS is moving TOWARD (degrees clockwise from north). It selects the forward normal side, sets yellow motion arrows, and projects schematic downstream polygons. It is NOT derived from RAP winds.',
  fetchRap:'Load a site- and time-matched processed NOAA RAP F00 profile. Winds populate the editable boxes. Site/time matching is checked and the source is displayed.',
  loadRap:'Import your own wind profile JSON. Imports are labeled unverified because no external provenance check is possible.',
  showBarbs:'Display wind barbs at regular grid points. When archived spatial RAP data match the radar and UTC time, every point uses independently sampled RAP winds. Otherwise the viewer explicitly identifies repeated representative winds.',
  showBarb0:'Show or hide 10-m (near-surface) wind barbs. All selected levels share the same station anchor.',
  showBarb1:'Show or hide 1-km AGL wind barbs. These overlay the other levels at precisely the same grid point.',
  showBarb3:'Show or hide 3-km AGL wind barbs. These overlay the other levels at precisely the same grid point.',
  barbSpacing:'Spacing between plotted barbs in SCREEN PIXELS. Rows and columns remain square and equally spaced after every zoom/pan. Changes visual density only, not the wind field or QTor score.',
  showNormals:'White arrows show each segment’s local line-normal direction, used to project 0–3-km shear. They are distinct from system motion.',
  showMotion:'Yellow arrows point in the manually specified QLCS motion direction and illustrate where a segment moves downstream. They are NOT individual tornado-track forecasts.',
  showFlare:'Project each segment a schematic distance downstream. Green marks the larger relative index; red marks the smaller index. Neither color proves or rules out tornadogenesis.',
  step:'Distance between sampled points along the traced line (km). Smaller values resolve more small bows but increase noise and calculation density; larger values smooth short-scale features.',
  tortuosity:'Tortuosity is curved line length divided by straight-line chord. Near 1.0 is relatively straight; a larger ratio indicates bowing/curvature. The research-inspired conditional enhancement doubles the factor when above this threshold.',
  threshold:'Display threshold for the uncalibrated local QTor-inspired score. Raising it makes fewer sections green; lowering it makes more sections green. Does NOT change winds or tornado probability.',
  analyze:'Recalculate shear projections and line geometry using the current RAP/manual wind inputs, line trace, settings and display threshold.',
  export:'Export the current traced line, environment values and numerical diagnostic samples in GeoJSON for research/review.',
  importBtn:'Import a previously exported geographic line so you can compare or edit a case.',
  example:'Draw a built-in demonstration leading edge, not a verified line from the currently displayed radar.',
  clear:'Remove the existing traced line and clear its diagnostic sampling.',
  captureA:'First draw the candidate UDCZ at the current exact radar scan time, then capture it. The captured line is retained while you move to another scan.',
  captureB:'Advance to a later radar scan, draw the new line position, then capture it. Corresponding fractional positions between lines estimate local motion and possible expansion.',
  motionMethod:'Two-frame uses different local displacement vectors along the QLCS; Manual uses a single direction and speed. Both are conditional extrapolations, not tornado forecasts.',
  motionSpeedKt:'Manual forward speed in knots (1 kt = 1.852 km/h). Only applied when Manual motion is selected.',
  forecastHours:'How far the captured line is projected downstream in hours. Longer projections become increasingly uncertain, especially if orientation or environment changes.',
  forecastSpread:'Illustrative positional uncertainty added per hour (km/h). It is a visual sensitivity control, not statistically verified error bounds.',
  showForecast:'Show colored future line locations and schematic uncertainty envelopes. Green/red transport the CURRENT uncalibrated relative score; no future RAP or real tornado probability is computed.',
  calculateMotion:'Calculate local movement from two time-separated line drawings, or use your manual direction and speed. Yellow arrows connect the current and projected positions.',
  resetMotion:'Clear both captured line snapshots and the future projection, without deleting your current editable trace.',
  findScans:'Load any already-published Level II scans within the selected UTC/Zulu window. A different date may first need processing in GitHub Actions.'
 };
 function addHelp(node,message){
   if(!node||node.querySelector('.help-tip'))return;
   const tip=document.createElement('span');
   tip.className='help-tip';tip.tabIndex=0;tip.setAttribute('role','note');
   tip.setAttribute('aria-label','Help: '+message);
   tip.dataset.help=message;tip.textContent='?';
   node.appendChild(document.createTextNode(' '));node.appendChild(tip);
 }
 Object.entries(tips).forEach(([id,message])=>{
   const control=$(id);if(!control)return;
   control.title=message;
   if(control.tagName==='INPUT'&&control.type==='checkbox'){
      addHelp(control.closest('label'),message);return;
   }
   const label=document.querySelector('label[for="'+id+'"]')
       ||control.closest('.field')?.querySelector('label')
       ||(control.tagName==='BUTTON'?null:control.closest('label'));
   if(!['dir0','spd0','dir1','spd1','dir3','spd3'].includes(id))addHelp(label,message);
 });
 for(const [i,desc] of [
   ['0','10 m wind is a practical near-surface proxy for 0 km AGL in this tool. It is not an exact zero-height wind.'],
   ['1','1-km AGL wind contributes to the line-PARALLEL 0–1 km shear term.'],
   ['3','3-km AGL wind contributes to the line-NORMAL 0–3 km shear term.']
 ]){
   const label=$('dir'+i)?.closest('.windrow')?.querySelector('label');
   addHelp(label,desc);
 }
 document.querySelectorAll('.windtable .labels span').forEach((el,i)=>{
   if(i===1)addHelp(el,'Meteorological wind FROM direction in degrees clockwise from true north. Drag/adjust wind values to recompute the vector shears.');
   if(i===2)addHelp(el,'Wind speed in knots. Winds are converted to m/s for the numerical shear projections.');
 });
 // Explain the research-inspired index without claiming tornado probability.
 const science=document.querySelector('.science-explainer');
 if(science){
   const formula=document.createElement('div');formula.className='science-equation';
   formula.textContent='Index = clamp(LN 0–3 km ÷ 10 m/s) × clamp(|LP 0–1 km| ÷ 8 m/s) × tortuosity factor. LN < 0 → index 0; each positive shear factor is capped to 0.5–3; tortuosity factor = 1 or 2.';
   science.appendChild(formula);
 }

 // A single body-level tooltip avoids clipping by scrolling sidebars, cards,
 // legends and maps. Position and flip within the visual viewport.
 const helpPortal=document.createElement('div');
 helpPortal.className='help-portal';
 helpPortal.setAttribute('role','tooltip');
 helpPortal.setAttribute('aria-hidden','true');
 document.body.appendChild(helpPortal);
 let activeTip=null;
 function positionHelp(anchor){
   if(!anchor)return;
   const r=anchor.getBoundingClientRect();
   const width=Math.min(330,window.innerWidth-28);
   helpPortal.style.width=width+'px';
   const height=helpPortal.offsetHeight;
   const left=Math.max(14,Math.min(window.innerWidth-width-14,r.left+r.width/2-width/2));
   const below=r.bottom+12;
   const top=below+height>window.innerHeight-12
     ?Math.max(12,r.top-height-12):below;
   helpPortal.style.left=Math.round(left)+'px';
   helpPortal.style.top=Math.round(top)+'px';
 }
 function openHelp(anchor){
   activeTip=anchor;
   helpPortal.textContent=anchor.dataset.help||anchor.title||'';
   if(!helpPortal.textContent)return;
   helpPortal.classList.add('visible');
   helpPortal.setAttribute('aria-hidden','false');
   positionHelp(anchor);
 }
 function closeHelp(){
   activeTip=null;
   helpPortal.classList.remove('visible');
   helpPortal.setAttribute('aria-hidden','true');
 }
 document.addEventListener('pointerover',e=>{
   const tip=e.target.closest?.('.help-tip');
   if(tip)openHelp(tip);
 });
 document.addEventListener('pointerout',e=>{
   const tip=e.target.closest?.('.help-tip');
   if(tip&&activeTip===tip&&!tip.contains(e.relatedTarget))closeHelp();
 });
 document.addEventListener('focusin',e=>{
   const tip=e.target.closest?.('.help-tip');
   if(tip)openHelp(tip);
 });
 document.addEventListener('focusout',e=>{
   if(activeTip===e.target)closeHelp();
 });
 document.addEventListener('click',e=>{
   const tip=e.target.closest?.('.help-tip');
   if(tip){if(activeTip===tip&&helpPortal.classList.contains('visible'))closeHelp();else openHelp(tip);}
   else if(activeTip)closeHelp();
 });
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHelp();});
 window.addEventListener('resize',()=>{if(activeTip)positionHelp(activeTip);});
 document.querySelector('.sidebar')?.addEventListener('scroll',()=>{if(activeTip)positionHelp(activeTip);},{passive:true});
 let active=false,down=false,points=[],preview=null,last=null;
 const btn=$('freehand');
 function toggle(v){
   active=v;btn.setAttribute('aria-pressed',String(v));
   btn.textContent=v?'✎ Freehand: ON — drag on map':'✎ Freehand: OFF';
   btn.classList.toggle('active',v);
   map.getContainer().classList.toggle('freehand-active',v);
   if(v)map.dragging.disable();else if(!map.dragging.enabled())map.dragging.enable();
   if(!v){down=false;if(preview){map.removeLayer(preview);preview=null;}}
 }
 btn.addEventListener('click',()=>toggle(!active));
 map.on('mousedown',event=>{
   if(!active||!event.originalEvent||event.originalEvent.button!==0)return;
   down=true;points=[event.latlng];last=map.latLngToContainerPoint(event.latlng);
   if(preview)map.removeLayer(preview);
   preview=L.polyline(points,{color:'#65f4f5',weight:4,opacity:.95,interactive:false}).addTo(map);
   event.originalEvent.preventDefault();
 });
 map.on('mousemove',event=>{
   if(!active||!down)return;
   const p=map.latLngToContainerPoint(event.latlng);
   if(last&&p.distanceTo(last)<5)return;
   last=p;if(points.length<1400)points.push(event.latlng);
   preview.setLatLngs(points);
 });
 function finish(){
   if(!down)return;
   down=false;const coords=points.slice();
   toggle(false);
   if(coords.length<2)return;
   // Reduce excessive sampling noise without altering the geographic positions.
   const simplified=L.LineUtil.simplify(coords.map(p=>map.latLngToLayerPoint(p)),3.2);
   const converted=simplified.map(p=>map.layerPointToLatLng(p));
   if(converted.length<2)return;
   loadLine(converted.map(p=>[p.lat,p.lng]));
   $('drawHelp').textContent='Freehand trace complete. Edit the vertices if needed, then review the highlighted index and motion arrows.';
 }
 map.on('mouseup',finish);
 map.on('mouseout',()=>{if(down)finish();});
 window.addEventListener('mouseup',()=>{if(down)finish();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&active)toggle(false);});
})();
