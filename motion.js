'use strict';
// Experimental two-frame UDCZ line tracking and conditional future envelopes.
// Not a tornado probability, warning tool, or validated extrapolation product.
(function(){
 const $=id=>document.getElementById(id);
 const previous=L.layerGroup().addTo(map),forecast=L.layerGroup().addTo(map);
 map.createPane('forecastPane');
 map.getPane('forecastPane').style.zIndex=345;
 let A=null,B=null,runToken=0;
 const MAXPOINTS=36;
 function currentStamp(){
   if($('mode').value==='archive'&&scanTimes.length)return scanTimes[Math.max(0,Math.min(scanTimes.length-1,Number($('scanSlider').value)||0))];
   return null; // live: there may not be an exact data timestamp
 }
 function capture(which){
   const line=drawn.getLayers()[0];
   if(!line){$('motionCaptureStatus').textContent='Trace a QLCS leading edge first (freehand or polyline).';return;}
   const time=currentStamp();
   if(!time){$('motionCaptureStatus').textContent='Select a historical radar scan with an exact UTC timestamp before capturing.';return;}
   const coords=line.getLatLngs();
   if(coords.length<2){$('motionCaptureStatus').textContent='The trace needs at least two vertices.';return;}
   const item={time,site:$('site').value,coords:coords.map(p=>[p.lat,p.lng])};
   if(which==='A'){
     A=item;B=null;previous.clearLayers();forecast.clearLayers();
     L.polyline(item.coords,{color:'#4edce8',weight:3,dashArray:'7 5',opacity:.9,interactive:false}).addTo(previous);
     $('motionCaptureStatus').textContent='Scan A saved: '+time+' • Advance the scan slider, trace the NEW line position, then capture Scan B.';
   }else{
     if(!A){$('motionCaptureStatus').textContent='Capture Scan A before Scan B.';return;}
     if(A.site!==item.site){$('motionCaptureStatus').textContent='Both captures must use the same radar site.';return;}
     if(Date.parse(item.time)<=Date.parse(A.time)){$('motionCaptureStatus').textContent='Scan B must have a later UTC timestamp than Scan A.';return;}
     B=item;
     $('motionCaptureStatus').textContent='A: '+A.time+' → B: '+B.time+' ('+((Date.parse(B.time)-Date.parse(A.time))/60000).toFixed(1)+' min). Local forward vectors are ready.';
     // Respect the chosen mode; Manual is the default even with two captures.
     compute();
   }
 }
 // Compare corresponding fractional distances along two traced lines, with
 // start/end pairing chosen to minimize flipped trace mismatch.
 function normalizedLine(coords){
   const pts=coords.map(p=>L.latLng(p[0],p[1]));
   const cumulative=[0];for(let i=1;i<pts.length;i++)cumulative.push(cumulative[i-1]+distance(pts[i-1],pts[i]));
   const total=cumulative[cumulative.length-1];if(total<.5)return null;
   return {pts,cumulative,total};
 }
 function at(line,fraction){
   const target=line.total*fraction;
   let k=1;while(k<line.cumulative.length-1&&line.cumulative[k]<target)k++;
   const a=line.pts[k-1],b=line.pts[k],d=line.cumulative[k]-line.cumulative[k-1];
   const t=d>0?(target-line.cumulative[k-1])/d:0;
   return dest(a,bearing(a,b),distance(a,b)*t);
 }
 function bearingBetween(a,b){return bearing(a,b);}
 function deriveVectors(){
   if(!A||!B)return null;
   const dt=(Date.parse(B.time)-Date.parse(A.time))/3600000;
   if(!(dt>0&&dt<=2))throw Error('Two scan times must be 0–120 min apart.');
   const la=normalizedLine(A.coords),lb=normalizedLine(B.coords);
   if(!la||!lb)throw Error('Traced line is too short to estimate motion.');
   const forward=distance(la.pts[0],lb.pts[0])+distance(la.pts.at(-1),lb.pts.at(-1));
   const reverse=distance(la.pts[0],lb.pts.at(-1))+distance(la.pts.at(-1),lb.pts[0]);
   if(reverse<forward){
     lb.pts.reverse();
     lb.cumulative=[0];
     for(let i=1;i<lb.pts.length;i++)lb.cumulative.push(lb.cumulative[i-1]+distance(lb.pts[i-1],lb.pts[i]));
   }
   const motion=[];
   const n=MAXPOINTS;
   for(let k=0;k<n;k++){
     const frac=k/(n-1),p=at(la,frac),q=at(lb,frac),km=distance(p,q);
     const speed=Math.min(110,km/dt/1.852);
     const dir=bearing(p,q);
     motion.push({f:frac,atA:p,atB:q,dir,speed,km});
   }
   // Robust dominant translation: median of interior east/north speeds avoids
   // extrapolating rapidly growing/shortening endpoints as translational motion.
   const east=[],north=[];
   for(const m of motion.slice(3,-3)){
     east.push(m.speed*Math.sin(rad(m.dir)));
     north.push(m.speed*Math.cos(rad(m.dir)));
   }
   const median=values=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)]||0;};
   const dominant={east:median(east),north:median(north)};
   dominant.speed=Math.hypot(dominant.east,dominant.north);
   dominant.dir=(Math.atan2(dominant.east,dominant.north)*180/Math.PI+360)%360;
   return {dt,motion,a:la,b:lb,dominant};
 }
 function interpolateMotion(vectors,f){
   const pos=f*(vectors.motion.length-1),index=Math.min(vectors.motion.length-2,Math.floor(pos));
   // Smooth over adjacent line elements, so single vertex correspondence errors
   // do not produce kinks/spikes in downstream QLCS line geometry.
   let east=0,north=0,total=0;
   const smoothingRadius=4;
   for(let j=Math.max(0,index-smoothingRadius);j<=Math.min(vectors.motion.length-1,index+smoothingRadius);j++){
     const m=vectors.motion[j],weight=smoothingRadius+1-Math.abs(j-index);
     east+=m.speed*Math.sin(rad(m.dir))*weight;
     north+=m.speed*Math.cos(rad(m.dir))*weight;
     total+=weight;
   }
   east/=total;north/=total;
   const dominant=vectors.dominant;
   const freedom=(100-Number($('shapeLock').value))/100; // 90% locked → 10% differential
   // Max 12 kt local variation before the shape-preservation blend, preventing
   // unrealistic divergent ends and overturning/folding projected line segments.
   let de=east-dominant.east,dn=north-dominant.north;
   const delta=Math.hypot(de,dn),maxLocal=12;
   if(delta>maxLocal){de*=maxLocal/delta;dn*=maxLocal/delta;}
   const u=dominant.east+de*freedom,v=dominant.north+dn*freedom;
   return {dir:(Math.atan2(u,v)*180/Math.PI+360)%360,speed:Math.hypot(u,v)};
 }
 function geoProject(p,v,hours){return dest(p,v.dir,Math.min(500,v.speed*1.852*hours));}
 function compute(){
   forecast.clearLayers();
   $('forecastHoursValue').textContent=Number($('forecastHours').value).toFixed(1)+' h';
   $('forecastSpreadValue').textContent=$('forecastSpread').value+' km/h';
   $('shapeLockValue').textContent=$('shapeLock').value+'%';
   if(!$('showForecast').checked){$('motionForecastStatus').textContent='Future envelopes hidden.';return;}
   const latest=drawn.getLayers()[0];
   const baseCoords=B?B.coords:(latest?latest.getLatLngs().map(p=>[p.lat,p.lng]):null);
   if(!baseCoords||baseCoords.length<2){$('motionForecastStatus').textContent='Draw a line and capture two scans, or use manual direction and speed.';return;}
   let derived=null;
   if($('motionMethod').value==='twoframe'&&A&&B){
     try{derived=deriveVectors();}catch(e){$('motionForecastStatus').textContent='Motion calculation: '+e.message;return;}
   }
   if($('motionMethod').value==='twoframe'&&!derived){
     $('motionForecastStatus').textContent='Capture two different scan times to calculate local propagation, or select Manual direction / speed.';
     return;
   }
   const manualDirection=Number($('motion').value),manualSpeed=Number($('motionSpeedKt').value);
   if(!Number.isFinite(manualDirection)||!Number.isFinite(manualSpeed)||manualSpeed<0||manualSpeed>100){
     $('motionForecastStatus').textContent='Set a valid manual motion direction and speed (0–100 kt).';return;
   }
   const line=normalizedLine(baseCoords);
   if(!line)return;
   const hours=Number($('forecastHours').value),spread=Number($('forecastSpread').value);
   const sampleCount=28;
   // Score-by-fraction is based on the current, stationary representative wind
   // analysis. It is NOT extrapolated into a verified future environment.
   const scores=rows.map(r=>r.score);
   const threshold=Number($('threshold').value);
   function scoreAt(f){if(!scores.length)return null;const x=f*(scores.length-1),i=Math.min(scores.length-1,Math.round(x));return scores[i];}
   const now=[],future=[],vectors=[];
   for(let k=0;k<sampleCount;k++){
     const f=k/(sampleCount-1),p=at(line,f);
     const mv=derived?interpolateMotion(derived,f):{dir:manualDirection,speed:manualSpeed};
     const q=geoProject(p,mv,hours);
     now.push(p);future.push(q);vectors.push(mv);
   }
   // Fill ALL the way from the latest traced line (Scan B if captured) to
   // the projected leading edge, rather than shading just near the endpoint.
   // Score colors transport CURRENT diagnostic classifications unchanged:
   // green = higher relative index, red = lower relative index.
   // These are conditional swept footprints, NOT tornado-risk polygons.
   const segmentColor=k=>{
     const f=(k-.5)/(sampleCount-1);
     const diagnostic=window.qlcsDiagnosticAt?.(f);
     if(diagnostic&&$('showScores').checked&&$('gradientMode').value!=='off')return diagnostic.color;
     return '#6fbdcc'; // neutral when diagnostic overlay is disabled
   };
   for(let k=1;k<sampleCount;k++){
     const color=segmentColor(k);
     L.polygon([now[k-1],now[k],future[k],future[k-1]],{
       pane:'forecastPane',stroke:false,fillColor:color,fillOpacity:.20,
       interactive:false
     }).addTo(forecast);
   }
   // Borders trace the full traveled corridor from captured B to projected edge.
   // Narrow transverse connectors are intentionally only at line ends.
   // Distinct category colors continue all the way to the projected edge.
   // A dark outline separates the colored edge from high-reflectivity imagery.
   L.polyline(future,{pane:'forecastPane',color:'#101f2d',weight:7,
     opacity:.85,interactive:false}).addTo(forecast);
   for(let k=1;k<sampleCount;k++){
     L.polyline([future[k-1],future[k]],{pane:'forecastPane',color:segmentColor(k),
       weight:4,opacity:.98,dashArray:'8 4',interactive:false}).addTo(forecast);
   }
   // Category names at substantial contiguous future-edge spans.
   if($('gradientMode').value==='weighted'&&$('weightedCategories').checked&&$('showScores').checked){
     const labels=future.map((_,k)=>window.qlcsDiagnosticAt?.(k/(sampleCount-1))?.category||null);
     let first=0;
     const mark=(lo,hi)=>{
       if(!labels[lo]||hi-lo<2)return;
       const mid=Math.floor((lo+hi)/2),color=segmentColor(Math.max(1,mid));
       L.marker(future[mid],{pane:'forecastPane',interactive:false,keyboard:false,
         icon:L.divIcon({className:'qlcs-category-label projected',
           html:'<span style="border-color:'+color+'">+'+hours.toFixed(1)+'h · '+labels[lo]+'</span>',
           iconSize:[120,24],iconAnchor:[60,32]})}).addTo(forecast);
     };
     for(let k=1;k<=labels.length;k++){
       if(k===labels.length||labels[k]!==labels[first]){mark(first,k-1);first=k;}
     }
   }
   for(const edge of [0,sampleCount-1]){
     L.polyline([now[edge],future[edge]],{pane:'forecastPane',color:'#b5ffe0',
       weight:1.6,opacity:.75,dashArray:'7 6',interactive:false}).addTo(forecast);
   }
   // One coherent uncertainty ribbon following the SHAPE of Scan B, not
   // separate segment rectangles whose differing azimuths form giant wedges.
   // Bound display width to avoid visually implying unrealistic tornado swaths.
   const width=Math.min(16,spread*hours);
   if(width>0){
     const outer=[],inner=[];
     for(let k=0;k<future.length;k++){
       const lo=future[Math.max(0,k-1)],hi=future[Math.min(future.length-1,k+1)];
       const tangent=bearing(lo,hi),normal=(tangent+90)%360;
       outer.push(dest(future[k],normal,width));
       inner.push(dest(future[k],(normal+180)%360,width));
     }
     L.polygon([...outer,...inner.reverse()],{
       pane:'forecastPane',color:'#d8e8ee',weight:1,opacity:.25,
       fillColor:'#80b7c8',fillOpacity:.022,interactive:false
     }).addTo(forecast);
   }
   // Draw intermediate projected positions every 30 minutes for a Warngen-like
   // timeline of line motion, retaining the same representative score classes.
   for(let step=0.5;step<hours-.01;step+=0.5){
     const layerPoints=now.map((p,k)=>geoProject(p,vectors[k],step));
     for(let k=1;k<layerPoints.length;k++){
       const col=segmentColor(k);
       L.polyline([layerPoints[k-1],layerPoints[k]],{pane:'forecastPane',color:col,
         weight:2,opacity:.55,dashArray:'3 7',interactive:false}).addTo(forecast);
     }
     const labelPoint=layerPoints[Math.floor(layerPoints.length/2)];
     L.marker(labelPoint,{pane:'forecastPane',interactive:false,keyboard:false,
       icon:L.divIcon({className:'motion-hour-label',
         html:'<span>+'+step.toFixed(1)+'h</span>',iconSize:[48,24],iconAnchor:[0,12]})
     }).addTo(forecast);
   }
   const finalLabel=future[Math.floor(future.length/2)];
   L.marker(finalLabel,{pane:'forecastPane',interactive:false,keyboard:false,
     icon:L.divIcon({className:'motion-hour-label final',
       html:'<span>+'+hours.toFixed(1)+'h</span>',iconSize:[48,24],iconAnchor:[0,12]})
   }).addTo(forecast);
   const tickEvery=10;
   for(let k=0;k<sampleCount;k+=tickEvery){
     L.polyline([now[k],future[k]],{pane:'forecastPane',color:'#ffe46e',weight:1.8,opacity:.75,dashArray:'6 5',interactive:false}).addTo(forecast);
   }
   if(derived){
     $('motionForecastStatus').textContent='A→B '+(derived.dt*60).toFixed(1)+' min; dominant translation '+derived.dominant.speed.toFixed(0)+' kt toward '+derived.dominant.dir.toFixed(0)+'°. Scan B shape preserved '+$('shapeLock').value+'%; local variations smoothed and limited. +'+hours.toFixed(1)+' h projection; schematic envelope ±'+width.toFixed(0)+' km (max 16 km). NOT a probability forecast.';
   }else{
     $('motionForecastStatus').textContent='Manual '+manualDirection.toFixed(0)+'° TOWARD at '+manualSpeed.toFixed(0)+' kt: conditional '+hours.toFixed(1)+'-h position, ±'+(spread*hours).toFixed(0)+' km uncertainty. Assumes no change in system direction, speed, orientation or environment.';
   }
 }
 // One user-visible Clear button resets the drawn line (app.js), both captures,
 // previous paths, projection fills and saved motion state.
 $('clear').addEventListener('click',()=>{$('resetMotion').click();});
 $('captureA').onclick=()=>capture('A');
 $('captureB').onclick=()=>capture('B');
 $('calculateMotion').onclick=compute;
 // Keep the downstream fill synchronized with the chosen line-gradient view.
 for(const id of ['gradientMode','weightedCategories','showScores','step','tortuosity','threshold'])
   $(id).addEventListener('input',()=>{queueMicrotask(compute);});
 $('resetMotion').onclick=()=>{A=null;B=null;$('forecastHours').value='1';$('motionMethod').value='manual';$('forecastHoursValue').textContent='1.0 h';forecast.clearLayers();previous.clearLayers();$('motionCaptureStatus').textContent='Captures cleared. Draw a leading edge and save Scan A.';$('motionForecastStatus').textContent='Two-frame motion not yet calculated.';};
 for(const id of ['motionMethod','motionSpeedKt','forecastHours','forecastSpread','shapeLock','showForecast'])
   $(id).addEventListener('input',compute);
 // Update on redraw/environment adjustments but do NOT overwrite captured shapes.
 $('analyze').addEventListener('click',compute);
 $('scanSlider').addEventListener('input',()=>{if(A&&!B)$('motionCaptureStatus').textContent='Scan A at '+A.time+' saved. Draw the line on the new scan and capture B.';});
 $('advanceCapture').onclick=()=>{
   if(!A){$('motionCaptureStatus').textContent='Draw and capture Scan A first.';return;}
   $('scanForward').click();
   $('motionCaptureStatus').textContent='Moved to next available radar scan. Use Freehand or Polyline to redraw its leading edge, then capture Scan B.';
 };
 // Explicit defaults, independent of whether the user has captured any scans.
 $('forecastHours').value='1';
 $('motionMethod').value='manual';
 $('forecastHoursValue').textContent='1.0 h';
 window.qlcsMotion={compute};
})();
