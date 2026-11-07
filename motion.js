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
     $('motionMethod').value='twoframe';
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
   if(!(dt>0&&dt<=2))throw Error('Two scans must be 0–120 minutes apart to estimate motion reliably.');
   const la=normalizedLine(A.coords),lb=normalizedLine(B.coords);
   if(!la||!lb)throw Error('Traced line is too short to estimate motion.');
   const da=distance(la.pts[0],lb.pts[0])+distance(la.pts[la.pts.length-1],lb.pts[lb.pts.length-1]);
   const db=distance(la.pts[0],lb.pts[lb.pts.length-1])+distance(la.pts[la.pts.length-1],lb.pts[0]);
   if(db<da){lb.pts.reverse();lb.cumulative=[0];for(let i=1;i<lb.pts.length;i++)lb.cumulative.push(lb.cumulative[i-1]+distance(lb.pts[i-1],lb.pts[i]));}
   const n=MAXPOINTS;
   const motion=[];
   for(let k=0;k<n;k++){
     const f=k/(n-1),p=at(la,f),q=at(lb,f),km=distance(p,q);
     const speed=Math.min(110,km/dt/1.852);
     motion.push({f,atA:p,atB:q,dir:bearingBetween(p,q),speed,km});
   }
   // Line-pairing is approximate; endpoint stretching is interpreted as
   // expansion, not established physical motion of individual features.
   return {dt,motion,a:la,b:lb};
 }
 function interpolateMotion(vectors,f){
   const pos=f*(vectors.length-1),i=Math.min(vectors.length-2,Math.floor(pos));
   const t=Math.max(0,Math.min(1,pos-i));
   const a=vectors[i],b=vectors[i+1];
   const va=wind(a.dir,a.speed),vb=wind(b.dir,b.speed);
   const u=va.u*(1-t)+vb.u*t,v=va.v*(1-t)+vb.v*t;
   return {dir:(Math.atan2(u,v)*180/Math.PI+360)%360,speed:Math.hypot(u,v)/.514444};
 }
 function geoProject(p,v,hours){return dest(p,v.dir,Math.min(500,v.speed*1.852*hours));}
 function compute(){
   forecast.clearLayers();
   $('forecastHoursValue').textContent=Number($('forecastHours').value).toFixed(1)+' h';
   $('forecastSpreadValue').textContent=$('forecastSpread').value+' km/h';
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
     const mv=derived?interpolateMotion(derived.motion,f):{dir:manualDirection,speed:manualSpeed};
     const q=geoProject(p,mv,hours);
     now.push(p);future.push(q);vectors.push(mv);
   }
   // Draw colored conditional envelopes by segment, with uncertainty increasing
   // in proportion to lead time; never label green/red as tornado probabilities.
   for(let k=1;k<sampleCount;k++){
     const val=scoreAt((k-.5)/(sampleCount-1));
     const favorable=val!==null&&val>=threshold;
     const color=val===null?'#82c4ea':favorable?'#35e58a':'#f17770';
     const a=future[k-1],b=future[k];
     L.polyline([a,b],{pane:'forecastPane',color,weight:5,opacity:.9,dashArray:'10 6',interactive:false}).addTo(forecast);
     const uncertainty=Math.min(100,spread*hours);
     // Outward uncertainty ribbon is schematic; centerline plus flanks.
     const v=vectors[k],side=(v.dir+90)%360;
     const aa=dest(a,side,uncertainty),bb=dest(b,side,uncertainty);
     const cc=dest(b,(side+180)%360,uncertainty),dd=dest(a,(side+180)%360,uncertainty);
     L.polygon([aa,bb,cc,dd],{pane:'forecastPane',stroke:false,fillColor:color,fillOpacity:.075,interactive:false}).addTo(forecast);
   }
   const tickEvery=5;
   for(let k=0;k<sampleCount;k+=tickEvery){
     L.polyline([now[k],future[k]],{pane:'forecastPane',color:'#ffe46e',weight:2,opacity:.88,dashArray:'6 5',interactive:false}).addTo(forecast);
   }
   if(derived){
     const speeds=derived.motion.map(x=>x.speed);
     const min=Math.min(...speeds),max=Math.max(...speeds),mean=speeds.reduce((a,b)=>a+b,0)/speeds.length;
     $('motionForecastStatus').textContent='Two-frame local motion: '+derived.dt.toFixed(2)+' h between scans. Segment speeds '+min.toFixed(0)+'–'+max.toFixed(0)+' kt (mean '+mean.toFixed(0)+' kt). Conditional '+hours.toFixed(1)+'-h projection; ±'+(spread*hours).toFixed(0)+' km display uncertainty. Spatially varying motion may include line growth, deformation, or drawing correspondence errors.';
   }else{
     $('motionForecastStatus').textContent='Manual '+manualDirection.toFixed(0)+'° TOWARD at '+manualSpeed.toFixed(0)+' kt: conditional '+hours.toFixed(1)+'-h position, ±'+(spread*hours).toFixed(0)+' km uncertainty. Assumes no change in system direction, speed, orientation or environment.';
   }
 }
 $('captureA').onclick=()=>capture('A');
 $('captureB').onclick=()=>capture('B');
 $('calculateMotion').onclick=compute;
 $('resetMotion').onclick=()=>{A=null;B=null;forecast.clearLayers();previous.clearLayers();$('motionCaptureStatus').textContent='Captures cleared. Draw a leading edge and save Scan A.';$('motionForecastStatus').textContent='Two-frame motion not yet calculated.';};
 for(const id of ['motionMethod','motionSpeedKt','forecastHours','forecastSpread','showForecast'])
   $(id).addEventListener('input',compute);
 // Update on redraw/environment adjustments but do NOT overwrite captured shapes.
 $('analyze').addEventListener('click',compute);
 $('scanSlider').addEventListener('input',()=>{if(A&&!B)$('motionCaptureStatus').textContent='Scan A at '+A.time+' saved. Draw the line on the new scan and capture B.';});
 window.qlcsMotion={compute};
})();
