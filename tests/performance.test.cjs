require('node:fs').mkdirSync(require('node:path').resolve(__dirname,'../test-output'),{recursive:true});
const test=require('node:test'),assert=require('node:assert/strict');
const {PriorityGate}=require('../src/thumbnail-pool.cjs');
const {ThumbnailService}=require('../src/thumbnail-service.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));

test('When image process reaches recycling limit, release slots; the next request can create a new reader',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),{createCanvas}=require('@napi-rs/canvas'),{ImageReaders}=require('../src/thumbnail-pool.cjs');
  const root=path.resolve(__dirname,'../test-output'),directory=await fs.mkdtemp(path.join(root,'reader-recycle-'));
  const canvas=createCanvas(16,16);canvas.getContext('2d').fillRect(0,0,16,16);const filename=path.join(directory,'real.png');await fs.writeFile(filename,await canvas.encode('png'));
  const readers=new ImageReaders(path.resolve(__dirname,'../src/thumbnail-cpu-worker.cjs'),1);readers.slots[0].jobs=63;
  try{const a={path:filename,extension:'.png',size:100};assert.equal((await readers.read(a,path.join(directory,'first.jpg'),'raster')).ok,true);assert.equal(readers.gate.running,0);assert.equal(readers.slots[0].worker,null);assert.equal((await readers.read(a,path.join(directory,'second.jpg'),'raster')).ok,true);assert.equal(readers.gate.running,0);}finally{const children=readers.slots.map(s=>s.worker).filter(Boolean);readers.stop();await Promise.all(children.map(child=>child.exitCode!==null?null:new Promise(r=>child.once('exit',r))));assert.ok(directory.startsWith(root+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});

test('Background cannot occupy foreground reserved capacity; queued foreground requests get the released slots first',async()=>{
  const gate=new PriorityGate(3,1),a=await gate.enter(true),b=await gate.enter(true),order=[];
  const waiting=gate.enter(true).then(release=>{order.push('background');return release;});
  const c=await gate.enter(false);assert.equal(gate.running,3);
  const foreground=gate.enter(false).then(release=>{order.push('foreground');return release;});
  a();const d=await foreground;assert.deepEqual(order,['foreground']);
  b();const e=await waiting;assert.deepEqual(order,['foreground','background']);c();d();e();assert.equal(gate.running,0);
});

test('Parallel tasks pause after out-of-order completion; restart won’t skip unfinished assets',async()=>{
  const done=new Set(),rows=Array.from({length:19},(_,i)=>({id:i+1}));let saved=null;
  const request=async(method,...args)=>{if(method==='thumbStats')return {total:19,counts:[{kind:'content',n:done.size}],state:saved&&JSON.stringify(saved)};if(method==='thumbBatchSave'){saved=structuredClone(args[0]);return true;}if(method==='thumbWork')return args[2]==='fast'?rows.filter(a=>a.id>args[0]&&!done.has(a.id)):[];throw new Error(method);};
  const service=new ThumbnailService({base:__dirname,data:__dirname,request});
  service.get=async id=>{await delay(id===1?50:4);done.add(id);return {};};
  await service.startBatch();await delay(10);await service.pauseBatch();while(service.looping)await delay(5);
  assert.deepEqual([...done].sort((a,b)=>a-b),[1,2,3,4]);assert.equal(saved.lanes.fast.cursor,4);service.stop();
  const resumed=new ThumbnailService({base:__dirname,data:__dirname,request});resumed.get=async id=>{assert.ok(!done.has(id));await delay((id%3)*3);done.add(id);return {};};
  await resumed.startBatch();while(resumed.looping)await delay(5);assert.equal(done.size,19);assert.equal(saved.stage,'done');resumed.stop();
});

test('Transient failures do not save the cursor after the failed item as completed; on resume, gaps are filled',async()=>{
  const done=new Set();let saved=null,failed=false;
  const request=async(method,...args)=>{if(method==='thumbStats')return {total:4,counts:[],state:saved&&JSON.stringify(saved)};if(method==='thumbBatchSave'){saved=structuredClone(args[0]);return true;}if(method==='thumbWork')return args[2]==='fast'?[1,2,3,4].filter(id=>id>args[0]&&!done.has(id)).map(id=>({id})):[];};
  const service=new ThumbnailService({base:__dirname,data:__dirname,request});service.get=async id=>{if(id===2&&!failed){failed=true;throw new Error('Temporary read failure');}done.add(id);return {};};
  await service.startBatch();while(service.looping)await delay(5);assert.equal(saved.lanes.fast.cursor,1);assert.equal(saved.paused,true);
  await service.startBatch();while(service.looping)await delay(5);assert.equal(done.size,4);assert.equal(saved.stage,'done');service.stop();
});
