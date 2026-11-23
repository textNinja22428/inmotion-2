'use strict';
/* Market Run — a quiet, offline shopping companion for Cooking Rotations.
 * Shopping amounts are only filled when the original menu specifies them;
 * "as needed" is deliberate, not an inferred serving size.
 */
(function(){
 const KEY='cooking_market_run_v1';
 const CATEGORIES=['Produce','Meat','Pasta','Dairy','Sauces','Spices','Frozen','Desserts','Drinks','Other'];
 const UNITS=['','g','kg','ml','L','pc','can','tub','pack','bottle','serving','tbsp','tsp'];
 const recipe={
  mexican:[
   ['Ground beef',null,'','Meat'],['Tortilla',null,'','Pasta'],['Cheese',null,'','Dairy'],
   ['Tomato paste',null,'','Sauces'],['Chili seasoning',null,'','Spices'],
   ['Rice pudding (sütlaç)',1,'tub','Desserts'],['Antep pistachios',null,'','Desserts'],
   ['Zero soda',1,'can','Drinks']
  ],
  fiesta:[
   ['Tortilla',null,'','Pasta'],['Eggs',null,'','Dairy'],['Mixed vegetables',null,'','Produce'],
   ['Ladyfingers',2,'pc','Desserts'],['Milk',null,'','Dairy'],
   ['Premier chocolate protein pudding',1,'tub','Desserts'],['Banana',null,'','Produce'],
   ['Zero soda',1,'can','Drinks']
  ],
  cream:[
   ['Fettuccine',80,'g','Pasta'],['Julienned sirloin steak',150,'g','Meat'],
   ['Cream',50,'ml','Dairy'],['Pesto sauce',15,'g','Sauces'],
   ['Lemon sorbet',1,'serving','Frozen'],['Zero soda',1,'can','Drinks']
  ],
  fire:[
   ['Penne',80,'g','Pasta'],['Julienned sirloin steak',150,'g','Meat'],
   ['Barilla Arrabbiata sauce',125,'g','Sauces'],['Ladyfingers',2,'pc','Desserts'],
   ['Milk',null,'','Dairy'],['Mövenpick Bourbon Vanilla Pudding',1,'tub','Desserts'],
   ['Cinnamon',null,'','Spices'],['Zero soda',1,'can','Drinks']
  ],
  comfort:[
   ['Lezzet Mantı Gurme Saray Mantı',null,'','Frozen'],['Plain yogurt',null,'','Dairy'],
   ['Garlic',null,'','Produce'],['Butter',null,'','Dairy'],['Red pepper flakes',null,'','Spices'],
   ['Sour cherry sorbet',1,'serving','Frozen'],['Zero soda',1,'can','Drinks']
  ]
 };
 const cleanText=x=>String(x??'').trim().slice(0,120);
 const clone=x=>JSON.parse(JSON.stringify(x));
 const mapRecipe=x=>(x||[]).map(i=>Array.isArray(i)?{name:i[0],qty:i[1],unit:i[2],category:i[3]}:i).filter(i=>i&&i.name);
 const initial={selected:[],counts:{},checked:{},pantry:{},pantryLabels:{},manual:[],recipes:{},lastRun:null,view:'list'};
 let state=load(),allItems=[];
 function load(){try{
   const saved=JSON.parse(localStorage.getItem(KEY)||'{}');
   const merged={...clone(initial),...saved};
   for(const k of ['selected','manual'])if(!Array.isArray(merged[k]))merged[k]=[];
   for(const k of ['counts','checked','pantry','pantryLabels','recipes'])if(!merged[k]||typeof merged[k]!=='object'||Array.isArray(merged[k]))merged[k]={};
   if(!['list','pantry'].includes(merged.view))merged.view='list';
   return merged;
 }catch{return clone(initial)}}
 function persist(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){toast('Market Run could not save on this device')}}
 function keyOf(name,unit=''){return name.trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ')+'|'+unit.trim()}
 function pantryKey(name){return name.trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ')}
 function rotationList(){return typeof rotations==='undefined'?[]:rotations}
 function quantity(q){const n=typeof q==='number'?q:(q===''||q===null||q===undefined?NaN:Number(q));return Number.isFinite(n)&&n>0?Math.min(n,99999):null}
 function countFor(id){return Math.min(20,Math.max(1,Math.floor(Number(state.counts[id])||1)))}
 function rawItems(r){
   if(Array.isArray(state.recipes[r.id]))return clone(state.recipes[r.id]);
   if(recipe[r.id])return mapRecipe(recipe[r.id]);
   return [];
 }
 function selectedItemsFor(r){
   const items=rawItems(r);
   const tweaks=Array.isArray(r.tweaks)?r.tweaks:[];
   const includes=t=>tweaks.some(x=>x.toLocaleLowerCase('en-US')===t.toLocaleLowerCase('en-US'));
   const rename=(match,name)=>{
     for(const i of items)if(i.name.toLowerCase().includes(match.toLowerCase()))i.name=name;
   };
   const extra=(name,category)=>{if(!items.some(i=>i.name.toLowerCase()===name.toLowerCase()))items.push({name,qty:null,unit:'',category})};
   if(includes('Ravioli Mantı'))rename('Saray Mantı','Ravioli Mantı');
   if(includes('Napoletana sauce'))rename('Arrabbiata','Barilla Napoletana sauce');
   if(includes('Beef tenderloin'))rename('sirloin','Julienned beef tenderloin');
   if(includes('Extra avocado'))extra('Avocado','Produce');
   if(includes('Extra parmesan'))extra('Parmesan','Dairy');
   if(includes('More basil'))extra('Fresh basil','Produce');
   return items;
 }
 function calculate(){
   const output=new Map();
   const selected=state.selected.filter(id=>rotationList().some(r=>r.id===id));
   const feed=(i,mult,source)=>{
     const name=cleanText(i.name);if(!name)return;
     const unit=UNITS.includes(i.unit)?i.unit:'';
     const cat=CATEGORIES.includes(i.category)?i.category:'Other';
     const qty=quantity(i.qty);
     const key=keyOf(name,unit);
     if(!output.has(key))output.set(key,{key,name,unit,category:cat,qty:0,known:true,sources:[]});
     const item=output.get(key);
     if(qty===null)item.known=false;
     else item.qty+=qty*mult;
     if(!item.sources.includes(source))item.sources.push(source);
   };
   for(const id of selected){
     const r=rotationList().find(x=>x.id===id);if(!r)continue;
     for(const i of selectedItemsFor(r))feed(i,countFor(id),r.name);
   }
   for(const m of state.manual)feed(m,1,'Extra item');
   return [...output.values()].sort((a,b)=>{
     const ca=CATEGORIES.indexOf(a.category),cb=CATEGORIES.indexOf(b.category);
     return ca-cb||a.name.localeCompare(b.name);
   });
 }
 function fmtAmount(item){
   if(!item.known)return 'As needed';
   const q=Math.round(item.qty*100)/100;
   return (Number.isInteger(q)?String(q):q.toFixed(2).replace(/0+$/,'').replace(/\.$/,''))+(item.unit?' '+item.unit:'');
 }
 function keepPantry(item,yes){
   const k=pantryKey(item.name);
   if(yes){state.pantry[k]=true;state.pantryLabels[k]=item.name;}
   else{delete state.pantry[k];delete state.pantryLabels[k];}
   persist();render();
 }
 function setPageView(name){state.view=name;persist();render()}
 function selectedCount(){return state.selected.filter(id=>rotationList().some(r=>r.id===id)).length}
 function drawRotations(){
   const target=$('shopRotations');if(!target)return;
   const rs=rotationList();
   if(!rs.length){target.innerHTML='<div class="shop-empty">Add your first meal rotation to make a shopping list.</div>';return}
   target.innerHTML=rs.map(r=>{
     const active=state.selected.includes(r.id),count=countFor(r.id),items=rawItems(r);
     return '<div class="shop-rotation '+(active?'selected':'')+'">'+
       '<button type="button" class="shop-rotation-select" data-shop-action="toggle-rotation" data-rid="'+esc(r.id)+'" aria-pressed="'+active+'">'+
       '<span class="shop-rotation-emoji">'+esc(r.icon||'🍽️')+'</span><span class="shop-rotation-text"><b>'+esc(r.name)+'</b><small>'+esc(displayedMeal(r))+'</small></span><span class="shop-round-check">'+(active?'✓':'＋')+'</span></button>'+
       '<div class="shop-rotation-footer"><button class="shop-text-action" data-shop-action="recipe" data-rid="'+esc(r.id)+'">✎ '+(items.length?'Ingredients':'Add ingredients')+'</button>'+
       (active?'<div class="shop-servings"><button data-shop-action="less" data-rid="'+esc(r.id)+'" aria-label="Decrease meal count">−</button><span>'+count+'×</span><button data-shop-action="more" data-rid="'+esc(r.id)+'" aria-label="Increase meal count">＋</button></div>':'')+
       '</div></div>';
   }).join('');
 }
 function drawStatus(){
   const items=calculate();allItems=items;
   const buy=items.filter(i=>!state.pantry[pantryKey(i.name)]);
   const done=buy.filter(i=>state.checked[i.key]).length;
   const owned=items.length-buy.length;
   const title=$('shopStatus');if(!title)return;
   title.innerHTML='<div class="shop-status-count"><strong>'+done+' / '+buy.length+'</strong><span>items collected</span></div>'+
     '<div class="shop-status-progress"><i style="width:'+(buy.length?Math.round(done/buy.length*100):0)+'%"></i></div>'+
     '<p>'+owned+' already in your pantry · '+selectedCount()+' rotation'+(selectedCount()===1?'':'s')+' selected</p>';
 }
 function itemRow(i,idx,type){
   const checked=!!state.checked[i.key];
   return '<div class="shop-item '+(checked&&type==='buy'?'collected':'')+'">'+
    (type==='buy'?'<button class="shop-item-check" data-shop-action="check-item" data-index="'+idx+'" aria-label="'+(checked?'Uncheck ':'Mark bought ')+esc(i.name)+'">'+(checked?'✓':'')+'</button>':
     '<button class="shop-item-check owned" data-shop-action="pantry-item" data-index="'+idx+'" aria-label="Remove '+esc(i.name)+' from pantry">✓</button>')+
    '<div class="shop-item-info"><b>'+esc(i.name)+'</b><small>'+esc(i.sources.join(' · '))+'</small></div>'+
    '<span class="shop-item-amount">'+esc(fmtAmount(i))+'</span>'+
    (type==='buy'?'<button class="shop-item-pantry" data-shop-action="pantry-item" data-index="'+idx+'" title="I have this at home" aria-label="Already have '+esc(i.name)+'">⌂</button>':'')+'</div>';
 }
 function drawList(){
   const wrap=$('shopList');if(!wrap)return;
   if(!selectedCount()&&!state.manual.length){wrap.innerHTML='<div class="shop-empty"><span>🧺</span><strong>What are we cooking?</strong>Pick your rotations above and your list will build itself.</div>';return}
   const missing=state.selected.map(id=>rotationList().find(r=>r.id===id)).filter(r=>r&&rawItems(r).length===0);
   const emptyHint=missing.length?'<div class="shop-gentle-warning">✎ Add shopping ingredients for '+missing.map(r=>esc(r.name)).join(', ')+' using the edit button above.</div>':'';
   const buy=allItems.map((v,idx)=>({...v,idx})).filter(i=>!state.pantry[pantryKey(i.name)]);
   const groups=CATEGORIES.map(cat=>{
     const next=buy.filter(i=>i.category===cat&&!state.checked[i.key]);
     return next.length?'<div class="shop-category"><div class="shop-category-heading">'+esc(cat)+'</div>'+next.map(i=>itemRow(i,i.idx,'buy')).join('')+'</div>':'';
   }).join('');
   const purchased=buy.filter(i=>state.checked[i.key]);
   wrap.innerHTML=emptyHint+(buy.length?groups+(purchased.length?'<div class="shop-category"><div class="shop-category-heading">✓ Bought '+purchased.length+'</div>'+purchased.map(i=>itemRow(i,i.idx,'buy')).join('')+'</div>':''):'<div class="shop-empty">All done! Everything is at home or your ingredient list is empty. ✨</div>');
 }
 function drawPantry(){
   const wrap=$('shopPantry');if(!wrap)return;
   const map=new Map(allItems.map((i,idx)=>[pantryKey(i.name),{...i,idx}]));
   const existing=Object.keys(state.pantry).filter(k=>state.pantry[k]);
   if(!existing.length){wrap.innerHTML='<div class="shop-empty"><span>🏠</span><strong>Your pantry is ready</strong>Tap the house icon beside ingredients you already have. They disappear from your buy list.</div>';return}
   wrap.innerHTML='<div class="shop-category"><div class="shop-category-heading">Already at home · '+existing.length+'</div>'+
     existing.sort().map(k=>{
       const found=map.get(k);
       return found?itemRow(found,found.idx,'pantry'):'<div class="shop-item"><button class="shop-item-check owned" data-shop-action="remove-pantry" data-key="'+esc(k)+'">✓</button><div class="shop-item-info"><b>'+esc(state.pantryLabels[k]||k)+'</b><small>Saved pantry item</small></div></div>';
     }).join('')+'</div>';
 }
 function draw(){
   if(!$('shopRotations'))return;
   drawRotations();drawStatus();drawList();drawPantry();
   $('shopListPanel').hidden=state.view!=='list';
   $('shopPantryPanel').hidden=state.view!=='pantry';
   $('shopListTab').classList.toggle('active',state.view==='list');
   $('shopPantryTab').classList.toggle('active',state.view==='pantry');
   const latest=$('shopLastRun');
   if(state.lastRun&&state.lastRun.date){
     latest.hidden=false;
     latest.textContent='Last market run: '+new Date(state.lastRun.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
   }else latest.hidden=true;
   $('shopRepeat').disabled=!state.lastRun;
 }
 function render(){draw()}
 function editRecipe(id){
   const r=rotationList().find(x=>x.id===id);if(!r)return;
   const items=rawItems(r);
   showModal(modalHeader('Shopping ingredients',r.name+' · Edit amounts, brands, and what to buy.')+
    '<p class="shop-modal-hint">Leave quantity blank for “as needed.” Changing this shopping list will not overwrite your meal notes.</p>'+
    '<form id="shopRecipeForm"><div id="shopRecipeRows"></div><button class="wide ghost" type="button" id="shopAddIngredient">＋ Ingredient</button>'+
    '<button class="wide primary" type="submit">✓ Save ingredients</button></form>'+
    (recipe[r.id]?'<button type="button" class="wide shop-restore-recipe" id="shopRestoreRecipe">↺ Restore starter ingredients</button>':''));
   function row(item){
     const el=document.createElement('div');el.className='shop-recipe-row';
     el.innerHTML='<input class="shop-recipe-name" maxlength="120" data-field="name" required aria-label="Ingredient" placeholder="Ingredient" value="'+esc(item?.name||'')+'"/>'+
       '<div class="shop-recipe-details"><input type="number" min="0.01" max="99999" step="any" data-field="qty" aria-label="Quantity" placeholder="Amount" value="'+(quantity(item?.qty)??'')+'"/>'+
       '<select data-field="unit" aria-label="Unit">'+UNITS.map(u=>'<option value="'+esc(u)+'"'+(u===(item?.unit||'')?' selected':'')+'>'+(u||'No unit')+'</option>').join('')+'</select>'+
       '<select data-field="category" aria-label="Category">'+CATEGORIES.map(c=>'<option value="'+c+'"'+(c===(item?.category||'Other')?' selected':'')+'>'+c+'</option>').join('')+'</select>'+
       '<button type="button" class="shop-remove-row" data-shop-row-remove aria-label="Remove ingredient">×</button></div>';
     el.querySelector('[data-shop-row-remove]').onclick=()=>el.remove();
     $('shopRecipeRows').appendChild(el);
   }
   items.forEach(row);
   $('shopAddIngredient').onclick=()=>row({name:'',qty:null,unit:'',category:'Other'});
   $('shopRecipeForm').onsubmit=e=>{
     e.preventDefault();
     const result=[...$('shopRecipeRows').querySelectorAll('.shop-recipe-row')].map(el=>{
       const name=cleanText(el.querySelector('[data-field=name]').value);
       return {name,qty:quantity(el.querySelector('[data-field=qty]').value),unit:el.querySelector('[data-field=unit]').value,category:el.querySelector('[data-field=category]').value};
     }).filter(i=>i.name);
     state.recipes[id]=result;
     persist();closeModal();render();toast('Shopping ingredients saved ✨');
     window.SFX?.play('save');
   };
   const restore=$('shopRestoreRecipe');
   if(restore)restore.onclick=()=>{if(!confirm('Restore the original ingredients for this rotation?'))return;delete state.recipes[id];persist();closeModal();render();toast('Starter ingredients restored')};
 }
 function addItem(){
   showModal(modalHeader('Extra market item','Add anything else you need this trip.')+
    '<form id="shopExtraForm"><label class="field"><span>Item</span><input required name="name" maxlength="120" placeholder="Sparkling water"/></label>'+
    '<div class="fieldrow"><label class="field"><span>Amount (optional)</span><input type="number" min="0.01" step="any" max="99999" name="qty" placeholder="1"/></label>'+
    '<label class="field"><span>Unit</span><select name="unit">'+UNITS.map(u=>'<option value="'+esc(u)+'">'+(u||'No unit')+'</option>').join('')+'</select></label></div>'+
    '<label class="field"><span>Category</span><select name="category">'+CATEGORIES.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select></label>'+
    '<button class="wide primary" type="submit">＋ Add to list</button></form>');
   $('shopExtraForm').onsubmit=e=>{
     e.preventDefault();
     const f=new FormData(e.target),name=cleanText(f.get('name'));if(!name)return;
     state.manual.push({id:'extra_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name,qty:quantity(f.get('qty')),unit:String(f.get('unit')||''),category:String(f.get('category')||'Other')});
     persist();closeModal();render();toast('Added to your shopping list');window.SFX?.play('sparkle');
   };
 }
 function finishRun(){
   if(!state.selected.length&&!state.manual.length){toast('Choose a meal or add an item first');return}
   state.lastRun={date:new Date().toISOString(),selected:state.selected.slice(),counts:clone(state.counts),manual:clone(state.manual)};
   persist();render();toast('Market run complete! 🌸');window.SFX?.play('finish');
 }
 function repeatRun(){
   const r=state.lastRun;if(!r){toast('Finish a market run first');return}
   state.selected=(r.selected||[]).filter(id=>rotationList().some(x=>x.id===id));
   state.counts=clone(r.counts||{});state.manual=clone(r.manual||[]);
   state.checked={};state.view='list';persist();render();toast('Previous run restored — happy shopping!');
 }
 function newRun(){if(Object.keys(state.checked).length&&!confirm('Start a fresh run and clear your checked items?'))return;state.selected=[];state.counts={};state.manual=[];state.checked={};state.view='list';persist();render();toast('Fresh market run ready')}
 function addRotation(id){
   if(!rotationList().some(r=>r.id===id))return;
   if(!state.selected.includes(id))state.selected.push(id);
   state.view='list';persist();closeModal();setPage('shop');render();toast('Rotation added to Market Run 🛒');
 }
 function onClick(e){
   const b=e.target.closest('[data-shop-action]');if(!b)return;
   const action=b.dataset.shopAction,id=b.dataset.rid;
   const i=allItems[Number(b.dataset.index)];
   if(action==='toggle-rotation'){
     state.selected=state.selected.includes(id)?state.selected.filter(x=>x!==id):[...state.selected,id];
     persist();render();
   }else if(action==='less'||action==='more'){
     state.counts[id]=Math.max(1,Math.min(20,countFor(id)+(action==='less'?-1:1)));persist();render();
   }else if(action==='recipe')editRecipe(id);
   else if(action==='check-item'&&i){state.checked[i.key]=!state.checked[i.key];persist();render();}
   else if(action==='pantry-item'&&i)keepPantry(i,!state.pantry[pantryKey(i.name)]);
   else if(action==='remove-pantry'){delete state.pantry[b.dataset.key];delete state.pantryLabels[b.dataset.key];persist();render();}
 }
 function copyList(){
   const current=calculate().filter(i=>!state.pantry[pantryKey(i.name)]&&!state.checked[i.key]);
   const data='MARKET RUN\n'+current.map(i=>'☐ '+i.name+' — '+fmtAmount(i)).join('\n');
   if(!current.length){toast('Nothing left to buy');return}
   if(navigator.clipboard?.writeText)navigator.clipboard.writeText(data).then(()=>toast('Shopping list copied')).catch(()=>fallbackCopy(data));
   else fallbackCopy(data);
 }
 function fallbackCopy(data){
   const area=document.createElement('textarea');area.value=data;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);
   area.select();try{document.execCommand('copy');toast('Shopping list copied')}catch(e){toast('Copy unavailable')};area.remove();
 }
 function bind(){
   const page=$('shop');if(!page)return;
   page.addEventListener('click',onClick);
   $('shopListTab').onclick=()=>setPageView('list');
   $('shopPantryTab').onclick=()=>setPageView('pantry');
   $('shopAddItem').onclick=addItem;
   $('shopFinish').onclick=finishRun;
   $('shopRepeat').onclick=repeatRun;
   $('shopNewRun').onclick=newRun;
   $('shopCopy').onclick=copyList;
   $('shopSelectAll').onclick=()=>{state.selected=rotationList().map(r=>r.id);persist();render()};
   render();
 }
 function exportState(){return clone(state)}
 function importState(data){
   if(!data||typeof data!=='object')return;
   try{localStorage.setItem(KEY,JSON.stringify(data));state=load();render()}catch(e){toast('Could not restore Market Run')}
 }
 window.Shop={render,addRotation,editRecipe,exportState,importState,_test:{calculate,rawItems,selectedItemsFor,quantity,fmtAmount,pantryKey,keyOf}};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
