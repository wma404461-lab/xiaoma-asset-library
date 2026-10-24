import bpy,sys,os,math,json
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:];filename,output=args[0],args[1];extension=os.path.splitext(filename)[1].lower()
if extension=='.blend':bpy.ops.wm.open_mainfile(filepath=filename,load_ui=False)
else:
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    if extension in ('.glb','.gltf'):bpy.ops.import_scene.gltf(filepath=filename)
    elif extension=='.fbx':bpy.ops.import_scene.fbx(filepath=filename)
    elif extension=='.obj':bpy.ops.wm.obj_import(filepath=filename)
    elif extension=='.ply':bpy.ops.wm.ply_import(filepath=filename)
    elif extension=='.stl':bpy.ops.wm.stl_import(filepath=filename)
    elif extension in ('.usd','.usda','.usdc','.usdz'):bpy.ops.wm.usd_import(filepath=filename)
    elif extension=='.abc':bpy.ops.wm.alembic_import(filepath=filename,as_background_job=False)
    else:raise RuntimeError('This format requires a corresponding reader')
scene=bpy.context.scene;objects=[obj for obj in scene.objects if obj.type in ('MESH','CURVE','SURFACE','META','FONT','VOLUME')]
if not objects:raise RuntimeError('No renderable geometry found in the file')
points=[obj.matrix_world@Vector(corner) for obj in objects for corner in obj.bound_box]
minimum=Vector([min(v[i] for v in points) for i in range(3)]);maximum=Vector([max(v[i] for v in points) for i in range(3)]);center=(minimum+maximum)/2;radius=max((maximum-minimum).length/2,0.001)
for obj in objects:obj.hide_render=False;obj.hide_viewport=False
camera_data=bpy.data.cameras.new('LibraryThumbnailCamera');camera=bpy.data.objects.new('LibraryThumbnailCamera',camera_data);scene.collection.objects.link(camera);scene.camera=camera
camera.location=center+Vector((1.2,-1.7,1.1)).normalized()*radius*3.8;camera.rotation_euler=(center-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=radius*2.7;camera_data.clip_start=radius/10000;camera_data.clip_end=radius*100
scene.render.engine='BLENDER_WORKBENCH';scene.render.resolution_x=480;scene.render.resolution_y=320;scene.render.resolution_percentage=100;scene.render.image_settings.file_format='PNG';scene.render.filepath=output;scene.render.film_transparent=False
scene.display.shading.light='STUDIO';scene.display.shading.color_type='MATERIAL';scene.display.shading.background_type='WORLD';scene.world.color=(0.025,0.034,0.027);scene.display.shading.show_shadows=True;scene.display.shading.show_cavity=True
bpy.ops.render.render(write_still=True);print(json.dumps({'ok':True,'objects':len(objects)}))
