'use strict';
const $=id=>document.getElementById(id),R=6371.0088,D=Math.PI/180,rad=x=>x*D,deg=x=>x/D;
const map=L.map('map',{preferCanvas:true}).setView([31.15,-88.55],7);
// Flat charcoal canvas: no basemap tiles, API keys, or street labels.
map.getContainer().style.background='#30343a';
map.createPane('radarPane');map.getPane('radarPane').style.zIndex=330;
map.createPane('boundaryPane');map.getPane('boundaryPane').style.zIndex=370;
const drawn=L.featureGroup().addTo(map),analysis=L.layerGroup().addTo(map);
const drawControl=new L.Control.Draw({draw:{polyline:{shapeOptions:{color:'#56e9ec',weight:4}},polygon:false,rectangle:false,marker:false,circle:false,circlemarker:false},edit:{featureGroup:drawn,remove:true}});map.addControl(drawControl);
map.on(L.Draw.Event.CREATED,e=>{drawn.clearLayers();drawn.addLayer(e.layer);calc();save();});
map.on(L.Draw.Event.EDITED,()=>{calc();save();});map.on(L.Draw.Event.DELETED,()=>{calc();save();});
// IEM TMS RIDGE individual Level III imagery, NOT raw Level II.
const IEM='https://mesonet.agron.iastate.edu',sites={MOB:[30.68,-88.24],EVX:[30.56,-85.92],DGX:[32.28,-89.98],HDC:[30.52,-90.42],LIX:[30.34,-89.83],EOX:[31.46,-85.46],VAX:[30.89,-83.00],TLH:[30.40,-84.33],BMX:[33.17,-86.77],JAN:[32.32,-90.08]};
let radar=null,scanTimes=[],playTimer=null;
const stopPlay=()=>{if(playTimer)clearInterval(playTimer);playTimer=null;$('scanPlay').textContent='▶ Play';};
function refresh(){
 if(radar)map.removeLayer(radar);
 const site=$('site').value,product=$('product').value,historical=$('mode').value==='archive';
 if(historical&&!scanTimes.length){$('radarStatus').textContent='Choose archived scans';return;}
 const ts=historical?scanTimes[Number($('scanSlider').value)]:null;
 const stamp=ts?ts.slice(0,16).replace(/[-:T]/g,''):'0';
 const base='cache'; // Official IEM TMS endpoint works for latest AND timestamped archived scans.
 radar=L.tileLayer(IEM+'/'+base+'/tile.py/1.0.0/ridge::'+site+'-'+product+'-'+stamp+'/{z}/{x}/{y}.png',{tms:false,pane:'radarPane',maxZoom:13,maxNativeZoom:10,opacity:Number($('radarOpacity').value)/100,attribution:'© Iowa Environmental Mesonet'}).addTo(map);
 let success=false,errors=0;
 const timeout=setTimeout(()=>{if(!success){$('radarStatus').textContent='Radar slow/unavailable';$('scanStatus').textContent='No radar tile confirmed within 12 s. Try switching products or site.';}},12000);
 radar.on('tileload',()=>{success=true;clearTimeout(timeout);$('radarStatus').textContent='Radar tile response received';});
 radar.on('tileerror',()=>{if(!success&&++errors>2){clearTimeout(timeout);$('radarStatus').textContent='Radar tile unavailable';$('scanStatus').textContent='No imagery returned. Try a different scan/site or N0Q.';}});
 $('radarStatus').textContent='Loading '+site+' '+product;
 $('radarTime').textContent='K'+site+' '+product+' • '+(ts?ts+' UTC':'latest available');
}
async function findScans(){
 stopPlay();scanTimes=[];$('scanSlider').disabled=true;$('scanLabel').textContent='0/0';
 const a=$('startUTC').value,b=$('endUTC').value;
 const t0=Date.parse(a+':00Z'),t1=Date.parse(b+':00Z');
 if(!Number.isFinite(t0)||!Number.isFinite(t1)||t1<=t0||t1-t0>6*3600e3){$('scanStatus').textContent='Enter a UTC window of up to 6 hours.';return;}
 $('scanStatus').textContent='Finding exact scan timestamps…';
 const q=new URLSearchParams({operation:'list',radar:$('site').value,product:$('product').value,start:new Date(t0).toISOString().slice(0,16)+'Z',end:new Date(t1).toISOString().slice(0,16)+'Z'});
 try{
  const response=await fetch(IEM+'/json/radar.py?'+q,{cache:'no-store'});if(!response.ok)throw Error('Metadata HTTP '+response.status);
  const payload=await response.json();scanTimes=(Array.isArray(payload)?payload:(payload.scans||payload.times||payload.timestamps||[])).map(x=>typeof x==='string'?x:(x.ts||x.time||x.valid||'')).map(x=>x.replace(/:00Z$/,'Z')).filter(x=>/^\d{4}-\d\d-\d\dT\d\d:\d\dZ$/.test(x));
  if(!scanTimes.length)throw Error('No archived '+$('product').value+' scans in selected window.');
  $('scanSlider').max=scanTimes.length-1;$('scanSlider').value='0';$('scanSlider').disabled=false;
  $('scanStatus').textContent=scanTimes.length+' scans found.';setScan(0);
 }catch(e){$('scanStatus').textContent=e.message;$('radarStatus').textContent='Archive lookup unavailable';}
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
const borders={states:new Boundary({layerId:3,pane:'boundaryPane',opacity:1,maxZoom:14}),counties:new Boundary({layerId:2,pane:'boundaryPane',opacity:.72,maxZoom:14}),cwas:new Boundary({layerId:1,pane:'boundaryPane',opacity:1,maxZoom:14})};
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
for(let i=0;i<pts.length;i++){let a=Math.max(0,i-10),b=Math.min(pts.length-1,i+10),az=bearing(pts[a],pts[b]),n1=(az+90)%360,n2=(az+270)%360,normal=angle(n1,o.motion)<=angle(n2,o.motion)?n1:n2,j=Math.max(0,i-5),k=Math.min(pts.length-1,i+5),arc=0;for(let z=j+1;z<=k;z++)arc+=distance(pts[z-1],pts[z]);let chord=distance(pts[j],pts[k]),tort=chord>0?arc/chord:1,LN=component(v03,normal),LP=Math.abs(component(v01,az)),factor=tort>Number($('tortuosity').value)?2:1,score=LN<=0?0:clamp(LN/10,.5,3)*clamp(LP/8,.5,3)*factor;rows.push({point:pts[i],ahead:dest(pts[i],normal,40),LN,LP,tort,score,normal});}
let th=Number($('threshold').value);if($('showInflow').checked)for(let i=1;i<rows.length;i++)L.polygon([rows[i-1].point,rows[i].point,rows[i].ahead,rows[i-1].ahead],{stroke:false,fillColor:'#e9c371',fillOpacity:.075,interactive:false}).addTo(analysis);
if($('showScores').checked)for(let i=1;i<rows.length;i++){let v=(rows[i-1].score+rows[i].score)/2;if(v>=th)L.polyline([rows[i-1].point,rows[i].point],{color:'#ff806a',weight:8,opacity:.9}).bindPopup('Experimental QTor-inspired score: '+v.toFixed(2)+'<br>Not a tornado probability.').addTo(analysis);}
let len=rows.slice(1).reduce((v,x,i)=>v+distance(rows[i].point,x.point),0),max=Math.max(...rows.map(x=>x.score)),count=rows.filter(x=>x.score>=th).length;
$('metricStatus').textContent='Calculated '+new Date().toISOString().slice(11,16)+' UTC';$('summary').innerHTML=[['Line length',len.toFixed(1)+' km'],['Max QTor-inspired score',max.toFixed(2)],['Above display threshold',count+' / '+rows.length],['Max tortuosity',Math.max(...rows.map(x=>x.tort)).toFixed(3)]].map(x=>'<div class="metric"><strong>'+x[1]+'</strong><span>'+x[0]+'</span></div>').join('');
let skip=Math.max(1,Math.ceil(rows.length/18));$('tablewrap').innerHTML='<table><thead><tr><th>Sample</th><th>LN 0–3 km</th><th>LP 0–1 km</th><th>Tortuosity</th><th>QT-inspired</th></tr></thead><tbody>'+rows.filter((x,i)=>i%skip===0||i===rows.length-1).map((r,i)=>'<tr><td>'+((i*skip)+1)+'</td><td>'+r.LN.toFixed(1)+' m/s</td><td>'+r.LP.toFixed(1)+' m/s</td><td>'+r.tort.toFixed(3)+'</td><td>'+r.score.toFixed(2)+'</td></tr>').join('')+'</tbody></table><p class="hint">An experimental line-relative index; not a verified tornado prediction or probability. Verify radar and environmental conditions.</p>';
}catch(e){rows=[];$('metricStatus').textContent='Input issue';$('summary').innerHTML='<div class="empty">'+esc(e.message)+'</div>';$('tablewrap').innerHTML='';}}
function loadLine(a){if(!Array.isArray(a)||a.length<2||a.length>5000)throw Error('Invalid line');let p=a.map(x=>{if(!Array.isArray(x)||x.length<2||Math.abs(Number(x[0]))>90||Math.abs(Number(x[1]))>180||!x.every(y=>Number.isFinite(Number(y))))throw Error('Invalid coordinate');return [Number(x[0]),Number(x[1])];});drawn.clearLayers();drawn.addLayer(L.polyline(p,{color:'#56e9ec',weight:4}));map.fitBounds(L.latLngBounds(p).pad(.3));calc();save();}
function save(){try{let l=drawn.getLayers()[0],inputs={};for(let k of ['dir0','spd0','dir1','spd1','dir3','spd3','motion','step','tortuosity','threshold','showInflow','showScores'])inputs[k]=$(k).type==='checkbox'?$(k).checked:$(k).value;localStorage.setItem('qlcs-v01',JSON.stringify({coords:l?l.getLatLngs().map(p=>[p.lat,p.lng]):null,inputs}));}catch(e){}}
$('example').onclick=()=>loadLine([[32.17,-89.68],[31.9,-89.63],[31.65,-89.56],[31.39,-89.40],[31.18,-89.15],[31,-89.17],[30.80,-89.31],[30.57,-89.30]]);
$('clear').onclick=()=>{drawn.clearLayers();calc();save();};$('analyze').onclick=()=>{calc();save();};
function sync(){$('stepValue').textContent=$('step').value;$('tortValue').textContent=Number($('tortuosity').value).toFixed(2);$('thValue').textContent=Number($('threshold').value).toFixed(2);}
for(let k of ['dir0','spd0','dir1','spd1','dir3','spd3','motion','step','tortuosity','threshold','showInflow','showScores'])$(k).addEventListener('input',()=>{sync();calc();save();});
$('export').onclick=()=>{let l=drawn.getLayers()[0];if(!l)return alert('Draw a line first.');let data={type:'FeatureCollection',metadata:{name:'QLCS Experimental Analysis',created:new Date().toISOString(),note:'NOT a tornado probability',winds:read()},features:[{type:'Feature',properties:{type:'manual_leading_edge'},geometry:{type:'LineString',coordinates:l.getLatLngs().map(x=>[x.lng,x.lat])}},...rows.map((x,i)=>({type:'Feature',properties:{sample:i,LN03_mps:x.LN,LP01_mps:x.LP,tortuosity:x.tort,qtor_inspired:x.score},geometry:{type:'Point',coordinates:[x.point.lng,x.point.lat]}}))]};let url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/geo+json'})),a=document.createElement('a');a.href=url;a.download='qlcs-analysis.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('importBtn').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{if(f.size>5e6)throw Error('File too large');let g=JSON.parse(await f.text()),features=g.type==='FeatureCollection'?g.features:[g],l=features.find(x=>x?.geometry?.type==='LineString');if(!l)throw Error('No LineString found');loadLine(l.geometry.coordinates.map(x=>[x[1],x[0]]));}catch(err){alert(err.message);}e.target.value='';};
try{let s=JSON.parse(localStorage.getItem('qlcs-v01')||'null');if(s?.inputs)for(let [k,v]of Object.entries(s.inputs))if($(k))$(k).type==='checkbox'?$(k).checked=Boolean(v):$(k).value=v;if(s?.coords)loadLine(s.coords);}catch(e){console.warn(e);}sync();calc();