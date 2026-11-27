import * as THREE from '../three.module.min.js';

export async function loadPortraitRegions(){
  const loader=new THREE.TextureLoader();
  async function read(name){
    const texture=await loader.loadAsync(new URL('./local-source/'+name,import.meta.url).href);
    texture.flipY=false;
    texture.premultiplyAlpha=false;
    texture.colorSpace=THREE.NoColorSpace;
    texture.anisotropy=4;
    return texture;
  }
  const [zones,eyes]=await Promise.all([read('portrait-zones-polished.png'),read('portrait-eyes.png')]);
  return {zones,eyes};
}

// The same source UV and material response follow the mesh and every splat.
// Eyelashes, outlined edges and painted glints retain their source detail.
export function bindPortraitSurface(material,regions){
  const originalCompile=material.onBeforeCompile;
  const originalProgram=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    originalCompile.call(this,shader,renderer);
    shader.uniforms.portraitZones={value:regions.zones};
    shader.uniforms.portraitEyes={value:regions.eyes};
    shader.fragmentShader='uniform sampler2D portraitZones,portraitEyes;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      vec2 surfaceUV=vMapUv;
      #ifdef PORTRAIT_SPLAT
        surfaceUV=clamp(surfaceUV,gBounds.xy,gBounds.zw);
      #endif
      vec4 zone=texture2D(portraitZones,surfaceUV);
      float hair=zone.r,skin=zone.g,hood=zone.b;
      float iris=clamp((zone.a*255.-128.)/127.,0.,1.);
      vec3 eye=texture2D(portraitEyes,surfaceUV).rgb;
      float cornea=max(iris,eye.g);
      #ifdef PORTRAIT_SPLAT
        // Suppress grain over skin gradients and preserve the registered eye
        // boundary on the detailed surface, including during an orbit.
        diffuseColor.a*=mix(1.,.16,skin)*(1.-cornea);
        if(diffuseColor.a<.003)discard;
      #endif
      roughnessFactor=mix(.87,.58,hair);
      roughnessFactor=mix(roughnessFactor,.68,skin);
      roughnessFactor=mix(roughnessFactor,.39,hood);
      roughnessFactor=mix(roughnessFactor,.23,cornea);
      #if NUM_DIR_LIGHTS > 0
        // Consensual pupil response: both eyes receive one light level.
        // Only the narrow annulus at each registered pupil boundary is changed.
        vec3 headForward=normalize(mat3(viewMatrix)*vec3(.04,.18,1.));
        float lightLevel=smoothstep(-.23,.75,dot(headForward,directionalLights[0].direction));
        float edge=mix(.546,.483,lightLevel);
        float aa=clamp(fwidth(eye.r)*.65,.008,.035);
        float restDisk=1.-smoothstep(.5-aa,.5+aa,eye.r);
        float litDisk=1.-smoothstep(edge-aa,edge+aa,eye.r);
        float change=(litDisk-restDisk)*eye.g*(1.-eye.b);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.012,.009,.027),max(0.,change)*.82);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.081,.060,.185),max(0.,-change)*.68);
      #endif
    `).replace('#include <lights_physical_fragment>',`
      #include <lights_physical_fragment>
      float surfaceF0=mix(.024,.039,hair);
      surfaceF0=mix(surfaceF0,.029,skin);
      surfaceF0=mix(surfaceF0,.036,hood);
      surfaceF0=mix(surfaceF0,.029,cornea);
      material.specularColor=vec3(surfaceF0);
    `).replace('#include <lights_fragment_end>',`
      #include <lights_fragment_end>
      // A small spread of daylight softens the cheek terminator. Cast
      // shadows still follow the hood and the leaf as the actual key moves.
      #if NUM_DIR_LIGHTS > 0
        float cheekCos=dot(normal,directionalLights[0].direction);
        float cheekWrap=max(0.,(cheekCos+.24)/1.24)-max(0.,cheekCos);
        if(skin>.01 && cheekWrap>.001){
          float keyVisibility=1.;
          #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
            DirectionalLightShadow keyShadow=directionalLightShadows[0];
            if(receiveShadow)keyVisibility=getShadow(directionalShadowMap[0],keyShadow.shadowMapSize,
              keyShadow.shadowBias,keyShadow.shadowRadius,vDirectionalShadowCoord[0]);
          #endif
          reflectedLight.directDiffuse+=diffuseColor.rgb*vec3(1.,.82,.76)*directionalLights[0].color
            *(RECIPROCAL_PI*.36*cheekWrap*skin*keyVisibility);
        }
      #endif
      // Give the moving key reflection precedence over broad sky reflections at the iris.
      reflectedLight.indirectSpecular*=1.-.30*cornea;
    `);
  };
  material.customProgramCacheKey=()=>originalProgram+'|frog-portrait-surface-2';
  return material;
}
