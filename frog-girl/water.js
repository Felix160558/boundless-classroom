import * as THREE from '../three.module.min.js';

// The same water finish is used on the original studio study and the imported leaf.
export function createDewMaterial({singleHighlight=true}={}){
  if(!singleHighlight)return new THREE.MeshPhysicalMaterial({
    color:0xf5ffff,roughness:.067,transmission:.94,ior:1.333,thickness:.016,
    attenuationDistance:.5,attenuationColor:0xd3f3e5,clearcoat:1,clearcoatRoughness:.035
  });
  const water=new THREE.MeshPhysicalMaterial({
    color:0xfaffff,metalness:0,roughness:.095,transmission:.98,ior:1.333,thickness:.016,
    attenuationDistance:.5,attenuationColor:0xe7f5ed,envMapIntensity:.32
  });
  // Three sorts shadow-casting directional lights first. The studio has one
  // shadowed sun; keep its camera-dependent glint and the refracted scenery.
  // A tiny bead of water has one interface, so a clearcoat would duplicate it.
  water.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`
      #include <lights_fragment_end>
      #if NUM_DIR_LIGHTS > 0
        vec3 dewHalfway=directionalLights[0].direction+normalize(vViewPosition);
        float dewAlignment=dot(normal,dewHalfway*inversesqrt(max(dot(dewHalfway,dewHalfway),.0001)));
        reflectedLight.directSpecular*=smoothstep(.975,.996,dewAlignment);
      #endif`);
  };
  return water;
}
