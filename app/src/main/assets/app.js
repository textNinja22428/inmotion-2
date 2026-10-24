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
 const xp=lifetimeXP(), lvl=Math.floor(xp/100)+1, progress=xp%100;
 Q('cover-level').textContent=`LEVEL ${String(lvl).padStart(2,'0')}`;
 Q('level-title').textContent=levelTitle(lvl);
 Q('level-fill').style.width=progress+'%';
 Q('xp-label').textContent=`${progress} / 100 XP`;
 Q('today-label').textContent=`TODAY ${points(day())} / 40 XP`;
 Q('board-xp').textContent=`${points(day())} / 40 XP`;
}
function prettyDate(key,options){
 const date=new Date(`${key}T12:00:00`);
 return new Intl.DateTimeFormat('tr-TR',options).format(date);
}
function updateDate(){
 const d=new Date(); Q('date-weekday').textContent=new Intl.DateTimeFormat('tr-TR',{weekday:'long'}).format(d).toLocaleUpperCase('tr-TR');
 Q('date-long').textContent=new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long',year:'numeric'}).format(d);
 Q('date-clock').textContent=new Intl.DateTimeFormat('tr-TR',{hour:'2-digit',minute:'2-digit'}).format(d);
 Q('board-date-label').textContent=prettyDate(state.activeDay,{weekday:'short',day:'numeric',month:'short'}).toUpperCase();
}
function renderSlots(){
 const layer=Q('slot-layer'); layer.textContent=''; const d=day();
 SECTIONS.forEach((s,i)=>{
  const b=document.createElement('button');b.type='button';b.className='slot'+(s.bottom?' bottom-slot':'')+(s.bottomRight?' bottom-right':'');
  Object.assign(b.style,{left:s.x+'%',top:s.y+'%',width:s.w+'%',height:s.h+'%'});
  b.setAttribute('aria-label','Edit '+s.name);b.dataset.slot=i;
  const preview=document.createElement('span');preview.className='slot-preview';preview.textContent=d.slots[i]||'';b.append(preview);
  const marker=document.createElement('span');marker.className='done-marker'+(d.done[i]?' is-done':'');marker.textContent=d.done[i]?'✓':'';b.append(marker);
  b.addEventListener('click',()=>openEditor(i));layer.append(b);
 });
}
function enterBoard(){rollover();if(page!=='cover')return;page='board';covers.board.classList.remove('is-hidden');covers.cover.classList.add('is-hidden');}
function goCover(){page='cover';covers.cover.classList.remove('is-hidden');covers.board.classList.add('is-hidden');updateXP();}
let lastTap=0,lastX=0,lastY=0;
Q('cover-stage').addEventListener('pointerup',e=>{
 if(page!=='cover'||(e.pointerType==='mouse'&&e.button!==0))return;
 const now=Date.now(),dist=Math.hypot(e.clientX-lastX,e.clientY-lastY);
 if(now-lastTap<370&&dist<55){lastTap=0;enterBoard();e.preventDefault();}
 else{lastTap=now;lastX=e.clientX;lastY=e.clientY;}
});
Q('cover-stage').addEventListener('dblclick',e=>{if(page==='cover'){enterBoard();e.preventDefault();}});
function openEditor(index){rollover();editingSlot=index;const d=day();
 Q('editor-title').textContent=SECTIONS[index].name;Q('editor-overline').textContent=`${state.activeDay} / SLOT ${index+1}`;
 Q('editor-input').value=d.slots[index]||'';Q('slot-complete').checked=!!d.done[index];
 show('modal-shade');setTimeout(()=>Q('editor-input').focus(),190);
}
function saveEditor(){if(editingSlot<0)return;const d=day(),i=editingSlot;
 d.slots[i]=Q('editor-input').value;d.done[i]=Q('slot-complete').checked;
 if(d.done[i]&&!d.earned[i]){d.earned[i]=true;toast('+5 XP · Nice work!');}
 // If a day was already saved to Gallery, its latest state is still preserved.
 persist();renderSlots();updateXP();closeEditor();
}
function closeEditor(){Q('editor-input').blur();editingSlot=-1;hide('modal-shade');}
function archiveToday(){rollover();day().archived=true;day().savedAt=new Date().toISOString();persist();toast('Today saved to Gallery ✓');}
function openGallery(){rollover();const list=Q('gallery-list');list.textContent='';
 const keys=Object.keys(state.days).filter(k=>k!==state.activeDay||state.days[k].archived)
  .filter(k=>{const d=state.days[k];return d.archived||d.slots.some(t=>t&&t.trim())||d.done.some(Boolean);}).sort().reverse();
 if(!keys.length){const e=document.createElement('div');e.className='gallery-empty';e.textContent='No archived days yet. Tap “SAVE TODAY TO GALLERY” on the board to keep a snapshot.';list.append(e);}
 keys.forEach(k=>{const d=state.days[k],b=document.createElement('button');b.className='gallery-item';
 const thumb=document.createElement('img');thumb.src='board.jpg';thumb.alt='';
 const body=document.createElement('span');body.className='gallery-item-body';
 const name=document.createElement('strong');name.textContent=prettyDate(k,{weekday:'long',day:'numeric',month:'short',year:'numeric'});
 const meta=document.createElement('small');meta.textContent=`${d.done.filter(Boolean).length}/8 completed · ${points(d)} XP · ${d.slots.filter(v=>v&&v.trim()).length} notes`;
 body.append(name,meta);b.append(thumb,body);b.addEventListener('click',()=>openHistory(k));list.append(b);
 });show('gallery-shade');
}
function closeGallery(){hide('gallery-shade');}
function openHistory(key){selectedArchive=key;const d=state.days[key];Q('history-title').textContent=prettyDate(key,{day:'numeric',month:'long',year:'numeric'});Q('history-status').textContent=`${d.done.filter(Boolean).length} / 8 completed   ·   ${points(d)} XP`;
 const layer=Q('history-slots');layer.textContent='';SECTIONS.forEach((s,i)=>{
 const v=document.createElement('div');v.className='history-slot'+(s.bottom?' history-bottom':'')+(s.bottomRight?' history-right':'');
 Object.assign(v.style,{left:s.x+'%',top:s.y+'%',width:s.w+'%',height:s.h+'%'});
 const content=document.createElement('span');content.textContent=d.slots[i]||'';v.append(content);
 if(d.done[i]){const check=document.createElement('b');check.textContent='✓';v.append(check);}layer.append(v);
 });hide('gallery-shade');show('history-shade');
}
function closeHistory(){hide('history-shade');openGallery();}
function show(id){const node=Q(id);node.classList.add('open');node.setAttribute('aria-hidden','false');}
function hide(id){const node=Q(id);node.classList.remove('open');node.setAttribute('aria-hidden','true');}
let toastTimer=null;
function toast(message){const node=Q('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2500);}
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
for(const id of ['modal-shade','settings-shade','gallery-shade','history-shade'])Q(id).addEventListener('pointerdown',e=>{if(e.target===Q(id)){if(id==='modal-shade')closeEditor();else if(id==='settings-shade')closeSettings();else if(id==='gallery-shade')closeGallery();else closeHistory();}});
// All pointer interactions: a single select sample through native SoundPool, or HTML audio in browsers.
const clickAudio=Q('web-click');let clickedAt=0;
document.addEventListener('pointerdown',()=>{
 if(state.soundEnabled===false)return;
 const now=Date.now();if(now-clickedAt<55)return;clickedAt=now;
 if(nativeAvailable){try{window.NativeAudio.playSelect();return;}catch(e){}}
 try{clickAudio.currentTime=0;clickAudio.play().catch(()=>{});}catch(e){}
},{passive:true,capture:true});
window.handleAndroidBack=()=>{if(Q('modal-shade').classList.contains('open')){closeEditor();return true;}
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
renderSlots();updateDate();updateXP();applyTheme();prepareAmbient();persist();
document.addEventListener('visibilitychange',()=>{if(!document.hidden){rollover();updateDate();updateXP();}});
setInterval(()=>{rollover();updateDate();},30000);
