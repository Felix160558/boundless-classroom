import * as THREE from '../three.module.min.js';
import {frogSeatMount} from './full-body.js?v=frog-blink-69';

export const FROG_HIP_DEPTH=-.197;
export const FROG_SEAT_DURATION=1.1;

const idleDeformation=/* glsl */`
uniform float frogNod, frogBreath;
float frogHeadWeight(vec3 p) {
  return smoothstep(-.15,.085,p.y);
}
vec3 frogTilt(vec3 v,float weight) {
  float s=sin(frogNod*weight),c=cos(frogNod*weight);
  return vec3(v.x,c*v.y-s*v.z,s*v.y+c*v.z);
}
vec3 frogMove(vec3 p) {
  vec3 neck=vec3(.22,-.035,-.16);
  vec3 q=(p-vec3(.22,-.48,-.09))/vec3(.43,.32,.36);
  vec3 breath=vec3(1.5*(p.x-.22),.2,1.6*(p.z+.09))*frogBreath*exp(-dot(q,q));
  return neck+frogTilt(p-neck,frogHeadWeight(p))+breath;
}
`;

let blinkAssets;
function loadBlinkAssets(){
  const files=new URL('./local-source/',import.meta.url);
  const loader=new THREE.TextureLoader();
  blinkAssets??=Promise.all([
    loader.loadAsync(new URL('portrait-blink-guide.png',files).href),
    loader.loadAsync(new URL('portrait-blink-skin.webp',files).href),
    fetch(new URL('portrait-blink.json',files)).then(response=>{
      if(!response.ok)throw new Error('Missing eyelid registration.');
      return response.json();
    }),
  ]).then(([guide,skin,{x,y,width,height,atlasWidth,atlasHeight}])=>{
    for (const texture of [guide,skin]) {
      if(texture.image.width!==width||texture.image.height!==height)throw new Error('Invalid eyelid atlas.');
      texture.flipY=false;
      texture.minFilter=THREE.LinearFilter;
      texture.generateMipmaps=false;
    }
    skin.colorSpace=THREE.SRGBColorSpace;
    return {frogLidGuide:{value:guide},frogLidSkin:{value:skin},frogLidArea:{
      value:new THREE.Vector4(x/atlasWidth,y/atlasHeight,width/atlasWidth,height/atlasHeight),
    }};
  }).catch(error=>{
    blinkAssets=null;
    console.warn('Frog eyelids could not load.',error);
    return null;
  });
  return blinkAssets;
}

function attachLids(shader,blink){
  Object.assign(shader.uniforms,blink);
  shader.vertexShader='varying vec3 vFrogLidNormal;\n'+shader.vertexShader.replace(
    '#include <project_vertex>',/* glsl */`
    vec3 lidNormal=normalize(vec3((position.x-.226)*2.15,clamp((position.y-.22)*2.8,-.12,.16),1.));
    vFrogLidNormal=normalize(normalMatrix*frogTilt(lidNormal,frogHeadWeight(position)));
    #include <project_vertex>`);
  shader.fragmentShader=/* glsl */`
    uniform float frogBlink;
    uniform sampler2D frogLidGuide, frogLidSkin;
    uniform vec4 frogLidArea;
    varying vec3 vFrogLidNormal;
    `+shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
    #include <color_fragment>
    float frogLidCover=0.;
    if(frogBlink>.002){
      vec2 lidUV=(vMapUv-frogLidArea.xy)/frogLidArea.zw;
      if(all(greaterThanEqual(lidUV,vec2(0.)))&&all(lessThanEqual(lidUV,vec2(1.)))){
        vec3 guide=texture2D(frogLidGuide,lidUV).rgb;
        float depth=frogBlink*.82-guide.r;
        frogLidCover=guide.g*smoothstep(-.02,.018,depth)*smoothstep(0.,.17,frogBlink);
        vec3 eyelid=texture2D(frogLidSkin,lidUV).rgb;
        diffuseColor.rgb=mix(diffuseColor.rgb,eyelid,frogLidCover);
        float lash=(1.-smoothstep(.009,.038,abs(depth)))*guide.b*guide.g;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.060,.027,.030),lash*.9*smoothstep(.08,.22,frogBlink));
      }
    }
    `).replace('#include <normal_fragment_maps>',/* glsl */`
    #include <normal_fragment_maps>
    // The baked open eyelash ridge should not catch light through closed skin.
    normal=normalize(mix(normal,normalize(vFrogLidNormal),frogLidCover*.84));
    `).replace('float cornea=max(iris,eye.g);','float cornea=max(iris,eye.g)*(1.-frogLidCover);\n      skin=max(skin,frogLidCover);')
    .replace('float change=(litDisk-restDisk)*eye.g*(1.-eye.b);','float change=(litDisk-restDisk)*eye.g*(1.-eye.b)*(1.-frogLidCover);');
}

function animateMaterial(source,pose,blink=null){
  const material=source.clone();
  material.onBeforeCompile=(shader,renderer)=>{
    // Retain the portrait's UVs, region shading and material response.
    source.onBeforeCompile.call(source,shader,renderer);
    Object.assign(shader.uniforms,pose);
    shader.vertexShader=idleDeformation+shader.vertexShader
      .replace('#include <defaultnormal_vertex>',`
        objectNormal=frogTilt(objectNormal,frogHeadWeight(position));
        #include <defaultnormal_vertex>`)
      .replace('#include <project_vertex>',`
        transformed=frogMove(transformed);
        #include <project_vertex>`);
    if(blink)attachLids(shader,blink);
  };
  material.customProgramCacheKey=()=>`${source.customProgramCacheKey()}|frog-mesh-idle${blink?'|lids':''}`;
  return material;
}

const blinkMoments=[1.68,5.94,10.35,14.88,15.23,21.1,26.4];

export async function createFrogIdle(upperBody){
  const pose={frogNod:{value:0},frogBreath:{value:0},frogBlink:{value:0}};
  const head=upperBody.getObjectByName('Head and hair');
  const parasol=upperBody.getObjectByName('Lotus-leaf parasol');
  const leaf=parasol?.visible?parasol.getObjectByName('Lotus leaf pivot'):null;
  const blink=head?.visible?await loadBlinkAssets():null;
  for (const name of ['Head and hair','Frog hood and raincoat','Neck, waist and lining details']) {
    const part=upperBody.getObjectByName(name);
    if (!part?.visible) continue;
    const source=part.material;
    const depth=part.customDepthMaterial??new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:source.side});
    part.material=animateMaterial(source,pose,part===head?blink:null);
    part.customDepthMaterial=animateMaterial(depth,pose);
  }
  return {update(elapsed,{still=false}={}){
    const {smootherstep}=THREE.MathUtils;
    const time=Math.max(0,elapsed);
    const nodTime=time%10.6;
    const nod=smootherstep(nodTime,2.2,2.62)*(1-smootherstep(nodTime,2.62,3.16));
    const breath=(.5-.5*Math.cos(elapsed*1.41))*(.94+.06*Math.sin(elapsed*.55));
    pose.frogNod.value=still?0:.031*nod;
    pose.frogBreath.value=still?0:.012*breath;
    const clock=time%31.7;
    const onset=blinkMoments.find(start=>clock>=start&&clock<start+.236);
    const phase=clock-(onset??clock);
    pose.frogBlink.value=still||onset===undefined?0:
      smootherstep(phase,0,.085)*(1-smootherstep(phase,.119,.236));
    if(leaf){
      // A quiet roll with a smaller, offset pitch. The hub stays on the stalk.
      const ease=still?0:smootherstep(time,0,1.7);
      const roll=.023*(.74*Math.sin(time*1.05)+.26*Math.sin(time*.46+.4));
      const pitch=.012*(.76*Math.sin(time*.84+.65)+.24*Math.sin(time*1.48));
      leaf.rotation.set(ease*pitch,0,ease*roll);
    }
  }};
}

export function createFrogSeating({model,upperBody,lowerBody,scale},{seatTop}){
  const origin=model.position.clone();
  const torso=new THREE.Group();
  torso.name='Frog seated torso';
  const mount=frogSeatMount(scale,seatTop);
  torso.position.set(0,mount.hipY,FROG_HIP_DEPTH);
  upperBody.position.sub(torso.position);
  torso.add(upperBody);
  model.add(torso);
  return {set(progress){
    const pose=lowerBody.userData.setSeatedPose(progress,{scale,seatTop,approach:true});
    model.position.set(origin.x,origin.y+pose.y,origin.z+pose.z);
    torso.rotation.x=pose.lean;
  }};
}
