'use strict';
// Level II overlay, no-label vector boundaries, editable RAP wind profiles and
// experimental directional guidance. This file augments the manual tracing app.
(function(){
 const $=id=>document.getElementById(id);
 const source=$('dataSource'),liveRefresh=refresh,liveFindScans=findScans;
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
 function clearLevel2(){if(level2Overlay){map.removeLayer(level2Overlay);level2Overlay=null;}}
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
   level2Overlay=L.imageOverlay(frame.url,frame.bounds,{pane:'radarPane',opacity:Number($('radarOpacity').value)/100,interactive:false,crossOrigin:true}).addTo(map);
   level2Overlay.once('load',()=>{$('radarStatus').textContent='Level II loaded: '+(frame.elevation_deg??'?')+'°';});
   level2Overlay.once('error',()=>{$('radarStatus').textContent='Level II image missing';$('level2Info').textContent='Manifest exists but radar image failed: '+frame.url;});
   $('radarStatus').textContent='Loading Level II sweep';
   $('radarTime').textContent='K'+normSite(frame.site||level2Manifest.site)+' • '+niceTime(frame.time)+' • '+Number(frame.elevation_deg||0).toFixed(2)+'° '+(frame.field||'reflectivity');
   $('level2Info').textContent='Actual decoded Level II sweep • '+(frame.source||'Unidata NEXRAD Level II')+' • '+(frame.render_radius_km||'full')+' km radius • '+(frame.image_pixels||'legacy')+' px raster • '+(frame.elevation_deg??'?')+'° • UTC/Zulu.';
   $('radarDirect').href=frame.url;$('radarDirect').textContent='Open decoded Level II image';
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
   if(source.value==='level3')return liveFindScans();
   const a=parseZulu($('startUTC').value),b=parseZulu($('endUTC').value);
   if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a){$('scanStatus').textContent='Enter YYYY-MM-DDTHH:mmZ for both UTC endpoints.';return;}
   await getManifest();
   scanTimes=[...new Set(level2Frames().filter(f=>normSite(f.site||level2Manifest.site)===normSite($('site').value)&&frameTime(f)>=a&&frameTime(f)<=b).map(f=>f.time))].sort();
   $('scanSlider').disabled=!scanTimes.length;$('scanSlider').max=Math.max(0,scanTimes.length-1);$('scanSlider').value=0;
   $('scanLabel').textContent=scanTimes.length?'1/'+scanTimes.length:'0/0';
   $('scanStatus').textContent=scanTimes.length?scanTimes.length+' genuine Level II scan(s) for K'+$('site').value+' in '+$('startUTC').value+' to '+$('endUTC').value+'.':'No decoded Level II scans published for K'+$('site').value+' during '+$('startUTC').value+' to '+$('endUTC').value+'. Choose a processed date or run the GitHub Actions decoder for this window.';
   showLevel2();
 };
 source.addEventListener('change',async()=>{stopPlay();if(source.value==='level2')await getManifest();refresh();});
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
 function advancedDraw(){
   windMarkerLayer.clearLayers();
   if(!rows?.length||!drawn.getLayers().length)return;
   let threshold=+$('threshold').value;const motion=+$('motion').value;
   for(let i=1;i<rows.length;i++){
     const prev=rows[i-1],cur=rows[i],val=(prev.score+cur.score)/2,hot=val>=threshold;
     const color=hot?'#38e58c':'#ed6665';
     L.polyline([prev.point,cur.point],{color,weight:5,opacity:.94,interactive:false}).addTo(windMarkerLayer);
     if($('showFlare').checked){
       const shift=hot?26:15;
       const a=dest(prev.point,motion,shift),b=dest(cur.point,motion,shift);
       L.polygon([prev.point,cur.point,b,a],{stroke:false,fillColor:color,fillOpacity:hot?.21:.10,interactive:false}).addTo(windMarkerLayer);
     }
   }
   if($('showNormals').checked)for(let i=2;i<rows.length;i+=Math.max(3,Math.round(22/Math.max(1,+$('step').value)))){
     const p=rows[i].point,q=dest(p,rows[i].normal,11),a=dest(q,(rows[i].normal+150)%360,3),b=dest(q,(rows[i].normal+210)%360,3);
     L.polyline([p,q],{color:'#ebf1fa',weight:1.6,opacity:.85,interactive:false}).addTo(windMarkerLayer);
     L.polyline([a,q,b],{color:'#ebf1fa',weight:1.6,opacity:.85,interactive:false}).addTo(windMarkerLayer);
   }
   if($('showMotion').checked)for(let i=2;i<rows.length;i+=Math.max(3,Math.round(15/Math.max(1,+$('step').value)))){
     const p=rows[i].point,q=dest(p,motion,22);
     L.polyline([p,q],{color:'#ffe06b',weight:2.3,opacity:.95,interactive:false,dashArray:'6 4'}).addTo(windMarkerLayer);
     const a=dest(q,(motion+155)%360,4),b=dest(q,(motion+205)%360,4);
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
   if(!$('showBarbs').checked){$('windGridStatus').textContent='Wind barb grid hidden.';return;}
   const spacing=Math.max(25,Number($('barbSpacing').value)||55);
   $('barbSpacingValue').textContent=String(spacing);
   const bounds=map.getBounds();if(!bounds.isValid())return;
   const levels=['0','1','3'].filter(level=>$('showBarb'+level).checked);
   if(!levels.length){$('windGridStatus').textContent='All wind-barb levels hidden.';return;}
   const colors={'0':'#d8f2ff','1':'#ffdc79','3':'#d4abff'};
   let count=0;
   function addBarbs(lat,lon,winds){
     if(!bounds.contains([lat,lon])||count>=100)return;
     const markup=levels.map(level=>{
       const speed=Number(winds['spd'+level]),from=Number(winds['dir'+level]);
       if(!Number.isFinite(speed)||!Number.isFinite(from))return '';
       return '<div class="barb-layer barb-'+level+'">'+pennantBarb(speed,from,colors[level])+'</div>';
     }).join('');
     if(!markup)return;
     const content='<div class="wind-grid-stack">'+markup+'</div>';
     // Every level shares this identical geographic marker center/pivot.
     L.marker([lat,lon],{pane:'windGridPane',interactive:false,keyboard:false,
       icon:L.divIcon({className:'wind-grid-icon',html:content,iconSize:[48,48],
       iconAnchor:[24,24]})}).addTo(barbGrid);
     count++;
   }
   // Build a complete rectangular MATRIX of equally spaced Web-Mercator
   // positions, anchored to the radar site. RAP's rotated native sampling grid
   // supplies the values only; it must NEVER determine the plotted positions.
   const actual=findSpatialGrid();
   const zoom=map.getZoom(),siteLatLng=L.latLng(sites[$('site').value]);
   const origin=map.project(siteLatLng,zoom);
   const metersPerPixel=40075016.686*Math.cos(siteLatLng.lat*Math.PI/180)/(256*Math.pow(2,zoom));
   const nominalStepPx=Math.max(70,spacing*1000/metersPerPixel);
   const viewport=map.getPixelBounds();
   // Restrict actual data to a rectangular footprint of sampled RAP locations.
   // This does not imply availability outside the processed RAP data footprint.
   let field=viewport;
   let domain=null;
   if(actual&&Array.isArray(actual.points)&&actual.points.length){
     const all=actual.points;
     const latitudes=all.map(p=>p.lat),longitudes=all.map(p=>p.lon);
     const minLat=Math.min(...latitudes),maxLat=Math.max(...latitudes);
     const minLon=Math.min(...longitudes),maxLon=Math.max(...longitudes);
     // A modest inset prevents outside-domain extrapolation at the four corners.
     const padLat=Math.min(.11,(maxLat-minLat)*.06);
     const padLon=Math.min(.11,(maxLon-minLon)*.06);
     domain=L.latLngBounds(
       [minLat+padLat,minLon+padLon],
       [maxLat-padLat,maxLon-padLon]
     );
     const nw=map.project(domain.getNorthWest(),zoom);
     const se=map.project(domain.getSouthEast(),zoom);
     field=L.bounds(
       L.point(Math.max(viewport.min.x,nw.x),Math.max(viewport.min.y,nw.y)),
       L.point(Math.min(viewport.max.x,se.x),Math.min(viewport.max.y,se.y))
     );
   }
   let plottedRows=0,plottedCols=0;
   const uniform={};
   for(const level of ['0','1','3']){
     uniform['dir'+level]=Number($('dir'+level).value);
     uniform['spd'+level]=Number($('spd'+level).value);
   }
   function gridWindsAt(lat,lon){
     if(!actual||!Array.isArray(actual.points)||!actual.points.length)return uniform;
     // Interpolate the VECTOR (u/v) from four nearest genuine RAP profile
     // locations; interpolation of wind direction angles would be incorrect.
     const nearest=actual.points.map(point=>{
       const dLat=(point.lat-lat)*111.2;
       const dLon=(point.lon-lon)*111.2*Math.cos(lat*Math.PI/180);
       return {point,d:Math.hypot(dLat,dLon)};
     }).sort((p,q)=>p.d-q.d).slice(0,4);
     if(nearest.length<1)return null;
     const output={};
     for(const level of ['0','1','3']){
       let u=0,v=0,total=0;
       for(const {point,d} of nearest){
         const speed=Number(point.winds?.['spd'+level]),from=Number(point.winds?.['dir'+level]);
         if(!Number.isFinite(speed)||!Number.isFinite(from))continue;
         const weight=1/Math.max(d,1.5)**2,theta=from*Math.PI/180;
         u+=-speed*Math.sin(theta)*weight;
         v+=-speed*Math.cos(theta)*weight;total+=weight;
       }
       if(total===0)return null;
       u/=total;v/=total;
       output['spd'+level]=Math.hypot(u,v);
       output['dir'+level]=(Math.atan2(-u,-v)*180/Math.PI+360)%360;
     }
     return output;
   }
   // Fixed integer row/column index ranges mean no diagonal displacement,
   // skipped interior cells, or changes in phase when the viewer is panned.
   let stepPx=nominalStepPx;
   if(field.min.x<field.max.x&&field.min.y<field.max.y){
     const candidateCols=Math.floor((field.max.x-field.min.x)/stepPx)+1;
     const candidateRows=Math.floor((field.max.y-field.min.y)/stepPx)+1;
     if(candidateRows*candidateCols>100)stepPx*=Math.sqrt(candidateRows*candidateCols/100);
     const iMin=Math.ceil((field.min.x-origin.x)/stepPx);
     const iMax=Math.floor((field.max.x-origin.x)/stepPx);
     const jMin=Math.ceil((field.min.y-origin.y)/stepPx);
     const jMax=Math.floor((field.max.y-origin.y)/stepPx);
     plottedCols=Math.max(0,iMax-iMin+1);
     plottedRows=Math.max(0,jMax-jMin+1);
     for(let j=jMin;j<=jMax;j++){
       for(let i=iMin;i<=iMax;i++){
         const geo=map.unproject(L.point(origin.x+i*stepPx,origin.y+j*stepPx),zoom);
         const winds=gridWindsAt(geo.lat,geo.lng);
         if(winds)addBarbs(geo.lat,geo.lng,winds);
       }
     }
   }

   if(actual){
     $('windGridStatus').textContent='SQUARE RAP BARB GRID • '+plottedRows+' rows × '+plottedCols+' columns ('+count+' points) • K'+$('site').value+' • '+niceTime(actual.valid_time)+' • regular map positions, wind vectors interpolated from RAP spatial profiles within their processed coverage.';
   }else{
     $('windGridStatus').textContent='SQUARE UNIFORM BARB GRID • '+plottedRows+' rows × '+plottedCols+' columns ('+count+' points). Uniform manual/site winds repeated (not spatial RAP vectors).';
   }
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
 map.on('moveend',renderBarbGrid);
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
   if(!rapProfiles.length)return;
   if(manualWindOverride)return;
   const target=Date.parse(time||'');
   const candidates=rapProfiles.filter(p=>normSite(p.site||'')===normSite($('site').value));
   const match=candidates.map(p=>({p,d:Math.abs(Date.parse(p.valid_time||p.time||'')-target)})).sort((a,b)=>a.d-b.d)[0];
   if(match&&match.d<=60*60000)try{applyRap(match.p);}catch(e){console.warn(e);}
   else if(candidates.length)setWindSource('MANUAL VALUES · No matching RAP cycle within 60 minutes of this radar scan');
 }
 async function fetchRapFromRepo(){
   $('windSource').textContent='Looking up processed NOAA RAP profile for radar site and UTC scan…';
   try{
     const response=await fetch('./data/rap.json?t='+Date.now(),{cache:'no-store'});
     if(!response.ok)throw Error('No published RAP profile; run Process archived RAP profile in GitHub Actions');
     const data=await response.json();
     rapProfiles=Array.isArray(data.profiles)?data.profiles:[data];rapProfilesFromRepo=true;
     const site=normSite($('site').value);
     const candidates=rapProfiles.filter(p=>normSite(p.site||'')===site);
     if(!candidates.length)throw Error('No RAP profile found for K'+site+'.');
     const current=source.value==='level2'&&scanTimes.length?scanTimes[+$('scanSlider').value]:null;
     const target=Date.parse(current||'');
     let match=candidates.map(p=>({p,delta:Number.isFinite(target)?Math.abs(Date.parse(p.valid_time||p.time)-target):Infinity})).sort((a,b)=>a.delta-b.delta)[0];
     if(current&&match.delta>3600000)throw Error('Nearest RAP profile for K'+site+' is >60 min from radar scan '+current);
     if(!current)match=candidates.sort((a,b)=>Date.parse(b.valid_time)-Date.parse(a.valid_time)).map(p=>({p}))[0];
     manualWindOverride=false;
     applyRap(match.p);
   }catch(error){$('windSource').textContent='RAP not applied: '+error.message;}
 }
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
