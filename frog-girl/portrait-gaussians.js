import * as THREE from '../three.module.min.js';

const textureWidth=1024;
const depthBins=2048;
const recordSize=40;
const torsoAxis=new THREE.Vector3(0,.16,1);

// A canonical rest space is shared by the surface support and the ellipsoids.
// The rest frame is exactly the imported shape. A future motion track can
// address this field in seconds; the portrait review only displays a still.
const motionField=`
  uniform float portraitExcursion;
  vec3 motionQ(vec3 p){return (p-vec3(.18,-.45,-.04))/vec3(.27,.23,.28);}
  float motionWeight(vec3 p){vec3 q=motionQ(p);return exp(-dot(q,q));}
  vec3 weightGradient(vec3 p,float w){return -2.*w*motionQ(p)/vec3(.27,.23,.28);}
  vec3 displacementAxis(){return vec3(0.,.16,1.)*portraitExcursion;}
  vec3 movedNormal(vec3 n, vec3 gradient){
    vec3 d=displacementAxis();
    return normalize(n-gradient*dot(n,d)/(1.+dot(gradient,d)));
  }
`;

export function bindPortraitSupport(material,excursion){
  material.onBeforeCompile=shader=>{
    shader.uniforms.portraitExcursion=excursion;
    shader.vertexShader=motionField+shader.vertexShader;
    shader.vertexShader=shader.vertexShader
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        objectNormal=movedNormal(objectNormal,weightGradient(position,motionWeight(position)));`)
      .replace('#include <begin_vertex>',`vec3 transformed=position+displacementAxis()*motionWeight(position);`);
  };
  return material;
}

function dataTexture(data,height,type){
  const t=new THREE.DataTexture(data,textureWidth,height,THREE.RGBAFormat,type);
  t.magFilter=t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;
  return t;
}
const pointData=`
  attribute float orderIndex;
  uniform highp sampler2D restPositions, surfaceAxes, charts, gradients, boundsUV, restPigment;
  uniform vec2 viewport;
  varying vec3 gKernel;
  varying vec4 gBounds;
  varying vec4 gPigment;
  vec3 octUnit(vec2 p){
    vec3 n=vec3(p,1.-abs(p.x)-abs(p.y));
    if(n.z<0.) n.xy=(1.-abs(n.yx))*mix(vec2(-1.),vec2(1.),step(vec2(0.),n.xy));
    return normalize(n);
  }
  vec2 projectAxis(vec3 axis,vec2 ndc,float w){
    vec4 v=projectionMatrix*vec4(mat3(modelViewMatrix)*axis,0.);
    return (v.xy-ndc*v.w)/w;
  }
`;
const initSample=`
  ivec2 texel=ivec2(int(orderIndex)%${textureWidth},int(orderIndex)/${textureWidth});
  vec4 rest=texelFetch(restPositions,texel,0);
  vec4 coords=texelFetch(charts,texel,0);
  vec4 encoding=texelFetch(surfaceAxes,texel,0);
  vec3 n=octUnit(encoding.xy),grad=weightGradient(rest.xyz,coords.w),d=displacementAxis();
  vec3 objectNormal=movedNormal(n,grad);
  vec3 center=rest.xyz+d*coords.w+objectNormal*.00024;
  vec4 centerView=modelViewMatrix*vec4(center,1.);
  vec4 clip=projectionMatrix*centerView;
  float facing=dot(normalize(normalMatrix*objectNormal),normalize(-centerView.xyz));
  // Skip invisible particles before computing their projected covariance, as
  // in antimatter15/splat. Bound the full footprint to keep fine rim detail.
  mat3 modelView=mat3(modelViewMatrix);
  float worldScale=sqrt(dot(modelView[0],modelView[0])+dot(modelView[1],modelView[1])+dot(modelView[2],modelView[2]));
  float radius=3.4*max(rest.w,coords.z)*worldScale;
  vec2 margin=radius*(vec2(projectionMatrix[0][0],projectionMatrix[1][1])+1.)+2.*max(clip.w,0.)/viewport;
  if(facing<=-.07||clip.w<=0.||clip.z< -clip.w-radius*(1.+abs(projectionMatrix[2][2]))||
     any(greaterThan(abs(clip.xy),vec2(clip.w)+margin))){
    gl_Position=vec4(2.,2.,2.,1.);
    return;
  }
  gPigment=texelFetch(restPigment,texel,0);
  vec3 u=octUnit(encoding.zw);
  u=normalize(u-n*dot(n,u));
  vec3 v=cross(n,u);
  vec3 major=rest.w*(u+d*dot(grad,u));
  vec3 minor=coords.z*(v+d*dot(grad,v));
  vec3 thickness=min(rest.w,coords.z)*.14*(n+d*dot(grad,n));
`;
const projectSample=`
  float safeW=max(.0001,clip.w);
  vec2 ndc=clip.xy/safeW;
  vec2 a=projectAxis(major,ndc,safeW),b=projectAxis(minor,ndc,safeW),c=projectAxis(thickness,ndc,safeW);
  vec3 rowX=vec3(a.x,b.x,c.x),rowY=vec3(a.y,b.y,c.y);
  vec2 pixel=.65/max(viewport,vec2(1.));
  float xx=dot(rowX,rowX),yy=dot(rowY,rowY),xy=dot(rowX,rowY);
  float sigmaPixels=.5*max(sqrt(xx)*viewport.x,sqrt(yy)*viewport.y);
  float l00=sqrt(xx+pixel.x*pixel.x),l10=xy/l00;
  float l11=sqrt(max(yy+pixel.y*pixel.y-l10*l10,1e-14));
  vec2 q=position.xy*3.;
  vec2 k=vec2((q.x-l10*q.y/l11)/l00,q.y/l11);
  vec2 local=vec2(dot(a,k),dot(b,k));
  transformed+=major*local.x+minor*local.y+thickness*dot(c,k);
  vec4 mvPosition=modelViewMatrix*vec4(transformed,1.);
  gl_Position=projectionMatrix*mvPosition;
  gl_Position.xy=(ndc+vec2(l00*q.x,l10*q.x+l11*q.y))*gl_Position.w;
  float energy=sqrt(max(0.,xx*yy-xy*xy))/(l00*l11);
  // Large footprints soften fine details. In close-ups hand coverage back
  // to the repaired surface. Fade grazing splats to keep thin contours sharp.
  float detailCoverage=(1.-smoothstep(2.4,5.2,sigmaPixels))*smoothstep(.08,.48,facing);
  gKernel=vec3(q,detailCoverage*min(1.,energy));
  vec4 g=texelFetch(gradients,texel,0);
  vMapUv=coords.xy+g.xy*local.x+g.zw*local.y;
  gBounds=texelFetch(boundsUV,texel,0);
`;

function makeSplatMaterial(source,uniforms){
  const m=source.clone();
  m.defines={...m.defines,PORTRAIT_SPLAT:1};
  m.name='Frog girl · Gaussian surface';m.transparent=true;m.depthWrite=false;m.side=THREE.FrontSide;
  m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;
  m.onBeforeCompile=s=>{
    Object.assign(s.uniforms,uniforms);
    s.vertexShader=motionField+pointData+s.vertexShader;
    s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>',initSample)
      .replace('#include <begin_vertex>','vec3 transformed=center;')
      .replace('#include <project_vertex>',projectSample);
    s.fragmentShader='varying vec3 gKernel;varying vec4 gBounds;varying vec4 gPigment;\n'+s.fragmentShader;
    s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`
      float r2=dot(gKernel.xy,gKernel.xy);
      if(r2>9. || gKernel.z<.001)discard;
      vec4 pigment=texture2D(map,clamp(vMapUv,gBounds.xy,gBounds.zw));
      const vec3 luma=vec3(.2126,.7152,.0722);
      float brightness=dot(pigment.rgb,luma);
      float centerLuma=dot(gPigment.rgb,luma);
      // Keep high-contrast lash, fringe and hood boundaries on the original
      // 4K surface when a projected ellipse reaches the other side of a line.
      float contrast=abs(brightness-centerLuma)/(.055+max(brightness,centerLuma));
      float edgeCoverage=1.-.96*smoothstep(.27,.56,contrast)*smoothstep(.08,.68,r2);
      vec3 anchorChroma=gPigment.rgb*(brightness/max(.0001,centerLuma));
      pigment.rgb=mix(pigment.rgb,anchorChroma,gPigment.a);
      diffuseColor*=pigment;
      diffuseColor.a*=.94*gKernel.z*exp(-.5*r2)*edgeCoverage;
      if(diffuseColor.a<.003)discard;`);
  };
  return m;
}

export async function loadPortraitSplats(file='portrait-splats.bin'){
  const res=await fetch(new URL('./local-source/'+file,import.meta.url));
  if(!res.ok)throw new Error('Cannot load Gaussian portrait.');
  return res.arrayBuffer();
}
export function createPortraitSplats(buffer,support,material,pigments,omittedFaces){
  const d=new DataView(buffer),records=d.getUint32(4,true);
  if(d.getUint32(0,false)!==0x46475331||d.getUint32(8,true)!==recordSize||d.getUint32(12,true)!==1||
     !records||records>800000||buffer.byteLength!==16+recordSize*records)throw new Error('Unexpected Gaussian portrait format.');
  if(pigments.length!==4*records)throw new Error('Gaussian pigment count does not match its surface.');
  const tri=support.index.array,uv=support.attributes.uv;
  const active=new Uint32Array(records);
  let count=0;
  for(let i=0;i<records;i++){
    const face=d.getUint32(16+i*recordSize+36,true);
    if(3*face+2>=tri.length)throw new Error('Invalid Gaussian surface anchor.');
    if(!(omittedFaces[face>>>3]&(1<<(face&7))))active[count++]=i;
  }
  const height=Math.ceil(count/textureWidth),length=height*textureWidth*4;
  const pigmentPixels=new Uint8Array(length);
  const sourceColors=new Uint32Array(pigments.buffer,pigments.byteOffset,records);
  const filteredColors=new Uint32Array(pigmentPixels.buffer);
  const pigmentMap=dataTexture(pigmentPixels,height,THREE.UnsignedByteType);
  pigmentMap.colorSpace=THREE.SRGBColorSpace;
  const rest=new Float32Array(length),charts=new Float32Array(length),axes=new Uint16Array(length);
  const jacobian=new Uint16Array(length),limits=new Float32Array(length);
  const fromHalf=THREE.DataUtils.fromHalfFloat,toHalf=THREE.DataUtils.toHalfFloat;
  const order=new Float32Array(count);
  for(let i=0;i<count;i++){
    const source=active[i],off=16+source*recordSize,j=i*4;
    filteredColors[i]=sourceColors[source];
    const x=d.getFloat32(off,true),y=d.getFloat32(off+4,true),z=d.getFloat32(off+8,true);
    rest[j]=x;rest[j+1]=y;rest[j+2]=z;rest[j+3]=fromHalf(d.getUint16(off+24,true));
    charts[j]=d.getUint16(off+12,true)/65535;charts[j+1]=d.getUint16(off+14,true)/65535;
    charts[j+2]=fromHalf(d.getUint16(off+26,true));
    charts[j+3]=Math.exp(-(((x-.18)/.27)**2+((y+.45)/.23)**2+((z+.04)/.28)**2));
    for(let k=0;k<4;k++){
      axes[j+k]=toHalf(Math.max(-1,d.getInt16(off+16+2*k,true)/32767));
      jacobian[j+k]=d.getUint16(off+28+2*k,true);
    }
    const idx=3*d.getUint32(off+36,true);
    const a=tri[idx],b=tri[idx+1],c=tri[idx+2],pad=.5/4096;
    limits[j]=Math.min(uv.getX(a),uv.getX(b),uv.getX(c))-pad;
    limits[j+1]=Math.min(uv.getY(a),uv.getY(b),uv.getY(c))-pad;
    limits[j+2]=Math.max(uv.getX(a),uv.getX(b),uv.getX(c))+pad;
    limits[j+3]=Math.max(uv.getY(a),uv.getY(b),uv.getY(c))+pad;
    order[i]=i;
  }
  const pose={value:0},uniforms={
    restPositions:{value:dataTexture(rest,height,THREE.FloatType)},surfaceAxes:{value:dataTexture(axes,height,THREE.HalfFloatType)},
    charts:{value:dataTexture(charts,height,THREE.FloatType)},gradients:{value:dataTexture(jacobian,height,THREE.HalfFloatType)},
    boundsUV:{value:dataTexture(limits,height,THREE.FloatType)},restPigment:{value:pigmentMap},
    portraitExcursion:pose,viewport:{value:new THREE.Vector2()}
  };
  const geo=new THREE.InstancedBufferGeometry(),quad=new THREE.PlaneGeometry(2,2);
  geo.index=quad.index;geo.setAttribute('position',quad.attributes.position);geo.setAttribute('uv',quad.attributes.uv);
  const instanceOrder=new THREE.InstancedBufferAttribute(order,1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('orderIndex',instanceOrder);geo.instanceCount=count;
  const object=new THREE.Mesh(geo,makeSplatMaterial(material,uniforms));object.frustumCulled=false;
  object.name='Frog girl · temporally deformable Gaussians';object.receiveShadow=true;
  const matrix=new THREE.Matrix4(),direction=new THREE.Vector3(),previous=new THREE.Vector3();
  const hist=new Uint32Array(depthBins),bins=new Uint16Array(count);
  let lastPose=NaN;
  // Sort before WebGL uploads the instance buffer, including on the first
  // stationary frame and the immediate A/B switch.
  function prepareView(renderer,camera){
    if(!object.visible)return;
    renderer.getDrawingBufferSize(uniforms.viewport.value);
    camera.updateWorldMatrix(true,false);object.updateWorldMatrix(true,false);
    const e=matrix.multiplyMatrices(camera.matrixWorldInverse,object.matrixWorld).elements;
    direction.set(e[2],e[6],e[10]).normalize();
    if(direction.dot(previous)>.99995&&lastPose===pose.value)return;
    previous.copy(direction);lastPose=pose.value;
    const weight=direction.dot(torsoAxis)*pose.value;
    hist.fill(0);
    for(let i=0;i<count;i++){
      const j=4*i;
      const z=direction.x*rest[j]+direction.y*rest[j+1]+direction.z*rest[j+2]+weight*charts[j+3];
      const bin=Math.max(0,Math.min(depthBins-1,Math.floor((z+1.6)*depthBins/3.2)));
      hist[bin]++;bins[i]=bin;
    }
    let offset=0;
    for(let b=0;b<depthBins;b++){const n=hist[b];hist[b]=offset;offset+=n;}
    for(let i=0;i<count;i++)order[hist[bins[i]]++]=i;
    instanceOrder.needsUpdate=true;
  }
  return {object,excursion:pose,prepareView,setTime(seconds){
    pose.value=.005*Math.sin((Number.isFinite(seconds)?seconds:0)*1.57);
  }};
}
