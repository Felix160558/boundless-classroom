import * as THREE from '../three.module.min.js';

const glassWidth=2.62,glassHeight=2.93;
// WebXR uses layers 1 and 2 for its left and right eye cameras.
export const LOUNGE_MIRROR_LAYER=7;

function arch(path,width,height){
  const side=width/2,bottom=-height/2,top=height/2,rise=.55;
  path.moveTo(-side,bottom);
  path.lineTo(side,bottom);
  path.lineTo(side,top-rise);
  path.absellipse(0,top-rise,side,rise,0,Math.PI,false,0);
  path.closePath();
  return path;
}

function casing(width,height,innerWidth,innerHeight,depth,bevel){
  const shape=arch(new THREE.Shape(),width,height);
  shape.holes.push(arch(new THREE.Path(),innerWidth,innerHeight));
  return new THREE.ExtrudeGeometry(shape,{
    depth,bevelEnabled:bevel>0,bevelSegments:2,bevelSize:bevel,
    bevelThickness:bevel,curveSegments:48,
  });
}

function oakGrain(){
  const width=128,height=256,pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const grain=Math.sin(x*.97+.6*Math.sin(y*.049))*.46
      +Math.sin(x*2.38+y*.021)*.17+Math.sin(x*.24+.31*Math.sin(y*.09))*.37;
    const i=4*(y*width+x),shade=156+grain*21;
    pixels[i]=shade+14;
    pixels[i+1]=shade+1;
    pixels[i+2]=shade-13;
    pixels[i+3]=255;
  }
  const map=new THREE.DataTexture(pixels,width,height);
  map.wrapS=map.wrapT=THREE.RepeatWrapping;
  map.repeat.set(.75,.38);
  map.colorSpace=THREE.SRGBColorSpace;
  map.magFilter=THREE.LinearFilter;
  map.minFilter=THREE.LinearMipmapLinearFilter;
  map.generateMipmaps=true;
  map.needsUpdate=true;
  return map;
}

const mirrorVertex=/* glsl */`
  uniform mat4 mirrorProjection;
  varying vec4 mirrorUV;
  void main() {
    vec4 point=vec4(position,1.);
    mirrorUV=mirrorProjection*point;
    gl_Position=projectionMatrix*modelViewMatrix*point;
  }
`;

const mirrorFragment=/* glsl */`
  uniform sampler2D mirrorColor;
  varying vec4 mirrorUV;
  void main() {
    vec3 reflected=texture2DProj(mirrorColor,mirrorUV).rgb;
    // Subtle silvered glass, with the scene's original highlight and colors.
    gl_FragColor=vec4(reflected*vec3(.955,.964,.961)+vec3(.007,.008,.008),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createLoungeMirror(parent,scene){
  const group=new THREE.Group();
  group.name='Lounge standing mirror';
  group.position.set(6.43,-.40,-.80);
  group.rotation.y=-Math.PI/2;
  parent.add(group);

  const grain=oakGrain();
  const frameMaterial=new THREE.MeshStandardMaterial({
    color:0x6c4d34,map:grain,roughness:.86,metalness:.015,
  });
  const outer=new THREE.Mesh(
    casing(glassWidth+.235,glassHeight+.235,glassWidth-.009,glassHeight-.009,.094,.016),
    frameMaterial
  );
  outer.name='Beveled oak casing';
  outer.position.z=-.106;
  outer.receiveShadow=true;
  group.add(outer);
  const inner=new THREE.Mesh(
    casing(glassWidth+.045,glassHeight+.045,glassWidth-.006,glassHeight-.006,.011,.003),
    new THREE.MeshStandardMaterial({color:0x9a8059,roughness:.61,metalness:.48})
  );
  inner.name='Fine aged-brass edge';
  inner.position.z=-.006;
  inner.receiveShadow=true;
  group.add(inner);

  const target=new THREE.WebGLRenderTarget(512,512,{
    type:THREE.HalfFloatType,depthBuffer:true,stencilBuffer:false,
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
  });
  target.texture.name='Lounge mirror reflection';
  const bias=new THREE.Matrix4().set(
    .5,0,0,.5,
    0,.5,0,.5,
    0,0,.5,.5,
    0,0,0,1,
  );
  const textureMatrix=new THREE.Matrix4();
  const geometry=new THREE.ShapeGeometry(arch(new THREE.Shape(),glassWidth,glassHeight),64);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const glass=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
    uniforms:{mirrorColor:{value:target.texture},mirrorProjection:{value:textureMatrix}},
    vertexShader:mirrorVertex,fragmentShader:mirrorFragment,
  }));
  glass.name='Live mirror glass';
  glass.position.z=.010;
  group.add(glass);

  const mirrorCamera=new THREE.PerspectiveCamera();
  mirrorCamera.name='Lounge mirror reflected view';
  const normal=new THREE.Vector3(),origin=new THREE.Vector3(),eye=new THREE.Vector3();
  const eyeOffset=new THREE.Vector3(),direction=new THREE.Vector3();
  const plane=new THREE.Plane(),clip=new THREE.Vector4(),corner=new THREE.Vector4();
  const viewProjection=new THREE.Matrix4(),eyeViewport=new THREE.Vector4();
  const frustum=new THREE.Frustum(),bounds=new THREE.Sphere();
  const biasDistance=.0008;
  let reflecting=false,targetConfigured=false;

  glass.onBeforeRender=(renderer,world,camera)=>{
    if(reflecting||world!==scene||!camera.isPerspectiveCamera)return;
    origin.setFromMatrixPosition(glass.matrixWorld);
    normal.set(0,0,1).transformDirection(glass.matrixWorld);
    eye.setFromMatrixPosition(camera.matrixWorld);
    eyeOffset.subVectors(eye,origin);
    if(eyeOffset.dot(normal)<.008)return;
    frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    bounds.copy(geometry.boundingSphere).applyMatrix4(glass.matrixWorld);
    if(!frustum.intersectsSphere(bounds))return;

    // WebGLRenderer invokes this once for each XR subcamera. Reflect that
    // eye and its asymmetric projection, including the mirrored view-up.
    mirrorCamera.position.copy(eyeOffset).reflect(normal).add(origin);
    direction.set(0,0,-1).transformDirection(camera.matrixWorld).reflect(normal);
    mirrorCamera.up.set(0,1,0).transformDirection(camera.matrixWorld).reflect(normal);
    mirrorCamera.lookAt(direction.add(mirrorCamera.position));
    mirrorCamera.near=camera.near;
    mirrorCamera.far=camera.far;
    mirrorCamera.layers.mask=camera.layers.mask|(1<<LOUNGE_MIRROR_LAYER);
    mirrorCamera.updateMatrixWorld(true);
    mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);
    // Reflection flips the horizontal basis. Flip the principal point along
    // with it so the full asymmetric XR eye frustum still covers the glass.
    mirrorCamera.projectionMatrix.elements[8]*=-1;
    textureMatrix.copy(bias).multiply(mirrorCamera.projectionMatrix)
      .multiply(mirrorCamera.matrixWorldInverse).multiply(glass.matrixWorld);

    // Use the glass as the near plane so the wall behind it never enters
    // the reflection. Move the clip a fraction toward the room at the rim.
    plane.setFromNormalAndCoplanarPoint(normal,origin).applyMatrix4(mirrorCamera.matrixWorldInverse);
    clip.set(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant-biasDistance);
    const projection=mirrorCamera.projectionMatrix.elements;
    corner.set((Math.sign(clip.x)+projection[8])/projection[0],
      (Math.sign(clip.y)+projection[9])/projection[5],-1,(1+projection[10])/projection[14]);
    const divisor=clip.dot(corner);
    if(Math.abs(divisor)<1e-6)return;
    clip.multiplyScalar(2/divisor);
    projection[2]=clip.x;
    projection[6]=clip.y;
    projection[10]=clip.z+1;
    projection[14]=clip.w;
    mirrorCamera.projectionMatrixInverse.copy(mirrorCamera.projectionMatrix).invert();

    const previous=renderer.getRenderTarget();
    const face=renderer.getActiveCubeFace(),lod=renderer.getActiveMipmapLevel();
    eyeViewport.copy(camera.viewport??renderer.getCurrentViewport(eyeViewport));
    const xr=renderer.xr.enabled;
    const shadowAuto=renderer.shadowMap.autoUpdate,shadowDirty=renderer.shadowMap.needsUpdate;
    const cap=renderer.xr.isPresenting?768:1024;
    const limit=Math.min(cap,renderer.capabilities.maxTextureSize);
    const scale=Math.min(.86,limit/Math.max(1,eyeViewport.z,eyeViewport.w));
    const size=pixels=>Math.min(limit,Math.max(128,Math.floor(pixels*scale/64)*64));
    const width=size(eyeViewport.z),height=size(eyeViewport.w);
    if(!targetConfigured){
      targetConfigured=true;
      if(!renderer.extensions.has('EXT_color_buffer_float')&&!renderer.extensions.has('EXT_color_buffer_half_float')){
        target.texture.type=THREE.UnsignedByteType;
      }
    }
    if(target.width!==width||target.height!==height)target.setSize(width,height);

    reflecting=true;
    glass.visible=false;
    try{
      renderer.xr.enabled=false;
      // Reuse the room's lighting and shadow pass within the reflection.
      renderer.shadowMap.autoUpdate=false;
      renderer.shadowMap.needsUpdate=false;
      renderer.setRenderTarget(target);
      renderer.state.buffers.depth.setMask(true);
      if(!renderer.autoClear||!renderer.autoClearColor||!renderer.autoClearDepth)renderer.clear(true,true,false);
      renderer.render(scene,mirrorCamera);
    }finally{
      renderer.xr.enabled=xr;
      renderer.shadowMap.autoUpdate=shadowAuto;
      renderer.shadowMap.needsUpdate=shadowDirty;
      renderer.setRenderTarget(previous,face,lod);
      renderer.state.viewport(eyeViewport);
      reflecting=false;
      glass.visible=true;
    }
  };
  return {group,glass};
}
