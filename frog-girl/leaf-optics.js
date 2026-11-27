import * as THREE from '../three.module.min.js';

export async function loadLeafThickness(){
  const url=new URL('./local-source/leaf-thickness.png',import.meta.url);
  const map=await new THREE.TextureLoader().loadAsync(url.href);
  map.flipY=false; // The GLB's base-colour atlas uses glTF UV orientation.
  map.colorSpace=THREE.NoColorSpace;
  return map;
}

// A thin green sheet passes scattered light, but still occludes the objects
// behind it. Apply this material exclusively to the selected leaf triangles.
export function createLeafOptics(sourceMaterial, thickness){
  const material=sourceMaterial.clone();
  material.name='Lotus leaf · light through lamina and veins';
  material.metalness=0;
  material.roughness=.52;
  const direction={value:new THREE.Vector3(-.35,.7,.6).normalize()};
  const irradiance={value:1};
  material.onBeforeCompile=shader=>{
    shader.uniforms.leafKey=direction;
    shader.uniforms.leafIrradiance=irradiance;
    shader.uniforms.leafVeins={value:thickness};
    shader.fragmentShader=`
      uniform vec3 leafKey;
      uniform float leafIrradiance;
      uniform sampler2D leafVeins;
      `+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      {
        const vec3 weights=vec3(.2126,.7152,.0722);
        float value=dot(diffuseColor.rgb,weights);
        // Linear-light chromaticities of the painted blade, sampled from
        // IMG_2713 at (79,385), (59,360), and (250,82).
        vec3 hue=mix(vec3(.125,.246,.144),vec3(.216,.402,.296),smoothstep(.055,.24,value));
        hue=mix(hue,vec3(.371,.533,.558),smoothstep(.21,.52,value));
        diffuseColor.rgb=mix(diffuseColor.rgb,hue*value/dot(hue,weights),.66);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      {
        vec3 V=normalize(vViewPosition);
        vec3 L=normalize(mat3(viewMatrix)*leafKey);
        float normalToViewer=dot(normal,V);
        // Either GLB shell face can be visible around a bend. Orient softly
        // to the viewer so the rim does not flicker at grazing incidence.
        float observerSide=clamp(normalToViewer/.16,-1.,1.);
        float opposite=-dot(normal,L)*observerSide;
        float throughFace=smoothstep(-.03,.84,opposite);
        float forwardScatter=smoothstep(-.17,.72,-dot(V,L));
        float tangent=1.-smoothstep(.08,.39,abs(normalToViewer));
        float path=throughFace*(.14+.86*forwardScatter)+tangent*.10*forwardScatter;
        float through=1.-exp(-leafIrradiance*path*.93);
        float vein=texture2D(leafVeins,vMapUv).r;
        // Keep a coloured, bounded transmission lobe; face-on alabaster white
        // in the artwork is illumination, not a pigment that belongs on a vein.
        vec3 scatter=pow(max(diffuseColor.rgb,vec3(0.)),vec3(.78))*vec3(.88,1.10,.84);
        // The denser original ribs transmit less; their painted strokes are
        // still visible under frontal illumination, where through falls away.
        outgoingLight*=1.-.13*vein*smoothstep(.04,.68,through);
        outgoingLight+=scatter*through*(1.-.65*vein);
      }
      #include <opaque_fragment>`);
  };
  return {material,setLight(keyDirection,power){
    direction.value.copy(keyDirection).normalize();
    irradiance.value=Math.max(0,power);
  }};
}
