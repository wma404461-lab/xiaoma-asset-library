const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs/promises'),path=require('node:path');
const EXT={};
for(const [category,list] of Object.entries({
  'Image':'.jpg .jpeg .png .tif .tiff .tga .bmp .webp .gif .avif .heic .heif .dds .ktx .ktx2 .svg',
  'HDR and EXR':'.hdr .exr', '3D model':'.fbx .obj .gltf .glb .stl .ply .usd .usda .usdc .usdz .dae .3ds .lwo .dxf .3mf',
  'Creative project':'.ma .mb .blend .max .c4d .hip .hiplc .hipnc .nk .nknc .aep .aepx .prproj .drp .uproject .spp .sbs .ztl .zpr .zbp .zprj .duf .daz',
  '2D source file':'.psd .psb .ai .eps .kra .afphoto .afdesign', 'Material Pack':'.sbsar .mtl .mdl .mat', 'UE Resources':'.uasset .umap',
  'Video':'.mp4 .mov .mkv .avi .webm .m4v .wmv .flv .mpg .mpeg .mxf .braw .r3d', 'Audio':'.wav .mp3 .flac .aiff .aif .aac .ogg .m4a .opus',
  'Geometry and Simulation Caches':'.abc .vdb .bgeo .bgeo.sc .vdb.sc .sim .sim.sc', 'Pending Archive':'.zip .rar .7z .tar .gz .tgz .bz2 .xz'
}))for(const extension of list.split(' '))EXT[extension]=category;
const TYPES={models:['3D model'],images:['Image','2D source file'],environment:['HDR and EXR'],video:['Video'],audio:['Audio'],projects:['Creative project'],unreal:['UE Resources'],cache:['Geometry and Simulation Caches'],other:['Material Pack','Pending Archive']};
const SKIP=new Set(['node_modules','.git','.svn','.codex','.venv','venv','__pycache__','site-packages','Engine','Binaries','Intermediate','DerivedDataCache','Logs','Crashes','Autosaves','$RECYCLE.BIN','System Volume Information'].map(s=>s.toLowerCase()));
const FIELDS='a.id,a.path,a.folder,a.name,a.extension,a.category,a.size,CAST(a.mtime_ns/1000000 AS INTEGER) AS modified,a.pbr_role,a.sequence_key,a.favorite,a.tags,a.notes,a.curated';
function cleanRow(row){if(!row)return null;let tags=[];try{tags=JSON.parse(row.tags||'[]');}catch{}return {...row,tags,favorite:!!row.favorite};}
function idValue(id){id=Number(id);if(!Number.isSafeInteger(id)||id<1)throw new Error('Invalid Asset ID');return id;}
class Library {
  constructor(filename){this.db=new DatabaseSync(filename,{timeout:5000});this.db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA cache_size=-49152; CREATE TABLE IF NOT EXISTS thumbnail_records(asset_id INTEGER PRIMARY KEY,signature TEXT,url TEXT,kind TEXT,provider TEXT,detail TEXT,updated INTEGER); CREATE INDEX IF NOT EXISTS thumbnail_kind ON thumbnail_records(kind); CREATE TABLE IF NOT EXISTS thumbnail_batch(key TEXT PRIMARY KEY,value TEXT);");this.importing=false;this.cancelled=false;}
  asset(id){return cleanRow(this.db.prepare(`SELECT ${FIELDS} FROM assets a WHERE a.id=?`).get(idValue(id)));}
  statistics(){return {total:this.db.prepare('SELECT count(*) AS n FROM assets').get().n,curated:this.db.prepare('SELECT count(*) AS n FROM assets WHERE curated=1').get().n,favorites:this.db.prepare('SELECT count(*) AS n FROM assets WHERE favorite=1').get().n,collections:this.db.prepare('SELECT c.*, (SELECT count(*) FROM collection_assets WHERE collection_id=c.id) AS count FROM collections c ORDER BY c.position,c.id').all(),tags:this.db.prepare("SELECT tags FROM assets WHERE tags<>'[]' LIMIT 10000").all().flatMap(r=>{try{return JSON.parse(r.tags);}catch{return [];}}).reduce((m,t)=>(m[t]=(m[t]||0)+1,m),{})};}
  query(options={}){
    const conditions=[],params=[];
    if(options.collection){conditions.push('a.id IN (SELECT asset_id FROM collection_assets WHERE collection_id=?)');params.push(idValue(options.collection));}
    else if(options.scope==='favorites')conditions.push('a.favorite=1');
    else if(options.scope==='no-preview')conditions.push("a.id IN (SELECT asset_id FROM thumbnail_records WHERE kind IN ('info','missing'))");
    else if(options.scope!=='all')conditions.push('a.curated=1');
    const q=String(options.q||'').trim().slice(0,160);
    if(q){for(const term of q.split(/\s+/).slice(0,8)){const like='%'+term.replace(/[\\%_]/g,c=>'\\'+c)+'%';conditions.push("(a.name LIKE ? ESCAPE '\\' OR a.folder LIKE ? ESCAPE '\\' OR a.tags LIKE ? ESCAPE '\\' OR a.notes LIKE ? ESCAPE '\\')");params.push(like,like,like,like);}}
    const tag=String(options.tag||'').slice(0,40);if(tag){conditions.push('EXISTS (SELECT 1 FROM json_each(a.tags) WHERE value=?)');params.push(tag);}
    const baseWhere=conditions.length?'WHERE '+conditions.join(' AND '):'';
    const categoryCounts=this.db.prepare(`SELECT a.category,count(*) AS n FROM assets a ${baseWhere} GROUP BY a.category`).all(...params);
    if(TYPES[options.type]){conditions.push('a.category IN ('+TYPES[options.type].map(()=>'?').join(',')+')');params.push(...TYPES[options.type]);}
    const where=conditions.length?'WHERE '+conditions.join(' AND '):'';
    const total=this.db.prepare(`SELECT count(*) AS n FROM assets a ${where}`).get(...params).n;
    const limit=Math.min(96,Math.max(12,Number(options.limit)||48));const maxPage=Math.max(0,Math.ceil(total/limit)-1),page=Math.min(maxPage,Math.max(0,Math.floor(Number(options.page)||0)));
    const sort={name:'a.name COLLATE NOCASE,a.id',recent:'a.mtime_ns DESC,a.id DESC',size:'a.size DESC,a.id DESC',default:'a.favorite DESC,a.id DESC'}[options.sort]||'a.favorite DESC,a.id DESC';
    const items=this.db.prepare(`SELECT ${FIELDS} FROM assets a ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...params,limit,page*limit).map(cleanRow);
    return {items,total,page,limit,categoryCounts};
  }
  update(id,changes){id=idValue(id);if(!this.asset(id))throw new Error('Asset Does Not Exist');const values=[],assignments=[];
    if('favorite' in changes){assignments.push('favorite=?');values.push(changes.favorite?1:0);}
    if('tags' in changes){const tags=[...new Set((Array.isArray(changes.tags)?changes.tags:[]).map(x=>String(x).trim().slice(0,40)).filter(Boolean))].slice(0,30);assignments.push('tags=?');values.push(JSON.stringify(tags));}
    if('notes' in changes){assignments.push('notes=?');values.push(String(changes.notes||'').slice(0,4000));}
    if(assignments.length)this.db.prepare('UPDATE assets SET '+assignments.join(',')+' WHERE id=?').run(...values,id);return this.asset(id);
  }
  pairedImage(id){const a=this.asset(id);if(!a)return null;const stem=path.parse(a.name).name.toLowerCase(),shortStem=stem.replace(/_(?:\d+k|\d+x\d+)$/i,'');const names=['.jpg','.jpeg','.png','.webp'].flatMap(e=>[stem+e,a.name.toLowerCase()+e,shortStem+'_preview'+e,shortStem+e]);return this.db.prepare("SELECT id FROM assets WHERE folder=? AND lower(name) IN ("+names.map(()=>'?').join(',')+") LIMIT 1").get(a.folder,...names)?.id||null;}
  relatedImage(id){const a=this.asset(id);if(!a)return null;const paired=this.pairedImage(id);if(paired)return paired;const stem=path.parse(a.name).name.replace(/(?:[._-](?:v\d+|r\d+|\d{4,}))+/gi,'').replace(/^(SM_|SK_|M_|MI_|T_)/i,'').toLowerCase();const candidates=this.db.prepare("SELECT id,name,folder FROM assets WHERE (folder=? OR folder IN (?,?,?,?,?,?,?)) AND category IN ('Image','HDR and EXR') AND id<>? ORDER BY id DESC LIMIT 400").all(a.folder,...['preview','previews','thumbnails','renders','render','images','.swatches'].map(name=>path.join(a.folder,name)),a.id);let best=null,score=0;for(const c of candidates){const name=c.name.toLowerCase(),base=path.parse(name).name;let s=base===stem?100:stem.length>3&&base.includes(stem)?70:0;if(/(?:preview|thumbnail|cover|screenshot|Preview|Cover)/i.test(name))s+=40;if(c.folder!==a.folder)s+=15;if(s>score&&s>=40){score=s;best=c.id;}}return best;}
  thumbRecord(id){return this.db.prepare('SELECT * FROM thumbnail_records WHERE asset_id=?').get(idValue(id))||null;}
  thumbAsset(id){return {asset:this.asset(id),record:this.thumbRecord(id)};}
  thumbSave(record,protectCustom=false){this.saveThumbnailStatement??=this.db.prepare("INSERT INTO thumbnail_records(asset_id,signature,url,kind,provider,detail,updated) VALUES (?,?,?,?,?,?,?) ON CONFLICT(asset_id) DO UPDATE SET signature=excluded.signature,url=excluded.url,kind=excluded.kind,provider=excluded.provider,detail=excluded.detail,updated=excluded.updated WHERE ?=0 OR thumbnail_records.kind<>'custom' OR excluded.kind='custom' RETURNING *");return this.saveThumbnailStatement.get(idValue(record.asset_id),String(record.signature),String(record.url),String(record.kind),String(record.provider||''),String(record.detail||'').slice(0,1000),Date.now(),protectCustom?1:0)||this.thumbRecord(record.asset_id);}
  thumbNext(cursor=0,curated=false){return this.db.prepare(`SELECT a.id FROM assets a LEFT JOIN thumbnail_records r ON r.asset_id=a.id WHERE a.id>? ${curated?'AND a.curated=1':''} AND (r.asset_id IS NULL OR (r.kind<>'custom' AND r.signature<>('v3-'||a.size||'-'||CAST(a.mtime_ns/1000000 AS INTEGER)))) ORDER BY a.id LIMIT 120`).all(Number(cursor)||0).map(r=>r.id);}
  thumbWork(cursor=0,curated=false,lane='fast',limit=80){const heavy="(a.category IN ('3D model','Geometry and Simulation Caches','HDR and EXR','Video','Audio','Pending Archive') OR a.extension IN ('.tif','.tiff','.tga','.dds','.ktx','.ktx2','.psd','.psb','.ai','.blend','.kra','.spp'))";return this.db.prepare(`SELECT ${FIELDS} FROM assets a LEFT JOIN thumbnail_records r ON r.asset_id=a.id WHERE a.id>? ${curated?'AND a.curated=1':''} AND ${lane==='heavy'?heavy:'NOT '+heavy} AND (r.asset_id IS NULL OR (r.kind<>'custom' AND r.signature<>('v3-'||a.size||'-'||CAST(a.mtime_ns/1000000 AS INTEGER)))) ORDER BY a.id LIMIT ?`).all(Number(cursor)||0,Math.min(160,Math.max(1,Number(limit)||80))).map(cleanRow);}
  thumbStats(refresh=false){if(refresh||!this.thumbnailStats||Date.now()-this.thumbnailStats.at>5000)this.thumbnailStats={at:Date.now(),counts:this.db.prepare('SELECT kind,count(*) AS n FROM thumbnail_records GROUP BY kind').all(),total:this.db.prepare('SELECT count(*) AS n FROM assets').get().n};return {...this.thumbnailStats,state:this.db.prepare("SELECT value FROM thumbnail_batch WHERE key='state'").get()?.value||null};}
  thumbBatchSave(state){this.db.prepare("INSERT INTO thumbnail_batch(key,value) VALUES ('state',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(state));return true;}
  async importFolder(directory,notify=()=>{}){
    if(this.importing)throw new Error('A directory is already being updated');directory=await fs.realpath(directory);if(!(await fs.stat(directory)).isDirectory())throw new Error('Please select a folder');
    this.importing=true;this.cancelled=false;let matched=0,seen=0,errors=0,lastMessage=0;const started=Date.now(),stack=[directory];notify({root:directory,seen,matched,errors});
    let collection=this.db.prepare('SELECT * FROM collections WHERE path=? COLLATE NOCASE').get(directory);
    if(!collection){const r=this.db.prepare('INSERT INTO collections(name,path,position) VALUES (?,?,100)').run(path.basename(directory)||directory,directory);collection={id:Number(r.lastInsertRowid),path:directory};}
    const insert=this.db.prepare(`INSERT INTO assets(root,path,folder,name,extension,category,size,mtime_ns,pbr_role,sequence_key,favorite,tags,notes,curated) VALUES (?,?,?,?,?,?,?,?,?, '',0,'[]','',1) ON CONFLICT(path) DO UPDATE SET size=excluded.size,mtime_ns=excluded.mtime_ns,curated=1 RETURNING id`);
    const link=this.db.prepare('INSERT OR IGNORE INTO collection_assets(collection_id,asset_id) VALUES (?,?)');
    try{
      while(stack.length&&!this.cancelled){const folder=stack.pop();let handle;try{handle=await fs.opendir(folder);}catch{errors++;continue;}
        for await(const entry of handle){if(this.cancelled)break;if(entry.isSymbolicLink())continue;if(entry.isDirectory()){if(!SKIP.has(entry.name.toLowerCase())&&!entry.name.startsWith('.venv'))stack.push(path.join(folder,entry.name));continue;}if(!entry.isFile())continue;seen++;
          const filename=path.join(folder,entry.name),lower=entry.name.toLowerCase(),ext=['.bgeo.sc','.vdb.sc','.sim.sc'].find(e=>lower.endsWith(e))||path.extname(lower),category=EXT[ext];if(!category)continue;
          try{const s=await fs.stat(filename);const role=path.parse(entry.name).name.match(/(?:^|[_\-.\s])(basecolor|albedo|diffuse|roughness|metallic|normal|ao|opacity|emissive|height|displacement)(?:$|[_\-.\s\d])/i)?.[1]?.toLowerCase()||'';
            const row=insert.get(directory,filename,folder,entry.name,ext,category,s.size,BigInt(Math.floor(s.mtimeMs))*1000000n,role);link.run(collection.id,row.id);matched++;
          }catch{errors++;}
          if(Date.now()-lastMessage>350){notify({root:directory,seen,matched,errors,elapsed:Date.now()-started});lastMessage=Date.now();await new Promise(r=>setImmediate(r));}
        }
      }
      notify({root:directory,seen,matched,errors,done:true,cancelled:this.cancelled});return {collection:collection.id,seen,matched,errors,cancelled:this.cancelled};
    }finally{this.importing=false;}
  }
  close(){this.db.close();}
}
module.exports={Library,EXT,TYPES,cleanRow};
