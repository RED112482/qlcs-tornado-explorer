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
  showBarbs:'Display meteorological wind barbs at regularly spaced points across the current map extent, using repeated 10-m/1-km/3-km representative winds (NOT independent model values at each grid location).',
  barbLevels:'Choose 10-m, 1-km or 3-km wind barbs, or show all three side-by-side at each grid node. Colors distinguish levels, not wind hazard or tornado chance.',
  barbSpacing:'Ground-distance spacing between plotted wind-barb grid nodes in kilometers. Smaller spacing yields more symbols, potentially obscuring radar details. Does not change wind values or analysis.',
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
