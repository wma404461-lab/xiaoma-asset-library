import hou,sys,math,json,gc
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
def convert(source,output):
    geometry=hou.Geometry();geometry.loadFromFile(source);points=geometry.points();volumes=[prim for prim in geometry.prims() if isinstance(prim,(hou.Volume,hou.VDB))];sample=[]
    if volumes:
        volume=volumes[0];bounds=volume.boundingBox();minimum=bounds.minvec();maximum=bounds.maxvec();n=28;sdf=volume.isSDF();threshold=max(abs(volume.volumeMax())*0.025,1e-6) if not sdf else 0
        for z in range(n):
            for y in range(n):
                for x in range(n):
                    position=hou.Vector3([minimum[i]+(maximum[i]-minimum[i])*((x,y,z)[i]+0.5)/n for i in range(3)]);value=volume.sample(position)
                    if (sdf and value<0) or (not sdf and abs(value)>threshold):sample.append(tuple(position))
    else:
        step=max(1,math.ceil(len(points)/24000));sample=[tuple(point.position()) for point in points[::step]]
    if not sample:raise RuntimeError('No geometry or volume available for sampling in cache')
    with open(output,'w',encoding='ascii') as stream:
        stream.write('ply\nformat ascii 1.0\nelement vertex '+str(len(sample))+'\nproperty float x\nproperty float y\nproperty float z\nend_header\n')
        for position in sample:stream.write(' '.join(str(v) for v in position)+'\n')
    geometry.clear();return len(sample)
for line in sys.stdin:
    value={}
    try:
        value=json.loads(line);count=convert(value['filename'],value['output']);print(json.dumps({'id':value['id'],'ok':True,'points':count}),flush=True)
    except Exception as error:print(json.dumps({'id':value.get('id',0),'ok':False,'error':str(error)},ensure_ascii=False),flush=True)
    gc.collect()
