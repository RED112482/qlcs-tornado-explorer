'use strict';
const $=id=>document.getElementById(id),R=6371.0088,D=Math.PI/180,rad=x=>x*D,deg=x=>x/D;
const map=L.map('map',{preferCanvas:true}).setView([31.15,-88.55],7);
// Flat charcoal canvas: no basemap tiles, API keys, or street labels.
map.getContainer().style.background='#24313d';
map.createPane('landPane');map.getPane('landPane').style.zIndex=220;
// State polygons define gray land and dark water without commercial map tiles.
const landState=L.geoJSON(null,{pane:'landPane',style:()=>({color:'#a3adb8',weight:1.15,opacity:.8,fillColor:'#434c56',fillOpacity:1}),interactive:false}).addTo(map);
fetch('https://raw.githubusercontent.com/PublicaMundi/MappingAPI/master/data/geojson/us-states.json').then(r=>{if(!r.ok)throw Error('state map '+r.status);return r.json();}).then(g=>landState.addData(g)).catch(err=>{console.warn('State fill unavailable',err);});
map.createPane('radarPane');map.getPane('radarPane').style.zIndex=330;
map.createPane('boundaryPane');map.getPane('boundaryPane').style.zIndex=370;
const drawn=L.featureGroup().addTo(map),analysis=L.layerGroup().addTo(map);
const drawControl=new L.Control.Draw({draw:{polyline:{shapeOptions:{color:'#56e9ec',weight:4}},polygon:false,rectangle:false,marker:false,circle:false,circlemarker:false},edit:{featureGroup:drawn,remove:true}});map.addControl(drawControl);
map.on(L.Draw.Event.CREATED,e=>{drawn.clearLayers();drawn.addLayer(e.layer);calc();save();});
map.on(L.Draw.Event.EDITED,()=>{calc();save();});map.on(L.Draw.Event.DELETED,()=>{calc();save();});
// IEM TMS RIDGE individual Level III imagery, NOT raw Level II.
const IEM='https://mesonet.agron.iastate.edu',sites={MOB:[30.68,-88.24],EVX:[30.56,-85.92],DGX:[32.28,-89.98],HDC:[30.52,-90.42],LIX:[30.34,-89.83],EOX:[31.46,-85.46],VAX:[30.89,-83.00],TLH:[30.40,-84.33],BMX:[33.17,-86.77],JAN:[32.32,-90.08]};
let radar=null,scanTimes=[],playTimer=null;
function parseZulu(input){
 const s=String(input||'').trim();
 const match=/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})Z$/.exec(s);
 if(!match)return NaN;
 const ms=Date.parse(s);
 if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,16)!==s.slice(0,16))return NaN;
 return ms;
}
const stopPlay=()=>{if(playTimer)clearInterval(playTimer);playTimer=null;$('scanPlay').textContent='▶ Play';};
function refresh(){
 if(radar)map.removeLayer(radar);
 const site=$('site').value,product=$('product').value,historical=$('mode').value==='archive';
 if(historical&&!scanTimes.length){$('radarStatus').textContent='Choose archived scans';return;}
 const ts=historical?scanTimes[Number($('scanSlider').value)]:null;
 const stamp=ts?ts.slice(0,16).replace(/[-:T]/g,''):'0'; // YYYYMMDDHHmm UTC
 const base='c'; // IEM current TMS endpoint (also retry legacy /cache/ if needed).
 const tileUrl=IEM+'/'+base+'/tile.py/1.0.0/ridge::'+site+'-'+product+'-'+stamp+'/{z}/{x}/{y}.png';
 radar=L.tileLayer(tileUrl,{tms:false,pane:'radarPane',maxZoom:13,maxNativeZoom:10,opacity:Number($('radarOpacity').value)/100,attribution:'© Iowa Environmental Mesonet',keepBuffer:2}).addTo(map);
 const previewCoords=map.project(L.latLng(sites[site]),8).divideBy(256).floor();
 const directUrl=tileUrl.replace('{z}','8').replace('{x}',String(previewCoords.x)).replace('{y}',String(previewCoords.y));
 $('radarDirect').href=directUrl;
 $('radarDirect').textContent='Open source radar tile (K'+site+' '+product+')';
 let success=false,errors=0,retried=false;
 const timeout=setTimeout(()=>{if(!success){$('radarStatus').textContent='Radar slow/unavailable';$('scanStatus').textContent='No radar tile confirmed in 12 seconds. Open the source radar tile below to test the provider, or try another product.';}},12000);
 radar.on('tileload',()=>{success=true;clearTimeout(timeout);$('radarStatus').textContent='Radar tiles loaded (may be clear-air)';});
 radar.on('tileerror',()=>{if(!success&&++errors>2){if(!retried){retried=true;errors=0;radar.setUrl(tileUrl.replace('/c/tile.py/','/cache/tile.py/'));$('radarStatus').textContent='Retrying radar alternate server path';}else{clearTimeout(timeout);$('radarStatus').textContent='Radar tile error';$('scanStatus').textContent='IEM radar tile service failed on both paths. Test source link or change product/site.';}}});
 $('radarStatus').textContent='Loading '+site+' '+product;
 $('radarTime').textContent='K'+site+' '+product+' • '+(ts?ts+' UTC':'latest available');
}
let archiveRequestVersion=0;
function normalizeIEMTime(value){
 const t=typeof value==='string'?value:(
   value?.ts||value?.time||value?.valid||value?.timestamp||value?.datetime||
   value?.date||value?.scan_time||'');
 let raw=String(t).trim();
 if(/^\d{12}$/.test(raw))raw=raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8)+'T'+raw.slice(8,10)+':'+raw.slice(10,12)+'Z';
 if(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(?::\d{2})?$/.test(raw))raw=raw.replace(' ','T')+'Z';
 if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))raw+='Z';
 const ms=Date.parse(raw);
 return Number.isFinite(ms)?new Date(ms).toISOString().slice(0,16)+'Z':null;
}
function scanRecords(payload){
 const records=Array.isArray(payload)?payload:(payload?.scans||payload?.results||payload?.data||
   payload?.times||payload?.timestamps||payload?.volumes||payload?.radar||[]);
 if(Array.isArray(records))return records;
 if(records&&typeof records==='object')return Object.values(records);
 return [];
}
async function findScans(){
 const request=++archiveRequestVersion;
 stopPlay();scanTimes=[];$('scanSlider').disabled=true;$('scanLabel').textContent='0/0';
 const t0=parseZulu($('startUTC').value),t1=parseZulu($('endUTC').value);
 if(!Number.isFinite(t0)||!Number.isFinite(t1)||t1<=t0||t1-t0>6*3600e3){
  $('scanStatus').textContent='Select a valid UTC/Zulu window of 1–6 hours.';return;
 }
 const site=$('site').value,start=new Date(t0).toISOString().slice(0,16)+'Z',
   end=new Date(t1).toISOString().slice(0,16)+'Z',preferred=$('product').value;
 const products=[preferred,...['N0B','N0Q','N0Z'].filter(p=>p!==preferred)];
 $('scanStatus').textContent='Searching IEM archived reflectivity scans for K'+site+' '+start+'–'+end+'…';
 $('radarStatus').textContent='Searching IEM Level III archive';
 const problems=[];
 for(const product of products){
  try{
   const q=new URLSearchParams({operation:'list',radar:site,product,start,end});
   const response=await fetch(IEM+'/json/radar.py?'+q,{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const payload=await response.json();
   if(payload?.error)throw Error(String(payload.error));
   const records=scanRecords(payload);
   const times=[...new Set(records.map(normalizeIEMTime).filter(t=>{
     if(!t)return false;
     const ms=Date.parse(t);return ms>=t0&&ms<t1;
   }))].sort();
   if(request!==archiveRequestVersion)return;
   if(!times.length){problems.push(product+': no archived scans');continue;}
   $('product').value=product;
   scanTimes=times;
   $('scanSlider').max=times.length-1;$('scanSlider').value='0';
   $('scanSlider').disabled=false;
   $('scanStatus').textContent=times.length+' IEM Level III '+product+' scan(s) for K'+site+' between '+start+' and '+end+
      (product!==preferred?' (automatically selected available '+product+' product)':'')+'.';
   $('radarStatus').textContent='IEM Level III archive';
   setScan(0);
   return;
  }catch(e){problems.push(product+': '+e.message);}
 }
 if(request!==archiveRequestVersion)return;
 $('scanStatus').textContent='No IEM Level III imagery found for K'+site+' '+start+'–'+end+'. '+problems.join('; ')+'. Try another radar or UTC window, or process raw Level II through GitHub Actions.';
 $('radarStatus').textContent='No radar archive available for selection';
 $('radarTime').textContent='No IEM archived radar scans at selected UTC window';
}
function setScan(i){if(!scanTimes.length)return;let n=Math.max(0,Math.min(i,scanTimes.length-1));$('scanSlider').value=n;$('scanLabel').textContent=(n+1)+'/'+scanTimes.length;refresh();}
function changeMode(){
 stopPlay();scanTimes=[];$('archiveFields').hidden=$('mode').value!=='archive';
 $('scanStatus').textContent=$('mode').value==='archive'?'Set UTC window, then find scans.':'Showing latest site imagery.';refresh();
}
$('refresh').onclick=()=>{$('mode').value==='archive'?findScans():refresh();};
$('site').onchange=()=>{map.setView(sites[$('site').value],8);changeMode();};
$('product').onchange=changeMode;$('mode').onchange=changeMode;
$('findScans').onclick=findScans;
$('scanSlider').oninput=()=>{stopPlay();setScan(+$('scanSlider').value);};
$('scanBack').onclick=()=>{stopPlay();setScan(+$('scanSlider').value-1);};
$('scanForward').onclick=()=>{stopPlay();setScan(+$('scanSlider').value+1);};
$('scanPlay').onclick=()=>{if(playTimer){stopPlay();return;}if(!scanTimes.length)return;$('scanPlay').textContent='❚❚ Pause';playTimer=setInterval(()=>setScan((+$('scanSlider').value+1)%scanTimes.length),1800);};
$('radarOpacity').oninput=()=>{if(radar)radar.setOpacity(+$('radarOpacity').value/100);};
const REF='https://mapservices.weather.noaa.gov/static/rest/services/nws_reference_maps/nws_reference_map/MapServer/export';
const Boundary=L.GridLayer.extend({createTile(coords,done){
 const im=document.createElement('img');im.width=256;im.height=256;im.alt='';
 const b=this._tileCoordsToBounds(coords),sw=L.CRS.EPSG3857.project(b.getSouthWest()),ne=L.CRS.EPSG3857.project(b.getNorthEast());
 const q=new URLSearchParams({f:'image',bbox:[sw.x,sw.y,ne.x,ne.y].join(','),bboxSR:'3857',imageSR:'3857',size:'256,256',format:'png32',transparent:'true',layers:'show:'+this.options.layerId});
 im.onload=()=>done(null,im);im.onerror=()=>done(new Error('Boundary unavailable'),im);im.src=REF+'?'+q;return im;
}});
const borders={states:new Boundary({layerId:3,pane:'boundaryPane',opacity:.48,maxZoom:14}),counties:new Boundary({layerId:2,pane:'boundaryPane',opacity:.50,maxZoom:14}),cwas:new Boundary({layerId:1,pane:'boundaryPane',opacity:1,maxZoom:14})};
for(const id of Object.keys(borders)){$(id).onchange=()=>{$(id).checked?borders[id].addTo(map):map.removeLayer(borders[id]);};$(id).onchange();}
refresh();
function distance(a,b){let da=rad(b.lat-a.lat),db=rad(b.lng-a.lng),h=Math.sin(da/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(db/2)**2;return 2*R*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));}
function bearing(a,b){let p=rad(a.lat),q=rad(b.lat),d=rad(b.lng-a.lng);return (deg(Math.atan2(Math.sin(d)*Math.cos(q),Math.cos(p)*Math.sin(q)-Math.sin(p)*Math.cos(q)*Math.cos(d)))+360)%360;}
function dest(a,br,km){let p=rad(a.lat),l=rad(a.lng),d=km/R,t=rad(br),p2=Math.asin(Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(t)),l2=l+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(p2));return L.latLng(deg(p2),((deg(l2)+540)%360)-180);}
function densify(coords,spacing){let a=[coords[0]];for(let i=1;i<coords.length;i++){let p=coords[i-1],q=coords[i],n=distance(p,q),b=bearing(p,q);for(let k=spacing;k<n;k+=spacing)a.push(dest(p,b,k));a.push(q);}return a;}
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x)),angle=(a,b)=>Math.abs(((a-b+540)%360)-180);
function wind(d,s){return{u:-Math.sin(rad(d))*s*.514444,v:-Math.cos(rad(d))*s*.514444};}
function component(v,b){return v.u*Math.sin(rad(b))+v.v*Math.cos(rad(b));}
function read(){let o={};for(let k of ['dir0','spd0','dir1','spd1','dir3','spd3','motion']){o[k]=Number($(k).value);if(!Number.isFinite(o[k]))throw Error('Invalid wind input: '+k);}for(let k of ['dir0','dir1','dir3','motion'])if(o[k]<0||o[k]>360)throw Error('Directions must be 0–360°');for(let k of ['spd0','spd1','spd3'])if(o[k]<0||o[k]>180)throw Error('Speeds must be 0–180 kt');return o;}
let rows=[];
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function calc(){analysis.clearLayers();const line=drawn.getLayers()[0];if(!line){rows=[];$('metricStatus').textContent='Draw a line to begin';$('summary').innerHTML='<div class="empty">Use the polyline tool on the map (upper left), or load the example.</div>';$('tablewrap').innerHTML='';return;}
try{let o=read(),pts=densify(line.getLatLngs(),Number($('step').value));if(pts.length<3)throw Error('Draw a longer line.');let w0=wind(o.dir0,o.spd0),w1=wind(o.dir1,o.spd1),w3=wind(o.dir3,o.spd3),v03={u:w3.u-w0.u,v:w3.v-w0.v},v01={u:w1.u-w0.u,v:w1.v-w0.v};rows=[];
for(let i=0;i<pts.length;i++){let a=Math.max(0,i-10),b=Math.min(pts.length-1,i+10),az=bearing(pts[a],pts[b]),n1=(az+90)%360,n2=(az+270)%360,normal=angle(n1,o.motion)<=angle(n2,o.motion)?n1:n2,j=Math.max(0,i-5),k=Math.min(pts.length-1,i+5),arc=0;for(let z=j+1;z<=k;z++)arc+=distance(pts[z-1],pts[z]);let chord=distance(pts[j],pts[k]),tort=chord>0?arc/chord:1,LN=component(v03,normal),LP=Math.abs(component(v01,az)),tortBoost=clamp((tort-Number($('tortuosity').value))/.12,0,1),factor=1+tortBoost,score=LN<=0?0:clamp(LN/10,.5,3)*clamp(LP/8,.5,3)*factor;rows.push({point:pts[i],ahead:dest(pts[i],normal,40),LN,LP,tort,tortBoost,factor,score,normal});}
let th=Number($('threshold').value);if($('showInflow').checked){
 const outer=rows.map(r=>r.ahead);
 // Continuous gold ahead-of-line corridor. This is a conceptual reference
 // region, NOT the actual RAP sampling footprint or a predicted tornado swath.
 L.polygon([...rows.map(r=>r.point),...outer.slice().reverse()],
   {stroke:false,fillColor:'#f2d05e',fillOpacity:.15,interactive:false}).addTo(analysis);
 L.polyline(outer,{color:'#ffe17a',weight:2.7,opacity:.92,dashArray:'8 5',interactive:false}).addTo(analysis);
 for(const k of [0,Math.floor((rows.length-1)/2),rows.length-1]){
   L.polyline([rows[k].point,rows[k].ahead],{color:'#ffe17a',weight:1.4,dashArray:'5 5',opacity:.68,interactive:false}).addTo(analysis);
 }
 const center=rows[Math.floor(rows.length/2)].ahead;
 L.marker(center,{interactive:false,keyboard:false,
   icon:L.divIcon({className:'inflow-reference-label',
     html:'40 km ahead · inflow reference',iconSize:[193,22],iconAnchor:[96,11]})
 }).addTo(analysis);
}
// Continuous line gradients are drawn in level2.js (not thresholded green/red segments).
let len=rows.slice(1).reduce((v,x,i)=>v+distance(rows[i].point,x.point),0),max=Math.max(...rows.map(x=>x.score)),count=rows.filter(x=>x.score>=th).length;
$('metricStatus').textContent='Calculated '+new Date().toISOString().slice(11,16)+' UTC';$('summary').innerHTML=[['Line length',len.toFixed(1)+' km'],['Max QTor-inspired score',max.toFixed(2)],['Above reference value',count+' / '+rows.length],['Max tortuosity',Math.max(...rows.map(x=>x.tort)).toFixed(3)]].map(x=>'<div class="metric"><strong>'+x[1]+'</strong><span>'+x[0]+'</span></div>').join('');
let skip=Math.max(1,Math.ceil(rows.length/18));$('tablewrap').innerHTML='<table><thead><tr><th>Sample</th><th>LN 0–3 km</th><th>LP 0–1 km</th><th>Tortuosity</th><th>QT-inspired</th></tr></thead><tbody>'+rows.filter((x,i)=>i%skip===0||i===rows.length-1).map((r,i)=>'<tr><td>'+((i*skip)+1)+'</td><td>'+r.LN.toFixed(1)+' m/s</td><td>'+r.LP.toFixed(1)+' m/s</td><td>'+r.tort.toFixed(3)+'</td><td>'+r.score.toFixed(2)+'</td></tr>').join('')+'</tbody></table><p class="hint">An experimental line-relative index; not a verified tornado prediction or probability. Verify radar and environmental conditions.</p>';
}catch(e){rows=[];$('metricStatus').textContent='Input issue';$('summary').innerHTML='<div class="empty">'+esc(e.message)+'</div>';$('tablewrap').innerHTML='';}}
function loadLine(a){if(!Array.isArray(a)||a.length<2||a.length>5000)throw Error('Invalid line');let p=a.map(x=>{if(!Array.isArray(x)||x.length<2||Math.abs(Number(x[0]))>90||Math.abs(Number(x[1]))>180||!x.every(y=>Number.isFinite(Number(y))))throw Error('Invalid coordinate');return [Number(x[0]),Number(x[1])];});drawn.clearLayers();drawn.addLayer(L.polyline(p,{color:'#56e9ec',weight:4}));map.fitBounds(L.latLngBounds(p).pad(.3));calc();save();}
function save(){try{let l=drawn.getLayers()[0],inputs={};for(let k of ['dir0','spd0','dir1','spd1','dir3','spd3','motion','step','tortuosity','threshold','showInflow','showScores','gradientMode'])inputs[k]=$(k).type==='checkbox'?$(k).checked:$(k).value;localStorage.setItem('qlcs-v01',JSON.stringify({coords:l?l.getLatLngs().map(p=>[p.lat,p.lng]):null,inputs}));}catch(e){}}
$('example').onclick=()=>loadLine([[32.17,-89.68],[31.9,-89.63],[31.65,-89.56],[31.39,-89.40],[31.18,-89.15],[31,-89.17],[30.80,-89.31],[30.57,-89.30]]);
$('clear').onclick=()=>{drawn.clearLayers();calc();save();};$('analyze').onclick=()=>{calc();save();};
function sync(){$('stepValue').textContent=$('step').value;$('tortValue').textContent=Number($('tortuosity').value).toFixed(2);$('thValue').textContent=Number($('threshold').value).toFixed(2);}
for(let k of ['dir0','spd0','dir1','spd1','dir3','spd3','motion','step','tortuosity','threshold','showInflow','showScores','gradientMode'])$(k).addEventListener('input',()=>{sync();calc();save();});
$('export').onclick=()=>{let l=drawn.getLayers()[0];if(!l)return alert('Draw a line first.');let data={type:'FeatureCollection',metadata:{name:'QLCS Experimental Analysis',created:new Date().toISOString(),note:'NOT a tornado probability',winds:read()},features:[{type:'Feature',properties:{type:'manual_leading_edge'},geometry:{type:'LineString',coordinates:l.getLatLngs().map(x=>[x.lng,x.lat])}},...rows.map((x,i)=>({type:'Feature',properties:{sample:i,LN03_mps:x.LN,LP01_mps:x.LP,tortuosity:x.tort,qtor_inspired:x.score},geometry:{type:'Point',coordinates:[x.point.lng,x.point.lat]}}))]};let url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'})),a=document.createElement('a');a.href=url;a.download='qlcs-analysis.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{if(f.size>5e6)throw Error('File too large');let g=JSON.parse(await f.text()),features=g.type==='FeatureCollection'?g.features:[g],l=features.find(x=>x?.geometry?.type==='LineString');if(!l)throw Error('No LineString found');loadLine(l.geometry.coordinates.map(x=>[x[1],x[0]]));}catch(err){alert(err.message);}e.target.value='';};
try{let s=JSON.parse(localStorage.getItem('qlcs-v01')||'null');if(s?.inputs)for(let [k,v]of Object.entries(s.inputs))if($(k))$(k).type==='checkbox'?$(k).checked=Boolean(v):$(k).value=v;if(s?.coords)loadLine(s.coords);}catch(e){console.warn(e);}sync();calc();