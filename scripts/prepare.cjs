const path=require('node:path');
const {createCatalogIfMissing}=require('../src/catalog-bootstrap.cjs');
createCatalogIfMissing(path.resolve(__dirname,'../data/catalog.sqlite')).then(created=>console.log(created?'Created empty catalog':'Existing catalog preserved')).catch(error=>{console.error(error.message);process.exitCode=1;});
