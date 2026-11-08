'use strict';
// Research/training-only circulation motion scenarios. NOT tornado track forecasts.
// The line cannot diagnose individual vortices or their actual motion: use
// observed successive radar velocity scans for any warning decision.
(function(){
 const $=id=>document.getElementById(id);
 const layer=L.layerGroup().addTo(map),spots=L.layerGroup().addTo(map);
 map.createPane('vortexVectorPane');
 map.getPane('vortexVectorPane').style.zIndex=495;
 map.getPane('vortexVectorPane').style.pointerEvents='none';
 let selectedFraction=null,apexFraction=null,apexPick=false;
 const ctrl=['mvEnabled','mvShowMultiple','mvScenario','mvAngle','mvSpeed',
             'mvSteering','mvDrift','mvMinutes','mvCount'];
 const safeNum=(id,defaultValue=0)=>Number.isFinite(Number($(id).value))?Number($(id).value):defaultValue;
 const rad=x=>x*Math.PI/180;
 const direction=(u,v)=>(Math.atan2(u,v)*180/Math.PI+360)%360;
 const vector=(heading,speed)=>({u:speed*Math.sin(rad(heading)),v:speed*Math.cos(rad(heading))});
 const pointDistance=(a,b)=>map.distance(a,b)/1000;
 function lineGeometry(){
   const poly=drawn.getLayers()[0];
   if(!poly)return null;
   const coords=poly.getLatLngs();
   if(!Array.isArray(coords)||coords.length<2||Array.isArray(coords[0]))return null;
   const cumulative=[0];
   for(let i=1;i<coords.length;i++)cumulative.push(cumulative[i-1]+pointDistance(coords[i-1],coords[i]));
   const total=cumulative.at(-1);
   return total>0.05?{coords,cumulative,total}:null;
 }
 function sample(geometry,f){
   const fraction=Math.max(0,Math.min(1,f)),target=geometry.total*fraction;
   let idx=1;
   while(idx<geometry.cumulative.length-1&&geometry.cumulative[idx]<target)idx++;
   const a=geometry.coords[idx-1],b=geometry.coords[idx];
   const len=geometry.cumulative[idx]-geometry.cumulative[idx-1];
   if(!(len>0))return a;
   return dest(a,bearing(a,b),Math.max(0,Math.min(len,target-geometry.cumulative[idx-1])));
 }
 function nearestFraction(geometry,latlng){
   const p=map.latLngToContainerPoint(latlng);
   let best={dist:Infinity,fraction:0},sum=0;
   for(let i=1;i<geometry.coords.length;i++){
     const p1=map.latLngToContainerPoint(geometry.coords[i-1]),
           p2=map.latLngToContainerPoint(geometry.coords[i]);
     const dx=p2.x-p1.x,dy=p2.y-p1.y,den=dx*dx+dy*dy;
     const t=den>0?Math.max(0,Math.min(1,((p.x-p1.x)*dx+(p.y-p1.y)*dy)/den)):0;
     const dist=Math.hypot(p.x-(p1.x+t*dx),p.y-(p1.y+t*dy));
     const km=geometry.cumulative[i]-geometry.cumulative[i-1];
     if(dist<best.dist)best={dist,fraction:(geometry.cumulative[i-1]+km*t)/geometry.total};
   }
   return best;
 }
 function localScenario(f,geometry){
   const systemHeading=((safeNum('motion')%360)+360)%360;
   const systemSpeed=Math.max(0,Math.min(100,safeNum('mvSpeed',35)));
   const base=vector(systemHeading,systemSpeed);
   let u=base.u,v=base.v,detail='manual';
   const mode=$('mvScenario').value;
   if(mode==='manual'){
     const heading=(systemHeading+Math.max(-120,Math.min(120,safeNum('mvAngle')))+360)%360;
     const manual=vector(heading,systemSpeed);
     u=manual.u;v=manual.v;detail='system direction + user-entered rotation';
   }else if(mode==='steering'){
     // Interpret 10-m and 1-km meteorological FROM vectors as TOWARD winds;
     // blend with line motion in velocity component space. This is a scenario,
     // not measured circulation steering or an empirically trained relationship.
     const c=safeNum('mvSteering',30)/100;
     let wu=0,wv=0;
     for(const k of ['0','1']){
       const wind=vector((safeNum('dir'+k)+180)%360,Math.max(0,safeNum('spd'+k)));
       wu+=wind.u/2;wv+=wind.v/2;
     }
     u=base.u*(1-c)+wu*c;v=base.v*(1-c)+wv*c;
     detail='user blend of QLCS translation and 10-m/1-km flow';
   }else if(mode==='bow'){
     if(apexFraction!==null){
       const northernIsIncreasing=geometry.coords.at(-1).lat>geometry.coords[0].lat;
       const relativeNorth=(f-apexFraction)*(northernIsIncreasing?1:-1);
       const proximity=Math.exp(-.5*Math.pow((f-apexFraction)/.18,2));
       const strength=relativeNorth>=-.02?1:.12;
       const a=sample(geometry,Math.max(0,f-.015));
       const b=sample(geometry,Math.min(1,f+.015));
       const alongHeading=northernIsIncreasing?bearing(a,b):bearing(b,a);
       const drift=vector(alongHeading,Math.max(0,Math.min(25,safeNum('mvDrift',10)))*proximity*strength);
       u+=drift.u;v+=drift.v;
       detail='illustrative northern-flank along-line drift (NOT calibrated)';
     }else detail='bow apex not selected; using system translation only';
   }
   return {heading:direction(u,v),speed:Math.hypot(u,v),detail};
 }
 function drawArrow(anchor,local,chosen){
   const minutes=safeNum('mvMinutes',10);
   const km=local.speed*1.852*minutes/60;
   // Draw geographically true displacement; no misleading minimum arrow length.
   const end=dest(anchor,local.heading,km);
   const magenta=chosen?'#ff70ef':'#e99cf4';
   if(km>=.1){
     L.polyline([anchor,end],{pane:'vortexVectorPane',color:'#172536',weight:6,
       opacity:.92,interactive:false}).addTo(layer);
     L.polyline([anchor,end],{pane:'vortexVectorPane',color:magenta,weight:3,
       opacity:1,interactive:false}).addTo(layer);
     const arm=Math.max(.5,Math.min(2.5,km*.15));
     const left=dest(end,(local.heading+150)%360,arm),
           right=dest(end,(local.heading+210)%360,arm);
     L.polyline([left,end,right],{pane:'vortexVectorPane',color:magenta,weight:2.8,
       opacity:1,interactive:false}).addTo(layer);
   }
   L.circleMarker(anchor,{pane:'vortexVectorPane',radius:chosen?5:3.5,
     color:magenta,weight:2,fillColor:'#122537',fillOpacity:.85,
     interactive:false}).addTo(layer);
   if(chosen){
     const label=String(Math.round(local.heading)).padStart(3,'0')+'° / '+local.speed.toFixed(0)+' kt';
     L.marker(end,{pane:'vortexVectorPane',interactive:false,keyboard:false,
       icon:L.divIcon({className:'vortex-scenario-label',
         html:'<span>'+label+'</span>',iconSize:[100,27],iconAnchor:[50,-8]})
     }).addTo(layer);
   }
 }
 function draw(){
   layer.clearLayers();spots.clearLayers();
   $('mvSteeringValue').textContent=$('mvSteering').value+'%';
   $('mvDriftValue').textContent=$('mvDrift').value+' kt';
   const g=lineGeometry();
   if(!$('mvEnabled').checked){$('mvStatus').textContent='Circulation-motion scenarios hidden. Enable to click the traced QLCS line.';return;}
   if(!g){$('mvStatus').textContent='Draw a QLCS leading edge first to examine a local motion scenario.';return;}
   if(apexFraction!==null){
     L.circleMarker(sample(g,apexFraction),{pane:'vortexVectorPane',radius:7,
       color:'#e9faff',weight:2,dashArray:'3 3',fillOpacity:0,interactive:false}).addTo(spots);
   }
   if($('mvShowMultiple').checked){
     const count=Math.max(3,Math.min(9,safeNum('mvCount',5)));
     for(let i=0;i<count;i++){
       const f=.08+.84*i/(count-1);
       drawArrow(sample(g,f),localScenario(f,g),false);
     }
   }
   if(selectedFraction!==null)drawArrow(sample(g,selectedFraction),localScenario(selectedFraction,g),true);
   const mode=$('mvScenario').value,lead=$('mvMinutes').value;
   const message=mode==='bow'&&apexFraction===null
     ?'Select “Mark bow apex on line” and click the apex to enable illustrative north-flank drift.'
     :'Scenario vectors shown for '+lead+' min; click anywhere on the traced line to inspect a local arrow.';
   $('mvStatus').textContent=message+' These vectors are NOT observed or validated tornado tracks.';
 }
 function clickAt(e){
   if(!$('mvEnabled').checked&&!apexPick)return;
   if(map.getContainer().classList.contains('freehand-active'))return;
   const g=lineGeometry();if(!g)return;
   const hit=nearestFraction(g,e.latlng);
   if(hit.dist>24)return;
   if(apexPick){
     apexFraction=hit.fraction;apexPick=false;
     $('mvChooseApex').textContent='Mark bow apex on line';
     $('mvScenario').value='bow';
   }else selectedFraction=hit.fraction;
   draw();
 }
 map.on('click',clickAt);
 $('mvChooseApex').addEventListener('click',()=>{
   apexPick=!apexPick;
   $('mvChooseApex').textContent=apexPick?'Click the bow apex on map…':'Mark bow apex on line';
   $('mvStatus').textContent=apexPick?'Click the bulging bow apex on your traced line to mark it.':'Apex selection cancelled.';
 });
 for(const id of ctrl)$(id).addEventListener('input',draw);
 for(const id of ['motion','motionSpeedKt','dir0','spd0','dir1','spd1'])
   $(id).addEventListener('input',draw);
 const previousCalc=calc;
 calc=function(){previousCalc();draw();};
 $('clear').addEventListener('click',()=>{
   selectedFraction=null;apexFraction=null;apexPick=false;
   $('mvChooseApex').textContent='Mark bow apex on line';draw();
 });
 draw();
})();
