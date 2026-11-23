'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function boot(){
  const store=new Map();
  const rotations=[
    {id:'cream',name:'Italian Cream',tweaks:[]},
    {id:'fire',name:'Italian Fire',tweaks:[]},
    {id:'fiesta',name:'Breakfast Fiesta',tweaks:[]},
    {id:'comfort',name:'Turkish Comfort',tweaks:[]},
    {id:'custom',name:'My Custom Meal',tweaks:[]}
  ];
  const ctx={
    console,window:{},rotations,
    document:{readyState:'loading',addEventListener(){}},
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
    toast(){},closeModal(){},setPage(){},
    esc:s=>String(s),displayedMeal:r=>r.name,
    $:()=>null,
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../cooking-app/src/main/assets/shop.js'),'utf8'),ctx);
  return {shop:ctx.window.Shop,rotations,store};
}

test('combines two rotations without doubling items',()=>{
  const {shop}=boot();
  shop.addRotation('cream');shop.addRotation('fire');
  const items=shop._test.calculate();
  const steak=items.find(i=>i.name==='Julienned sirloin steak');
  assert.equal(steak.qty,300);assert.equal(steak.unit,'g');
  const zero=items.find(i=>i.name==='Zero soda');
  assert.equal(zero.qty,2);assert.equal(zero.unit,'can');
  assert.equal(steak.sources.length,2);
  assert.equal(items.find(i=>i.name==='Fettuccine').qty,80);
  assert.equal(items.find(i=>i.name==='Penne').qty,80);
});
test('menu tweaks replace ingredients instead of leaving obsolete ingredients',()=>{
  const {shop,rotations}=boot();
  rotations.find(r=>r.id==='fire').tweaks=['Napoletana sauce','Beef tenderloin'];
  rotations.find(r=>r.id==='comfort').tweaks=['Ravioli Mantı'];
  rotations.find(r=>r.id==='fiesta').tweaks=['Extra avocado'];
  shop.addRotation('fire');shop.addRotation('comfort');shop.addRotation('fiesta');
  const names=shop._test.calculate().map(i=>i.name);
  assert(names.includes('Barilla Napoletana sauce'));
  assert(!names.includes('Barilla Arrabbiata sauce'));
  assert(names.includes('Julienned beef tenderloin'));
  assert(!names.includes('Julienned sirloin steak'));
  assert(names.includes('Ravioli Mantı'));
  assert(!names.includes('Lezzet Mantı Gurme Saray Mantı'));
  assert(names.includes('Avocado'));
});
test('preserves user edits, unknown quantities, and repeat-run information',()=>{
  const {shop}=boot();
  let state=shop.exportState();
  state.selected=['custom'];
  state.recipes.custom=[{name:'Cottage cheese',qty:350,unit:'g',category:'Dairy'}, {name:'Salt',qty:null,unit:'',category:'Spices'}];
  state.manual=[{id:'extra',name:'Cottage cheese',qty:150,unit:'g',category:'Dairy'}];
  state.pantry={salt:true};
  state.lastRun={selected:['cream'],counts:{cream:2},manual:[],date:'2026-11-23T12:00:00Z'};
  shop.importState(state);
  const items=shop._test.calculate();
  assert.equal(items.find(i=>i.name==='Cottage cheese').qty,500);
  assert.equal(shop._test.fmtAmount(items.find(i=>i.name==='Salt')),'As needed');
  assert.equal(shop.exportState().lastRun.counts.cream,2);
  assert.equal(shop.exportState().pantry.salt,true);
});
