import * as THREE from '../three.module.min.js';
import {GLTFLoader} from '../GLTFLoader.js';
import {MeshoptDecoder} from '../meshopt_decoder.mjs';
import {textileFinish} from './student-textile.js?v=student-avatar-49';
import {STUDENT_NECKLINE} from './student-first-person.js?v=first-person-cat-55';

const file = new URL('./student-cat-support.glb?v=student-avatar-49', import.meta.url);
let assetPromise;

function readBacking() {
  assetPromise ??= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(file.href).then(({scene}) => {
    const parts = new Map();
    scene.traverse(object => {
      if (object.isMesh) parts.set(object.name, object);
    });
    if (!parts.has('Body') || !parts.has('Tail')) throw new Error('The orange cat backing is missing a part.');
    return parts;
  }).catch(error => {
    assetPromise = null;
    throw error;
  });
  return assetPromise;
}

export function deformableMaterial(source, joints, textile=true, cutHead=false) {
  const material = new THREE.MeshBasicMaterial({
    map:source.map, color:source.color, vertexColors:source.vertexColors,
    side:source.side, toneMapped:false,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.avatarJoints = {value:joints};
    shader.uniforms.avatarTextile = {value:Number(textile)};
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `
      #include <common>
      attribute vec4 avatarBinding;
      uniform mat4 avatarJoints[${joints.length}];
      varying vec3 avatarRest;
      varying vec3 avatarNormal;
    `).replace('#include <begin_vertex>', `
      avatarRest = position;
      avatarNormal = normal;
      int first = int(floor(avatarBinding.x * 255. + .5));
      int second = int(floor(avatarBinding.y * 255. + .5));
      mat4 skin = avatarJoints[0] * (1. - avatarBinding.z - avatarBinding.w)
        + avatarJoints[first] * avatarBinding.z + avatarJoints[second] * avatarBinding.w;
      vec3 transformed = (skin * vec4(position - normal * .0007, 1.)).xyz;
    `);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `
      #include <common>
      varying vec3 avatarRest;
      varying vec3 avatarNormal;
      uniform float avatarTextile;
      ${textileFinish}
    `).replace('#include <color_fragment>', `
      #include <color_fragment>
      ${cutHead ? `if (avatarRest.y >= ${STUDENT_NECKLINE}) discard;` : ''}
      diffuseColor.rgb *= mix(1.,avatarWovenFinish(avatarRest,avatarNormal,diffuseColor.rgb),avatarTextile);
    `);
  };
  material.customProgramCacheKey = () => `orange-cat-skin-${joints.length}-${cutHead}`;
  return material;
}

function retainTorso(geometry,position) {
  const source = geometry.getIndex();
  if (!source) return;
  const triangles = new source.array.constructor(source.count);
  let written = 0;
  for (let i=0; i<source.count; i+=3) {
    const [a,b,c] = [source.getX(i),source.getX(i+1),source.getX(i+2)];
    if (Math.min(position.getY(a),position.getY(b),position.getY(c)) >= STUDENT_NECKLINE) continue;
    triangles[written++] = a;
    triangles[written++] = b;
    triangles[written++] = c;
  }
  geometry.setIndex(new THREE.BufferAttribute(triangles.subarray(0,written),1));
}

function innerNeckline() {
  // Looking straight down can see into the opening beneath the folded collar.
  // Tuck a small closure inside that fold, below the retained edge of the mesh.
  const geometry = new THREE.CircleGeometry(1,48);
  geometry.rotateX(-Math.PI/2);
  geometry.scale(.114,1,.130);
  geometry.translate(-.004,STUDENT_NECKLINE-.002,-.038);
  const positions = geometry.getAttribute('position');
  const colors = new Float32Array(positions.count*3);
  const lining = new THREE.Color(0xe7c9ae), fold = new THREE.Color(0xf1e3d7);
  lining.toArray(colors);
  for (let index=1;index<positions.count;index++) fold.toArray(colors,index*3);
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  const mesh = new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}));
  mesh.name = 'First-person inner neckline';
  return mesh;
}

export async function createStudentBacking(joints, bindVertex, {firstPerson=false}={}) {
  const parts = await readBacking();
  const root = new THREE.Group();
  root.name = 'Continuous skinned surface beneath the Gaussians';
  for (const [part, tag] of [['Body',255], ['Tail',254]]) {
    const source = parts.get(part);
    const geometry = source.geometry.clone();
    const position = geometry.getAttribute('position');
    const cutHead = firstPerson && part==='Body';
    if (cutHead) retainTorso(geometry,position);
    const skin = new Uint8Array(position.count * 4);
    for (let index = 0; index < position.count; index++) {
      bindVertex(position.getX(index), position.getY(index), position.getZ(index), tag, skin, index * 4);
    }
    geometry.setAttribute('avatarBinding', new THREE.BufferAttribute(skin, 4, true));
    const mesh = new THREE.Mesh(geometry, deformableMaterial(source.material,joints,tag===255,cutHead));
    mesh.frustumCulled = false;
    mesh.name = part;
    root.add(mesh);
  }
  if (firstPerson) root.add(innerNeckline());
  return {
    object:root,
    dispose() {
      for (const part of root.children) {
        part.geometry.dispose();
        part.material.dispose();
      }
    },
  };
}
