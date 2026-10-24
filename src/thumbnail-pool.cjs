const {fork}=require('node:child_process');
function terminate(child){return new Promise(resolve=>{if(child.exitCode!==null||child.signalCode!==null){resolve();return;}child.once('exit',resolve);child.kill();});}

// Reserve capacity for files the user is viewing. Assign permits before waking
// waiters, so an arriving request cannot steal an already assigned slot.
class PriorityGate {
  constructor(limit,reserve=0){this.limit=limit;this.reserve=reserve;this.running=0;this.background=0;this.queue=[];this.stopped=false;}
  enter(background=false){return new Promise((resolve,reject)=>{if(this.stopped){reject(new Error('Reader stopped'));return;}this.queue.push({background,resolve,reject});this.drain();});}
  drain(){while(this.running<this.limit){let index=this.queue.findIndex(job=>!job.background);if(index<0){if(this.background>=this.limit-this.reserve)return;index=this.queue.findIndex(job=>job.background);}if(index<0)return;const job=this.queue.splice(index,1)[0];this.running++;if(job.background)this.background++;let released=false;job.resolve(()=>{if(released)return;released=true;this.running--;if(job.background)this.background--;this.drain();});}}
  stop(){this.stopped=true;for(const job of this.queue.splice(0))job.reject(new Error('Reader stopped'));}
}

class ImageReaders {
  constructor(filename,limit=2){this.filename=filename;this.slots=Array.from({length:limit},()=>({worker:null,jobs:0,bytes:0,busy:false}));this.gate=new PriorityGate(limit,limit>1?1:0);this.sequence=0;}
  async read(asset,output,mode){const release=await this.gate.enter(!!asset._background),slot=this.slots.find(s=>!s.busy);slot.busy=true;try{if(!slot.worker){const fresh=fork(this.filename,[],{windowsHide:true,execArgv:['--max-old-space-size=384','--expose-gc'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','ignore','ignore','ipc']});slot.worker=fresh;fresh.on('error',()=>{});try{require('node:os').setPriority(fresh.pid,require('node:os').constants.priority.PRIORITY_BELOW_NORMAL);}catch{}fresh.on('exit',()=>{if(slot.worker===fresh)slot.worker=null;});}const worker=slot.worker,id=++this.sequence;return await new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);worker.off('message',message);worker.off('error',error);worker.off('exit',exited);};const message=value=>{if(value.id!==id)return;cleanup();slot.bytes+=value.decodedBytes||0;slot.rss=value.rss||0;resolve(value);};const error=e=>{cleanup();slot.worker=null;terminate(worker);reject(e);};const exited=code=>error(new Error('Image reader exited: '+code));const timer=setTimeout(()=>error(new Error('Image reading timeout')),60000);worker.on('message',message);worker.on('error',error);worker.on('exit',exited);worker.send({id,filename:asset.path,extension:asset.extension,output,mode});});}finally{slot.jobs++;slot.bytes+=asset.size||0;if(slot.worker&&(slot.jobs>=64||slot.bytes>=256*1024*1024||slot.rss>=384*1024*1024)){await terminate(slot.worker);slot.worker=null;slot.jobs=0;slot.bytes=0;}slot.busy=false;release();}}
  stop(){this.gate.stop();for(const slot of this.slots)if(slot.worker)terminate(slot.worker);}
}
module.exports={PriorityGate,ImageReaders};
