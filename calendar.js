'use strict';
// Calendar inputs are deliberately UTC-only: no Date.toLocaleString or local timezone conversions.
(function(){
 const $=id=>document.getElementById(id);
 const date=$('archiveDate'),from=$('archiveStartHour'),through=$('archiveEndHour');
 const toZulu=(utcDate,hour)=>utcDate+'T'+String(hour).padStart(2,'0')+':00Z';
 for(let h=0;h<=24;h++){
   if(h<24){const o=document.createElement('option');o.value=String(h);o.textContent=String(h).padStart(2,'0')+'Z';from.appendChild(o);}
   const e=document.createElement('option');e.value=String(h);e.textContent=h===24?'24Z (next day)':String(h).padStart(2,'0')+'Z';through.appendChild(e);
 }
 from.value='21';through.value='22';
 const dayLabel=dateText=>{
   if(!/^\d{4}-\d\d-\d\d$/.test(dateText))return 'Invalid UTC date';
   const d=new Date(dateText+'T12:00:00Z');
   return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'short',day:'numeric',year:'numeric'}).format(d):'Invalid UTC date';
 };
 function sync(){
   const value=date.value,st=Number(from.value),end=Number(through.value);
   if(!value||!(end>st)){
     $('archiveWindow').textContent='End hour must be later than start hour in UTC.';
     $('archiveWindow').classList.add('invalid');$('findScans').disabled=true;return false;
   }
   const next=new Date(Date.parse(value+'T00:00:00Z')+86400000).toISOString().slice(0,10);
   $('startUTC').value=toZulu(value,st);
   $('endUTC').value=toZulu(end===24?next:value,end===24?0:end);
   $('archiveWindow').textContent=dayLabel(value)+' • '+String(st).padStart(2,'0')+':00–'+String(end).padStart(2,'0')+':00Z';
   $('archiveWindow').classList.remove('invalid');$('findScans').disabled=false;
   updateHourCoverage();
   return true;
 }
 async function load(){
   if(!sync())return;
   if($('mode').value!=='archive')return;
   stopPlay();
   try{await findScans();}
   catch(e){$('scanStatus').textContent='Unable to load UTC window: '+e.message;}
 }
 function shiftDay(delta){
   const d=new Date(date.value+'T00:00:00Z');
   if(!Number.isFinite(d.getTime()))return;
   date.value=new Date(d.getTime()+delta*86400000).toISOString().slice(0,10);
   load();
 }
 $('dayPrev').addEventListener('click',()=>shiftDay(-1));
 $('dayNext').addEventListener('click',()=>shiftDay(1));
 date.addEventListener('change',load);
 from.addEventListener('change',load);
 through.addEventListener('change',load);
 $('availableDates').addEventListener('change',()=>{
   if($('availableDates').value){
     date.value=$('availableDates').value;
     $('dataSource').value='level2';
     load();
   }
 });
 // The original code stores a reference to its original findScans() on the button.
 // Rebind after the Level II viewer overrides findScans, so calendar and button agree.
 $('findScans').onclick=load;
 $('copyLevel2Request').addEventListener('click',async()=>{
   if(!sync())return;
   const selected='site: K'+$('site').value+'\nmode: historical\nstart_utc: '+$('startUTC').value.replace(/Z$/,'')+'\nend_utc: '+$('endUTC').value.replace(/Z$/,'')+'\nmax_scans: 72';
   try{
     await navigator.clipboard.writeText(selected);
     $('copyLevel2Request').textContent='Copied Level II request ✓';
   }catch(err){
     // Some browsers deny clipboard access outside a secure context;
     // show the settings visibly instead of failing silently.
     $('archiveDataNotice').hidden=false;
     $('archiveDataNotice').textContent='Copy these workflow inputs: '+selected.replace(/\n/g,' • ');
     $('copyLevel2Request').textContent='Request values shown below';
   }
 });
 $('mode').addEventListener('change',()=>{if($('mode').value==='archive')load();});
 $('site').addEventListener('change',()=>{populateAvailableDates();if($('mode').value==='archive')load();});
 $('dataSource').addEventListener('change',()=>{populateAvailableDates();if($('mode').value==='archive')load();});
 let cachedFrames=[];
 function updateHourCoverage(){
   const day=date.value,site="K"+$("site").value;
   const hours=Array.from({length:24},(_,hour)=>{
     const count=cachedFrames.filter(f=>f.site===site&&String(f.time).startsWith(day+"T"+String(hour).padStart(2,"0")+":")).length;
     return {hour,count};
   }).filter(x=>x.count>0);
   $("hourCoverage").textContent=hours.length?"Published Level II: "+hours.map(x=>String(x.hour).padStart(2,"0")+"Z ("+x.count+" scans)").join(" • "):"No processed Level II scans yet for this site/date. Use the GitHub Actions link below to process a new UTC window.";
 }
 async function populateAvailableDates(){
   const selected=$('availableDates'),current=selected.value;
   selected.replaceChildren(new Option('Select a processed date…',''));
   try{
     const response=await fetch('./data/manifest.json?v='+Date.now(),{cache:'no-store'});
     if(!response.ok)return;
     const manifest=await response.json();
     cachedFrames=Array.isArray(manifest.frames)?manifest.frames:[];
     updateHourCoverage();
     const site='K'+$('site').value;
     const days=[...new Set((manifest.frames||[]).filter(f=>f.site===site).map(f=>String(f.time).slice(0,10)))].sort().reverse();
     for(const day of days)selected.add(new Option(dayLabel(day),day));
     if(days.includes(current))selected.value=current;
     else if(days.includes(date.value))selected.value=date.value;
   }catch(e){console.warn('Available Level II dates unavailable',e);}
 }
 sync();populateAvailableDates();
 // The archive source loads asynchronously; this also works after a user returns
 // from the browser cache or changes a date before the manifest request completes.
})();
