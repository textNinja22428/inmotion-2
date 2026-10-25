"use strict";
const SECTIONS = [
  {name:"E, E — MC CAB", x:29.7,y:2.8,w:30.9,h:24.9},
  {name:"S — TABLET JTC", x:61.8,y:2.8,w:32,h:24.9},
  {name:"E, E — CAW", x:29.7,y:28.1,w:30.9,h:24.9},
  {name:"S — WTBOX", x:61.8,y:28.1,w:32,h:24.9},
  {name:"SLOT 5", x:29.7,y:53.8,w:30.9,h:22.1},
  {name:"SLOT 6", x:61.8,y:53.8,w:32,h:22.1},
  {name:"SLOT 7", x:2.7,y:77,w:41.8,h:17.3,bottom:true},
  {name:"CLUTCHES / SENKROMEÇ BİLEZİKLERİ", x:46.2,y:77,w:47.7,h:17.3,bottom:true,bottomRight:true}
];
const Q = id => document.getElementById(id);
const STATE_KEY = 'inmotion-v2';
const nativeAvailable = !!window.NativeAudio;
const covers = {cover:Q('cover-page'),board:Q('board-page')};
let page='cover', editingSlot=-1, selectedArchive=null;
let boardReadyAt=0;
let entryPending=false;
let sealTapTimes=[];
let historyZoom=1,historyBaseWidth=0;

const fresh = () => ({slots:Array(8).fill(''), done:Array(8).fill(false),earned:Array(8).fill(false),archived:false,savedAt:null});
function todayKey(date=new Date()) {return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function loadState(){
  let loaded=null;
  try {loaded=JSON.parse(localStorage.getItem(STATE_KEY));}catch(e){}
  const s=loaded&&loaded.version===2&&loaded.days&&typeof loaded.days==='object'?loaded:{version:2,activeDay:todayKey(),days:{},theme:'light',soundEnabled:true,migrated:false};
  if(!s.days[s.activeDay])s.days[s.activeDay]=fresh();
  // Migration keeps existing V1 notes when installing over the same app without clearing data.
  if(!s.migrated){
    SECTIONS.forEach((_,i)=>{let v='';try{v=localStorage.getItem('inmotion-slot-'+i)||'';}catch(e){}
      if(v&&!s.days[s.activeDay].slots[i])s.days[s.activeDay].slots[i]=v;
    });
    s.migrated=true;
  }
  return s;
}
let state=loadState();
function persist(){try{localStorage.setItem(STATE_KEY,JSON.stringify(state));}catch(e){toast('Storage full — notes could not be saved');}}
function day(){return state.days[state.activeDay] || (state.days[state.activeDay]=fresh());}
function rollover(){
 const key=todayKey(); if(state.activeDay===key)return;
 if(state.activeDay && state.days[state.activeDay]){
  const old=state.days[state.activeDay]; old.archived=true; old.savedAt=old.savedAt||new Date().toISOString();
 }
 state.activeDay=key;if(!state.days[key])state.days[key]=fresh();
 persist();renderSlots();updateDate();updateXP();toast('New day · Your previous page is in Gallery');
}
function points(d){return d.earned.filter(Boolean).length*5;}
function lifetimeXP(){return Object.values(state.days).reduce((sum,d)=>sum+points(d),0);}
function levelTitle(level){return ['FIRST SPARK','GETTING STARTED','IN MOTION','FOCUSED','MOMENTUM','UNSTOPPABLE'][Math.min(level-1,5)];}
function updateXP(){
 const count=Object.keys(state.days).filter(k=>state.days[k].archived).length;
 Q('board-xp').textContent=`${day().done.filter(Boolean).length} / 8 COMPLETE`;
 Q('gallery-count').textContent=`${count} SAVED ${count===1?'DAY':'DAYS'}`;
}
function prettyDate(key,options){
 const date=new Date(`${key}T12:00:00`);
 return new Intl.DateTimeFormat('tr-TR',options).format(date);
}
function updateDate(){
 const d=new Date(); Q('date-weekday').textContent=new Intl.DateTimeFormat('tr-TR',{weekday:'long'}).format(d).toLocaleUpperCase('tr-TR');
 Q('date-long').textContent=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(d);
 const hour=d.getHours();
 const greetings=[
  [6,"You need to be sleeping, my man. Have a great night, though."],
  [8,"Early bird gets the worm. Let's have a great day."],
  [12,"Protect your momentum. Make your morning count."],
  [15,"A clear mind. One meaningful action at a time."],
  [18,"Keep moving forward. Finish what matters."],
  [21,"Good progress today. Keep the evening intentional."],
  [24,"Ease into rest. Tomorrow starts with tonight."]
 ];
 Q('time-greeting').textContent=greetings.find(item=>hour<item[0])[1];
 Q('board-date-label').textContent=prettyDate(state.activeDay,{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
}
function renderSlots(){
 const layer=Q('slot-layer'); layer.textContent=''; const d=day();
 SECTIONS.forEach((s,i)=>{
  const b=document.createElement('button');b.type='button';b.className='slot'+(s.bottom?' bottom-slot':'')+(s.bottomRight?' bottom-right':'');
  Object.assign(b.style,{left:s.x+'%',top:s.y+'%',width:s.w+'%',height:s.h+'%'});
  b.setAttribute('aria-label','Edit '+s.name);b.dataset.slot=i;
  const preview=document.createElement('span');preview.className='slot-preview';preview.textContent=d.slots[i]||'';b.append(preview);
  
  b.addEventListener('click',()=>openEditor(i));layer.append(b);
  const marker=document.createElement('button');marker.type='button';
  marker.className='done-marker'+(d.done[i]?' is-done':'');
  Object.assign(marker.style,{left:`calc(${s.x+s.w}% - 28px)`,top:`calc(${s.y+s.h}% - 28px)`});
  marker.textContent=d.done[i]?'✓':'○';
  marker.setAttribute('aria-label','Toggle completion '+s.name);
  marker.addEventListener('click',e=>{e.stopPropagation();toggleDone(i);});
  layer.append(marker);
 });
}
function toggleDone(index){
 if(page!=='board'||Date.now()<boardReadyAt)return;
 rollover();const d=day();d.done[index]=!d.done[index];
 persist();renderSlots();updateXP();
 if(d.done[index])toast('Marked complete ✓');
}
function enterBoard(){
 rollover();
 if(page!=='cover'||entryPending||state.lockdownActive)return;
 entryPending=true;boardReadyAt=Date.now()+850;
 const wipe=Q('entry-transition');
 wipe.classList.remove('is-active');
 void wipe.offsetWidth;
 wipe.classList.add('is-active');
 covers.board.classList.add('board-input-guard');
 setTimeout(()=>{
   if(page!=='cover'||state.lockdownActive)return;
   page='board';
   covers.board.classList.remove('is-hidden');
   covers.cover.classList.add('is-hidden');
   syncCoverVideo();
 },300);
 setTimeout(()=>{
   wipe.classList.remove('is-active');
   entryPending=false;
   covers.board.classList.remove('board-input-guard');
 },850);
}
function goCover(){page='cover';covers.cover.classList.remove('is-hidden');covers.board.classList.add('is-hidden');covers.board.classList.remove('board-input-guard');updateXP();syncCoverVideo();}

/* Portrait, silent cover animation. The original artwork remains visible as a fallback. */
const coverVideo=Q('cover-video');
const sealVideo=Q('seal-video');
function syncCoverVideo(){
 for(const video of [coverVideo,sealVideo]){
   if(!video)continue;
   video.muted=true;video.volume=0;
   if(page==='cover'&&!workOpen&&!document.hidden&&!state.lockdownActive){
     const promise=video.play();
     if(promise&&typeof promise.catch==='function')promise.catch(()=>{});
   }else{
     video.pause();
   }
 }
}
if(coverVideo){
 coverVideo.muted=true;
 coverVideo.addEventListener('playing',()=>Q('cover-stage').classList.add('has-video'));
 coverVideo.addEventListener('error',()=>Q('cover-stage').classList.remove('has-video'));
 coverVideo.addEventListener('stalled',()=>{if(coverVideo.readyState<2)Q('cover-stage').classList.remove('has-video');});
 coverVideo.addEventListener('loadeddata',()=>{if(page==='cover')syncCoverVideo();});
}

if(sealVideo){
 sealVideo.muted=true;
 sealVideo.addEventListener('playing',()=>Q('cover-stage').classList.add('has-seal-video'));
 sealVideo.addEventListener('error',()=>Q('cover-stage').classList.remove('has-seal-video'));
 sealVideo.addEventListener('loadeddata',()=>{if(page==='cover')syncCoverVideo();});
}
let lastTap=0,lastX=0,lastY=0;
Q('cover-stage').addEventListener('pointerup',e=>{
 if(page!=='cover'||(e.pointerType==='mouse'&&e.button!==0))return;
 const now=Date.now(),dist=Math.hypot(e.clientX-lastX,e.clientY-lastY);
 if(now-lastTap<370&&dist<55){lastTap=0;enterBoard();e.preventDefault();e.stopPropagation();}
 else{lastTap=now;lastX=e.clientX;lastY=e.clientY;}
});
Q('cover-stage').addEventListener('dblclick',e=>{if(page==='cover'){enterBoard();e.preventDefault();e.stopPropagation();}});
function openEditor(index){if(page!=='board'||Date.now()<boardReadyAt)return;rollover();editingSlot=index;const d=day();
 Q('editor-title').textContent=SECTIONS[index].name;Q('editor-overline').textContent=`${state.activeDay} / SLOT ${index+1}`;
 Q('editor-input').value=d.slots[index]||'';Q('slot-complete').checked=!!d.done[index];
 show('modal-shade');
}
function saveEditor(){if(editingSlot<0)return;const d=day(),i=editingSlot;
 d.slots[i]=Q('editor-input').value;d.done[i]=Q('slot-complete').checked;
 if(d.done[i]&&!d.earned[i])d.earned[i]=true;
 // If a day was already saved to Gallery, its latest state is still preserved.
 persist();renderSlots();updateXP();closeEditor();
}
function closeEditor(){Q('editor-input').blur();editingSlot=-1;hide('modal-shade');}
function archiveToday(){
 rollover();const d=day();d.archived=true;d.savedAt=new Date().toISOString();
 d.snapshot={slots:[...d.slots],done:[...d.done],savedAt:d.savedAt};
 persist();updateXP();toast('Today saved to Gallery ✓');
}
function openGallery(){rollover();const list=Q('gallery-list');list.textContent='';
 const keys=Object.keys(state.days).filter(k=>state.days[k].archived).sort().reverse();
 if(!keys.length){const e=document.createElement('div');e.className='gallery-empty';e.textContent='No archived days yet. Tap “SAVE TODAY TO GALLERY” on the board to keep a snapshot.';list.append(e);}
 keys.forEach(k=>{const d=state.days[k].snapshot||state.days[k],b=document.createElement('button');b.className='gallery-item';
 const thumb=document.createElement('img');thumb.src='board.jpg';thumb.alt='';
 const body=document.createElement('span');body.className='gallery-item-body';
 const name=document.createElement('strong');name.textContent=prettyDate(k,{weekday:'long',day:'numeric',month:'short',year:'numeric'});
 const meta=document.createElement('small');meta.textContent=`${d.done.filter(Boolean).length}/8 completed · ${d.slots.filter(v=>v&&v.trim()).length} notes`;
 body.append(name,meta);b.append(thumb,body);b.addEventListener('click',()=>openHistory(k));list.append(b);
 });show('gallery-shade');
}
function closeGallery(){hide('gallery-shade');}
function openHistory(key){selectedArchive=key;const d=state.days[key].snapshot||state.days[key];Q('history-title').textContent=prettyDate(key,{day:'numeric',month:'long',year:'numeric'});Q('history-status').textContent=`${d.done.filter(Boolean).length} / 8 COMPLETE · ${d.slots.filter(x=>x&&x.trim()).length} NOTES`;
 const layer=Q('history-slots');layer.textContent='';SECTIONS.forEach((s,i)=>{
 const v=document.createElement('div');v.className='history-slot'+(s.bottom?' history-bottom':'')+(s.bottomRight?' history-right':'');
 Object.assign(v.style,{left:s.x+'%',top:s.y+'%',width:s.w+'%',height:s.h+'%'});
 const content=document.createElement('span');content.textContent=d.slots[i]||'';v.append(content);
 if(d.done[i]){const check=document.createElement('b');check.textContent='✓';v.append(check);}layer.append(v);
 });hide('gallery-shade');show('history-shade');
 const poster=Q('history-board'); poster.style.width='';
 historyBaseWidth=poster.getBoundingClientRect().width;historyZoom=1;
 Q('history-scroll').scrollTop=0;Q('history-scroll').scrollLeft=0;
}
function changeHistoryZoom(direction){
 if(!Q('history-shade').classList.contains('open'))return;
 historyZoom=Math.max(1,Math.min(3,Math.round((historyZoom+direction*.5)*10)/10));
 Q('history-board').style.width=Math.round(historyBaseWidth*historyZoom)+'px';
}
window.onGallerySaved=function(success){
 toast(success==='ok'?'Saved to your phone gallery ✓':'Could not save image. Check Android storage settings.');
};
function saveHistoryToPhone(){
 if(!selectedArchive)return;
 const d=state.days[selectedArchive].snapshot||state.days[selectedArchive];
 const payload=JSON.stringify({date:selectedArchive,slots:d.slots,done:d.done});
 if(window.NativeAudio&&typeof window.NativeAudio.saveGalleryImage==='function'){
  try{window.NativeAudio.saveGalleryImage(payload);toast('Saving image to your gallery…');return;}
  catch(e){toast('Export failed: '+e.message);return;}
 }
 toast('Photo export is available in the Android app.');
}
function closeHistory(){hide('history-shade');openGallery();}
function show(id){const node=Q(id);node.classList.add('open');node.setAttribute('aria-hidden','false');}
function hide(id){const node=Q(id);node.classList.remove('open');node.setAttribute('aria-hidden','true');}
let toastTimer=null;
function toast(message){const node=Q('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2500);}

/* IN MOTION 2.7.6: persistent stopwatch and native Android YouTube shortcut. */
const STOPWATCH_STORAGE_KEY='inmotion-stopwatch-v1';
function loadStopwatch(){
 try{
  const v=JSON.parse(localStorage.getItem(STOPWATCH_STORAGE_KEY)||'null');
  if(v && Number.isFinite(v.elapsedMs) && Number.isFinite(v.startedAt)){
   return {elapsedMs:Math.max(0,v.elapsedMs),startedAt:v.startedAt,running:v.running===true};
  }
 }catch(e){}
 return {elapsedMs:0,startedAt:0,running:false};
}
let stopwatch=loadStopwatch(),stopwatchInterval=null;
function saveStopwatch(){
 try{localStorage.setItem(STOPWATCH_STORAGE_KEY,JSON.stringify(stopwatch));}catch(e){}
}
function stopwatchElapsed(){
 return Math.max(0,stopwatch.elapsedMs+(stopwatch.running?Math.max(0,Date.now()-stopwatch.startedAt):0));
}
function formatStopwatch(ms){
 const centiseconds=Math.floor(ms/10);
 const hh=Math.floor(centiseconds/360000);
 const mm=Math.floor(centiseconds/6000)%60;
 const ss=Math.floor(centiseconds/100)%60;
 const cs=centiseconds%100;
 return [hh,mm,ss].map(n=>String(n).padStart(2,'0')).join(':')+'.'+String(cs).padStart(2,'0');
}
function renderStopwatch(){
 const elapsed=stopwatchElapsed();
 Q('stopwatch-display').textContent=formatStopwatch(elapsed);
 Q('stopwatch-toggle').textContent=stopwatch.running?'PAUSE':'START';
 const seconds=Math.floor(elapsed/1000);
 const label=seconds>=3600
  ? Math.floor(seconds/3600)+'h'+String(Math.floor(seconds/60)%60).padStart(2,'0')
  : String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
 Q('stopwatch-mini').textContent=label;
 Q('stopwatch-launch').classList.toggle('stopwatch-running',stopwatch.running);
}
function openStopwatch(){
 if(page!=='board'||state.lockdownActive)return;
 renderStopwatch();
 show('stopwatch-shade');
 if(stopwatchInterval!==null)clearInterval(stopwatchInterval);
 stopwatchInterval=setInterval(()=>{
  if(!document.hidden && Q('stopwatch-shade').classList.contains('open'))renderStopwatch();
 },75);
}
function closeStopwatch(){
 hide('stopwatch-shade');
 if(stopwatchInterval!==null){clearInterval(stopwatchInterval);stopwatchInterval=null;}
}
function toggleStopwatch(){
 if(stopwatch.running){
  stopwatch.elapsedMs=stopwatchElapsed();stopwatch.startedAt=0;stopwatch.running=false;
 } else {
  stopwatch.startedAt=Date.now();stopwatch.running=true;
 }
 saveStopwatch();renderStopwatch();
}
function resetStopwatch(){
 stopwatch={elapsedMs:0,startedAt:0,running:false};saveStopwatch();renderStopwatch();
}
function openYouTube(){
 if(page!=='board'||state.lockdownActive)return;
 if(window.NativeAudio && typeof window.NativeAudio.openYouTube==='function'){
  try{window.NativeAudio.openYouTube();return;}catch(e){}
 }
 const newWindow=window.open('https://www.youtube.com','_blank');
 if(!newWindow)toast('Could not open YouTube.');
}

function isMuted(){if(nativeAvailable){try{return !!window.NativeAudio.isMuted();}catch(e){}}
 try{return localStorage.getItem('inmotion-mute')==='true';}catch(e){return false;}}
function setMuted(muted){try{localStorage.setItem('inmotion-mute',String(muted));}catch(e){}
 if(nativeAvailable){try{window.NativeAudio.setMuted(muted);}catch(e){}}
 else if(muted)Q('web-audio').pause();else Q('web-audio').play().catch(()=>{});
}
function applyTheme(){const dark=state.theme==='dark';document.body.classList.toggle('theme-dark',dark);Q('dark-enabled').checked=dark;
 document.querySelector('meta[name="theme-color"]').setAttribute('content',dark?'#090d10':'#ffffff');}
function openSettings(){Q('music-enabled').checked=!isMuted();Q('sound-enabled').checked=state.soundEnabled!==false;Q('dark-enabled').checked=state.theme==='dark';show('settings-shade');}
function closeSettings(){hide('settings-shade');}
Q('music-enabled').addEventListener('change',e=>setMuted(!e.target.checked));
Q('dark-enabled').addEventListener('change',e=>{state.theme=e.target.checked?'dark':'light';persist();applyTheme();});
Q('sound-enabled').addEventListener('change',e=>{state.soundEnabled=e.target.checked;persist();});
for(const id of ['modal-shade','settings-shade','gallery-shade','history-shade','stopwatch-shade','agent-shade'])Q(id).addEventListener('pointerdown',e=>{if(e.target===Q(id)){if(id==='modal-shade')closeEditor();else if(id==='settings-shade')closeSettings();else if(id==='gallery-shade')closeGallery();else if(id==='stopwatch-shade')closeStopwatch();else if(id==='agent-shade')closeInMotionAgent();else closeHistory();}});
// All pointer interactions: a single select sample through native SoundPool, or HTML audio in browsers.
const clickAudio=Q('web-click');let clickedAt=0;
document.addEventListener('pointerdown',()=>{
 if(state.soundEnabled===false)return;
 const now=Date.now();if(now-clickedAt<55)return;clickedAt=now;
 if(nativeAvailable){try{if(window.NativeAudio.playSelect()===true)return;}catch(e){}}
 try{clickAudio.pause();clickAudio.currentTime=0;clickAudio.play().catch(()=>{});}catch(e){}
},{passive:true,capture:true});




/* Clickable work animation must never count as cover double-tap. */
const workTrigger=Q('work-trigger');
if(workTrigger){
 for(const type of ['pointerup','dblclick'])workTrigger.addEventListener(type,e=>e.stopPropagation());
}
/* V2.9 Work Journal. Dates are generated on demand (30 at a time).
   Photos live in the private Android app directory, not localStorage. */
let workOpen=false,workLoaded=30,workPhotos=[],workExpanded=new Set(),workPhotoCache=new Map();
const workDate=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-n);return todayKey(d);};
const workLabel=k=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(k+'T12:00:00'));
function workReload(){
 try{workPhotos=JSON.parse(window.NativeAudio.listWorkPhotos());if(!Array.isArray(workPhotos))workPhotos=[];}
 catch(e){workPhotos=[];}
}
function workImage(id){
 if(workPhotoCache.has(id))return workPhotoCache.get(id);
 try{const src=window.NativeAudio.getWorkPhotoData(id);
  if(src&&src.startsWith('data:image/jpeg;base64,')){
   if(workPhotoCache.size>=20)workPhotoCache.clear();
   workPhotoCache.set(id,src);return src;
  }
 }catch(e){}
 return '';
}
function workRender(){
 const holder=Q('work-days');holder.textContent='';
 const keys=Array.from({length:workLoaded},(_,n)=>workDate(n));
 for(const image of workPhotos)if(image&&image.date&&!keys.includes(image.date))keys.push(image.date);
 keys.sort().reverse();
 for(const dayKey of keys){
  const pictures=workPhotos.filter(x=>x.date===dayKey);
  const card=document.createElement('section');card.className='work-day';
  const button=document.createElement('button');button.className='work-day-head';button.type='button';
  const header=document.createElement('span'),title=document.createElement('strong'),small=document.createElement('small');
  title.textContent=workLabel(dayKey);small.textContent=pictures.length+' PHOTO'+(pictures.length===1?'':'S');
  header.append(title,small);
  const arrow=document.createElement('span');arrow.className='work-chevron';arrow.textContent='›';
  button.append(header,arrow);
  const body=document.createElement('div');body.className='work-day-body';
  function expand(){
   body.textContent='';
   if(!pictures.length){const blank=document.createElement('div');blank.className='work-empty';blank.textContent='No photos for this day yet.';body.append(blank);}
   else{
    const grid=document.createElement('div');grid.className='work-thumbs';
    pictures.forEach(p=>{
     const tile=document.createElement('button');tile.className='work-thumb';tile.type='button';
     const img=document.createElement('img');img.loading='lazy';img.alt='Work photo';
     img.src=workImage(p.id);
     tile.append(img);tile.onclick=()=>openWorkPhoto(p.id);grid.append(tile);
    });body.append(grid);
   }
   const add=document.createElement('button');add.className='work-add-day';add.textContent='+ ADD PHOTOS TO '+dayKey;add.onclick=()=>addWorkPhotos(dayKey);body.append(add);
  }
  button.onclick=()=>{const show=!card.classList.contains('open');card.classList.toggle('open',show);if(show){workExpanded.add(dayKey);expand();}else workExpanded.delete(dayKey);};
  card.append(button,body);holder.append(card);
  if(workExpanded.has(dayKey)||(!workExpanded.size&&dayKey===todayKey())){card.classList.add('open');expand();}
 }
 Q('work-more').hidden=workLoaded>=3650;
}
function openWorkJournal(){
 if(page!=='cover'||state.lockdownActive)return;
 workOpen=true;Q('work-date').value=todayKey();
 workReload();workRender();show('work-shade');syncCoverVideo();
 if(window.NativeAudio?.setWorkMode)try{window.NativeAudio.setWorkMode(true);}catch(e){}
}
function closeWorkJournal(){
 closeWorkPhoto();workOpen=false;hide('work-shade');syncCoverVideo();
 if(window.NativeAudio?.setWorkMode)try{window.NativeAudio.setWorkMode(false);}catch(e){}
}
function loadMoreWorkDays(){const y=Q('work-scroll').scrollTop;workLoaded=Math.min(workLoaded+30,3650);workRender();Q('work-scroll').scrollTop=y;}
function addWorkPhotos(date){
 const chosen=date||Q('work-date').value||todayKey();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(chosen)||chosen>todayKey()){toast('Choose today or a past date');return;}
 if(!window.NativeAudio?.pickWorkPhotos){toast('Photo picker requires Android');return;}
 try{window.NativeAudio.pickWorkPhotos(chosen);}catch(e){toast('Photo picker unavailable');}
}
window.onWorkPhotosChanged=message=>{workReload();workPhotoCache.clear();if(workOpen){workRender();toast(message||'Photos saved');}};
function openWorkPhoto(id){
 const src=workImage(id);if(!src){toast('Photo unavailable');return;}
 Q('work-lightbox-photo').src=src;show('work-lightbox');
}
function closeWorkPhoto(){
 hide('work-lightbox');Q('work-lightbox-photo').removeAttribute('src');
}

/* AI can be called only after the user configures a private HTTPS proxy.
   Memory is not uploaded unless the checkbox is ticked. */
let aiAvailable=false,aiPending=false;
function loadAIConnection(){
 try{const info=JSON.parse(window.NativeAudio.getAIConfiguration());
  aiAvailable=!!info.configured;
  Q('ai-endpoint').value=info.endpoint||'';
 }catch(e){aiAvailable=false;}
 Q('agent-connect-status').textContent=aiAvailable?'GPT SETUP SAVED · CONNECTION UNTESTED':'LOCAL MODE · AI NOT CONFIGURED';
 const intro=Q('agent-shade').querySelector('.agent-description');
 if(intro)intro.textContent=aiAvailable
  ?'Ask GPT using your private connection. Your saved notes are only shared when you choose the checkbox.'
  :'Search your daily notes, completed tasks, Gallery and Guardian history privately on this device.';
}
function saveAIConnection(){
 const url=Q('ai-endpoint').value.trim(),token=Q('ai-token').value.trim();
 if(!/^https:\/\/[^\s/]+\/chat\/?$/.test(url)||!token){toast('HTTPS /chat URL and pairing token required');return;}
 if(!window.NativeAudio?.saveAIConfiguration){toast('Android required for setup');return;}
 try{if(window.NativeAudio.saveAIConfiguration(url,token)){Q('ai-token').value='';loadAIConnection();toast('AI connection saved ✓');}else toast('Could not save connection');}catch(e){toast('Setup failed');}
}
function openChatGPTShortcut(){
 if(window.NativeAudio&&typeof window.NativeAudio.openChatGPT==='function'){
  try{window.NativeAudio.openChatGPT();return;}catch(e){}
 }
 window.open('https://chatgpt.com','_blank');
}
function clearAIConnection(){
 try{window.NativeAudio?.clearAIConfiguration();}catch(e){}
 Q('ai-endpoint').value='';Q('ai-token').value='';loadAIConnection();toast('AI disconnected');
}
function aiSelectedMemory(query){
 const words=String(query).toLocaleLowerCase('tr-TR').match(/[\p{L}\p{N}]{3,}/gu)||[];
 return agentDocuments().map(x=>{
  const haystack=(x.title+' '+x.note).toLocaleLowerCase('tr-TR');
  const score=words.reduce((n,w)=>n+(haystack.includes(w)?2:0),0)+(x.date===state.activeDay?1:0);
  return {...x,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score)
 .slice(0,8).map(x=>x.date+' | '+x.title+': '+x.note.slice(0,550)).join('\n').slice(0,5000);
}
window.onInMotionAIResult=function(ok,text){
 aiPending=false;const message=String(text||'').slice(0,4200);
 agentAddMessage('assistant',ok?message:'AI connection failed: '+message+'\nLocal search remains available.');
};

/* IN MOTION 2.8 — on-device personal memory, never transmitted to an API.
   A deterministic local search / recap, NOT a remotely connected AI model. */
const AGENT_MAX_MESSAGES=36;
const AGENT_STOPWORDS=new Set([
 've','veya','bir','bu','ben','bana','benim','ile','icin','için','ne','neler','nedir',
 'hakkinda','hakkında','bunu','olan','oldu','gibi','nerede','hangi','var','yok',
 'the','and','for','what','how','when','from','my','me','did','does','about',
 'please','today','yesterday','notlarım','notları','notlar','some','show'
]);
function agentDocuments(){
 const items=[];
 const keys=Object.keys(state.days||{}).sort().reverse();
 for(const key of keys){
  const stored=state.days[key]||{};
  const snap=stored.snapshot||stored;
  const sourceSlots=key===state.activeDay?stored.slots:snap.slots;
  const sourceDone=key===state.activeDay?stored.done:snap.done;
  const slots=Array.isArray(sourceSlots)?sourceSlots:[];
  const done=Array.isArray(sourceDone)?sourceDone:[];
  for(let i=0;i<8;i++){
   const note=String(slots[i]||'').trim();
   if(!note)continue;
   items.push({date:key,kind:'note',title:SECTIONS[i].name,note,
               completed:done[i]===true});
  }
 }
 if(Array.isArray(state.overrideLog)){
  for(const entry of state.overrideLog){
   if(!entry||!entry.note)continue;
   const date=String(entry.time||'').slice(0,10)||todayKey();
   items.push({date,kind:'override',title:'Guardian Override',note:String(entry.note),completed:false});
  }
 }
 return items;
}
function agentSummaryForDate(key){
 const d=state.days&&state.days[key];
 if(!d)return 'No saved records for '+key+'.';
 const source=(key===state.activeDay?d:(d.snapshot||d));
 const slots=Array.isArray(source.slots)?source.slots:[];
 const done=Array.isArray(source.done)?source.done:[];
 const lines=[key===todayKey()?'TODAY · '+key:key,
   'Completed: '+done.filter(Boolean).length+'/8 · Notes: '+slots.filter(t=>String(t||'').trim()).length+'/8'];
 for(let i=0;i<8;i++){
  const note=String(slots[i]||'').trim();
  if(note)lines.push((done[i]?'✓ ':'○ ')+SECTIONS[i].name+': '+note.slice(0,450));
  else if(done[i])lines.push('✓ '+SECTIONS[i].name+' (no note)');
 }
 if(lines.length===2)lines.push('No notes yet. Double-tap the cover to start today’s page.');
 return lines.join('\n');
}
function agentResponse(rawQuery){
 const query=String(rawQuery||'').trim().slice(0,600);
 if(!query)return 'Write a question or tap TODAY, HISTORY or OVERRIDES.';
 const q=query.toLocaleLowerCase('tr-TR');
 if(/^(hi|hey|hello|merhaba|selam|help|yardım|ne yapabilirsin)/.test(q))
  return 'I can summarize your daily page, find past notes by keyword, show completion counts and look up Guardian overrides. I am an on-device search assistant in this version, not yet connected to ChatGPT.\n\nTry: “Bugün ne yaptım?”, “geçen hafta toplantı”, or “son Guardian notum”.';
 if(/\b(bugün|bugun|today|şimdi)\b/u.test(q)||q==='today')
  return agentSummaryForDate(state.activeDay);
 if(/\b(dün|dun|yesterday)\b/u.test(q)){
  const prior=new Date();prior.setDate(prior.getDate()-1);
  return agentSummaryForDate(todayKey(prior));
 }
 if(/\b(guardian|override|disruption|lockdown|reassurer)\b/u.test(q) ||
    /son (kriz|müdahale|müdahalem)/u.test(q)){
  const logs=Array.isArray(state.overrideLog)?state.overrideLog:[];
  if(!logs.length)return 'No Guardian Override entries are saved on this device yet.';
  return 'GUARDIAN OVERRIDE LOG · '+logs.length+' entries\n\n'+logs.slice(-5).reverse()
    .map((v,i)=>String(v.time||'').replace('T',' ').slice(0,16)+':\n'+String(v.note||'').slice(0,1100)).join('\n\n');
 }
 if(/\b(gallery|history|archive|geçmiş|gecmis|arşiv|arsiv|hafta|week|günler|gunler)\b/u.test(q)){
  const keys=Object.keys(state.days||{}).sort().reverse();
  const archive=keys.filter(k=>state.days[k]&&state.days[k].archived);
  const completed=keys.reduce((sum,k)=>{
   const d=state.days[k]||{};return sum+(Array.isArray(d.done)?d.done.filter(Boolean).length:0);
  },0);
  return 'LOCAL HISTORY\n'+keys.length+' recorded days · '+archive.length+' days in Gallery · '+completed+' current completion marks across days.\n\n'
   +keys.slice(0,12).map(k=>{
     const d=state.days[k]||{},v=k===state.activeDay?d:(d.snapshot||d);
     return k+' · '+(Array.isArray(v.done)?v.done.filter(Boolean).length:0)+'/8 complete · '+(Array.isArray(v.slots)?v.slots.filter(t=>String(t||'').trim()).length:0)+' notes';
   }).join('\n');
 }
 const documents=agentDocuments();
 const words=(q.match(/[\p{L}\p{N}]{2,}/gu)||[]).filter(x=>!AGENT_STOPWORDS.has(x));
 if(!words.length)return 'Try a more specific keyword, such as a project, task, topic or person mentioned in your notes.';
 const candidates=documents.map(item=>{
   const body=(item.note+' '+item.title).toLocaleLowerCase('tr-TR');
   let score=0;
   for(const word of words)if(body.includes(word))score+=word.length>=5?3:2;
   if(body.includes(q))score+=10;
   return {...item,score};
 }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||b.date.localeCompare(a.date));
 if(!candidates.length)
  return 'I searched '+documents.length+' local notes/overrides and could not find "'+query+'". Try fewer or different words. Nothing was sent online.';
 return 'FOUND '+candidates.length+' MATCH'+(candidates.length!==1?'ES':'')+' IN YOUR LOCAL RECORDS\n\n'
  +candidates.slice(0,6).map(item=>item.date+' · '+item.title+(item.completed?' ✓':'')+'\n'+item.note.slice(0,650)).join('\n\n');
}
function agentAddMessage(who,message,save=true){
 const area=Q('agent-messages');
 const node=document.createElement('article');node.className='agent-message '+(who==='user'?'user':'assistant');
 const label=document.createElement('small');label.textContent=who==='user'?'YOU':'IN MOTION · LOCAL';
 const text=document.createElement('div');text.textContent=message;
 node.append(label,text);area.append(node);area.scrollTop=area.scrollHeight;
 if(save){
  if(!Array.isArray(state.agentChat))state.agentChat=[];
  state.agentChat.push({who,message:String(message).slice(0,4000)});
  if(state.agentChat.length>AGENT_MAX_MESSAGES)state.agentChat=state.agentChat.slice(-AGENT_MAX_MESSAGES);
  persist();
 }
}
function openInMotionAgent(){loadAIConnection();
 if(state.lockdownActive)return;
 rollover();
 const area=Q('agent-messages');area.textContent='';
 const messages=Array.isArray(state.agentChat)?state.agentChat.slice(-AGENT_MAX_MESSAGES):[];
 if(!messages.length)agentAddMessage('assistant','Your personal log is ready. Ask me about today, search an older note or review Guardian overrides. I only search records stored in this app; AI conversation will require a separate secure connection.',false);
 else for(const item of messages)agentAddMessage(item.who==='user'?'user':'assistant',String(item.message||''),false);
 show('agent-shade');
}
function closeInMotionAgent(){hide('agent-shade');Q('agent-input').blur();}
function submitAgentQuery(){
 const input=Q('agent-input'),query=input.value.trim();if(!query||aiPending)return;
 input.value='';agentAddMessage('user',query.slice(0,600));
 if(aiAvailable&&window.NativeAudio?.askInMotionAI){
  aiPending=true;
  const memory=Q('agent-include-memory').checked?aiSelectedMemory(query):'';
  agentAddMessage('assistant','Thinking with connected GPT…');
  try{window.NativeAudio.askInMotionAI(JSON.stringify({question:query.slice(0,1200),context:memory}));return;}
  catch(e){aiPending=false;}
 }
 agentAddMessage('assistant',agentResponse(query).slice(0,4400));
}
function askAgentPreset(which){
 const choice={today:'Bugün ne yaptım?',history:'Geçmiş kayıtlarım',overrides:'Son Guardian Override kayıtlarım'};
 Q('agent-input').value=choice[which]||'';
 submitAgentQuery();
}
function clearInMotionChat(){
 state.agentChat=[];persist();
 Q('agent-messages').textContent='';
 agentAddMessage('assistant','Conversation cleared. Your daily notes, Gallery and Guardian records are unchanged.',false);
}
Q('agent-input').addEventListener('keydown',e=>{
 if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
  e.preventDefault();submitAgentQuery();
 }
});

/* Dictation uses the Android device's installed speech recognizer.
   It may depend on a recognition service/network; NOT ChatGPT voice. */
let currentSpeechTarget=null,webRecognizer=null;
function insertDictatedText(element,words){
 const value=String(words||'').trim();if(!value||!element)return;
 const first=typeof element.selectionStart==='number'?element.selectionStart:element.value.length;
 const last=typeof element.selectionEnd==='number'?element.selectionEnd:first;
 const separator=first>0&&element.value[first-1]&&!/\s/.test(element.value[first-1])?' ':'';
 element.value=element.value.slice(0,first)+separator+value+element.value.slice(last);
 const pos=first+separator.length+value.length;
 try{element.setSelectionRange(pos,pos);}catch(e){}
 element.dispatchEvent(new Event('input',{bubbles:true}));
 element.focus();
}
function startInMotionSpeech(target){
 if(!['editor','lockdown','agent'].includes(target))return;
 if(state.lockdownActive&&target!=='lockdown')return;
 const node=target==='editor'?Q('editor-input'):target==='lockdown'?Q('lockdown-notes'):Q('agent-input');
 if(!node)return;
 if(target==='editor'&&!Q('modal-shade').classList.contains('open'))return;
 if(target==='agent'&&!Q('agent-shade').classList.contains('open'))return;
 currentSpeechTarget=target;
 if(window.NativeAudio&&typeof window.NativeAudio.startVoiceInput==='function'){
  try{window.NativeAudio.startVoiceInput(target);return;}catch(e){/* use browser fallback */}
 }
 const SpeechApi=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SpeechApi){toast('Speech recognition is not available. You can still type your notes.');return;}
 try{
  if(webRecognizer)webRecognizer.abort();
  const recognizer=new SpeechApi();webRecognizer=recognizer;
  recognizer.lang=navigator.language||'tr-TR';
  recognizer.interimResults=false;recognizer.maxAlternatives=1;
  recognizer.onresult=e=>window.onInMotionSpeechResult(target,e.results[0][0].transcript);
  recognizer.onerror=e=>window.onInMotionSpeechError(target,e.error||'Speech recognition failed');
  recognizer.start();toast('Listening…');
 }catch(e){window.onInMotionSpeechError(target,'Speech recognizer unavailable');}
}
window.onInMotionSpeechResult=function(target,result){
 if(!['editor','lockdown','agent'].includes(target))return;
 const input=target==='editor'?Q('editor-input'):target==='lockdown'?Q('lockdown-notes'):Q('agent-input');
 if(target==='lockdown'&&!state.lockdownActive)return;
 insertDictatedText(input,result);
 toast('Voice note inserted ✓');
 currentSpeechTarget=null;
};
window.onInMotionSpeechError=function(target,message){
 currentSpeechTarget=null;
 toast('Voice input: '+String(message||'not available').slice(0,75));
};

const REASSURER_PROMPT='Based on the situation described above, create a personalized Reassurer that addresses my concerns, neutralizes the internal negotiation, and helps me return to decisive action.';
async function copyLockdownForChatGPT(){
 if(!state.lockdownActive)return;
 const note=Q('lockdown-notes').value.trim();
 if(!note){
  Q('lockdown-instruction').textContent='Describe the disruption first, then copy it for ChatGPT.';
  Q('lockdown-notes').focus();
  return;
 }
 const full=note+'\n\n"'+REASSURER_PROMPT+'"';
 if(window.NativeAudio&&typeof window.NativeAudio.copyText==='function'){
  try{
   if(window.NativeAudio.copyText(full)){toast('Disruption + Reassurer prompt copied ✓');return;}
  }catch(e){}
 }
 try{
  if(navigator.clipboard&&navigator.clipboard.writeText){
   await navigator.clipboard.writeText(full);toast('Copied for ChatGPT ✓');return;
  }
 }catch(e){}
 const input=document.createElement('textarea');input.value=full;input.setAttribute('readonly','');
 input.style.cssText='position:fixed;top:-2000px;opacity:0';
 document.body.append(input);input.select();
 let copied=false;try{copied=document.execCommand('copy');}catch(e){}
 input.remove();
 toast(copied?'Copied for ChatGPT ✓':'Unable to copy. Select the text manually.');
}

/* Seal protection · five deliberate taps within five seconds. */
function setLockdownView(active){
 const shade=Q('lockdown-shade');
 shade.classList.toggle('open',active);
 shade.setAttribute('aria-hidden',active?'false':'true');
 if(active)Q('lockdown-notes').value=state.lockdownDraft||'';
 const nativeLockdown=window.NativeAudio&&typeof window.NativeAudio.setLockdown==='function';
 if(nativeLockdown){
  try{window.NativeAudio.setLockdown(active);}catch(e){}
 }
 // Local browser preview fallback. Android uses its native looping MediaPlayer.
 const music=Q('web-lockdown'),normalMusic=Q('web-audio');
 if(!nativeLockdown){
   if(active){
     if(normalMusic)normalMusic.pause();
     if(music){music.currentTime=0;music.play().catch(()=>{});}
   }else{
     if(music){music.pause();music.currentTime=0;}
     if(normalMusic&&!isMuted())normalMusic.play().catch(()=>{});
   }
 }
 syncCoverVideo();
}
function triggerLockdown(){
 if(state.lockdownActive)return;
 state.lockdownActive=true;state.lockdownDraft='';persist();
 sealTapTimes=[];setLockdownView(true);
}
function completeLockdown(){
 const value=Q('lockdown-notes').value.trim();
 if(!value){Q('lockdown-instruction').textContent='Write your next concrete action before restoring control.';Q('lockdown-notes').focus();return;}
 if(!Array.isArray(state.overrideLog))state.overrideLog=[];
 state.overrideLog.push({time:new Date().toISOString(),note:value});
 state.lockdownActive=false;state.lockdownDraft='';
 persist();setLockdownView(false);
 Q('lockdown-instruction').textContent='Write at least one line to override. Your notes are stored on this device.';
 toast('Override complete. Seal intact.');
}
const sealTrigger=Q('seal-trigger');
sealTrigger.addEventListener('pointerup',e=>e.stopPropagation());
sealTrigger.addEventListener('dblclick',e=>e.stopPropagation());
sealTrigger.addEventListener('click',e=>{
 e.stopPropagation();
 if(page!=='cover'||state.lockdownActive)return;
 const now=Date.now();sealTapTimes=sealTapTimes.filter(t=>now-t<5000);
 sealTapTimes.push(now);
 if(sealTapTimes.length>=5){triggerLockdown();}
 else if(sealTapTimes.length>=3){toast(`OVERRIDE: ${sealTapTimes.length}/5`);}
});
Q('lockdown-notes').addEventListener('input',()=>{
 if(!state.lockdownActive)return;
 state.lockdownDraft=Q('lockdown-notes').value;persist();
});

window.handleAndroidBack=()=>{if(state.lockdownActive)return true;if(Q('work-lightbox').classList.contains('open')){closeWorkPhoto();return true;}if(workOpen){closeWorkJournal();return true;}if(Q('agent-shade').classList.contains('open')){closeInMotionAgent();return true;}if(Q('stopwatch-shade').classList.contains('open')){closeStopwatch();return true;}if(Q('modal-shade').classList.contains('open')){closeEditor();return true;}
 if(Q('settings-shade').classList.contains('open')){closeSettings();return true;}
 if(Q('history-shade').classList.contains('open')){closeHistory();return true;}
 if(Q('gallery-shade').classList.contains('open')){closeGallery();return true;}
 if(page==='board'){goCover();return true;}return false;};
function prepareAmbient(){const parent=Q('leaves');for(let i=0;i<20;i++){
 const el=document.createElement('span');el.className='wind-leaf'+(i%3===0?' tiny':'');
 el.style.left=(5+(i*73)%34)+'%';el.style.top=(16+(i*29)%19)+'%';el.style.animationDuration=(4.9+(i%7)*.9)+'s';el.style.animationDelay=(-i*.45)+'s';parent.append(el);
 }}
if(!nativeAvailable&&!isMuted()){
 Q('web-audio').play().catch(()=>{});
 document.addEventListener('pointerdown',()=>{if(!isMuted()&&Q('web-audio').paused)Q('web-audio').play().catch(()=>{});},{passive:true});
}
renderSlots();updateDate();updateXP();applyTheme();prepareAmbient();persist();renderStopwatch();
setInterval(()=>{if(stopwatch.running&&!document.hidden)renderStopwatch();},800);
if(state.lockdownActive)setLockdownView(true);else syncCoverVideo();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){rollover();updateDate();updateXP();}syncCoverVideo();});
setInterval(()=>{rollover();updateDate();},30000);
