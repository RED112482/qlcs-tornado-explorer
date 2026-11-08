'use strict';
// Level II overlay, no-label vector boundaries, editable RAP wind profiles and
// experimental directional guidance. This file augments the manual tracing app.
(function(){
 const $=id=>document.getElementById(id);
 const source=$('dataSource'),liveRefresh=refresh,liveFindScans=findScans;
 let autoArchiveFallback=false;
 let level2Manifest=null,level2Overlay=null,windMarkerLayer=L.layerGroup().addTo(map);
 let vectorBoundaries={};let boundarySerial=0,rapProfile=null,rapProfiles=[],manualWindOverride=false,rapProfilesFromRepo=false;
 const frameTime=x=>Date.parse(x.time||x.valid_time||x.timestamp||0);
 const niceTime=x=>x?new Date(x).toISOString().replace('T',' ').slice(0,19)+' UTC':'unknown';
 const normSite=s=>(s||'').toUpperCase().replace(/^K/,'');
 const level2Frames=()=>level2Manifest?.frames||[];
 async function getManifest(){
   try{const response=await fetch('./data/manifest.json?cache='+Math.floor(Date.now()/300000),{cache:'no-store'});
     if(!response.ok)throw Error('No Level II manifest published');
     const m=await response.json();
     if(!Array.isArray(m.frames))throw Error('Malformed Level II manifest');
     level2Manifest=m;return m;
   }catch(e){level2Manifest={frames:[]};$('level2Info').textContent='Level II archive not published yet. Run the radar decoder in GitHub Actions or switch to Level III fallback. '+e.message;return level2Manifest;}
 }
 function clearLevel2(){if(level2Overlay){map.removeLayer(level2Overlay);level2Overlay=null;} $('radarMomentLegend').hidden=true;}
 function chooseFrame(){
   const site=normSite($('site').value);
   let candidates=level2Frames().filter(f=>normSite(f.site||level2Manifest.site)===site);
   if($('mode').value==='archive'){
     const ts=scanTimes[+$('scanSlider').value];return ts?candidates.find(f=>f.time===ts)||null:null;
   }
   return candidates.sort((a,b)=>frameTime(b)-frameTime(a))[0]||null;
 }
 function showLevel2(){
   if(source.value!=='level2')return;
   if(radar){map.removeLayer(radar);radar=null;}
   clearLevel2();
   const frame=chooseFrame();
   if(!frame||!Array.isArray(frame.bounds)){
     $('radarStatus').textContent='Level II: no processed scan';
     $('radarTime').textContent='No decoded Level II scan published for K'+$('site').value;
     $('level2Info').textContent='No processed Level II data for this radar and selected UTC date. The calendar can select any date, but Level II archives must first be decoded through GitHub Actions → Process NEXRAD Level II. Select a processed date above to restore radar.';
     return;
   }
   const velocity=$('radarMoment').value==='velocity';
   const url=velocity?frame.velocity_url:frame.url;
   $('radarMomentLegend').hidden=!velocity||!url;
   const bounds=velocity?frame.velocity_bounds:frame.bounds;
   const elevation=velocity?frame.velocity_elevation_deg:frame.elevation_deg;
   if(!url||!Array.isArray(bounds)){
     $('radarStatus').textContent='Velocity not processed for this Level II frame';
     $('level2Info').textContent='This is a legacy Level II reflectivity-only frame. Reprocess this radar/time through the Level II workflow to generate the corresponding lowest-tilt velocity image. Raw velocity is not dealiased.';
     $('radarTime').textContent='K'+normSite(frame.site||level2Manifest.site)+' • '+niceTime(frame.time)+' • velocity unavailable';
     return;
   }
   level2Overlay=L.imageOverlay(url,bounds,{pane:'radarPane',opacity:Number($('radarOpacity').value)/100,interactive:false,crossOrigin:true}).addTo(map);
   level2Overlay.once('load',()=>{$('radarStatus').textContent='Level II '+(velocity?'Velocity':'Reflectivity')+' loaded: '+(elevation??'?')+'°';});
   level2Overlay.once('error',()=>{$('radarStatus').textContent='Level II image missing';$('level2Info').textContent='Manifest exists but radar image failed: '+frame.url;});
   $('radarStatus').textContent='Loading Level II sweep';
   $('radarTime').textContent='K'+normSite(frame.site||level2Manifest.site)+' • '+niceTime(frame.time)+' • '+Number(elevation||0).toFixed(2)+'° '+(velocity?'raw radial velocity (kt; aliased)':'base reflectivity (dBZ)');
   $('level2Info').textContent='Genuine Level II lowest valid '+(velocity?'velocity':'reflectivity')+' sweep • '+(elevation??'?')+'° • '+(frame.render_radius_km||'full')+' km • '+(frame.image_pixels||'legacy')+' px • '+(velocity?'RAW ALIASED radial velocity, kt':'reflectivity, dBZ')+' • UTC/Zulu.';
   $('radarDirect').href=url;$('radarDirect').textContent='Open decoded Level II '+(velocity?'velocity':'reflectivity')+' image';
   matchRap(frame.time);renderBarbGrid();
 }
 refresh=function(){
   if(source.value==='level3'){clearLevel2();liveRefresh();return;}
   if($('mode').value==='live'){
     const fresh=level2Frames().some(f=>normSite(f.site||level2Manifest.site)===normSite($('site').value)&&Date.now()-frameTime(f)<90*60000&&Date.now()>=frameTime(f));
     if(!fresh){source.value='level3';clearLevel2();$('level2Info').textContent='No freshly processed Level II scan for this radar. Showing the independent IEM latest radar feed (Level III).';liveRefresh();return;}
   }
   showLevel2();
 };
 findScans=async function(){
   if(source.value==='level3'){
     if(autoArchiveFallback){source.value='level2';}else return liveFindScans();
   }
   const a=parseZulu($('startUTC').value),b=parseZulu($('endUTC').value);
   if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a){$('scanStatus').textContent='Enter YYYY-MM-DDTHH:mmZ for both UTC endpoints.';return;}
   const windowStart=$('startUTC').value,windowEnd=$('endUTC').value,site=$('site').value;
   $('scanStatus').textContent='Checking processed Level II scans for '+windowStart+'–'+windowEnd+'…';
   await getManifest();
   // Ignore responses for a superseded calendar/site selection.
   if(windowStart!==$('startUTC').value||windowEnd!==$('endUTC').value||site!==$('site').value)return;
   scanTimes=[...new Set(level2Frames().filter(f=>normSite(f.site||level2Manifest.site)===normSite(site)&&frameTime(f)>=a&&frameTime(f)<b).map(f=>f.time))].sort();
   $('scanSlider').disabled=!scanTimes.length;$('scanSlider').max=Math.max(0,scanTimes.length-1);$('scanSlider').value=0;
   $('scanLabel').textContent=scanTimes.length?'1/'+scanTimes.length:'0/0';
   if(scanTimes.length){
     autoArchiveFallback=false;
     $('archiveDataNotice').hidden=true;
     $('scanStatus').textContent=scanTimes.length+' genuine decoded Level II scan(s) for K'+site+' • '+windowStart+' to '+windowEnd+'.';
     $('level2Info').textContent='Source: decoded native NEXRAD Level II, already processed and published in this repository.';
     showLevel2();
   }else{
     // GitHub Pages cannot decode remote Level II volumes on a date change.
     // IEM's archive exposes Level III single-site imagery for arbitrary dates.
     // Automatically hand off to that independent source rather than blanking.
     clearLevel2();
     autoArchiveFallback=true;
     source.value='level3';
     $('radarStatus').textContent='No published Level II • trying IEM Level III archive';
     $('level2Info').textContent='No decoded Level II for K'+site+' at '+windowStart+'–'+windowEnd+'. Automatically searching IEM single-site Level III reflectivity instead. To view genuine Level II for this date, run the GitHub Level II processing workflow (link below).';
     $('archiveDataNotice').hidden=false;
     $('archiveDataNotice').textContent='Level II not published for this UTC window — using Level III archived radar if available. Level II processing must be requested separately.';
     await liveFindScans();
   }
 };
 $('radarMoment').addEventListener('change',()=>{if(source.value==='level2')showLevel2();});
 // GR2Analyst-style quick moment switch. Do not intercept typing, line editing,
 // or Delete in a form. Numpad Decimal is frequently marked "Del" on keyboards.
 document.addEventListener('keydown',event=>{
   if(event.repeat||event.ctrlKey||event.metaKey||event.altKey)return;
   if(!['Period','NumpadDecimal','Delete'].includes(event.code)&&event.key!=='.')return;
   const el=document.activeElement;
   if(el&&(el.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(el.tagName)))return;
   if(map.getContainer().classList.contains('freehand-active'))return;
   if(source.value!=='level2')return;
   const frame=chooseFrame();
   if(!frame?.url||!frame?.velocity_url){
     $('radarStatus').textContent='R/V shortcut unavailable: both Level II moments must be processed';
     return;
   }
   event.preventDefault();
   $('radarMoment').value=$('radarMoment').value==='reflectivity'?'velocity':'reflectivity';
   showLevel2();
 });
 async function checkLatestLevel2(){
   $('level2Info').textContent='Refreshing latest published native Level II volumes…';
   await getManifest();
   const site=normSite($('site').value);
   const recent=level2Frames().filter(f=>normSite(f.site||level2Manifest.site)===site &&
     Date.now()-frameTime(f)>=0 && Date.now()-frameTime(f)<=90*60000)
     .sort((a,b)=>frameTime(b)-frameTime(a));
   if(recent.length){
     source.value='level2';
     $('level2Info').textContent='Most recent native Level II: '+niceTime(recent[0].time)+
       ' (reflectivity'+(recent[0].velocity_url?' + velocity':' only')+').';
     refresh();
   }else{
     $('level2Info').textContent='No recently processed Level II for K'+site+
       '. Enable the optional GitHub live processor for this radar or use the independent Level III latest feed.';
   }
 }
 $('checkLiveLevel2').addEventListener('click',checkLatestLevel2);
 function updateLiveControls(){
   $('liveLevel2Tools').hidden=$('mode').value!=='live';
 }
 $('mode').addEventListener('change',updateLiveControls);
 updateLiveControls();
 source.addEventListener('change',async()=>{autoArchiveFallback=false;$('archiveDataNotice').hidden=true;stopPlay();if($('mode').value==='archive')return findScans();if(source.value==='level2')await getManifest();refresh();});
 const originalOpacity=$('radarOpacity').oninput;
 $('radarOpacity').oninput=()=>{if(source.value==='level2'&&level2Overlay)level2Overlay.setOpacity(+$('radarOpacity').value/100);else originalOpacity?.();};
 // The NOAA ArcGIS reference service returns geometries with no rendered labels.
 // Replacing raster MapServer exports also eliminates embedded map text.
 const REF='https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer';
 const config={states:{id:3,color:'#bbc6d0',weight:1.6},counties:{id:2,color:'#8795a1',weight:.65},cwas:{id:1,color:'#ffe192',weight:1.9,dashArray:'7 4'}};
 for(const id of Object.keys(config)){
   if(borders[id])map.removeLayer(borders[id]);
   vectorBoundaries[id]=L.geoJSON(null,{pane:'boundaryPane',style:()=>({...config[id],fill:false,opacity:id==='counties'?.65:.9}),interactive:false});
   $(id).onchange=()=>{$(id).checked?vectorBoundaries[id].addTo(map):map.removeLayer(vectorBoundaries[id]);};
   $(id).onchange();
 }
 // Land polygons are already unlabeled; state borders can be toggled independently.
 async function loadBoundaries(){
   const serial=++boundarySerial,b=map.getBounds().pad(.15);
   if(!b.isValid())return;
   const geom=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(',');
   await Promise.all(Object.entries(config).map(async([id,opts])=>{
     if(!$(id).checked)return;
     const q=new URLSearchParams({where:'1=1',geometry:geom,geometryType:'esriGeometryEnvelope',inSR:'4326',spatialRel:'esriSpatialRelIntersects',outFields:'*',outSR:'4326',returnGeometry:'true',f:'geojson',maxAllowableOffset:map.getZoom()<7?'0.035':'0.008'});
     try{
       const r=await fetch(REF+'/'+opts.id+'/query?'+q);
       if(!r.ok)throw Error('HTTP '+r.status);
       const data=await r.json();
       if(serial!==boundarySerial)return;
       if(data.type==='FeatureCollection'){vectorBoundaries[id].clearLayers();vectorBoundaries[id].addData(data);}
     }catch(e){console.warn('Unlabeled '+id+' outline service unavailable:',e.message);}
   }));
 }
 let throttle;map.on('moveend',()=>{clearTimeout(throttle);throttle=setTimeout(loadBoundaries,400);});
 ['states','counties','cwas'].forEach(id=>$(id).addEventListener('change',loadBoundaries));
 loadBoundaries();
 // Advanced line-relative guidance: colors compare the experimental local index
 // among line sections, NEVER actual tornado likelihood or probability.
 const baseCalc=calc;
 function pennantBarb(speed,dir,color){
   // Meteorological convention: shaft points wind FROM. The barb feathers
   // meet the staff at exactly 90° (not the diagonal feather from v0.8).
   // A constant SVG pivot at (24,42) keeps the station anchor fixed.
   const value=Math.max(0,Math.round(speed/5)*5);
   let remainder=value,fifty=Math.floor(remainder/50);remainder%=50;
   const tens=Math.floor(remainder/10);remainder%=10;
   const five=remainder>=5?1:0;
   const paint='stroke="'+color+'" stroke-width="2.1" stroke-linecap="round"';
   let features='<line x1="24" y1="42" x2="24" y2="5" '+paint+'/>';
   let y=6;
   for(let n=0;n<fifty;n++){
     // Right-angle pennant, with leading feather perpendicular to the staff.
     features+='<path d="M24 '+y+' H38 V'+(y+9)+' Z" fill="'+color+'" stroke="'+color+'" stroke-width=".65"/>';
     y+=11;
   }
   for(let n=0;n<tens;n++){
     features+='<line x1="24" y1="'+y+'" x2="38" y2="'+y+'" '+paint+'/>';
     y+=6;
   }
   if(five)features+='<line x1="24" y1="'+y+'" x2="32" y2="'+y+'" '+paint+'/>';
   // Calm barbs render a ring. Cardinal rotation is exact (0=north, 90=east).
   if(value===0)features='<circle cx="24" cy="42" r="4" fill="none" '+paint+'/>';
   const from=(Number(dir)%360+360)%360;
   return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><g transform="rotate('+from+' 24 42)">'+features+'</g></svg>';
 }
 // Continuous diagnostic display with stable physical reference scaling.
 // This IS NOT a calibrated likelihood. QTor terms are a simplified prototype.
 const clamp01=v=>Math.max(0,Math.min(1,v));
 // Stretch only the COLOR scale across the current line to expose genuine
 // variations. The actual QTor-inspired numeric scores remain untouched.
 // Flat/uniform cases stay visually uniform; never invent variation.
 function relativeColorScale(values,value){
   const arr=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
   if(!arr.length)return .5;
   const low=arr[Math.floor(.10*(arr.length-1))];
   const high=arr[Math.ceil(.90*(arr.length-1))];
   if(high-low<.001)return .5;
   return clamp01((value-low)/(high-low));
 }
 function qtorScale(v){return clamp01((Number(v)||0)/6);}
 map.createPane('gradientPane');
 map.getPane('gradientPane').style.zIndex=450;
 map.getPane('gradientPane').style.pointerEvents='auto';
 function tortRamp(t){
   t=clamp01(t);
   const stops=[[32,104,67],[91,218,95],[67,244,197]];
   const i=t<.5?0:1,f=t<.5?t*2:(t-.5)*2;
   return 'rgb('+stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f)).join(',')+')';
 }
 function colorRamp(t){
   t=clamp01(t);
   // 0 red -> 0.5 yellow -> 1 green (avoid false threshold step).
   const stops=[[226,83,92],[244,197,69],[32,215,123]];
   const i=t<.5?0:1,f=t<.5?t*2:(t-.5)*2;
   return 'rgb('+stops[i].map((v,k)=>Math.round(v+(stops[i+1][k]-v)*f)).join(',')+')';
 }
 const WEIGHTED_CATEGORIES=[
   {key:'lower',label:'Lower',color:'#e2535c'},
   {key:'medium',label:'Medium',color:'#f4c545'},
   {key:'higher',label:'Higher',color:'#20d77b'}
 ];
 function weightedCategory(position){
   const pos=clamp01(position);
   return pos<1/3?WEIGHTED_CATEGORIES[0]:pos<2/3?WEIGHTED_CATEGORIES[1]:WEIGHTED_CATEGORIES[2];
 }
 function analysisAt(fraction){
   if(!rows.length)return null;
   const x=clamp01(fraction)*(rows.length-1),i=Math.min(rows.length-2,Math.floor(x)),w=x-i;
   const aa=rows[i],bb=rows[i+1];
   const q=(aa.score*(1-w)+bb.score*w),t=(aa.tortBoost*(1-w)+bb.tortBoost*w);
   const eligible=q>0;
   const mode=$('gradientMode').value;
   const qn=qtorScale(q),tn=clamp01(t);
   const value=mode==='tortuosity'?tn:mode==='weighted'?(eligible?(0.7*qn+0.3*tn):0):qn;
   const candidates=rows.map(r=>{
     const candidateQ=qtorScale(r.score),candidateT=clamp01(r.tortBoost);
     return mode==='tortuosity'?candidateT:
       mode==='weighted'?(r.score>0?.7*candidateQ+.3*candidateT:0):candidateQ;
   });
   const rendered=relativeColorScale(candidates,value);
   const categorical=mode==='weighted'&&$('weightedCategories').checked;
   const category=categorical?weightedCategory(rendered):null;
   const color=category?category.color:mode==='tortuosity'
      ?(eligible?tortRamp(rendered):'#687684')
      :colorRamp(rendered);
   return {mode,color,category:category?.label||null,value,relativeColor:rendered,score:q,tortBoost:tn,eligible};
 }
 window.qlcsDiagnosticAt=analysisAt;
 window.qlcsDiagnosticColor=analysisAt;
 function updateGradientLegend(){
   const mode=$('gradientMode').value,track=$('gradientTrack'),
         preview=$('gradientPreview'),explanation=$('gradientExplanation'),legend=$('analysisLegendText');
   $('weightedCategorySettings').hidden=mode!=='weighted';
   if(mode==='tortuosity'){
     track.style.background='linear-gradient(90deg,#206843,#5bda5f,#43f4c5)';
     preview.children[0].textContent='Weak tortuosity boost';
     preview.children[1].textContent='Strong tortuosity boost';
     explanation.textContent='The local curvature enhancement varies gradually along the line. Colors highlight differences within this trace only; gray sections lack positive QTor-inspired shear support.';
     legend.textContent='Tortuosity enhancement: dark green → lime → turquoise = stronger continuous bowing/curvature (gray = no favorable shear reference)';
   }else if(mode==='weighted'){
     const categorical=$('weightedCategories').checked;
     track.style.background=categorical
       ?'linear-gradient(90deg,#e2535c 0%,#e2535c 33.33%,#f4c545 33.33%,#f4c545 66.67%,#20d77b 66.67%,#20d77b 100%)'
       :'linear-gradient(90deg,#e2535c,#f4c545,#20d77b)';
     preview.children[0].textContent='Lower weighted index';
     preview.children[1].textContent='Higher weighted index';
     explanation.textContent=categorical
       ?'Three distinct classes (Lower <33%, Medium 33–67%, Higher ≥67%) partition the current line-relative normalized weighted index. The same classes color the immediate line and downstream swept area. They are NOT mesovortex genesis probabilities.'
       :'Smooth line-relative weighted index = 70% normalized QTor-inspired score + 30% tortuosity enhancement, not trained or calibrated probabilities.';
     legend.textContent=categorical
       ?'WEIGHTED INDEX: RED = Lower | YELLOW = Medium | GREEN = Higher. Relative to THIS drawn line only, NOT tornado probabilities.'
       :'Weighted relative index: red → yellow → green = increasing experimental diagnostic score (NOT percentage probability)';
   }else if(mode==='off'){
     track.style.background='#627987';
     preview.children[0].textContent='Analysis overlay off';
     preview.children[1].textContent='Only the drawn line remains';
     explanation.textContent='Line scoring still runs internally for exported diagnostics, but the colored segments are hidden.';
     legend.textContent='Line diagnostic gradient hidden';
   }else{
     track.style.background='linear-gradient(90deg,#e2535c,#f4c545,#20d77b)';
     preview.children[0].textContent='Lower QTor-inspired index';
     preview.children[1].textContent='Higher QTor-inspired index';
     explanation.textContent='Colors are stretched across the 10th–90th percentile of this traced line to reveal local differences. Underlying scores are unchanged. Red/yellow/green do not represent measured mesovortex probabilities.';
     legend.textContent='Continuous QTor-inspired index: red → yellow → green = increasing relative index, not calibrated risk';
   }
 }
 function advancedDraw(){
   windMarkerLayer.clearLayers();
   updateGradientLegend();
   if(!rows?.length||!drawn.getLayers().length)return;
   const mode=$('gradientMode').value,motion=Number($('motion').value);
   const visible=$('showScores').checked&&mode!=='off';
   // One dark underlay gives the full line a readable outline over high dBZ.
   if(visible)L.polyline(rows.map(r=>r.point),{pane:'gradientPane',color:'#101d26',weight:13,opacity:.95,interactive:false}).addTo(windMarkerLayer);
   for(let i=1;i<rows.length;i++){
     const prev=rows[i-1],cur=rows[i],diag=analysisAt((i-.5)/(rows.length-1));
     if(visible){
       L.polyline([prev.point,cur.point],{pane:'gradientPane',color:diag.color,weight:9,opacity:1,
          interactive:true})
        .bindPopup('Relative index: '+diag.score.toFixed(2)+
          '<br>Continuous tortuosity enhancement: '+diag.tortBoost.toFixed(2)+
          (diag.category?'<br><strong>Weighted category: '+diag.category+'</strong>':'')+
          '<br>Within-line color position: '+Math.round(diag.relativeColor*100)+' / 100'+
          '<br><strong>Not a calibrated mesovortex probability.</strong>')
        .addTo(windMarkerLayer);
     }
     if($('showFlare').checked&&visible){
       const a=dest(prev.point,motion,18),b=dest(cur.point,motion,18);
       L.polygon([prev.point,cur.point,b,a],{
         stroke:false,fillColor:diag.color,fillOpacity:.12,
         interactive:false}).addTo(windMarkerLayer);
     }
   }
   // Label each substantial contiguous weighted-class region once, rather
   // than stamping a label at every sample point or radar gate.
   if(visible&&mode==='weighted'&&$('weightedCategories').checked){
     let start=0;
     const labels=rows.map((_,i)=>analysisAt(i/(rows.length-1)).category);
     const addRun=(from,to)=>{
       if(!labels[from]||to-from<2)return;
       const mid=Math.floor((from+to)/2),p=rows[mid].point;
       L.marker(p,{pane:'gradientPane',interactive:false,keyboard:false,
         icon:L.divIcon({className:'qlcs-category-label',html:'<span>'+labels[from]+'</span>',
           iconSize:[90,22],iconAnchor:[45,28]})}).addTo(windMarkerLayer);
     };
     for(let i=1;i<=labels.length;i++){
       if(i===labels.length||labels[i]!==labels[start]){addRun(start,i-1);start=i;}
     }
   }
   if($('showNormals').checked)for(let i=2;i<rows.length;i+=Math.max(3,Math.round(22/Math.max(1,+$('step').value)))){
     const p=rows[i].point,q=dest(p,rows[i].normal,11),
       a=dest(q,(rows[i].normal+150)%360,3),b=dest(q,(rows[i].normal+210)%360,3);
     L.polyline([p,q],{color:'#ebf1fa',weight:1.6,opacity:.85,interactive:false}).addTo(windMarkerLayer);
     L.polyline([a,q,b],{color:'#ebf1fa',weight:1.6,opacity:.85,interactive:false}).addTo(windMarkerLayer);
   }
   if($('showMotion').checked)for(let i=2;i<rows.length;i+=Math.max(3,Math.round(15/Math.max(1,+$('step').value)))){
     const p=rows[i].point,q=dest(p,motion,22),
       a=dest(q,(motion+155)%360,4),b=dest(q,(motion+205)%360,4);
     L.polyline([p,q],{color:'#ffe06b',weight:2.3,opacity:.95,interactive:false,dashArray:'6 4'}).addTo(windMarkerLayer);
     L.polyline([a,q,b],{color:'#ffe06b',weight:2.3,opacity:.95,interactive:false}).addTo(windMarkerLayer);
   }
 }
 // Use *spatial* RAP profiles whenever site, UTC time and no manual override match.
 // Fall back to explicitly labeled repeated site winds only if grid data are absent.
 map.createPane('windGridPane');map.getPane('windGridPane').style.zIndex=460;
 map.getPane('windGridPane').style.pointerEvents='none';
 const barbGrid=L.layerGroup().addTo(map);
 let spatialGrids=[];
 function findSpatialGrid(){
   if(manualWindOverride)return null;
   const site='K'+$('site').value;
   const selected=scanTimes.length?scanTimes[Number($('scanSlider').value)]:null;
   const target=Date.parse(selected||($('mode').value==='archive'?$('startUTC').value:new Date().toISOString()));
   return spatialGrids.filter(g=>g.site===site&&Math.abs(Date.parse(g.valid_time)-target)<=3600000)
      .sort((a,b)=>Math.abs(Date.parse(a.valid_time)-target)-Math.abs(Date.parse(b.valid_time)-target))[0]||null;
 }
 function renderBarbGrid(){
   barbGrid.clearLayers();
   const status=$('windGridStatus');
   if(!$('showBarbs').checked){status.textContent='Wind barb grid hidden.';return;}
   const levels=['0','1','3'].filter(level=>$('showBarb'+level).checked);
   if(!levels.length){status.textContent='No wind levels selected.';return;}
   const spacing=Math.max(75,Math.min(180,Number($('barbSpacing').value)||110));
   $('barbSpacingValue').textContent=String(spacing);
   const screen=map.getSize();
   if(screen.x<1||screen.y<1)return;
   const colors={'0':'#d8f2ff','1':'#ffdc79','3':'#d4abff'};
   const actual=findSpatialGrid();
   const uniform={};
   for(const level of ['0','1','3']){
     uniform['dir'+level]=Number($('dir'+level).value);
     uniform['spd'+level]=Number($('spd'+level).value);
   }
   let spatialCount=0,representativeCount=0;
   // One fixed square grid in SCREEN pixels, centered in the viewport.
   // Recomputed after zoom/move so columns/rows remain equally separated.
   // Unlike a geographic latitude/longitude matrix, Mercator cannot compress
   // northern rows or create irregular spacing at different map zoom levels.
   const columns=Math.max(1,Math.floor(screen.x/spacing));
   const rows=Math.max(1,Math.floor(screen.y/spacing));
   const xOrigin=(screen.x-(columns-1)*spacing)/2;
   const yOrigin=(screen.y-(rows-1)*spacing)/2;
   function windsAt(lat,lon){
     if(!actual||!Array.isArray(actual.points)||!actual.points.length)
       return {winds:uniform,source:'representative'};
     const near=actual.points.map(point=>{
       const north=(point.lat-lat)*111.2;
       const east=(point.lon-lon)*111.2*Math.cos(lat*Math.PI/180);
       return {point,d:Math.hypot(north,east)};
     }).sort((p,q)=>p.d-q.d).slice(0,4);
     // Do not call winds from remote locations "actual spatial RAP."
     // Unsupported cells remain on the square grid using the user's displayed
     // representative profile and are visibly dimmed.
     if(!near.length||near[0].d>38)return {winds:uniform,source:'representative'};
     const result={};
     for(const level of ['0','1','3']){
       let u=0,v=0,total=0;
       for(const {point,d} of near){
         const speed=Number(point.winds?.['spd'+level]);
         const from=Number(point.winds?.['dir'+level]);
         if(!Number.isFinite(speed)||!Number.isFinite(from))continue;
         const weight=1/Math.max(1.5,d)**2;
         const direction=from*Math.PI/180;
         u-=speed*Math.sin(direction)*weight;
         v-=speed*Math.cos(direction)*weight;
         total+=weight;
       }
       if(!total)return {winds:uniform,source:'representative'};
       u/=total;v/=total;
       result['spd'+level]=Math.hypot(u,v);
       result['dir'+level]=(Math.atan2(-u,-v)*180/Math.PI+360)%360;
     }
     return {winds:result,source:'rap'};
   }
   for(let j=0;j<rows;j++){
     for(let i=0;i<columns;i++){
       const screenPoint=L.point(xOrigin+i*spacing,yOrigin+j*spacing);
       const geo=map.containerPointToLatLng(screenPoint);
       const data=windsAt(geo.lat,geo.lng);
       const content=levels.map(level=>{
         const speed=Number(data.winds['spd'+level]);
         const from=Number(data.winds['dir'+level]);
         if(!Number.isFinite(speed)||!Number.isFinite(from))return '';
         return '<div class="barb-layer barb-'+level+'">'+pennantBarb(speed,from,colors[level])+'</div>';
       }).join('');
       if(!content)continue;
       const div='<div class="wind-grid-stack '+(data.source==='rap'?'barb-from-rap':'barb-representative')+'">'+content+'</div>';
       L.marker(geo,{pane:'windGridPane',interactive:false,keyboard:false,
         icon:L.divIcon({className:'wind-grid-icon',html:div,iconSize:[48,48],iconAnchor:[24,42]})
       }).addTo(barbGrid);
       if(data.source==='rap')spatialCount++;else representativeCount++;
     }
   }
   status.textContent='SCREEN-ALIGNED SQUARE GRID • '+rows+' rows × '+columns+' columns • '+spacing+' px spacing at every zoom • '+spatialCount+' RAP-interpolated points'+(actual?' at '+niceTime(actual.valid_time):'')+'; '+representativeCount+' dimmed representative-wind points outside RAP coverage (not actual spatial RAP).';
 }
 async function loadSpatialGrid(){
   try{
     const r=await fetch('./data/rap-grid.json?bust='+Date.now(),{cache:'no-store'});
     if(!r.ok)throw Error('Grid not published');
     const d=await r.json();
     spatialGrids=Array.isArray(d.grids)?d.grids:[];
   }catch(e){spatialGrids=[];}
   renderBarbGrid();
 }
 loadSpatialGrid();
 calc=function(){baseCalc();advancedDraw();renderBarbGrid();};
 ['showNormals','showMotion','showFlare'].forEach(id=>$(id).addEventListener('change',advancedDraw));
 ['showBarbs','showBarb0','showBarb1','showBarb3','barbSpacing'].forEach(id=>$(id).addEventListener('input',renderBarbGrid));
 map.on('moveend zoomend resize',renderBarbGrid);
 renderBarbGrid();
 // RAP import is data provenance; changing a wind input switches to manual override.
 function setWindSource(msg){$('windSource').textContent=msg;}
 function applyRap(profile){
   const profileSite=normSite(profile.site||'');
   if(profileSite&&profileSite!==normSite($('site').value))throw Error('RAP profile is for K'+profileSite+', selected radar is K'+$('site').value);
   const w=profile.winds||profile;
   for(const key of ['dir0','spd0','dir1','spd1','dir3','spd3']){
     const val=Number(w[key]);if(!Number.isFinite(val))throw Error('RAP profile missing '+key);
     $(key).value=val;
   }
   rapProfile=profile;manualWindOverride=false;
   setWindSource((rapProfilesFromRepo?'NOAA RAP ARCHIVE · ':'USER-IMPORTED RAP JSON (not independently verified) · ')+'K'+normSite(profile.site||$('site').value)+' · '+niceTime(profile.valid_time||profile.time||'')+' · '+(profile.product||'awp130pgrb')+' F'+String(profile.forecast_hour??0).padStart(2,'0')+' · 10 m / 1 km / 3 km AGL · Editable inputs');
   calc();save();
 }
 function matchRap(time){
   if(manualWindOverride)return;
   const target=Date.parse(time||'');
   if(!Number.isFinite(target))return;
   const site=normSite($('site').value);
   const candidates=rapProfiles.filter(p=>normSite(p.site||'')===site)
     .map(p=>({p,d:Math.abs(Date.parse(p.valid_time||p.time||'')-target)}))
     .filter(x=>Number.isFinite(x.d)).sort((a,b)=>a.d-b.d);
   const match=candidates[0];
   if(match&&match.d<=60*60000){
     try{applyRap(match.p);updateRapRequestUI(false,'Time-matched RAP available for K'+site+'.');}
     catch(e){console.warn('RAP profile failed validation',e);}
   }else{
     // Retain displayed editable values but do not present them as the
     // new selected case's genuine model environment.
     rapProfile=null;
     const cycle=new Date(Math.floor(target/3600000)*3600000).toISOString().slice(0,16)+'Z';
     setWindSource('NO MATCHING RAP YET · K'+site+' · '+cycle+
       ' • displayed values are retained placeholders, NOT verified for this UTC case');
     updateRapRequestUI(true,'No cached RAP F00 profile for K'+site+' at '+cycle+
       '. Click Load time-matched RAP to recheck, or Retrieve missing RAP to process it on GitHub.');
   }
 }
 // The current radar scan in archive mode, otherwise the explicitly selected
 // UTC window, or the current UTC hour for live mode. NEVER use a stale
 // published profile merely because it is the newest one at a site.
 function selectedRapTime(){
   if($('mode').value==='archive'){
     const selected=scanTimes.length?scanTimes[Number($('scanSlider').value)||0]:null;
     const begin=Date.parse($('startUTC').value),end=Date.parse($('endUTC').value);
     // A calendar change can precede the asynchronous scan lookup. Do not
     // accidentally request the RAP cycle of the previous selected date.
     const candidate=Date.parse(selected||'');
     const epoch=Number.isFinite(candidate)&&candidate>=begin&&candidate<end
       ?candidate:begin;
     return Number.isFinite(epoch)?new Date(epoch).toISOString():null;
   }
   return new Date().toISOString();
 }
 function selectedRapCycle(){
   const current=selectedRapTime();
   if(!current)return null;
   return new Date(Math.floor(Date.parse(current)/3600000)*3600000)
     .toISOString().slice(0,16)+'Z';
 }
 const rapRequestButton=$('requestMissingRap'),rapCheck=$('checkRap'),
       rapRequestStatus=$('rapLookupStatus');
 function updateRapRequestUI(missing,message){
   rapRequestButton.hidden=!missing;
   rapCheck.hidden=!missing;
   rapRequestStatus.textContent=message||'';
 }
 async function fetchRapFromRepo(){
   $('windSource').textContent='Looking for RAP F00 for selected site and UTC time…';
   try{
     const requested=selectedRapTime(),cycle=selectedRapCycle();
     const site=normSite($('site').value);
     if(!requested||!cycle)throw Error('Select a valid UTC archive window or live time first');
     const response=await fetch('./data/rap.json?t='+Date.now(),{cache:'no-store'});
     if(!response.ok)throw Error('No RAP data cache published yet');
     const payload=await response.json();
     const profiles=Array.isArray(payload.profiles)?payload.profiles:[payload];
     const candidate=profiles.filter(p=>normSite(p.site||'')===site)
       .map(p=>({p,delta:Math.abs(Date.parse(p.valid_time||p.time||'')-Date.parse(requested))}))
       .filter(x=>Number.isFinite(x.delta))
       .sort((x,y)=>x.delta-y.delta)[0];
     // F00 cycle is at whole hour. Require a model cycle no more than one
     // hour from the radar volume, never silently substitute another case.
     if(!candidate||candidate.delta>3600000){
       updateRapRequestUI(true,'No processed RAP profile for K'+site+
         ' near '+requested.slice(0,16)+'Z. Click Retrieve missing RAP to process the '+cycle+' analysis from the NOAA archive using GitHub.');
       $('windSource').textContent='RAP NOT YET CACHED · K'+site+' · '+cycle+
         ' • manual winds preserved';
       return false;
     }
     rapProfiles=profiles;
     rapProfilesFromRepo=true;
     manualWindOverride=false;
     applyRap(candidate.p);
     updateRapRequestUI(false,'Verified NOAA RAP F00 cached for K'+site+
       ' at '+niceTime(candidate.p.valid_time||candidate.p.time||'')+'.');
     await loadSpatialGrid();
     return true;
   }catch(error){
     const site='K'+normSite($('site').value),cycle=selectedRapCycle();
     updateRapRequestUI(!!cycle,'RAP cache lookup unavailable: '+error.message+
       (cycle?'. You can request NOAA RAP F00 at '+cycle+'.':''));
     $('windSource').textContent='RAP NOT LOADED · '+site+' · '+error.message+
       ' • manual winds preserved';
     return false;
   }
 }
 rapRequestButton.addEventListener('click',()=>{
   const cycle=selectedRapCycle();
   const site='K'+normSite($('site').value);
   if(!cycle||!/^K[A-Z0-9]{3}$/.test(site)){
     rapRequestStatus.textContent='Select a radar and valid UTC time first.';
     return;
   }
   const title='[QLCS RAP] '+site+' '+cycle;
   const body='QLCS RAP F00 environmental analysis request\\nSITE='+site+
     '\\nCYCLE_UTC='+cycle+
     '\\n\\nOwner-authorized request to retrieve NOAA RAP and publish 10 m/1 km/3 km AGL winds.';
   const url=new URL('https://github.com/RED112482/qlcs-tornado-explorer/issues/new');
   url.searchParams.set('title',title);
   url.searchParams.set('body',body.replaceAll('\\n','\n'));
   const tab=window.open(url.toString(),'_blank');
   if(tab)tab.opener=null;else window.location.href=url.toString();
   rapRequestStatus.textContent='RAP request prepared for '+site+' '+cycle+
     '. Sign in to GitHub, click Submit new issue, then use Check RAP after the workflow publishes the profile.';
 });
 rapCheck.addEventListener('click',fetchRapFromRepo);
 $('fetchRap').onclick=fetchRapFromRepo;
 $('loadRap').onclick=()=>$('rapInput').click();
 $('rapInput').onchange=async e=>{
   const f=e.target.files?.[0];if(!f)return;
   try{if(f.size>3e6)throw Error('RAP profile file exceeds 3 MB');
     const data=JSON.parse(await f.text());rapProfiles=Array.isArray(data.profiles)?data.profiles:[data];rapProfilesFromRepo=false;
     if(!rapProfiles.length)throw Error('No wind profiles');
     const match=rapProfiles.find(p=>normSite(p.site||'')===normSite($('site').value));
     if(!match)throw Error('No profile for selected radar '+$('site').value);
     applyRap(match);
   }catch(err){setWindSource('RAP load error: '+err.message);}
   e.target.value='';
 };
 for(const k of ['dir0','spd0','dir1','spd1','dir3','spd3'])$(k).addEventListener('change',()=>{
   manualWindOverride=true;
   setWindSource('MANUAL OVERRIDE · '+k+' edited • active wind profile is not fully RAP-derived');
 });
 // Optional RAP profile JSON published by the processing worker.
 fetch('./data/rap.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{
   if(data){rapProfiles=Array.isArray(data.profiles)?data.profiles:[data];rapProfilesFromRepo=true;
     const selected=level2Frames().find(f=>normSite(f.site||level2Manifest?.site)===normSite($('site').value));
     if(selected)matchRap(selected.time);
     else setWindSource('MANUAL WINDS · '+rapProfiles.length+' RAP profile(s) available for matching radar/time');
   }
 }).catch(()=>{});
 getManifest().then(async m=>{
   const count=(m.frames||[]).length;
   if(!count&&source.value==='level2'){
     source.value='level3';
     $('level2Info').textContent='No decoded Level II frames have been published. Showing the IEM radar feed until processing is available.';
   }
   if(source.value==='level2'&&$('mode').value==='archive'){
     map.setView(sites[$('site').value],9);
     await findScans();
   }else if(source.value==='level3'&&$('mode').value==='archive'){
     await findScans();
   }else{
     refresh();
   }
   calc();
 });
})();
