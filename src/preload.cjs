const {contextBridge,ipcRenderer,webUtils}=require('electron');
contextBridge.exposeInMainWorld('library',{
  cover:(id,kind='loading')=>'cover://file/'+Number(id)+'.svg?kind='+kind,setThumbnail:id=>ipcRenderer.invoke('thumbnail-custom',id),thumbnailInfo:id=>ipcRenderer.invoke('thumbnail-info',id),thumbnailStatus:()=>ipcRenderer.invoke('thumbnail-status'),startThumbnails:()=>ipcRenderer.invoke('thumbnail-start'),pauseThumbnails:()=>ipcRenderer.invoke('thumbnail-pause'),onThumbnail:callback=>{const handler=(_e,v)=>callback(v);ipcRenderer.on('thumbnail-ready',handler);return()=>ipcRenderer.removeListener('thumbnail-ready',handler);},onThumbnailProgress:callback=>{const handler=(_e,v)=>callback(v);ipcRenderer.on('thumbnail-progress',handler);return()=>ipcRenderer.removeListener('thumbnail-progress',handler);},
  stats:()=>ipcRenderer.invoke('stats'),query:options=>ipcRenderer.invoke('query',options),asset:id=>ipcRenderer.invoke('asset',id),
  update:(id,changes)=>ipcRenderer.invoke('update',id,changes),thumbnail:id=>ipcRenderer.invoke('thumbnail',id),
  reveal:id=>ipcRenderer.invoke('reveal',id),open:id=>ipcRenderer.invoke('open',id),copyPath:id=>ipcRenderer.invoke('copy-path',id),
  addFolder:()=>ipcRenderer.invoke('add-folder'),refresh:id=>ipcRenderer.invoke('refresh',id),cancelImport:()=>ipcRenderer.invoke('cancel-import'),
  onProgress:callback=>{const handler=(_event,value)=>callback(value);ipcRenderer.on('index-progress',handler);return ()=>ipcRenderer.removeListener('index-progress',handler);},
  onIndexChanged:callback=>{const handler=()=>callback();ipcRenderer.on('index-changed',handler);return ()=>ipcRenderer.removeListener('index-changed',handler);},
  droppedPath:file=>webUtils.getPathForFile(file)
});
