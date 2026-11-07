'use strict';
// Level II overlay, no-label vector boundaries, editable RAP wind profiles and
// experimental directional guidance. This file augments the manual tracing app.
(function(){
 const $=id=>document.getElementById(id);
 const source=$('dataSource'),liveRefresh=refresh,liveFindScans=findScans;
 let level2Manifest=null,level2Overlay=null,windMarkerLayer=L.layerGroup().addTo(map);
 let vectorBoundaries={};let boundarySerial=0,rapProfile=null,rapProfiles=[],manualWindOverride=false;
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
     const ts=scanTimes[+$('scanSlider').value];return candidates.find(f=>f.time===ts)||null;
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
     $('level2Info').textContent='No processed Level II frame found for this site/mode. Run Actions → Process NEXRAD Level II, or switch to Level III fallback.';
     return;
   }
   level2Overlay=L.imageOverlay(frame.url,frame.bounds,{pane:'radarPane',opacity:Number($('radarOpacity').value)/100,interactive:false,crossOrigin:true}).addTo(map);
   level2Overlay.once('load',()=>{$('radarStatus').textContent='Level II loaded: '+(frame.elevation_deg??'?')+'°';});
   level2Overlay.once('error',()=>{$('radarStatus').textContent='Level II image missing';$('level2Info').textContent='Manifest exists but radar image failed: '+frame.url;});
   $('radarStatus').textContent='Loading Level II sweep';
   $('radarTime').textContent='K'+normSite(frame.site||level2Manifest.site)+' • '+niceTime(frame.time)+' • '+Number(frame.elevation_deg||0).toFixed(2)+'° '+(frame.field||'reflectivity');
   $('level2Info').textContent='Actual decoded Level II sweep • '+(frame.source||'Unidata NEXRAD Level II')+' • '+(frame.render_radius_km||'full')+' km radius • '+(frame.image_pixels||'legacy')+' px raster • '+(frame.elevation_deg??'?')+'° • UTC/Zulu.';
   $('radarDirect').href=frame.url;$('radarDirect').textContent='Open decoded Level II image';
   matchRap(frame.time);
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
   $('scanStatus').textContent=scanTimes.length?scanTimes.length+' processed Level II volume(s).':'No decoded sweeps for this period. Run the Actions radar processor for this UTC window.';
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
   // Meteorological wind barb: shaft points toward wind FROM direction.
   let s=Math.max(0,Math.round(speed/5)*5),n50=Math.floor(s/50);s%=50;let n10=Math.floor(s/10);s%=10;const n5=s>=5?1:0;
   let shapes='<line x1="30" y1="48" x2="30" y2="5" stroke="'+color+'" stroke-width="2.2"/>';let y=7;
   for(let k=0;k<n50;k++){shapes+='<path d="M30 '+y+' L49 '+(y+7)+' L30 '+(y+13)+' Z" fill="'+color+'"/>';y+=13;}
   for(let k=0;k<n10;k++){shapes+='<line x1="30" y1="'+y+'" x2="48" y2="'+(y+8)+'" stroke="'+color+'" stroke-width="2"/>';y+=7;}
   if(n5)shapes+='<line x1="30" y1="'+y+'" x2="39" y2="'+(y+4)+'" stroke="'+color+'" stroke-width="2"/>';
   return '<svg width="62" height="62" viewBox="0 0 60 60" aria-hidden="true"><g transform="rotate('+dir+' 30 48)">'+shapes+'</g><circle cx="30" cy="48" r="2.5" fill="'+color+'"/></svg>';
 }
 function advancedDraw(){
   windMarkerLayer.clearLayers();
   if(!rows?.length||!drawn.getLayers().length)return;
   let threshold=+$('threshold').value;const motion=+$('motion').value;
   for(let i=1;i<rows.length;i++){
     const prev=rows[i-1],cur=rows[i],val=(prev.score+cur.score)/2,hot=val>=threshold;
     const color=hot?'#f2645d':'#48ca85';
     L.polyline([prev.point,cur.point],{color,weight:5,opacity:.94,interactive:false}).addTo(windMarkerLayer);
     if($('showFlare').checked){
       const shift=hot?26:15;
       const a=dest(prev.point,motion,shift),b=dest(cur.point,motion,shift);
       L.polygon([prev.point,cur.point,b,a],{stroke:false,fillColor:color,fillOpacity:hot?.23:.12,interactive:false}).addTo(windMarkerLayer);
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
   if($('showBarbs').checked){
     const m=rows[Math.floor(rows.length/2)];const ids=[['0',20,'#c9f6fa'],['1',33,'#ffe18a'],['3',46,'#e3afff']];
     for(const [level,dist,color]of ids){
       const p=dest(m.point,m.normal,dist),direction=+$('dir'+level).value,speed=+$('spd'+level).value;
       const html='<div class="wx-barb">'+pennantBarb(speed,direction,color)+'<span>'+level+' km · '+speed+' kt</span></div>';
       L.marker(p,{interactive:false,icon:L.divIcon({className:'',html,iconSize:[90,75],iconAnchor:[40,47]})}).addTo(windMarkerLayer);
     }
   }
 }
 calc=function(){baseCalc();advancedDraw();};
 ['showBarbs','showNormals','showMotion','showFlare'].forEach(id=>$(id).addEventListener('change',advancedDraw));
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
   setWindSource('VERIFIED RAP MODEL DATA · K'+normSite(profile.site||$('site').value)+' · '+niceTime(profile.valid_time||profile.time||'')+' · '+(profile.product||'awp130pgrb')+' F'+String(profile.forecast_hour??0).padStart(2,'0')+' · 10 m / 1 km / 3 km AGL · Editable inputs');
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
 $('loadRap').onclick=()=>$('rapInput').click();
 $('rapInput').onchange=async e=>{
   const f=e.target.files?.[0];if(!f)return;
   try{if(f.size>3e6)throw Error('RAP profile file exceeds 3 MB');
     const data=JSON.parse(await f.text());rapProfiles=Array.isArray(data.profiles)?data.profiles:[data];
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
   if(data){rapProfiles=Array.isArray(data.profiles)?data.profiles:[data];
     const selected=level2Frames().find(f=>normSite(f.site||level2Manifest?.site)===normSite($('site').value));
     if(selected)matchRap(selected.time);
     else setWindSource('MANUAL WINDS · '+rapProfiles.length+' RAP profile(s) available for matching radar/time');
   }
 }).catch(()=>{});
 getManifest().then(async m=>{
   const count=(m.frames||[]).length;
   if(count){
     const demo=m.frames.find(f=>normSite(f.site)==='HDC'&&f.time.startsWith('2024-06-04T21:'));
     if(demo){
       source.value='level2';$('site').value='HDC';$('mode').value='archive';$('archiveFields').hidden=false;
       $('startUTC').value='2024-06-04T21:00Z';$('endUTC').value='2024-06-04T21:35Z';
       map.setView(sites.HDC,8);
       await findScans();
       $('scanStatus').textContent=scanTimes.length+' decoded KHDC Level II scans loaded. Change mode to Latest for live radar; all timestamps shown are UTC/Zulu.';
       calc();return;
     }
   }
   if(!count){
     source.value='level3';
     $('level2Info').textContent='Level II has 0 processed frames. Showing the independent high-resolution IEM radar feed until decoded Level II scans are published.';
     $('scanStatus').textContent='Live radar: latest IEM scan; archives: all times in UTC/Zulu.';
   }
   refresh();calc();
 });
})();
