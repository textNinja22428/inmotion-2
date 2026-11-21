'use strict';
// Kitchen Cinema v1.6 — personal offline watch shelf and official streaming shortcuts.
// The native Android player stores permission to user-picked videos, not copies of the videos.
const CINEMA_LINKS_KEY='cooking_cinema_links_v1';
const CINEMA_CATS_KEY='cooking_cinema_categories_v1';
const CINEMA_CATS_DEFAULT=['Anime','Series','Recipes','Comfort','Movies','Other'];
let cinemaVideos=[];
let cinemaLinks=cLoad(CINEMA_LINKS_KEY,[]);
let cinemaCats=cLoad(CINEMA_CATS_KEY,CINEMA_CATS_DEFAULT);
let cinemaFilter='All',cinemaPane='offline',cinemaPlayingUri='';
function cLoad(key,def){try{const d=JSON.parse(localStorage.getItem(key));return Array.isArray(d)?d:def.slice()}catch{return def.slice()}}
function cPersist(){localStorage.setItem(CINEMA_LINKS_KEY,JSON.stringify(cinemaLinks));localStorage.setItem(CINEMA_CATS_KEY,JSON.stringify(cinemaCats))}
function cNative(fn,...args){if(window.NativeCinema&&typeof NativeCinema[fn]==='function'){NativeCinema[fn](...args);return true}toast('Kitchen Cinema video library requires Android');return false}
function cFmt(ms){let n=Math.max(0,Math.floor((ms||0)/1000));return (n>=3600?Math.floor(n/3600)+':':'')+String(Math.floor(n%3600/60)).padStart(n>=3600?2:1,'0')+':'+String(n%60).padStart(2,'0')}
function cSafe(s){return esc(String(s==null?'':s))}
function cFilterItems(items){return items.filter(v=>cinemaFilter==='All'||(cinemaFilter==='Favorites'?!!v.favorite:(v.category||'Other')===cinemaFilter))}
function cCategoryOptions(selected){return [...new Set([...cinemaCats,'Other',selected||''])].filter(Boolean).map(c=>'<option value="'+cSafe(c)+'"'+(c===selected?' selected':'')+'>'+cSafe(c)+'</option>').join('')}
function cUsedCategories(){return [...new Set([...cinemaCats,...cinemaVideos.map(v=>v.category||'Other'),...cinemaLinks.map(v=>v.category||'Other')])].filter(Boolean)}
function cRenderCategories(){
 const box=$('cinemaCategories');if(!box)return;
 const cats=['All','Favorites',...cUsedCategories()];
 box.innerHTML=cats.map((c,i)=>'<button type="button" class="cinema-shelf'+(c===cinemaFilter?' active':'')+'" data-cinema-filter="'+i+'">'+(c==='Favorites'?'★ ':'')+cSafe(c)+'</button>').join('');
 box.querySelectorAll('[data-cinema-filter]').forEach(b=>b.onclick=()=>{cinemaFilter=cats[+b.dataset.cinemaFilter];cRenderCinema()});
}
function cRenderContinue(){
 const box=$('cinemaContinue');if(!box)return;
 const recent=cinemaVideos.filter(v=>(v.lastPlayed||0)>0).sort((a,b)=>(b.lastPlayed||0)-(a.lastPlayed||0))[0];
 if(!recent){box.hidden=true;box.innerHTML='';return}
 box.hidden=false;
 const progress=recent.duration>0?Math.min(100,Math.round(100*(recent.position||0)/recent.duration)):0;
 box.innerHTML='<span class="continue-icon">🎞️</span><div class="continue-info"><span class="eyebrow">PICK UP WHERE YOU LEFT OFF</span><b>'+cSafe(recent.title)+'</b><small>'+cSafe(recent.category||'Other')+' · '+cFmt(recent.position)+(progress?' · '+progress+'% watched':'')+'</small></div><button type="button" id="cinemaResume">▶ Resume</button>';
 $('cinemaResume').onclick=()=>cNative('playVideo',recent.uri);
}
function cRenderVideos(){
 const box=$('cinemaVideos');if(!box)return;
 const items=cFilterItems(cinemaVideos);
 if(!items.length){box.innerHTML='<div class="cinema-empty"><span style="font-size:30px">🍿</span><strong>'+ (cinemaVideos.length?'Nothing in this collection yet':'Your movie night starts here')+'</strong>'+(cinemaVideos.length?'Try a different collection.':'Add videos from your phone. They stay offline, sorted, and ready to play.')+'</div>';return}
 box.innerHTML=items.map(v=>{
  const idx=cinemaVideos.indexOf(v),ratio=v.duration>0?Math.min(100,Math.max(0,100*(v.position||0)/v.duration)):0;
  return '<div class="cinema-video-card"><div class="cinema-video-poster">'+((v.category||'')==='Anime'?'🌸':'🎬')+'</div><div class="cinema-video-copy"><b>'+cSafe(v.title)+'</b><small>'+cSafe(v.category||'Other')+(v.duration?' · '+cFmt(v.duration):'')+(v.position>0?' · Resume '+cFmt(v.position):'')+'</small>'+(v.duration?'<div class="cinema-meter"><i style="width:'+ratio.toFixed(1)+'%"></i></div>':'')+'<div class="cinema-video-tools"><button class="cinema-play" data-cinema-video="play" data-index="'+idx+'">▶ Watch</button><button data-cinema-video="edit" data-index="'+idx+'">✎ Edit</button><button class="'+(v.favorite?'cinema-faved':'')+'" data-cinema-video="favorite" data-index="'+idx+'">'+(v.favorite?'★ Saved':'☆ Favorite')+'</button><button data-cinema-video="remove" data-index="'+idx+'">×</button></div></div></div>'
 }).join('');
}
function cRenderLinks(){
 const box=$('cinemaLinks');if(!box)return;
 const items=cFilterItems(cinemaLinks);
 if(!items.length){box.innerHTML='<div class="cinema-empty"><span style="font-size:30px">🔗</span><strong>No saved links here yet</strong>Save YouTube videos, Netflix series or Crunchyroll episodes into your personal watch queue.</div>';return}
 box.innerHTML=items.map(v=>{
  const idx=cinemaLinks.indexOf(v),service=cLinkService(v.url);
  const badge=service==='youtube'?'▶':service==='netflix'?'N':service==='crunchyroll'?'◕':'↗';
  return '<div class="cinema-video-card"><div class="cinema-video-poster">'+badge+'</div><div class="cinema-video-copy"><b>'+cSafe(v.title)+'</b><small>'+cSafe(v.category||'Other')+' · '+cSafe(service==='youtube'?'YouTube in-app':service==='netflix'?'Netflix app':service==='crunchyroll'?'Crunchyroll app':'External link')+'</small><div class="cinema-video-tools"><button class="cinema-play" data-cinema-link="play" data-index="'+idx+'">▶ '+(service==='youtube'?'Watch':'Open')+'</button><button data-cinema-link="edit" data-index="'+idx+'">✎ Edit</button><button class="'+(v.favorite?'cinema-faved':'')+'" data-cinema-link="favorite" data-index="'+idx+'">'+(v.favorite?'★ Saved':'☆ Favorite')+'</button><button data-cinema-link="remove" data-index="'+idx+'">×</button></div></div></div>';
 }).join('');
}
function cRenderCinema(){
 cRenderCategories();cRenderContinue();cRenderVideos();cRenderLinks();
 $('cinemaOfflineTab').classList.toggle('active',cinemaPane==='offline');
 $('cinemaLinksTab').classList.toggle('active',cinemaPane==='links');
 $('cinemaOfflinePanel').hidden=cinemaPane!=='offline';
 $('cinemaLinksPanel').hidden=cinemaPane!=='links';
}
function cLinkService(url){
 try{let host=new URL(url).hostname.toLowerCase().replace(/^www\./,'');if(host==='youtu.be'||host==='youtube.com'||host==='m.youtube.com'||host==='music.youtube.com'||host==='youtube-nocookie.com')return'youtube';if(host==='netflix.com'||host.endsWith('.netflix.com'))return'netflix';if(host==='crunchyroll.com'||host.endsWith('.crunchyroll.com'))return'crunchyroll'}catch(e){}
 return'other';
}
function cValidateUrl(url){try{let u=new URL(url.trim());return u.protocol==='https:'&&!!u.hostname?u.href:null}catch(e){return null}}
function cEditVideo(i){
 const v=cinemaVideos[i];if(!v)return;
 showModal(modalHeader('Edit offline video','Change title and collection without moving the file.')+
 '<form id="cinemaVideoForm"><label class="field"><span>Title</span><input name="title" maxlength="120" required value="'+cSafe(v.title)+'"/></label><label class="field"><span>Collection</span><select name="category">'+cCategoryOptions(v.category||'Other')+'</select></label><button class="wide primary" type="submit">✓ Save changes</button></form>');
 $('cinemaVideoForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);cNative('updateVideo',v.uri,String(f.get('title')||'').trim().slice(0,120),String(f.get('category')||'Other'),!!v.favorite);closeModal()};
}
function cEditLink(i){
 const old=i>=0?cinemaLinks[i]:null;
 showModal(modalHeader(old?'Edit saved link':'Save something to watch','A video or series for your next cooking session.')+
 '<form id="cinemaLinkForm"><label class="field"><span>Title</span><input name="title" maxlength="120" required placeholder="The next episode..." value="'+cSafe(old?.title||'')+'"/></label><label class="field"><span>Video or show URL</span><input name="url" type="url" required placeholder="https://youtu.be/..." value="'+cSafe(old?.url||'')+'"/></label><label class="field"><span>Collection</span><select name="category">'+cCategoryOptions(old?.category||'Anime')+'</select></label><button class="wide primary" type="submit">✓ '+(old?'Save link':'Add to my shelf')+'</button></form>');
 $('cinemaLinkForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),url=cValidateUrl(String(f.get('url')||''));if(!url){toast('Use a valid HTTPS link');return}
 const item={id:old?.id||('link_'+Date.now()+'_'+Math.random().toString(36).slice(2,6)),title:String(f.get('title')||'').trim().slice(0,120),url,category:String(f.get('category')||'Other'),favorite:old?.favorite||false};
 if(!item.title){toast('Add a title');return}
 if(old)cinemaLinks[i]=item;else cinemaLinks.unshift(item);
 cPersist();closeModal();cRenderCinema();toast('Saved to your watch shelf 🍿')
 };
}
function cNewCollection(){
 showModal(modalHeader('New collection','Make your watch shelf feel like yours.')+
 '<form id="cinemaCategoryForm"><label class="field"><span>Collection name</span><input name="name" maxlength="32" placeholder="Weekend anime" required/></label><button class="wide primary" type="submit">＋ Create collection</button></form>');
 $('cinemaCategoryForm').onsubmit=e=>{e.preventDefault();let name=String(new FormData(e.target).get('name')||'').trim().slice(0,32);if(!name||['All','Favorites'].some(x=>x.toLowerCase()===name.toLowerCase())){toast('Choose another name');return}
 if(!cinemaCats.some(x=>x.toLowerCase()===name.toLowerCase()))cinemaCats.push(name);
 cinemaFilter=name;cPersist();closeModal();cRenderCinema();toast('Collection created ✨')};
}
function cPlayLink(i){
 const item=cinemaLinks[i];if(!item)return;
 const service=cLinkService(item.url);
 if(service==='youtube' && typeof extractYoutubeId==='function'){
  const id=extractYoutubeId(item.url);
  if(id){
   cNative('closeVideo');
   if(typeof window.playCinemaYoutube==='function')window.playCinemaYoutube(id,item.title);
   else toast('YouTube player unavailable');
   return;
  }
 }
 // Official apps and non-embeddable links are handed to Android, never scraped.
 cNative('openLink',item.url);
}
window.onNativeCinemaSnapshot=function(payload){
 try{cinemaVideos=(payload&&Array.isArray(payload.videos))?payload.videos:[];cinemaPlayingUri=payload?.playingUri||'';cRenderCinema()}catch(e){console.error('cinema snapshot',e)}
};
window.onNativeCinemaMessage=function(message){toast(String(message||'Kitchen Cinema'))};
function cInit(){
 $('cinemaOfflineTab').onclick=()=>{cinemaPane='offline';cRenderCinema()};
 $('cinemaLinksTab').onclick=()=>{cinemaPane='links';cRenderCinema()};
 $('cinemaImport').onclick=()=>cNative('chooseVideos');
 $('cinemaAddLink').onclick=()=>cEditLink(-1);
 $('cinemaNewCategory').onclick=cNewCollection;
 document.querySelectorAll('[data-service]').forEach(btn=>btn.onclick=()=>cNative('openPlatform',btn.dataset.service));
 $('cinemaVideos').addEventListener('click',e=>{
  const btn=e.target.closest('[data-cinema-video]');if(!btn)return;
  const i=+btn.dataset.index,v=cinemaVideos[i];if(!v)return;
  const action=btn.dataset.cinemaVideo;
  if(action==='play'){cNative('playVideo',v.uri)}
  else if(action==='edit'){cEditVideo(i)}
  else if(action==='favorite'){cNative('updateVideo',v.uri,v.title,v.category||'Other',!v.favorite)}
  else if(action==='remove'){if(confirm('Remove this video from your shelf? The original file will stay on your phone.'))cNative('removeVideo',v.uri)}
 });
 $('cinemaLinks').addEventListener('click',e=>{
  const btn=e.target.closest('[data-cinema-link]');if(!btn)return;
  const i=+btn.dataset.index,v=cinemaLinks[i];if(!v)return;
  const action=btn.dataset.cinemaLink;
  if(action==='play')cPlayLink(i);
  else if(action==='edit')cEditLink(i);
  else if(action==='favorite'){v.favorite=!v.favorite;cPersist();cRenderCinema()}
  else if(action==='remove'){if(confirm('Remove this link from your shelf?')){cinemaLinks.splice(i,1);cPersist();cRenderCinema()}}
 });
 cRenderCinema();if(window.NativeCinema)setTimeout(()=>NativeCinema.getSnapshot(),550);
}
document.addEventListener('DOMContentLoaded',cInit);
