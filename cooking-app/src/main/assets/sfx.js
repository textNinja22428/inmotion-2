'use strict';
// Kitchen Soundscape v2 — 18 curated, genuine CC0 Kenney game-menu recordings.
// Only triggered by user interaction; no ambient background soundtrack.
(function(){
 const KEY='cooking_rotations_soundscape_jrpg_v2';
 const names=['alert','camera','chop','edit','finish','navigate','open','page','play','pop','random','remove','save','sizzle','sparkle','stop','tap','toggle'];
 const urls=Object.fromEntries(names.map(n=>[n,'jrpg/'+n+'.wav']));
 let cfg={enabled:true,volume:35};
 try{let old=JSON.parse(localStorage.getItem('cooking_rotations_soundscape_v1')||'null');if(old?.enabled===false)cfg.enabled=false;}catch(e){}
 try {const old=JSON.parse(localStorage.getItem(KEY)||'null');if(old&&typeof old==='object'){cfg.enabled=old.enabled!==false;cfg.volume=Math.max(0,Math.min(100,Number(old.volume)||0));}}catch(e){}
 let ctx=null,bus=null,loaded={},loading=false;
 let lastSound='',lastWhen=0;
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(cfg));}catch(e){}}
 function context(){
  if(ctx)return ctx;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  try{
   ctx=new AC();
   const compressor=ctx.createDynamicsCompressor();
   compressor.threshold.value=-21;
   compressor.knee.value=12;
   compressor.ratio.value=2.5;
   compressor.attack.value=.003;
   compressor.release.value=.11;
   bus=ctx.createGain();
   bus.gain.value=1;
   bus.connect(compressor);
   compressor.connect(ctx.destination);
  }catch(e){ctx=null;bus=null;}
  return ctx;
 }
 function preload(){
  if(loading)return;loading=true;
  const ac=context();if(!ac)return;
  for(const n of names){
   fetch(urls[n]).then(r=>{if(!r.ok)throw Error('missing sound');return r.arrayBuffer();})
    .then(bytes=>ac.decodeAudioData(bytes)).then(b=>loaded[n]=b).catch(()=>{});
  }
 }
 function duck(){
  try{
   if(typeof musicState!=='undefined'&&musicState.playing)return .43;
   if(typeof youtubeActive!=='undefined'&&youtubeActive)return .36;
   if(typeof cinemaPlayingUri!=='undefined'&&cinemaPlayingUri)return .36;
  }catch(e){}
  return 1;
 }
 function play(n,force=false){
  if(!force&&!cfg.enabled)return;
  if(!urls[n])n='tap';
  const now=performance.now();
  if(n===lastSound&&now-lastWhen<145)return;
  lastSound=n;lastWhen=now;
  const ac=context();
  if(!ac)return;
  if(ac.state==='suspended')ac.resume().catch(()=>{});
  const level=(cfg.volume/100)*.22*duck();
  if(level<=.001)return;
  const audio=loaded[n];
  if(audio){
   try{
    const src=ac.createBufferSource();src.buffer=audio;
    const gain=ac.createGain();gain.gain.value=level;
    src.connect(gain);gain.connect(bus);
    // Subtle high-end UI ambience: low-volume single echo only on special interactions.
    if(['open','finish','save','random','sparkle'].includes(n)){
      const delay=ac.createDelay(.3);delay.delayTime.value=.088;
      const wet=ac.createGain();wet.gain.value=.11;
      gain.connect(delay);delay.connect(wet);wet.connect(bus);
      src.addEventListener('ended',()=>setTimeout(()=>{try{delay.disconnect();wet.disconnect()}catch(e){}},300),{once:true});
    }
    src.start();
    src.addEventListener('ended',()=>{src.disconnect();gain.disconnect()},{once:true});
   }catch(e){}
  }else{
   // First tap fallback while the short files are still being decoded.
   try{
    const a=new Audio(urls[n]);a.volume=Math.max(.02,Math.min(.45,level));a.play().catch(()=>{});
   }catch(e){}
  }
 }
 function updateQuick(){
  const b=document.getElementById('soundQuickToggle');
  if(b){b.textContent=cfg.enabled?'🔊':'🔇';b.title=cfg.enabled?'Mute kitchen effects':'Enable kitchen effects';b.setAttribute('aria-pressed',String(cfg.enabled));}
 }
 function setEnabled(x){cfg.enabled=!!x;persist();updateQuick();if(cfg.enabled)play('toggle',true);const t=document.getElementById('sfxEnabled');if(t)t.checked=cfg.enabled;}
 function setVolume(v){cfg.volume=Math.max(0,Math.min(100,Number(v)||0));persist();const label=document.getElementById('sfxVolumeValue');if(label)label.textContent=cfg.volume+'%';}
 function bindSettings(){
  const check=document.getElementById('sfxEnabled');
  const slider=document.getElementById('sfxVolume');
  const value=document.getElementById('sfxVolumeValue');
  const test=document.getElementById('sfxPreview');
  if(check){check.checked=cfg.enabled;check.onchange=()=>setEnabled(check.checked);}
  if(slider){
   slider.value=cfg.volume;
   slider.oninput=()=>setVolume(slider.value);
   slider.onchange=()=>play('sparkle');
  }
  if(value)value.textContent=cfg.volume+'%';
  if(test)test.onclick=()=>{if(!cfg.enabled)setEnabled(true);play('finish',true);};
 }
 function soundFor(el){
  if(!el)return null;
  if(el.closest('#splash'))return null;
  const id=el.id||'';
  const action=el.dataset||{};
  if(id==='sfxPreview'||id==='sfxEnabled'||id==='sfxVolume')return null;
  if(id==='soundQuickToggle')return null;
  if(action.tab)return 'navigate';
  if(el.closest('.rotation-card'))return 'open';
  if(el.closest('.gallery-item')||el.closest('.media-picker'))return 'camera';
  if(el.closest('.mood-options'))return 'pop';
  if(el.closest('.pill')||el.closest('.cinema-shelf'))return 'toggle';
  if(el.closest('.cinema-service'))return 'play';
  if(action.cinemaVideo==='play'||action.cinemaLink==='play')return 'play';
  if(action.cinemaVideo==='remove'||action.cinemaLink==='remove')return 'remove';
  if(action.cinemaVideo==='favorite'||action.cinemaLink==='favorite')return 'sparkle';
  if(action.cinemaVideo==='edit'||action.cinemaLink==='edit')return 'edit';
  if(id==='surpriseMe')return 'random';
  if(id==='floatingAdd'||id==='quickJournal'||id==='journalNew')return 'page';
  if(id==='addRotation'||id==='cinemaNewCategory'||id==='cinemaAddLink'||id==='youtubeAdd'||id==='cinemaImport'||id==='musicImport')return 'sparkle';
  if(id==='settingsButton'||id==='cinemaNewCategory')return 'edit';
  if(id==='musicPlay'||id==='miniToggle'||id==='musicPrev'||id==='musicNext'||id==='miniPrev'||id==='miniNext')return 'play';
  if(id==='youtubeDockClose'||id==='cinemaClose')return 'stop';
  if(id==='musicShuffle'||id==='musicRepeat'||id==='musicLocalTab'||id==='musicYoutubeTab'||id==='cinemaOfflineTab'||id==='cinemaLinksTab')return 'toggle';
  if(el.classList.contains('modal-close')||el.closest('.modal-close'))return 'stop';
  if(el.closest('.entry-tools'))return 'page';
  if(el.matches('button[type=submit]'))return null;
  if(el.classList.contains('text-button'))return 'sparkle';
  if(el.classList.contains('ghost'))return 'edit';
  return el.classList.contains('primary')?'tap':null;
 }
 function init(){
  preload();updateQuick();
  const b=document.getElementById('soundQuickToggle');
  if(b)b.addEventListener('click',()=>setEnabled(!cfg.enabled));
  // Capture phase gives immediate audible response even when the UI re-renders on click.
  document.addEventListener('click',e=>{
   if(e.target.closest('#sfxPreview'))return;
   const button=e.target.closest('button,.rotation-card,.gallery-item,.pill,.media-picker,.cinema-shelf');
   if(button){const name=soundFor(button);if(name)play(name);}
  },true);
  // Files change only after the Android picker returns: a gentle camera/import confirmation.
  document.addEventListener('change',e=>{
   if(e.target.matches('#mediaFiles'))play('camera');
   else if(e.target.matches('input[type=file]:not(#importFile)'))play('sparkle');
  },true);
 }
 window.SFX={play,setEnabled,setVolume,bindSettings,status:()=>({...cfg}),preview:()=>play('finish',true)};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();