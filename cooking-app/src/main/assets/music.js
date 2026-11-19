'use strict';
// Cooking Radio — native local audio + official YouTube video embeds.
const YOUTUBE_STORE_KEY='cooking_rotations_youtube_v1';
let musicState={tracks:[],currentId:'',playing:false,position:0,duration:0,shuffle:false,repeat:false};
let youtubeTracks=loadYoutubeTracks();
let musicTab='local',youtubeActive='',seekFingerDown=false;
function loadYoutubeTracks(){try{let a=JSON.parse(localStorage.getItem(YOUTUBE_STORE_KEY));return Array.isArray(a)?a:[]}catch{return []}}
function saveYoutubeTracks(){localStorage.setItem(YOUTUBE_STORE_KEY,JSON.stringify(youtubeTracks))}
function nMusic(method,...args){if(window.NativeMusic&&typeof NativeMusic[method]==='function'){NativeMusic[method](...args);return true}toast('Local audio is available in the Android APK');return false}
function fmtMusic(ms){let s=Math.floor(Math.max(0,ms||0)/1000);return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function playingTrack(){return musicState.tracks.find(t=>t.id===musicState.currentId)}
window.onNativeMusicSnapshot=function(data){musicState=data||musicState;renderMusicControls();renderLocalMusicList()};
window.onNativeMusicMessage=function(message){toast(message)};
function renderMusicControls(){
 const track=playingTrack(),playing=!!musicState.playing;
 $('musicNowTitle').textContent=youtubeActive?(youtubeTracks.find(t=>t.id===youtubeActive)?.title||'YouTube video'):(track?track.title:'Nothing playing yet');
 $('musicNowSub').textContent=youtubeActive?'Playing in the always-visible video dock. Browse any tab ♪':(track?'Your local kitchen soundtrack 🎶':'Add your favorite tracks to get cooking.');
 $('musicPlay').textContent=playing?'❚❚':'▶';
 $('musicShuffle').classList.toggle('selected',!!musicState.shuffle);
 $('musicRepeat').classList.toggle('selected',!!musicState.repeat);
 $('musicElapsed').textContent=fmtMusic(musicState.position);
 $('musicDuration').textContent=fmtMusic(musicState.duration);
 if(!seekFingerDown)$('musicSeek').value=musicState.duration?Math.round(1000*musicState.position/musicState.duration):0;
 $('miniMusic').hidden=!track || !!youtubeActive;
 if(track){$('miniMusicTitle').textContent=track.title;$('miniToggle').textContent=playing?'❚❚':'▶'}
}
function renderLocalMusicList(){
 const target=$('localMusicList');
 if(!musicState.tracks.length){target.innerHTML='<div class="music-empty">🎼 <b>Your playlist is waiting.</b><br/>Tap “Add audio from phone” to bring your own songs.</div>';return;}
 target.innerHTML=`<div class="music-library-title"><b>My songs</b><span>${musicState.tracks.length} tracks</span></div>`+musicState.tracks.map((song,i)=>`<div class="song-row ${musicState.currentId===song.id?'now':''}"><span class="song-index">${musicState.currentId===song.id?'♫':i+1}</span><button class="song-name" data-play-song="${esc(song.id)}"><b>${esc(song.title)}</b><small>${musicState.currentId===song.id?(musicState.playing?'Now playing':'Paused'):'Tap to play'}</small></button><button class="song-remove" data-remove-song="${esc(song.id)}" aria-label="Remove song">×</button></div>`).join('');
 target.querySelectorAll('[data-play-song]').forEach(b=>b.onclick=()=>musicPlayLocal(b.dataset.playSong));
 target.querySelectorAll('[data-remove-song]').forEach(b=>b.onclick=()=>{if(confirm('Remove this song from your Cooking Radio library? The original file stays on your phone.'))nMusic('removeTrack',b.dataset.removeSong)});
}
function musicPlayLocal(id){closeYoutubePlayer();nMusic('playTrack',id)}
function musicStopLocal(){if(window.NativeMusic)NativeMusic.stop()}
function musicToggle(){if(!musicState.currentId){if(musicState.tracks.length)musicPlayLocal(musicState.tracks[0].id);else toast('Add a track first ♪');return}nMusic(musicState.playing?'pause':'resume')}
function selectMusicTab(which){
 musicTab=which;
 $('musicLocalTab').classList.toggle('active',which==='local');
 $('musicYoutubeTab').classList.toggle('active',which==='youtube');
 $('localMusicPanel').hidden=which!=='local';
 $('youtubeMusicPanel').hidden=which!=='youtube';
 // Switching the library sub-tab never destroys the active YouTube iframe.
}
function extractYoutubeId(s){try{
 let u=new URL(s.trim());let host=u.hostname.toLowerCase().replace(/^www\./,'');let id='';
 if(host==='youtu.be')id=u.pathname.split('/')[1]||'';
 else if(['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host)){
  if(u.pathname==='/watch')id=u.searchParams.get('v')||'';
  else if(/^\/(shorts|live|embed)\//.test(u.pathname))id=u.pathname.split('/')[2]||'';
 }
 return /^[a-zA-Z0-9_-]{11}$/.test(id)?id:null;
 }catch{return null}}
function renderYoutubeList(){
 const el=$('youtubeLinks');if(!youtubeTracks.length){el.innerHTML='<div class="music-empty">▶ <b>No links saved yet.</b><br/>Paste a YouTube video URL above.</div>';return}
 el.innerHTML='<div class="music-library-title"><b>Saved YouTube videos</b><span>'+youtubeTracks.length+' links</span></div>'+youtubeTracks.map((t,i)=>`<div class="song-row ${youtubeActive===t.id?'now':''}"><span class="song-index">▶</span><button class="song-name" data-yt-play="${esc(t.id)}"><b>${esc(t.title)}</b><small>youtube.com · Tap to watch / listen</small></button><button class="song-remove" data-yt-delete="${esc(t.id)}" aria-label="Remove link">×</button></div>`).join('');
 el.querySelectorAll('[data-yt-play]').forEach(x=>x.onclick=()=>playYoutube(x.dataset.ytPlay));
 el.querySelectorAll('[data-yt-delete]').forEach(x=>x.onclick=()=>{youtubeTracks=youtubeTracks.filter(y=>y.id!==x.dataset.ytDelete);saveYoutubeTracks();if(youtubeActive===x.dataset.ytDelete)closeYoutubePlayer();renderYoutubeList()});
}
function playYoutube(id){
 const item=youtubeTracks.find(x=>x.id===id);
 if(!item)return;
 // Selecting the same item must not reload the iframe (which restarts its song).
 if(youtubeActive===id && $('youtubeDockPlayer').querySelector('iframe')){
  $('youtubeDock').hidden=false;
  document.body.classList.add('youtube-docked');
  return;
 }
 // The native audio player and YouTube should never compete for the speaker.
 musicStopLocal();
 youtubeActive=id;
 const dock=$('youtubeDock');
 $('youtubeDockTitle').textContent=item.title;
 $('youtubeOpenExternal').href=item.url;
 // This official video stays mounted in the DOM even if the user navigates to Home/Journal/Gallery.
 // The visible iframe is deliberately >=200px in each dimension; no background-only playback.
 const iframe=document.createElement('iframe');
 iframe.title='YouTube video: '+item.title;
 iframe.setAttribute('allow','autoplay; encrypted-media; picture-in-picture; fullscreen');
 iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
 iframe.setAttribute('allowfullscreen','');
 iframe.setAttribute('loading','eager');
 iframe.src='https://www.youtube.com/embed/'+id+'?playsinline=1&rel=0&autoplay=1';
 const frame=document.createElement('div');
 frame.className='youtube-frame';
 frame.appendChild(iframe);
 $('youtubeDockPlayer').replaceChildren(frame);
 dock.hidden=false;
 document.body.classList.add('youtube-docked');
 updateYoutubeStatus();
 renderYoutubeList();renderMusicControls();
}
function updateYoutubeStatus(){
 const hint=$('youtubePlayerContainer');
 if(!hint)return;
 hint.hidden=!youtubeActive;
 if(youtubeActive)hint.textContent='♪ YouTube is open in the persistent video dock. Switch to any app tab — your video stays visible and keeps its place.';
}
function closeYoutubePlayer(){
 if(!youtubeActive)return;
 youtubeActive='';
 // Explicit stop or switching to local audio can tear down the embed.
 $('youtubeDockPlayer').replaceChildren();
 $('youtubeDock').hidden=true;
 document.body.classList.remove('youtube-docked');
 updateYoutubeStatus();
 renderYoutubeList();renderMusicControls();
}
function saveYoutube(){const url=$('youtubeUrl').value.trim(),id=extractYoutubeId(url);
 if(!id){toast('Use a YouTube video link (not a playlist)');return}
 const label=$('youtubeLabel').value.trim().slice(0,80)||'YouTube video · '+id;
 if(youtubeTracks.some(x=>x.id===id)){toast('This video is already in your playlist');return}
 youtubeTracks.push({id,title:label,url:'https://www.youtube.com/watch?v='+id});saveYoutubeTracks();
 $('youtubeUrl').value='';$('youtubeLabel').value='';renderYoutubeList();toast('YouTube link saved ♪');
}
function initMusic(){
 $('musicImport').onclick=()=>nMusic('chooseSongs');
 $('musicLocalTab').onclick=()=>selectMusicTab('local');
 $('musicYoutubeTab').onclick=()=>selectMusicTab('youtube');
 $('musicPlay').onclick=musicToggle;
 $('musicPrev').onclick=()=>nMusic('previous');$('musicNext').onclick=()=>nMusic('next');
 $('musicShuffle').onclick=()=>nMusic('setShuffle',!musicState.shuffle);
 $('musicRepeat').onclick=()=>nMusic('setRepeat',!musicState.repeat);
 $('musicSeek').addEventListener('input',e=>{seekFingerDown=true;$('musicElapsed').textContent=fmtMusic((+e.target.value)*musicState.duration/1000)});
 $('musicSeek').addEventListener('change',e=>{seekFingerDown=false;if(musicState.duration)nMusic('seek',Math.floor((+e.target.value)*musicState.duration/1000))});
 $('miniToggle').onclick=musicToggle;
 $('miniPrev').onclick=()=>nMusic('previous');$('miniNext').onclick=()=>nMusic('next');
 $('miniMusicTitle').onclick=()=>setPage('music');
 $('youtubeAdd').onclick=saveYoutube;
 $('youtubeDockClose').onclick=closeYoutubePlayer;
 $('youtubeDockMusic').onclick=()=>setPage('music');
 updateYoutubeStatus();renderYoutubeList();renderLocalMusicList();renderMusicControls();
 if(window.NativeMusic)setTimeout(()=>NativeMusic.getSnapshot(),350);
}
// Navigation never removes the persistent visible player; only explicit stop does.
document.addEventListener('DOMContentLoaded',initMusic);
