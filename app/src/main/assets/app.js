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
 mediaReload();renderSlotMedia();
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
 });renderHistoryAttachments(key);hide('gallery-shade');show('history-shade');
 const poster=Q('history-board'); poster.style.width='';
 historyBaseWidth=poster.getBoundingClientRect().width;historyZoom=1;
 Q('history-scroll').scrollTop=0;Q('history-scroll').scrollLeft=0;
}
function renderHistoryAttachments(date){
 mediaReload();
 const host=Q('history-media-list');host.textContent='';
 let count=0;
 for(let i=0;i<8;i++){
  const attachments=mediaItems('slot'+i,date);
  if(!attachments.length)continue;
  count+=attachments.length;
  const block=document.createElement('section');block.className='history-media-section';
  const title=document.createElement('strong');title.textContent=SECTIONS[i].name;
  const grid=document.createElement('div');grid.className='media-grid';
  attachments.forEach(item=>grid.append(makeMediaCard(item,true)));
  block.append(title,grid);host.append(block);
 }
 if(!count){
  const empty=document.createElement('small');empty.className='media-empty';
  empty.textContent='No photo or video attachments saved for this day.';
  host.append(empty);
 }
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
function openSettings(){Q('music-enabled').checked=!isMuted();Q('sound-enabled').checked=state.soundEnabled!==false;Q('dark-enabled').checked=state.theme==='dark';hydrateIdentitySettings();show('settings-shade');}
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

/* IN MOTION 3.2 — unified local attachments.
   Android stores the images/videos in app-private files; only bounded metadata
   is held in JS. Neither the photos nor video bytes are sent to GPT. */
let allMediaEntries=[],removalPendingId='';
function mediaReload(){
 try{
  const native=window.NativeAudio;
  if(native&&typeof native.listAllMedia==='function'){
   const found=JSON.parse(native.listAllMedia());
   allMediaEntries=Array.isArray(found)?found:[];
  }else{
   const found=JSON.parse(native.listWorkPhotos());
   allMediaEntries=Array.isArray(found)?found.map(x=>({...x,kind:'image',legacy:true})):[];
  }
 }catch(e){allMediaEntries=[];}
 return allMediaEntries;
}
function mediaItems(category,date){
 return allMediaEntries.filter(x=>x&&x.category===category&&x.date===date);
}
function mediaData(id){
 try{
  const native=window.NativeAudio;
  if(native&&typeof native.getMediaImageData==='function')
   return native.getMediaImageData(id);
  return native.getWorkPhotoData(id);
 }catch(e){return '';}
}
function addSlotMedia(kind){
 if(editingSlot<0||page!=='board')return;
 pickMedia(kind,state.activeDay,'slot'+editingSlot);
}
function addJournalMedia(kind,date){
 if(!workOpen)return;
 const key=date||Q('work-date').value||todayKey();
 pickMedia(kind,key,journalMode);
}
function pickMedia(kind,date,category){
 if(kind!=='image'&&kind!=='video')return;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){toast('Choose a valid date');return;}
 if(!window.NativeAudio||typeof window.NativeAudio.pickInMotionMedia!=='function'){
  toast('Media attachments require Android.');return;
 }
 try{window.NativeAudio.pickInMotionMedia(kind,date,category);}
 catch(e){toast('Could not open the media picker');}
}
function makeMediaCard(item,readonly=false){
 const tile=document.createElement('div');tile.className='media-tile';
 const button=document.createElement('button');button.type='button';button.className='media-open';
 const isVideo=item.kind==='video',isFile=item.kind==='file';const name=String(item.name||'').slice(0,90);
 button.setAttribute('aria-label',isVideo?'Play video '+name:'View photo '+name);
 if(isFile){const symbol=document.createElement('span');symbol.className='media-play-icon';symbol.textContent='▤';
  const tag=document.createElement('small');tag.textContent=name||'FILE';
  button.append(symbol,tag);button.onclick=()=>{try{window.NativeAudio.openInMotionFile(item.id);}catch(e){toast('File viewer unavailable');}};
 }else if(isVideo){
  const symbol=document.createElement('span');symbol.className='media-play-icon';symbol.textContent='▶';
  const tag=document.createElement('small');tag.textContent=name||'SAVED VIDEO';
  button.append(symbol,tag);button.onclick=()=>playSavedMedia(item.id);
 }else{
  const img=document.createElement('img');img.loading='lazy';img.alt=name||'Saved photo';
  img.src=workImage(item.id);
  button.append(img);button.onclick=()=>openWorkPhoto(item.id);
 }
 const del=document.createElement('button');del.type='button';del.className='media-delete';
 del.setAttribute('aria-label','Remove saved attachment');
 del.textContent='×';del.addEventListener('click',()=>{
  if(removalPendingId!==item.id){
   removalPendingId=item.id;del.textContent='DELETE?';return;
  }
  removalPendingId='';
  try{
   if(window.NativeAudio?.deleteInMotionMedia?.(item.id)){
    mediaReload();workPhotoCache.clear();
    if(workOpen)workRender();
    if(editingSlot>=0)renderSlotMedia();
    toast('Attachment removed');
   }else toast('Could not remove this attachment');
  }catch(e){toast('Could not remove attachment')}
 });
 tile.append(button);if(!readonly)tile.append(del);
 return tile;
}
function playSavedMedia(id){
 if(!window.NativeAudio||typeof window.NativeAudio.playInMotionVideo!=='function'){
  toast('Video playback requires Android.');return;
 }
 try{window.NativeAudio.playInMotionVideo(id);}catch(e){toast('Could not open video player');}
}
function renderSlotMedia(){
 const target=Q('slot-media-grid');
 if(!target||editingSlot<0)return;
 target.textContent='';
 const attachments=mediaItems('slot'+editingSlot,state.activeDay);
 Q('slot-media-count').textContent=attachments.length+' SAVED';
 if(!attachments.length){
  const empty=document.createElement('small');empty.className='media-empty';
  empty.textContent='No attachments for this slot yet.';target.append(empty);return;
 }
 attachments.forEach(item=>target.append(makeMediaCard(item)));
}
window.onInMotionMediaChanged=function(message){
 mediaReload();workPhotoCache.clear();
 if(editingSlot>=0)renderSlotMedia();
 if(workOpen)workRender();
 if(openProjectId)projectDetailMedia();
 if(openProgramDayId>=0)renderProgramDayImages();
 toast(String(message||'Media saved').slice(0,100));
};


/* IN MOTION 3.3 — projects, linked journal entries and 6 editable programs.
   Metadata and notes remain in the private WebView store; media bytes stay
   in Android app-private storage and are not sent to GPT. */
const PROJECT_STORAGE='inmotion_projects_v33',TAG_STORAGE='inmotion_project_tags_v33',
      PROGRAM_STORAGE='inmotion_six_programs_v33';
const projectGroups={active:'ACTIVE PROJECTS',archived:'ARCHIVED PROJECTS',potential:'POTENTIAL LIST'};
const programDays=['LEGS','ARMS','SHOULDER','CHEST','BACK','TRICEPS'];
const projectDefaultDate='2000-01-01';
function readSavedObject(key,fallback){
 try{const item=JSON.parse(localStorage.getItem(key)||'null');return item&&typeof item==='object'?item:fallback;}catch(e){return fallback;}
}
let projects=readSavedObject(PROJECT_STORAGE,{});
let projectTags=readSavedObject(TAG_STORAGE,{});
let sixPrograms=readSavedObject(PROGRAM_STORAGE,{});
let projectGroup='active',openProjectId=null,openProgramDayId=-1,dynamicSpeechInputId='';
function saveAppObject(key,value){
 try{localStorage.setItem(key,JSON.stringify(value));return true;}
 catch(e){toast('Storage full — could not save');return false;}
}
function freshProjectId(){return 'project-'+[8,4,4,4,12].map(n=>Array.from({length:n},()=>Math.floor(Math.random()*16).toString(16)).join('')).join('-');}
function openProjectCategory(category){
 if(!projectGroups[category]||!workOpen||journalMode!=='work')return;
 projectGroup=category;
 Q('project-category-title').textContent=projectGroups[category];
 Q('project-category-description').textContent={
  active:'Projects currently in motion.',
  archived:'Completed or paused projects you chose to archive.',
  potential:'Ideas and opportunities that may become active projects.'
 }[category];
 projectCategoryRender();show('project-category-shade');
}
function projectCategoryRender(){
 const list=Q('project-category-list');list.textContent='';
 const matching=Object.values(projects).filter(p=>p&&p.status===projectGroup).sort((a,b)=>a.name.localeCompare(b.name));
 if(!matching.length){
  const empty=document.createElement('p');empty.className='project-empty';
  empty.textContent='No projects here yet. Tap + NEW PROJECT.';list.append(empty);
 }
 matching.forEach(project=>{
  const btn=document.createElement('button');btn.type='button';btn.className='project-list-button';
  const name=document.createElement('strong');name.textContent=project.name||'Untitled project';
  const meta=document.createElement('small');meta.textContent=(project.tasks||[]).length+' TASKS · '+(project.note?.trim()?'NOTES SAVED':'NEW');
  btn.append(name,meta);btn.onclick=()=>openProjectDetail(project.id);list.append(btn);
 });
}
function closeProjectCategory(){hide('project-category-shade');}
function createProject(){
 const id=freshProjectId();
 projects[id]={id,name:'New Project',status:projectGroup,note:'',tasks:[],createdAt:Date.now()};
 if(!saveAppObject(PROJECT_STORAGE,projects))return;
 projectCategoryRender();openProjectDetail(id);
}
function openProjectDetail(id){
 const p=projects[id];if(!p)return;
 openProjectId=id;
 Q('project-name').value=p.name||'';
 Q('project-description').value=p.note||'';
 Q('project-detail-title').textContent=p.name||'PROJECT';
 Q('project-status-button').textContent='MOVE CATEGORY · '+projectGroups[p.status];
 projectDetailMedia();renderProjectTasks();show('project-detail-shade');
}
function saveProject(){
 const p=projects[openProjectId];if(!p)return;
 p.name=Q('project-name').value.trim().slice(0,120)||'Untitled Project';
 p.note=Q('project-description').value.slice(0,12000);p.updatedAt=Date.now();
 saveAppObject(PROJECT_STORAGE,projects);
 Q('project-detail-title').textContent=p.name;
 if(Q('project-category-shade').classList.contains('open'))projectCategoryRender();
 if(workOpen&&journalMode==='work')workRender();
 toast('Project saved ✓');
}
function closeProjectDetail(){
 if(openProjectId&&Q('project-detail-shade').classList.contains('open'))saveProject();
 openProjectId=null;hide('project-detail-shade');
}
function cycleProjectStatus(){
 const p=projects[openProjectId];if(!p)return;
 saveProject();
 const order=['active','archived','potential'];
 p.status=order[(order.indexOf(p.status)+1)%3];
 saveAppObject(PROJECT_STORAGE,projects);
 Q('project-status-button').textContent='MOVE CATEGORY · '+projectGroups[p.status];
 if(Q('project-category-shade').classList.contains('open'))projectCategoryRender();
 toast('Moved to '+projectGroups[p.status]);
}
function projectDetailMedia(){
 mediaReload();const holder=Q('project-media-grid');holder.textContent='';
 if(!openProjectId)return;
 const matches=mediaItems(openProjectId,projectDefaultDate);
 if(!matches.length){const empty=document.createElement('small');empty.className='media-empty';empty.textContent='No files, images or videos attached.';holder.append(empty);}
 matches.forEach(item=>holder.append(makeMediaCard(item)));
}
function addProjectAttachment(kind){
 if(!openProjectId)return;saveProject();
 pickMedia(kind,projectDefaultDate,openProjectId);
}
function fmtTaskDuration(ms){
 const sec=Math.floor(Math.max(0,ms)/1000);
 return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(n=>String(n).padStart(2,'0')).join(':');
}
function durationForTask(t){
 return (Number(t.elapsedMs)||0)+(t.running&&t.startedAt?Math.max(0,Date.now()-t.startedAt):0);
}
function renderProjectTasks(){
 const host=Q('project-task-list');host.textContent='';
 const p=projects[openProjectId];if(!p)return;
 (p.tasks||[]).forEach(t=>{
  const row=document.createElement('div');row.className='project-task-row';
  const box=document.createElement('input');box.type='checkbox';box.checked=!!t.done;
  box.onchange=()=>{t.done=box.checked;saveAppObject(PROJECT_STORAGE,projects);renderProjectTasks();};
  const name=document.createElement('span');name.textContent=t.label;name.className=t.done?'task-done':'';
  const time=document.createElement('span');time.className='task-time';time.textContent=fmtTaskDuration(durationForTask(t));
  time.dataset.taskId=t.id;
  const toggle=document.createElement('button');toggle.type='button';
  toggle.textContent=t.running?'⏸ STOP':'▶ START';
  toggle.onclick=()=>{
   const current=Date.now();
   if(t.running){t.elapsedMs=durationForTask(t);t.startedAt=0;t.running=false;}
   else{t.running=true;t.startedAt=current;}
   saveAppObject(PROJECT_STORAGE,projects);renderProjectTasks();
  };
  const remove=document.createElement('button');remove.type='button';remove.className='task-delete';remove.textContent='×';
  remove.onclick=()=>{if(t.running){t.elapsedMs=durationForTask(t);t.running=false;}p.tasks=p.tasks.filter(x=>x.id!==t.id);saveAppObject(PROJECT_STORAGE,projects);renderProjectTasks();};
  row.append(box,name,time,toggle,remove);host.append(row);
 });
}
function addProjectTask(){
 const p=projects[openProjectId],input=Q('project-new-task');
 if(!p||!input.value.trim())return;
 saveProject();p.tasks=p.tasks||[];
 p.tasks.push({id:String(Date.now())+'-'+Math.random().toString(36).slice(2,8),label:input.value.trim().slice(0,160),elapsedMs:0,startedAt:0,running:false,done:false});
 input.value='';saveAppObject(PROJECT_STORAGE,projects);renderProjectTasks();
}
setInterval(()=>{
 if(!openProjectId||!Q('project-detail-shade').classList.contains('open'))return;
 const p=projects[openProjectId];if(!p)return;
 for(const timer of Q('project-task-list').querySelectorAll('[data-task-id]')){
  const task=(p.tasks||[]).find(t=>t.id===timer.dataset.taskId);
  if(task)timer.textContent=fmtTaskDuration(durationForTask(task));
 }
},1000);
/* Accept legacy one-project daily tags as well as the new many-project format.
   Older entries stay linked without rewriting existing saved data. */
function linkedProjectIdsForDay(date){
 const stored=projectTags[date];
 const ids=Array.isArray(stored)?stored:typeof stored==='string'&&stored?[stored]:[];
 return [...new Set(ids.filter(id=>typeof id==='string'&&projects[id]))];
}
function workProjectTagUI(date){
 const holder=document.createElement('div');
 holder.className='journal-project-tag journal-project-multi';
 const header=document.createElement('div');header.className='journal-project-heading';
 const label=document.createElement('strong');label.textContent='LINK PROJECTS';
 const count=document.createElement('small');
 header.append(label,count);
 const list=document.createElement('div');list.className='journal-project-choices';
 const links=document.createElement('div');links.className='journal-project-links';
 let selected=linkedProjectIdsForDay(date);
 const available=Object.values(projects)
   .filter(p=>p&&typeof p.id==='string')
   .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
 function renderLinks(){
  links.textContent='';
  count.textContent=selected.length+' SELECTED';
  if(!selected.length){
   const hint=document.createElement('small');hint.className='journal-no-projects';
   hint.textContent='No project linked to this date.';
   links.append(hint);return;
  }
  selected.forEach(id=>{
   const project=projects[id];
   if(!project)return;
   const button=document.createElement('button');
   button.type='button';button.className='journal-tag-link';
   button.textContent=(project.name||'Untitled Project')+' ›';
   button.setAttribute('aria-label','Open project '+(project.name||'Untitled Project'));
   button.onclick=()=>openProjectDetail(id);
   links.append(button);
  });
 }
 if(!available.length){
  const empty=document.createElement('small');
  empty.className='journal-no-projects';
  empty.textContent='Create a project under Active Projects, Archived Projects or Potential List first.';
  list.append(empty);
 } else {
  available.forEach(project=>{
   const row=document.createElement('label');
   row.className='journal-project-choice';
   const checkbox=document.createElement('input');
   checkbox.type='checkbox';checkbox.checked=selected.includes(project.id);
   checkbox.setAttribute('aria-label','Link '+(project.name||'Untitled Project')+' to '+date);
   const name=document.createElement('span');
   const title=document.createElement('strong');title.textContent=project.name||'Untitled Project';
   const group=document.createElement('small');group.textContent=projectGroups[project.status]||'PROJECT';
   name.append(title,group);row.append(checkbox,name);
   checkbox.onchange=()=>{
    const next=checkbox.checked
      ? [...selected,project.id]
      : selected.filter(id=>id!==project.id);
    selected=[...new Set(next)];
    if(selected.length)projectTags[date]=selected;
    else delete projectTags[date];
    if(!saveAppObject(TAG_STORAGE,projectTags)){
      checkbox.checked=!checkbox.checked;
      selected=linkedProjectIdsForDay(date);
      return;
    }
    renderLinks();
   };
   list.append(row);
  });
 }
 renderLinks();
 holder.append(header,list,links);
 return holder;
}
function openProgramDay(index){
 if(!programOpen||index<0||index>=6)return;
 openProgramDayId=index;
 Q('program-day-title').textContent=programDays[index]+' · MY PROGRAM';
 Q('program-day-note').value=sixPrograms[index]?.note||'';
 renderProgramDayImages();
 show('program-day-shade');
}
function renderProgramDayImages(){
 const holder=Q('program-day-images');holder.textContent='';mediaReload();
 if(openProgramDayId<0)return;
 const pics=mediaItems('program'+openProgramDayId,projectDefaultDate).filter(x=>x.kind==='image');
 if(!pics.length){const hint=document.createElement('small');hint.className='media-empty';hint.textContent='No personal program image yet. Add one below.';holder.append(hint);}
 pics.forEach(item=>holder.append(makeMediaCard(item)));
}
function addProgramDayImage(){
 if(openProgramDayId<0)return;
 saveProgramDay();pickMedia('image',projectDefaultDate,'program'+openProgramDayId);
}
function saveProgramDay(){
 if(openProgramDayId<0)return;
 sixPrograms[openProgramDayId]={note:Q('program-day-note').value.slice(0,16000)};
 saveAppObject(PROGRAM_STORAGE,sixPrograms);toast('Program saved ✓');
}
function closeProgramDay(){
 if(openProgramDayId<0)return;
 saveProgramDay();openProgramDayId=-1;hide('program-day-shade');
}
function speakTo(id){
 const node=Q(id);if(!node)return;
 dynamicSpeechInputId=id;
 startInMotionSpeech('dynamic');
}

/* IN MOTION 3.0 — Future-facing Work, E,E and Study journals.
   Private photos are keyed by journal and date in Android, notes in localStorage.
   Past entries remain stored but do not fill the upcoming date timeline. */
const JOURNAL_CONFIG={
 work:{title:'WORK JOURNAL',eyebrow:'IN MOTION / PROFESSIONAL RECORD',
       hero:'work_hero.jpg',caption:'MAKE TODAY COUNT',
       intro:'Your work. Your progress. Your record.'},
 ee:{title:'E, E · DAILY MOVEMENT',eyebrow:'EAT / PROPER / EXERCISE',
     hero:'ee_hero.jpg',caption:'BUILD YOUR BODY',
     intro:'Eat properly. Train consistently. Capture what moved you forward.'},
 study:{title:'STUDY JOURNAL',eyebrow:'IN MOTION / LEARN & IMPROVE',
        hero:'study_hero.jpg',caption:'LEARN. APPLY. REPEAT.',
        intro:'Show up, study and keep evidence of your progress.'}
};
const JOURNAL_NOTES_KEY='inmotion_journal_notes_v3';
let workOpen=false,journalMode='work',workLoaded=21,workPhotos=[],
    workExpanded=new Set(),workPhotoCache=new Map();
let journalNotes={};
try{journalNotes=JSON.parse(localStorage.getItem(JOURNAL_NOTES_KEY)||'{}')||{};}catch(e){journalNotes={};}
const workDate=n=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+n);return todayKey(d);};
const workLabel=k=>new Intl.DateTimeFormat('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(k+'T12:00:00'));
function workReload(){workPhotos=mediaReload();}
function workImage(id){
 if(workPhotoCache.has(id))return workPhotoCache.get(id);
 const src=mediaData(id);
 if(src&&src.startsWith('data:image/jpeg;base64,')){
  if(workPhotoCache.size>=20)workPhotoCache.clear();
  workPhotoCache.set(id,src);return src;
 }
 return '';
}
function journalStoredNote(key){
 return String(journalNotes[journalMode]?.[key]||'');
}
function journalSaveNote(dayKey,text){
 if(!journalNotes[journalMode]||typeof journalNotes[journalMode]!=='object')journalNotes[journalMode]={};
 journalNotes[journalMode][dayKey]=String(text||'').slice(0,16000);
 try{localStorage.setItem(JOURNAL_NOTES_KEY,JSON.stringify(journalNotes));toast('Journal note saved ✓');}
 catch(e){toast('Cannot save note — device storage full');}
}
function workRender(){
 const holder=Q('work-days');holder.textContent='';
 const relevant=workPhotos.filter(x=>(x.category||'work')===journalMode);
 const keys=Array.from({length:workLoaded},(_,n)=>workDate(n));
 // Allow every future date with saved photos/notes, without creating infinite empty rows.
 for(const item of relevant)if(item.date&&!keys.includes(item.date))keys.push(item.date);
 for(const key of Object.keys(journalNotes[journalMode]||{}))
  if(!keys.includes(key))keys.push(key);
 keys.sort((a,b)=>a<todayKey()&&b>=todayKey()?1:b<todayKey()&&a>=todayKey()?-1:a.localeCompare(b));
 for(const dayKey of keys){
  const pics=relevant.filter(x=>x.date===dayKey);
  const note=journalStoredNote(dayKey);
  const card=document.createElement('section');card.className='work-day';
  const button=document.createElement('button');button.className='work-day-head';button.type='button';
  const header=document.createElement('span'),title=document.createElement('strong'),small=document.createElement('small');
  title.textContent=workLabel(dayKey);
  small.textContent=pics.length+' MEDIA · '+(note.trim()?'NOTE SAVED':'NO NOTE');
  header.append(title,small);
  const arrow=document.createElement('span');arrow.className='work-chevron';arrow.textContent='›';
  button.append(header,arrow);
  const body=document.createElement('div');body.className='work-day-body';
  function populate(){
   body.textContent='';
   const noteWrap=document.createElement('div');noteWrap.className='work-day-note';
   const label=document.createElement('label');label.textContent='DAILY JOURNAL / '+dayKey;
   const area=document.createElement('textarea');area.value=journalStoredNote(dayKey);
   area.placeholder='What did you do, learn, or prepare for? Optional.';
   const save=document.createElement('button');save.type='button';save.textContent='SAVE NOTE';
   save.onclick=()=>{journalSaveNote(dayKey,area.value);small.textContent=pics.length+' MEDIA · '+(area.value.trim()?'NOTE SAVED':'NO NOTE');};
   const hint=document.createElement('small');hint.textContent='Notes are private to this device.';
   const speak=document.createElement('button');speak.type='button';
   speak.textContent='🎙 SPEAK TO WRITE';speak.className='journal-speech-button';
   const textId='journal-note-'+journalMode+'-'+dayKey;area.id=textId;
   speak.onclick=()=>speakTo(textId);
   noteWrap.append(label,area,speak,save,hint);body.append(noteWrap);
   if(journalMode==='work')body.append(workProjectTagUI(dayKey));
   if(pics.length){
    const grid=document.createElement('div');grid.className='media-grid journal-media-grid';
    pics.forEach(item=>grid.append(makeMediaCard(item)));
    body.append(grid);
   }else{
    const blank=document.createElement('div');blank.className='work-empty';
    blank.textContent='No photos or videos for this date yet.';body.append(blank);
   }
   const actions=document.createElement('div');actions.className='media-actions journal-media-actions';
   const photo=document.createElement('button');photo.type='button';photo.textContent='+ ADD PHOTO';
   photo.onclick=()=>addJournalMedia('image',dayKey);
   const video=document.createElement('button');video.type='button';video.textContent='+ ADD VIDEO';
   video.onclick=()=>addJournalMedia('video',dayKey);
   actions.append(photo,video);body.append(actions);
  }
  button.onclick=()=>{
   const expanded=!card.classList.contains('open');
   card.classList.toggle('open',expanded);
   if(expanded){workExpanded.add(dayKey);populate();}else workExpanded.delete(dayKey);
  };
  card.append(button,body);holder.append(card);
  if(workExpanded.has(dayKey)||(!workExpanded.size&&dayKey===todayKey())){
   card.classList.add('open');populate();
  }
 }
 Q('work-more').hidden=workLoaded>=730;
}
function openFocusJournal(mode){
 if(page!=='board'||state.lockdownActive||!JOURNAL_CONFIG[mode])return;
 openJournal(mode);
}
function openWorkJournal(){
 if(page!=='cover'||state.lockdownActive)return;
 openJournal('work');
}
function openJournal(mode){
 const config=JOURNAL_CONFIG[mode];if(!config)return;
 Q('program-launch').hidden=mode!=='ee';
 journalMode=mode;workOpen=true;workLoaded=21;workExpanded=new Set();
 Q('journal-eyebrow').textContent=config.eyebrow;
 Q('journal-title').textContent=config.title;
 Q('journal-hero').src=config.hero;
 Q('journal-hero-label').textContent=config.caption;
 Q('journal-intro').textContent=config.intro;
 Q('work-project-menu').hidden=mode!=='work';
 Q('work-date').value=todayKey();Q('work-date').min=todayKey();
 Q('work-date').removeAttribute('max');
 workReload();workRender();show('work-shade');
 if(window.NativeAudio?.setJournalMode){
  try{window.NativeAudio.setJournalMode(mode);}catch(e){}
 }else if(window.NativeAudio?.setWorkMode){
  try{window.NativeAudio.setWorkMode(mode==='work');}catch(e){}
 }
 syncCoverVideo();
}
function closeWorkJournal(){
 if(Q('project-detail-shade').classList.contains('open'))closeProjectDetail();
 closeProjectCategory();
 closeProgram();closeWorkPhoto();workOpen=false;hide('work-shade');
 if(window.NativeAudio?.setJournalMode){
  try{window.NativeAudio.setJournalMode('');}catch(e){}
 }else if(window.NativeAudio?.setWorkMode){
  try{window.NativeAudio.setWorkMode(false);}catch(e){}
 }
 syncCoverVideo();
}
function loadMoreWorkDays(){
 const scroller=Q('work-scroll'),scroll=scroller.scrollTop;
 workLoaded=Math.min(workLoaded+21,730);workRender();scroller.scrollTop=scroll;
}
function addWorkPhotos(date){addJournalMedia('image',date);}
window.onWorkPhotosChanged=message=>{
 workReload();workPhotoCache.clear();if(workOpen){workRender();toast(message||'Photos saved');}
};
function openWorkPhoto(id){
 const src=workImage(id);if(!src){toast('Photo unavailable');return;}
 Q('work-lightbox-photo').src=src;show('work-lightbox');
}
function closeWorkPhoto(){
 hide('work-lightbox');Q('work-lightbox-photo').removeAttribute('src');
}

/* IN MOTION 3.0.1: E,E program is a private, replaceable image.
   Default remains a bundled asset; Android stores the replacement in filesDir. */
let programOpen=false;
function loadProgramImage(){
 const img=Q('program-image');
 let replacement='';
 if(window.NativeAudio&&typeof window.NativeAudio.getProgramImageData==='function'){
  try{replacement=window.NativeAudio.getProgramImageData();}catch(e){}
 }
 if(replacement&&replacement.startsWith('data:image/jpeg;base64,')){
  img.onerror=null;
  img.src=replacement;
 }else{
  img.onerror=()=>{img.onerror=null;img.src='program_default.svg';};
  img.src='program_default.jpg';
 }
}
function openProgram(){
 if(!workOpen||journalMode!=='ee'||state.lockdownActive)return;
 programOpen=true;
 loadProgramImage();
 show('program-shade');
}
function closeProgram(){
 if(!programOpen)return;
 if(openProgramDayId>=0)closeProgramDay();
 programOpen=false;hide('program-shade');
 Q('program-image').removeAttribute('src');
}
function changeProgramImage(){
 if(!programOpen)return;
 if(!window.NativeAudio||typeof window.NativeAudio.pickProgramImage!=='function'){
  toast('Please open this in the Android app.');return;
 }
 try{window.NativeAudio.pickProgramImage();}catch(e){toast('Could not open the image picker.');}
}
function resetProgramImage(){
 if(!programOpen)return;
 if(window.NativeAudio&&typeof window.NativeAudio.resetProgramImage==='function'){
  try{window.NativeAudio.resetProgramImage();}catch(e){toast('Could not reset program.');return;}
 }
 loadProgramImage();toast('Default training program restored');
}
window.onProgramImageChanged=function(ok){
 if(!programOpen)return;
 if(ok){loadProgramImage();toast('Training program image saved ✓');}
 else toast('No program image was saved');
};


/* IN MOTION 3.1 — explicitly user-controlled, on-device identity settings.
   Previous AI messages and profile are never sent unless enabled here. */
const IDENTITY_STORAGE_KEY='inmotion-identity-v1';
const IDENTITY_DEFAULT={
 tone:'balanced',
 directive:'Protect clarity. Maintain momentum. Turn intention into sustainable action.',
 profile:'',
 sendProfile:false,
 useHistory:false
};
function loadIdentity(){
 try {
  const input=JSON.parse(localStorage.getItem(IDENTITY_STORAGE_KEY)||'null');
  if(input&&typeof input==='object'){
   return {
    tone:['balanced','direct','companion'].includes(input.tone)?input.tone:'balanced',
    directive:typeof input.directive==='string'?input.directive.slice(0,350):IDENTITY_DEFAULT.directive,
    profile:typeof input.profile==='string'?input.profile.slice(0,1200):'',
    sendProfile:input.sendProfile===true,
    useHistory:input.useHistory===true
   };
  }
 }catch(e){}
 return {...IDENTITY_DEFAULT};
}
let identitySettings=loadIdentity();
function hydrateIdentitySettings(){
 Q('identity-tone').value=identitySettings.tone;
 Q('identity-directive').value=identitySettings.directive;
 Q('identity-profile').value=identitySettings.profile;
 Q('identity-send-profile').checked=identitySettings.sendProfile;
 Q('identity-use-history').checked=identitySettings.useHistory;
}
function saveIdentitySettings(){
 const updated={
  tone:Q('identity-tone').value,
  directive:Q('identity-directive').value.trim().slice(0,350),
  profile:Q('identity-profile').value.trim().slice(0,1200),
  sendProfile:Q('identity-send-profile').checked,
  useHistory:Q('identity-use-history').checked
 };
 if(!['balanced','direct','companion'].includes(updated.tone))updated.tone='balanced';
 try{
  localStorage.setItem(IDENTITY_STORAGE_KEY,JSON.stringify(updated));
  identitySettings=updated;toast('IN MOTION identity & memory saved ✓');
  if(Q('agent-shade').classList.contains('open')){
   Q('agent-footer-mode').textContent=aiAvailable
    ? 'GPT · '+(updated.useHistory?'CHAT CONTEXT ON':'CHAT CONTEXT OFF')+
      (updated.sendProfile?' · PROFILE ON':'')
    : 'LOCAL SEARCH · DEVICE ONLY';
  }
 }catch(e){toast('Could not save settings. Check device storage.');}
}
function resetIdentitySettings(){
 identitySettings={...IDENTITY_DEFAULT};
 try{localStorage.removeItem(IDENTITY_STORAGE_KEY);}catch(e){}
 hydrateIdentitySettings();toast('Identity preferences restored');
}
function openIdentitySettings(){
 openSettings();
 requestAnimationFrame(()=>Q('identity-config').scrollIntoView({block:'start',behavior:'smooth'}));
}
function recentAIMessages(){
 if(!identitySettings.useHistory)return [];
 const chat=Array.isArray(state.agentChat)?state.agentChat:[];
 const pairs=[];
 for(let i=1;i<chat.length;i++){
  const question=chat[i-1],response=chat[i];
  if(question?.source!=='ai'||question.who!=='user'
     ||response?.source!=='ai'||response.who!=='assistant')continue;
  pairs.push(
   {role:'user',content:String(question.message||'').slice(0,320)},
   {role:'assistant',content:String(response.message||'').slice(0,320)}
  );
 }
 return pairs.slice(-8);
}

/* AI can be called only after the user configures a private HTTPS proxy.
   Memory is not uploaded unless the checkbox is ticked. */
let aiAvailable=false,aiPending=false;
const DEFAULT_INMOTION_WORKER_URL='https://inmotion-private-ai.batinkoraykapti.workers.dev/chat';
function loadAIConnection(){
 Q('ai-endpoint').value=DEFAULT_INMOTION_WORKER_URL;
 try{const info=JSON.parse(window.NativeAudio.getAIConfiguration());
  aiAvailable=!!info.configured;
  Q('ai-endpoint').value=info.endpoint||DEFAULT_INMOTION_WORKER_URL;
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
let agentThinkingNode=null;
window.onInMotionAIResult=function(ok,text){
 aiPending=false;
 if(agentThinkingNode){agentThinkingNode.remove();agentThinkingNode=null;}
 const message=String(text||'').slice(0,4200);
 agentAddMessage('assistant',ok?message:'AI connection failed: '+message+'\nLocal search remains available.',ok,'ai');
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
 // Journals are separate private stores; only selected relevant entries are shared,
 // and only when the user explicitly ticks SHARE RELEVANT NOTES WITH AI.
 const titles={work:'WORK JOURNAL',ee:'E,E / PHYSICAL',study:'STUDY JOURNAL'};
 for(const [mode,notes] of Object.entries(journalNotes||{})){
  if(!titles[mode]||!notes||typeof notes!=='object')continue;
  for(const [date,value] of Object.entries(notes)){
   const note=String(value||'').trim();
   if(!note)continue;
   items.push({date,kind:'journal',title:titles[mode],note,completed:false});
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
function agentAddMessage(who,message,save=true,source='local'){
 const area=Q('agent-messages');
 const node=document.createElement('article');node.className='agent-message '+(who==='user'?'user':'assistant');
 const label=document.createElement('small');label.textContent=who==='user'?'YOU':source==='ai'?'IN MOTION · GPT':'IN MOTION · LOCAL';
 const text=document.createElement('div');text.textContent=message;
 node.append(label,text);area.append(node);area.scrollTop=area.scrollHeight;
 if(save){
  if(!Array.isArray(state.agentChat))state.agentChat=[];
  state.agentChat.push({who,message:String(message).slice(0,4000),source});
  if(state.agentChat.length>AGENT_MAX_MESSAGES)state.agentChat=state.agentChat.slice(-AGENT_MAX_MESSAGES);
  persist();
 }
 return node;
}
function openInMotionAgent(){loadAIConnection();
 if(state.lockdownActive)return;
 rollover();
 const area=Q('agent-messages');area.textContent='';
 const messages=Array.isArray(state.agentChat)?state.agentChat.slice(-AGENT_MAX_MESSAGES):[];
 if(!messages.length)agentAddMessage('assistant',
  aiAvailable?'IN MOTION is online. I can help with WORK, E,E, STUDY and GUARDIAN. Set personality and memory options under PERSONALIZE. Past chats and notes are shared only with your permission.':
  'Your local records are ready. Ask me about today, history or Guardian; configure your private GPT connection to enable AI replies.',false);
 else for(const item of messages)agentAddMessage(item.who==='user'?'user':'assistant',String(item.message||''),false,item.source==='ai'?'ai':'local');
 Q('agent-footer-mode').textContent=aiAvailable
  ? 'GPT · '+(identitySettings.useHistory?'CHAT CONTEXT ON':'CHAT CONTEXT OFF')+
    (identitySettings.sendProfile?' · PROFILE ON':'')
  : 'LOCAL SEARCH · DEVICE ONLY';
 show('agent-shade');
}
function closeInMotionAgent(){hide('agent-shade');Q('agent-input').blur();}
function submitAgentQuery(){
 const input=Q('agent-input'),query=input.value.trim();if(!query||aiPending)return;
 const online=aiAvailable&&window.NativeAudio&&typeof window.NativeAudio.askInMotionAI==='function';
 // Capture previous completed GPT turns BEFORE recording the new question.
 const history=online?recentAIMessages():[];
 input.value='';agentAddMessage('user',query.slice(0,600),true,online?'ai':'local');
 if(online){
  aiPending=true;
  const context=Q('agent-include-memory').checked?aiSelectedMemory(query).slice(0,4000):'';
  const options={
   tone:identitySettings.tone,
   directive:identitySettings.directive.slice(0,350),
   profile:identitySettings.sendProfile?identitySettings.profile.slice(0,1200):''
  };
  const payload=JSON.stringify({
   question:query.slice(0,1200),
   context,history,
   identity:options
  });
  agentThinkingNode=agentAddMessage('assistant','Thinking with IN MOTION…',false,'ai');
  try{window.NativeAudio.askInMotionAI(payload);return;}
  catch(e){
   aiPending=false;
   if(agentThinkingNode){agentThinkingNode.remove();agentThinkingNode=null;}
   agentAddMessage('assistant','Could not reach your private GPT connection. Local search is still available.',false);
   return;
  }
 }
 agentAddMessage('assistant',agentResponse(query).slice(0,4400),true,'local');
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
 if(!['editor','lockdown','agent','dynamic'].includes(target))return;
 if(state.lockdownActive&&target!=='lockdown')return;
 const node=target==='dynamic'?Q(dynamicSpeechInputId):target==='editor'?Q('editor-input'):target==='lockdown'?Q('lockdown-notes'):Q('agent-input');
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
 if(!['editor','lockdown','agent','dynamic'].includes(target))return;
 const input=target==='dynamic'?Q(dynamicSpeechInputId):target==='editor'?Q('editor-input'):target==='lockdown'?Q('lockdown-notes'):Q('agent-input');
 if(target==='lockdown'&&!state.lockdownActive)return;
 insertDictatedText(input,result);
 toast('Voice note inserted ✓');
 currentSpeechTarget=null;
 dynamicSpeechInputId='';
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

window.handleAndroidBack=()=>{if(state.lockdownActive)return true;
 if(openProgramDayId>=0){closeProgramDay();return true;}
 if(Q('project-detail-shade').classList.contains('open')){closeProjectDetail();return true;}
 if(Q('project-category-shade').classList.contains('open')){closeProjectCategory();return true;}if(programOpen){closeProgram();return true;}if(Q('work-lightbox').classList.contains('open')){closeWorkPhoto();return true;}if(workOpen){closeWorkJournal();return true;}if(Q('agent-shade').classList.contains('open')){closeInMotionAgent();return true;}if(Q('stopwatch-shade').classList.contains('open')){closeStopwatch();return true;}if(Q('modal-shade').classList.contains('open')){closeEditor();return true;}
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
