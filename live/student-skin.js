import * as THREE from '../three.module.min.js';
import {GLTFLoader} from '../GLTFLoader.js';
import {MeshoptDecoder} from '../meshopt_decoder.mjs';
import {textileFinish} from './student-textile.js?v=student-avatar-49';

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

export function deformableMaterial(source, joints, textile=true) {
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
      diffuseColor.rgb *= mix(1.,avatarWovenFinish(avatarRest,avatarNormal,diffuseColor.rgb),avatarTextile);
    `);
  };
  return material;
}

export async function createStudentBacking(joints, bindVertex) {
  const parts = await readBacking();
  const root = new THREE.Group();
  root.name = 'Continuous skinned surface beneath the Gaussians';
  for (const [part, tag] of [['Body',255], ['Tail',254]]) {
    const source = parts.get(part);
    const geometry = source.geometry.clone();
    const position = geometry.getAttribute('position');
    const skin = new Uint8Array(position.count * 4);
    for (let index = 0; index < position.count; index++) {
      bindVertex(position.getX(index), position.getY(index), position.getZ(index), tag, skin, index * 4);
    }
    geometry.setAttribute('avatarBinding', new THREE.BufferAttribute(skin, 4, true));
    const mesh = new THREE.Mesh(geometry, deformableMaterial(source.material, joints,tag===255));
    mesh.frustumCulled = false;
    mesh.name = part;
    root.add(mesh);
  }
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
