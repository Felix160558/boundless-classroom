import * as THREE from '../three.module.min.js';

const strandShader = /* glsl */ `
  uniform sampler2D centers;
  uniform sampler2D normals;
  uniform sampler2D colors;
  uniform sampler2D skinning;
  uniform mat4 joints[JOINTS];
  in float strandIndex;
  out vec2 fiber;
  out vec3 tint;
  out float opacity;

  float variation(float id, float seed) {
    return fract(sin(id * seed) * 43758.5453);
  }
  vec3 fromSRGB(vec3 c) {
    return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(vec3(.04045),c));
  }
  void main() {
    int id = int(strandIndex);
    ivec2 pixel = ivec2(id % WIDTH,id / WIDTH);
    vec3 root = texelFetch(centers,pixel,0).xyz;
    vec3 n = normalize(texelFetch(normals,pixel,0).xyz);
    vec4 color = texelFetch(colors,pixel,0);
    vec4 w = texelFetch(skinning,pixel,0);
    mat4 skin = joints[0] * (1. - w.z - w.w)
      + joints[int(round(w.x * 255.))] * w.z + joints[int(round(w.y * 255.))] * w.w;
    mat4 view = modelViewMatrix * skin;

    float seed = variation(strandIndex,.39161);
    bool isTail = color.a < .998;
    float ear = smoothstep(.83,.98,root.y);
    vec3 guide = isTail ? vec3(root.x * .7,.94,-.22) : vec3(root.x * 2.2,mix(-.9,.82,ear),-.06);
    guide.x += (variation(strandIndex,.7477)-.5)*.27;
    vec3 tangent = guide - dot(guide,n)*n;
    if (dot(tangent,tangent) < .001) tangent = cross(n,vec3(.43,.38,.74));
    tangent = normalize(tangent);
    float strandLength = mix(.0032,.0088,seed) * (isTail ? 1.43 : mix(1.,.82,ear));
    float t = position.y;
    vec3 curve = root + n*(strandLength*(.59*t-.23*t*t)-.00027) + tangent*(strandLength*.91*t*t);
    vec4 mv = view*vec4(curve,1.);
    vec3 direction = normalize(mat3(view)*(n*(.59-.46*t)+tangent*1.82*t));
    vec3 toCamera = normalize(-mv.xyz);
    vec3 side = normalize(cross(direction,toCamera) + vec3(.00001,0.,0.));
    float scale = length(modelViewMatrix[0].xyz);
    float width = mix(.00009,.00025,seed) * mix(1.,.07,t*t);
    mv.xyz += side*position.x*width*scale;
    gl_Position = projectionMatrix*mv;
    fiber = position.xy;
    float facing = dot(normalize(mat3(view)*n),toCamera);
    float distanceFade = 1.-smoothstep(1.55,3.15,length(mv.xyz)/max(scale,.0001));
    opacity = distanceFade * smoothstep(-.58,.04,facing) * mix(.35,.79,seed);
    tint = fromSRGB(color.rgb) * (mix(.89,1.075,seed)*mix(.91,1.10,t));
  }
`;

const strandFragment = /* glsl */ `
  in vec2 fiber;
  in vec3 tint;
  in float opacity;
  out vec4 coatColor;
  #define gl_FragColor coatColor
  void main() {
    float alpha = opacity * (1.-smoothstep(.34,1.,abs(fiber.x)))
      * smoothstep(0.,.08,fiber.y) * (1.-smoothstep(.73,1.,fiber.y));
    if (alpha < .015) discard;
    gl_FragColor = vec4(tint,alpha);
    #include <colorspace_fragment>
  }
`;

function coatIndices({centers, colors, count}) {
  const selected = [];
  for (let index = 0; index < count; index++) {
    const i = index * 3, c = index * 4, tag = colors[c + 3];
    const x = Math.abs(centers[i]), y = centers[i + 1], z = centers[i + 2];
    const red = colors[c], green = colors[c + 1], blue = colors[c + 2];
    const inEye = z > .078 && y > .661 && y < .805 && x > .016 && x < .167;
    const nearTemple = x > .136 && x < .226 && z > .044 && Math.abs(y - (.736 - .57 * Math.max(0,x-.149))) < .018;
    const muzzle = z > .122 && y < .655 && x < .105;
    const earSkin = z > .035 && y > .835 && red - green > 32 && blue > green * .8;
    const velvet = red > 117 && green > 70 && red + 3 >= green;
    const head = y > .576 && !inEye && !nearTemple && !muzzle && !earSkin && velvet;
    const paw = (y < .072 || (y > .255 && y < .367 && x > .233)) && red - blue > 20 && velvet;
    const density = ((Math.imul(index, 1597334677) ^ Math.imul(index >>> 10, 2246822519)) >>> 0) / 4294967296;
    if ((tag === 254 && density < .28) || (head && density < .27) || (paw && density < .23)) selected.push(index);
  }
  return new Float32Array(selected);
}

function makeCoat(asset, skinning, joints, width) {
  const geometry = new THREE.InstancedBufferGeometry();
  const positions = [-1,0,0, 1,0,0, -1,.38,0, 1,.38,0, -1,.72,0, 1,.72,0, -1,1,0, 1,1,0];
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex([0,1,2,1,3,2, 2,3,4,3,5,4, 4,5,6,5,7,6]);
  const indices = coatIndices(asset);
  geometry.setAttribute('strandIndex',new THREE.InstancedBufferAttribute(indices,1));
  geometry.instanceCount = indices.length;
  const material = new THREE.ShaderMaterial({
    glslVersion:THREE.GLSL3, defines:{JOINTS:joints.length,WIDTH:width},
    vertexShader:strandShader, fragmentShader:strandFragment,
    transparent:true, depthWrite:false, toneMapped:false, side:THREE.DoubleSide,
    uniforms:{
      centers:{value:asset.centerTexture}, normals:{value:asset.normalTexture},
      colors:{value:asset.colorTexture}, skinning:{value:skinning}, joints:{value:joints},
    },
  });
  const mesh = new THREE.Mesh(geometry,material);
  mesh.name = 'Fine directional coat';
  mesh.renderOrder = 1;
  mesh.frustumCulled = false;
  return mesh;
}

const whiskerPaths = [
  {root:[.065,.648,.153],rightZ:.161,bend:[.128,.670,.181],end:[.198,.663,.133]},
  {root:[.074,.636,.139],rightZ:.135,bend:[.137,.646,.172],end:[.214,.632,.141]},
  {root:[.083,.615,.127],rightZ:.123,bend:[.139,.618,.157],end:[.210,.593,.131]},
  {root:[.089,.602,.118],rightZ:.116,bend:[.134,.596,.141],end:[.188,.567,.108]},
];

function makeWhiskers(headPose) {
  const positions = [], colors = [], indices = [];
  const segments = 20, sides = 6;
  const base = new THREE.Color(0xc39264), tip = new THREE.Color(0xf4e4cc);
  const point = new THREE.Vector3(), color = new THREE.Color();
  for (const sign of [-1,1]) {
    for (const [index,{root,rightZ,bend,end}] of whiskerPaths.entries()) {
      const a = new THREE.Vector3(sign*root[0],root[1],sign===1 ? rightZ : root[2]);
      const b = new THREE.Vector3(sign*bend[0],bend[1],bend[2]);
      const c = new THREE.Vector3(sign*end[0],end[1]+(sign===1 ? .0016*(index-1) : 0),end[2]);
      const curve = new THREE.QuadraticBezierCurve3(a,b,c);
      const frames = curve.computeFrenetFrames(segments,false);
      const start = positions.length / 3;
      for (let row = 0; row <= segments; row++) {
        const t = row / segments;
        const center = curve.getPointAt(t);
        color.copy(base).lerp(tip,Math.min(1,.24 + t));
        const radius = (.00059-index*.000046) * (1.-.9*t);
        for (let side = 0; side < sides; side++) {
          const angle = side * 2 * Math.PI / sides;
          point.copy(center).addScaledVector(frames.normals[row],radius*Math.cos(angle))
            .addScaledVector(frames.binormals[row],radius*Math.sin(angle));
          positions.push(point.x,point.y,point.z);
          colors.push(color.r,color.g,color.b);
          if (row === segments) continue;
          const m = start + row * sides;
          const j = m + side, k = m + (side+1)%sides;
          indices.push(j,k,j+sides,k,k+sides,j+sides);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);
  const material = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false,side:THREE.DoubleSide});
  material.onBeforeCompile = shader => {
    shader.uniforms.whiskerHead = {value:headPose};
    shader.vertexShader = shader.vertexShader.replace('#include <common>',`
      #include <common>
      uniform mat4 whiskerHead;
    `).replace('#include <begin_vertex>',`
      vec3 transformed = (whiskerHead * vec4(position,1.)).xyz;
    `);
  };
  const mesh = new THREE.Mesh(geometry,material);
  mesh.name = 'Short tapered whiskers';
  mesh.frustumCulled = false;
  return mesh;
}

export function createStudentGroom(asset, skinning, joints, width) {
  return [makeCoat(asset,skinning,joints,width),makeWhiskers(joints[1])];
}
