'use strict';
const $=id=>document.getElementById(id);
const STORAGE_KEY='cooking_rotations_v1';
const DEFAULTS=[
 {id:'mexican',name:'Mexican Crunch',icon:'🌮',accent:'#f29d6a',bg:'#fff0dc',meal:'Crispy Chipotle Beef Taco',dessert:'Cold Pistachio Rice Pudding',drink:'Zero',ingredients:'Crispy beef quesadilla / folded taco. Tomato-chili filling, melty cheese.',dessertNotes:'Cold Turkish sütlaç with Antep pistachios.',palate:'Crunchy, savory & spicy → cool, milky & nutty.',tweaks:[],presets:['Extra cheese','More chili','Extra beef']},
 {id:'fiesta',name:'Breakfast Fiesta',icon:'🍳',accent:'#e5ab62',bg:'#fff3d6',meal:'Breakfast Burrito Bowl',dessert:'Chocolate Banana Protein Trifle',drink:'Zero',ingredients:'Tortilla, eggs and sautéed vegetables.',dessertNotes:'2 ladyfingers + a little milk + Premier chocolate protein pudding + banana.',palate:'Savory eggs & vegetables → cool, chocolatey & creamy.',tweaks:[],presets:['Extra avocado','More eggs','Extra vegetables']},
 {id:'cream',name:'Italian Cream',icon:'🍝',accent:'#8cb79b',bg:'#e1f1e7',meal:'Creamy Pesto Steak Fettuccine',dessert:'Lemon Sorbet',drink:'Zero',ingredients:'80 g dry fettuccine + 150 g julienned sirloin + 50 ml cream + 15 g pesto.',dessertNotes:'Ready-made chilled lemon sorbet.',palate:'Rich, creamy basil & steak → tart, icy & refreshing.',tweaks:[],presets:['Beef tenderloin','More basil','Extra parmesan']},
 {id:'fire',name:'Italian Fire',icon:'🍅',accent:'#f17d72',bg:'#ffebe4',meal:'Steak Penne Arrabbiata',dessert:'Bourbon Vanilla Trifle',drink:'Zero',ingredients:'80 g dry penne + 150 g julienned sirloin/tenderloin + Barilla Arrabbiata (or Napoletana).',dessertNotes:'2 ladyfingers + milk + Mövenpick Bourbon Vanilla Pudding + a little cinnamon.',palate:'Tangy, spicy tomato & umami → cold, sweet & silky.',tweaks:[],presets:['Napoletana sauce','Beef tenderloin','Extra parmesan']},
 {id:'comfort',name:'Turkish Comfort',icon:'🥟',accent:'#b49adc',bg:'#f1e7fb',meal:'Saray Mantı',dessert:'Sour Cherry Sorbet',drink:'Zero',ingredients:'Lezzet Mantı Gurme Saray Mantı, garlicky yogurt and sizzling butter with red pepper flakes.',dessertNotes:'Cold sour cherry sorbet (vişne).',palate:'Garlicky yogurt & buttery chili → bright, icy sour cherry.',tweaks:[],presets:['Ravioli Mantı','Extra garlic yogurt','More chili butter']}
];
const moodOptions=[['🤩','Amazing'],['😊','Happy'],['😌','Cozy'],['😐','Okay'],['😴','Tired']];
let rotations=loadRotations(),entries=[],page='home',editingEntry=null,pendingFiles=[],editingRotationId=null,selectionMood='😊',db=null,toastTimer=null;
function loadRotations(){try{let data=JSON.parse(localStorage.getItem(STORAGE_KEY));return Array.isArray(data)&&data.length?data:structuredClone(DEFAULTS)}catch{return JSON.parse(JSON.stringify(DEFAULTS))}}
function saveRotations(){localStorage.setItem(STORAGE_KEY,JSON.stringify(rotations))}

function displayedMeal(r){
 if(r.id==='comfort' && r.tweaks.includes('Ravioli Mantı'))return 'Ravioli Mantı';
 if(r.id==='fire' && r.tweaks.includes('Napoletana sauce'))return 'Steak Penne Napoletana';
 return r.meal;
}
function displayedIngredients(r){
 let v=r.ingredients||'';
 if(r.id==='comfort'&&r.tweaks.includes('Ravioli Mantı'))v=v.replace('Lezzet Mantı Gurme Saray Mantı','Ravioli Mantı');
 if(r.id==='fire'&&r.tweaks.includes('Napoletana sauce'))v=v.replace('Barilla Arrabbiata (or Napoletana)','Barilla Napoletana');
 if(r.tweaks.includes('Beef tenderloin'))v=v.replaceAll('sirloin','tenderloin');
 let extras=r.tweaks.filter(t=>!['Ravioli Mantı','Napoletana sauce','Beef tenderloin'].includes(t));
 return v+(extras.length?' • Added: '+extras.join(', '):'');
}

function esc(str){return String(str??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;')}
function uid(){return 'id_'+Date.now()+'_'+Math.random().toString(36).slice(2,8)}
function today(){let d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}
function prettyDate(d){return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
function toast(msg){const el=$('toast');el.textContent=msg;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',2400)}
function openDB(){return new Promise((resolve,reject)=>{let req=indexedDB.open('cooking_rotations_journal',1);req.onupgradeneeded=()=>{let s=req.result.createObjectStore('entries',{keyPath:'id'});s.createIndex('date','date',{unique:false})};req.onsuccess=()=>{db=req.result;resolve()};req.onerror=()=>reject(req.error)})}
function allEntries(){return new Promise((resolve,reject)=>{let req=db.transaction('entries','readonly').objectStore('entries').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>(b.date+b.created).localeCompare(a.date+a.created)));req.onerror=()=>reject(req.error)})}
function putEntry(entry){return new Promise((resolve,reject)=>{let req=db.transaction('entries','readwrite').objectStore('entries').put(entry);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
function delEntry(id){return new Promise((resolve,reject)=>{let req=db.transaction('entries','readwrite').objectStore('entries').delete(id);req.onsuccess=()=>resolve();req.onerror=()=>reject(req.error)})}
async function refresh(){entries=await allEntries();renderHome();renderJournal();renderGallery();renderStats()}
function setPage(next){page=next;document.querySelectorAll('.page').forEach(x=>x.classList.toggle('active',x.id===next));document.querySelectorAll('.tab[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===next));window.scrollTo({top:0,behavior:'smooth'})}
function closeModal(){const wrap=$('modalWrap');wrap.classList.remove('show');wrap.setAttribute('aria-hidden','true');$('modal').innerHTML='';editingEntry=null;pendingFiles=[]}
function showModal(html){$('modal').innerHTML=html;$('modalWrap').classList.add('show');$('modalWrap').setAttribute('aria-hidden','false')}
function modalHeader(title,desc=''){return `<div class="modal-top"><div><span class="eyebrow">COOKING ROTATIONS</span><h2>${title}</h2>${desc?`<p class="sub">${desc}</p>`:''}</div><button class="modal-close" onclick="closeModal()" aria-label="Close">×</button></div>`}
function renderHome(){const list=$('rotationList');$('rotationCount').textContent=rotations.length;list.innerHTML=rotations.map((r,i)=>`<div class="rotation-card" onclick="openRotation('${esc(r.id)}')" style="--accent:${esc(r.accent)};--cardbg:${esc(r.bg)}"><div class="rotation-icon">${esc(r.icon)}</div><div class="rotation-info"><small class="rotation-number">ROTATION ${String(i+1).padStart(2,'0')}</small><b>${esc(r.name)}</b><p>🍽 ${esc(displayedMeal(r))}<br/>🍨 ${esc(r.dessert)} · 🥤 ${esc(r.drink)}</p></div><span class="chevron">›</span></div>`).join('');let last=entries[0];$('homeInsight').innerHTML=`<span>💛</span><div><strong>${last?'Your last kitchen memory':'Every dinner is a little celebration.'}</strong><p>${last?esc((rotations.find(x=>x.id===last.rotationId)?.name||last.rotationName)+' • '+prettyDate(last.date)):'Tap a rotation to make it yours, then journal the moment.'}</p></div>`}
window.openRotation=function(id){const r=rotations.find(x=>x.id===id);if(!r)return;showModal(`${modalHeader(esc(r.name),'Your meal, dessert, and all the little touches.')}
<div class="detail-visual" style="background:linear-gradient(135deg,${esc(r.bg)},#f6e4e9)"><span class="food-icon">${esc(r.icon)}</span><div><span class="eyebrow">TONIGHT'S MENU</span><br/><strong>${esc(r.name)}</strong></div></div>
<div class="detail-row"><span>🍽️</span><div><b>${esc(displayedMeal(r))}</b><small>${esc(displayedIngredients(r))}</small></div></div>
<div class="detail-row"><span>🍨</span><div><b>${esc(r.dessert)}</b><small>${esc(r.dessertNotes)}</small></div></div>
<div class="detail-row"><span>🥤</span><div><b>${esc(r.drink)}</b></div></div>
<div class="detail-row"><span>✨</span><div><b>Palate pairing</b><small>${esc(r.palate)}</small></div></div>
<div class="field"><span>Little tweaks</span><div class="pill-list">${(r.presets||[]).map(t=>`<button class="pill ${r.tweaks.includes(t)?'selected':''}" onclick="toggleTweak('${esc(r.id)}','${esc(t).replaceAll('&#39;',"\\'")}')">${r.tweaks.includes(t)?'✓ ':''}${esc(t)}</button>`).join('')}${r.tweaks.filter(t=>!r.presets.includes(t)).map(t=>`<button class="pill selected" onclick="toggleTweak('${esc(r.id)}',${JSON.stringify(t).replaceAll('"','&quot;')})">✓ ${esc(t)}</button>`).join('')}</div></div>
<div class="detail-buttons"><button class="primary" onclick="openJournalEditor('${esc(r.id)}')">＋ I cooked this!</button><button class="ghost" onclick="editRotation('${esc(r.id)}')">✎ Edit menu</button><button class="ghost" onclick="customTweak('${esc(r.id)}')">＋ Add tweak</button></div><p class="tiny-note">Changes to this rotation persist on your device. Your past journal entries stay as they were.</p>`) };
window.toggleTweak=function(id,t){let r=rotations.find(x=>x.id===id);if(!r)return;r.tweaks.includes(t)?r.tweaks=r.tweaks.filter(x=>x!==t):r.tweaks.push(t);saveRotations();openRotation(id);toast(r.tweaks.includes(t)?'Tweak added ✨':'Tweak removed')};
window.customTweak=function(id){let text=prompt('Your own tweak (e.g. extra avocado):');if(text&&text.trim()){const r=rotations.find(x=>x.id===id);r.tweaks.push(text.trim().slice(0,100));saveRotations();openRotation(id)}};
window.editRotation=function(id){const r=rotations.find(x=>x.id===id),isNew=!r;editingRotationId=id||null;let v=r||{id:uid(),name:'',icon:'🍲',accent:'#b49adc',bg:'#f0e9f8',meal:'',dessert:'',drink:'Zero',ingredients:'',dessertNotes:'',palate:'',tweaks:[],presets:[]};showModal(`${modalHeader(isNew?'Create a Rotation':'Edit Rotation','Make the menu fit your life, not the other way around.')}
<form id="rotationForm"><div class="fieldrow"><label class="field"><span>Name</span><input required name="name" value="${esc(v.name)}" placeholder="Sunday Comfort"/></label><label class="field"><span>Emoji</span><input required name="icon" value="${esc(v.icon)}" maxlength="8"/></label></div>
<label class="field"><span>Main dish</span><input required name="meal" value="${esc(v.meal)}" placeholder="Your favorite meal"/></label><label class="field"><span>Meal ingredients / notes</span><textarea name="ingredients">${esc(v.ingredients)}</textarea></label>
<label class="field"><span>Dessert</span><input name="dessert" value="${esc(v.dessert)}"/></label><label class="field"><span>Dessert details</span><textarea name="dessertNotes">${esc(v.dessertNotes)}</textarea></label>
<label class="field"><span>Drink</span><input name="drink" value="${esc(v.drink)}"/></label><label class="field"><span>Palate pairing</span><textarea name="palate">${esc(v.palate)}</textarea></label>
<button class="wide primary" type="submit">✓ Save Rotation</button></form>${!isNew?`<button class="wide ghost" onclick="removeRotation('${esc(id)}')">Remove this rotation</button>`:''}`);$('rotationForm').addEventListener('submit',e=>{e.preventDefault();let d=new FormData(e.target);for(let k of ['name','icon','meal','ingredients','dessert','dessertNotes','drink','palate'])v[k]=String(d.get(k)||'').trim();if(isNew)rotations.push(v);saveRotations();closeModal();renderHome();toast(isNew?'New rotation added ✨':'Menu updated ✨');window.SFX?.play('save')})};
window.removeRotation=function(id){if(!confirm('Remove this rotation? Past journal entries will remain.'))return;rotations=rotations.filter(r=>r.id!==id);saveRotations();closeModal();renderHome();toast('Rotation removed');window.SFX?.play('remove')};
function renderJournal(){const el=$('journalList');if(!entries.length){el.innerHTML='<div class="empty"><span class="empty-emoji">📷</span><b>Your first cooking memory is waiting.</b><br/>Add a photo or a note the next time you cook.</div>';return}el.innerHTML=entries.map(e=>{const r=rotations.find(x=>x.id===e.rotationId);return `<article class="journal-card"><div class="journal-head"><div><span class="journal-date">${prettyDate(e.date)} · ${esc(e.mood||'😊')}</span><br/><b>${esc(r?.name||e.rotationName||'My Meal')}</b></div><span style="font-size:28px">${esc(r?.icon||e.rotationIcon||'🍽️')}</span></div><p class="journal-note">${esc(e.note||'A delicious little moment.')}</p>${e.tweaks?.length?`<div class="pill-list">${e.tweaks.map(t=>`<span class="pill selected">${esc(t)}</span>`).join('')}</div>`:''}<div class="entry-media" id="media_${esc(e.id)}"></div><div class="entry-tools"><button onclick="openJournalEditor(null,'${esc(e.id)}')">✎ Edit entry</button><button onclick="deleteJournalEntry('${esc(e.id)}')">🗑 Delete</button></div></article>`}).join('');for(let e of entries)renderEntryMedia(e)}
function renderEntryMedia(e){let box=$('media_'+e.id);if(!box)return;box.innerHTML='';for(let obj of(e.media||[])){let node=document.createElement(obj.type.startsWith('video/')?'video':'img');node.src=URL.createObjectURL(obj.blob);if(node.tagName==='VIDEO'){node.controls=true;node.preload='metadata'}else node.loading='lazy';box.appendChild(node)}}
window.deleteJournalEntry=async function(id){if(!confirm('Delete this journal entry and its media?'))return;await delEntry(id);await refresh();toast('Entry deleted');window.SFX?.play('remove')};
function optionsForRotations(selected){return rotations.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.name)}</option>`).join('')}
window.openJournalEditor=function(rid=null,eid=null){let e=eid?entries.find(x=>x.id===eid):null;editingEntry=e||null;pendingFiles=(e?.media||[]).map(x=>({...x}));selectionMood=e?.mood||'😊';let selected=rid||e?.rotationId||rotations[0]?.id||'';showModal(`${modalHeader(e?'Edit Cooking Memory':'New Cooking Memory','The good food, the little story, the moment itself.')}
<form id="entryForm"><label class="field"><span>Date</span><input type="date" name="date" value="${esc(e?.date||today())}" required/></label>
<label class="field"><span>Rotation</span><select name="rotationId" id="entryRotation">${optionsForRotations(selected)}</select></label>
<label class="field"><span>How was it?</span><div class="mood-options" id="moodOptions">${moodOptions.map(([em,label])=>`<button type="button" class="${em===selectionMood?'active':''}" onclick="pickMood('${em}')">${em}<small>${label}</small></button>`).join('')}</div></label>
<label class="field"><span>My cooking notes</span><textarea name="note" placeholder="How did it turn out? Anything you'd change next time?">${esc(e?.note||'')}</textarea></label>
<label class="field"><span>Photo / video memories</span><label class="media-picker" for="mediaFiles">📸  Tap to add photos or videos</label><input type="file" id="mediaFiles" accept="image/*,video/*" multiple style="display:none"/><div class="media-previews" id="mediaPreviews"></div></label>
<button class="wide primary" type="submit">✓ Save to My Journal</button></form>`);$('mediaFiles').addEventListener('change',async ev=>{for(let f of ev.target.files){if(f.size>200*1024*1024){toast('A video exceeds 200 MB');continue}pendingFiles.push({name:f.name,type:f.type||'application/octet-stream',blob:f})}ev.target.value='';renderFilePreviews()});$('entryForm').addEventListener('submit',submitEntry);renderFilePreviews()};
window.pickMood=function(m){selectionMood=m;document.querySelectorAll('#moodOptions button').forEach(b=>b.classList.toggle('active',b.textContent.includes(m)))};
function renderFilePreviews(){let el=$('mediaPreviews');if(!el)return;el.innerHTML='';pendingFiles.forEach((file,i)=>{let div=document.createElement('div');div.className='thumb';let node=document.createElement(file.type.startsWith('video/')?'video':'img');node.src=URL.createObjectURL(file.blob);if(node.tagName==='VIDEO'){node.muted=true;node.playsInline=true}else node.alt=file.name;div.appendChild(node);let close=document.createElement('button');close.textContent='×';close.type='button';close.onclick=()=>{pendingFiles.splice(i,1);renderFilePreviews()};div.appendChild(close);el.appendChild(div)})}
async function submitEntry(ev){ev.preventDefault();let d=new FormData(ev.target);let rid=d.get('rotationId');let r=rotations.find(x=>x.id===rid);let entry={id:editingEntry?.id||uid(),created:editingEntry?.created||new Date().toISOString(),date:d.get('date'),rotationId:rid,rotationName:r?.name||'Custom Meal',rotationIcon:r?.icon||'🍽️',mood:selectionMood,note:String(d.get('note')||''),tweaks:[...(r?.tweaks||[])],media:pendingFiles};try{await putEntry(entry);closeModal();await refresh();setPage('journal');toast('Memory saved! ✨');window.SFX?.play('finish')}catch(err){toast('Could not save — check device storage');console.error(err)}}
function renderGallery(){const el=$('galleryGrid');let all=entries.flatMap(e=>(e.media||[]).map(m=>({entry:e,media:m})));if(!all.length){el.innerHTML='<div class="empty" style="grid-column:1/-1"><span class="empty-emoji">🎞️</span>Your food gallery starts with your first journal photo.</div>';return}el.innerHTML='';for(let {entry,media} of all){let box=document.createElement('div');box.className='gallery-item';let node=document.createElement(media.type.startsWith('video/')?'video':'img');node.src=URL.createObjectURL(media.blob);if(node.tagName==='VIDEO'){node.controls=true;node.preload='metadata'}else node.loading='lazy';box.append(node);let label=document.createElement('small');label.textContent=(entry.rotationName||'Meal')+' · '+prettyDate(entry.date);box.append(label);el.append(box)}}
function renderStats(){let counts=rotations.map(r=>({name:r.name,num:entries.filter(e=>e.rotationId===r.id).length,icon:r.icon}));let best=[...counts].sort((a,b)=>b.num-a.num)[0];let max=Math.max(1,...counts.map(x=>x.num));$('statsContent').innerHTML=`<div class="stat-card"><span class="eyebrow">YOU'VE MADE</span><div class="stat-big">${entries.length} <span style="font-size:19px">meal memories</span></div><p class="stat-sub">No streak pressure. Every dinner deserves a little joy. 🌸</p></div><div class="stat-card"><span class="eyebrow">MOST COOKED</span><h2>${best?.num?esc(best.icon+' '+best.name):'Your future favorite awaits ✨'}</h2><p class="stat-sub">${best?.num?best.num+' memories so far':'Cook and journal your first rotation.'}</p></div><div class="stat-card"><span class="eyebrow">ROTATION MIX</span>${counts.map(c=>`<div class="stat-chart-row"><div style="min-width:120px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(c.icon+' '+c.name)}</div><div class="bar"><i style="width:${c.num/max*100}%"></i></div><b>${c.num}</b></div>`).join('')}</div><div class="stat-card"><span class="eyebrow">A FRIENDLY REMINDER</span><h3>Good meals. Happy memories.</h3><p class="stat-sub">This isn't a diet tracker or another chore. Make it delicious, then enjoy it. 💛</p></div>`}
function randomPick(){if(!rotations.length){toast('Create a rotation first!');return}let r=rotations[Math.floor(Math.random()*rotations.length)];openRotation(r.id)}
async function blobToDataUrl(b){return await new Promise((resolve,reject)=>{let f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(f.error);f.readAsDataURL(b)})}
function dataUrlToBlob(url){let [a,b]=url.split(',');let type=a.match(/data:(.*?);base64/)[1];let binary=atob(b),bytes=new Uint8Array(binary.length);for(let i=0;i<bytes.length;i++)bytes[i]=binary.charCodeAt(i);return new Blob([bytes],{type})}
function downloadFile(name,content,mime){let a=document.createElement('a');let url=URL.createObjectURL(new Blob([content],{type:mime}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
async function backup(){try{let full=[];for(let e of entries){let media=[];for(let m of(e.media||[]))media.push({name:m.name,type:m.type,data:await blobToDataUrl(m.blob)});full.push({...e,media})}downloadFile('CookingRotations_backup_'+today()+'.json',JSON.stringify({format:'cooking-rotations-v1',date:today(),rotations,entries:full}), 'application/json');toast('Backup exported ✨')}catch(err){console.error(err);toast('Backup could not be exported')}}
async function restoreFile(file){try{let data=JSON.parse(await file.text());if(data.format!=='cooking-rotations-v1'||!Array.isArray(data.rotations)||!Array.isArray(data.entries))throw Error('Invalid backup');if(!confirm('Replace your current rotations and journal with this backup?'))return;rotations=data.rotations;saveRotations();for(let previous of entries)await delEntry(previous.id);for(let e of data.entries){e.media=(e.media||[]).map(m=>({name:m.name,type:m.type,blob:dataUrlToBlob(m.data)}));await putEntry(e)}await refresh();closeModal();toast('Backup restored!')}catch(err){console.error(err);toast('Invalid backup file')}}
window.openSettings=function(){showModal(`${modalHeader('Kitchen Settings','Make your happy little cooking corner your own.')}
<div class="sound-panel">
  <div class="sound-panel-head"><span class="sound-bubble">🎧</span><div><b>Kitchen Soundscape</b><small>Curated fantasy RPG menu sounds · CC0</small></div><label class="sound-switch"><input type="checkbox" id="sfxEnabled" aria-label="Enable sound effects"/><span class="sound-switch-track"></span></label></div>
  <div class="sound-volume-row"><span>Sound effects volume</span><b id="sfxVolumeValue">45%</b></div>
  <input type="range" min="0" max="100" step="5" value="45" id="sfxVolume" aria-label="Sound effects volume"/>
  <div class="sound-note">New crystal-style menu cues, licensed CC0, with light ambience. Offline and independent of Cooking Radio.</div>
  <button type="button" class="sound-preview" id="sfxPreview">♪ Preview the sounds</button>
</div>
<div class="detail-row"><span>🎬</span><div style="flex:1"><b>Cinematic welcome music</b><small>Play Mutfakta Şov when the opening door video begins.</small></div><label class="sound-switch"><input type="checkbox" id="welcomeMusicEnabled" aria-label="Play cinematic welcome music"/><span class="sound-switch-track"></span></label></div>
<div class="detail-row"><span>📦</span><div><b>Backup your journal & media</b><small>Export a local JSON backup with rotations, photos and videos.</small></div></div><button class="wide ghost" onclick="backup()">↓ Export all my data</button><div class="detail-row"><span>📂</span><div><b>Restore a backup</b><small>Import your saved backup file.</small></div></div><button class="wide ghost" onclick="document.getElementById('importFile').click()">↑ Import backup</button><div class="detail-row"><span>🔒</span><div><b>Private and offline</b><small>Your menu and journal stay on your own device. No accounts or tracking.</small></div></div><p class="tiny-note">Keep backups before uninstalling or clearing app storage. This app does not upload your photos anywhere.</p>`);if(window.SFX)SFX.bindSettings();if(window.NativeIntro){let checkbox=$('welcomeMusicEnabled');if(checkbox){checkbox.checked=NativeIntro.getMusicEnabled();checkbox.onchange=()=>NativeIntro.setMusicEnabled(checkbox.checked)}}};
// Two-phase welcome: anime splash, then seven uninterrupted seconds of ambient cooking footage with its music.
// Only after the video has its own moment do the readable menu surfaces fade in.
let welcomeStarted=false;
let welcomeUiTimer=null;
let welcomeLastTap=-1000;
function finishWelcome(){
 if(welcomeUiTimer!==null){clearTimeout(welcomeUiTimer);welcomeUiTimer=null;}
 document.body.classList.remove('intro-pending');
 document.body.classList.add('intro-revealed');
 if(window.NativeIntro)try{NativeIntro.stopWelcome()}catch(e){}
}
window.skipSplash=function(){
 if(welcomeStarted)return;
 welcomeStarted=true;
 const ambient=$('ambient');
 try{
  if(ambient.readyState>=1)ambient.currentTime=0;
  else ambient.addEventListener('loadedmetadata',()=>{try{ambient.currentTime=0}catch(e){}},{once:true});
 }catch(e){}
 ambient.play().catch(()=>{});
 $('splash').classList.add('gone');
 // Start the supplied Mutfakta Şov theme exactly as the door video crossfade begins.
 if(window.NativeIntro)try{NativeIntro.startWelcome()}catch(e){}
 // Keep the splash crossfade (0.85s) separate from the full 7 seconds of visible footage.
 welcomeUiTimer=setTimeout(finishWelcome,7850);
};
function initSplash(){
 const ambient=$('ambient');
 // Hidden gesture: two taps anywhere on the unobstructed video skip straight to the menu.
 // The splash itself cannot accidentally skip; the UI stays untouched on a single tap.
 document.addEventListener('pointerup',event=>{
  if(!welcomeStarted||!document.body.classList.contains('intro-pending'))return;
  if(!$('splash').classList.contains('gone'))return;
  if(event.pointerType==='mouse'&&event.button!==0)return;
  const now=performance.now();
  if(now-welcomeLastTap<420){welcomeLastTap=-1000;finishWelcome();}
  else welcomeLastTap=now;
 },true);
 // The opening video should begin from its first frame AFTER the splash.
 ambient.pause();
 setTimeout(skipSplash,3300);
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)ambient.pause();
  else if(welcomeStarted)ambient.play().catch(()=>{});
 });
}
function bind(){document.querySelectorAll('.tab[data-tab]').forEach(b=>b.addEventListener('click',()=>setPage(b.dataset.tab)));$('floatingAdd').onclick=()=>openJournalEditor();$('quickJournal').onclick=()=>openJournalEditor();$('journalNew').onclick=()=>openJournalEditor();$('addRotation').onclick=()=>editRotation(null);$('surpriseMe').onclick=randomPick;$('settingsButton').onclick=openSettings;$('modalShade').onclick=closeModal;$('importFile').onchange=e=>{if(e.target.files[0])restoreFile(e.target.files[0]);e.target.value=''};window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()})}
async function init(){bind();initSplash();try{await openDB();await refresh()}catch(err){console.error(err);toast('Local journal storage unavailable');renderHome()}}init();