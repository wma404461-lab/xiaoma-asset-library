const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),{DatabaseSync}=require('node:sqlite');
// First-install initialization only. Existing catalogs are never opened here.
async function createCatalogIfMissing(filename){try{await fs.access(filename);return false;}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.mkdir(path.dirname(filename),{recursive:true});const temporary=filename+'.initial-'+crypto.randomUUID();let db;
  try{db=new DatabaseSync(temporary);db.exec(`
    CREATE TABLE assets(id INTEGER PRIMARY KEY,root TEXT,path TEXT UNIQUE COLLATE NOCASE,folder TEXT,name TEXT,extension TEXT,category TEXT,size INTEGER,mtime_ns INTEGER,pbr_role TEXT,sequence_key TEXT,favorite INTEGER DEFAULT 0,tags TEXT DEFAULT '[]',notes TEXT DEFAULT '',curated INTEGER DEFAULT 0);
    CREATE INDEX assets_category ON assets(category);CREATE INDEX assets_folder ON assets(folder);
    CREATE INDEX assets_curated ON assets(id) WHERE curated=1;CREATE INDEX assets_favorites ON assets(id) WHERE favorite=1;
    CREATE TABLE collections(id INTEGER PRIMARY KEY,name TEXT,path TEXT UNIQUE COLLATE NOCASE,position INTEGER DEFAULT 100);
    CREATE TABLE collection_assets(collection_id INTEGER,asset_id INTEGER,PRIMARY KEY(collection_id,asset_id));
  `);db.close();db=null;try{await fs.link(temporary,filename);return true;}catch(error){if(error.code==='EEXIST')return false;if(['EPERM','ENOTSUP','ENOSYS'].includes(error.code)){try{await fs.copyFile(temporary,filename,require('node:fs').constants.COPYFILE_EXCL);return true;}catch(copyError){if(copyError.code==='EEXIST')return false;throw copyError;}}throw error;}}
  finally{db?.close();await fs.unlink(temporary).catch(()=>{});}
}
module.exports={createCatalogIfMissing};
