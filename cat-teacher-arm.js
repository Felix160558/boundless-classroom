import * as THREE from './three.module.min.js';

const clamp = THREE.MathUtils.clamp;
const smooth = THREE.MathUtils.smootherstep;
const shoulderPivot = new THREE.Vector3(-.115,.275,.023);
const elbowPivot = new THREE.Vector3(-.141,.218,.025);
const wristPivot = new THREE.Vector3(-.149,.162,.032);
const neutral = { value:0, velocity:0 };
const restIfTiny = value => value < .00004 ? 0 : value;

function settle(joint,target,dt) {
  const omega = 2 / .095;
  const decay = Math.exp(-omega * dt);
  const offset = joint.value - target;
  const change = (joint.velocity + omega * offset) * dt;
  joint.velocity = (joint.velocity - omega * change) * decay;
  joint.value = clamp(target + (offset + change) * decay,0,1);
  return joint.value;
}

function gesture(age) {
  return smooth(age,0,.38) * (1 - smooth(age,.56,1.27));
}

function localPose(matrix,pivot,angles) {
  matrix.makeRotationFromEuler(angles);
  const [a,b,c,,d,e,f,,g,h,i] = matrix.elements;
  const { x,y,z } = pivot;
  return matrix.setPosition(x - a*x - d*y - g*z,y - b*x - e*y - h*z,z - c*x - f*y - i*z);
}

function writableAttribute(geometry,name) {
  const source = geometry.getAttribute(name);
  if (source.isBufferAttribute && !source.normalized && source.array instanceof Float32Array) return source;
  const values = new Float32Array(source.count * 3);
  for (let i=0;i<source.count;i++) values.set([source.getX(i),source.getY(i),source.getZ(i)],i*3);
  const attribute = new THREE.BufferAttribute(values,3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name,attribute);
  return attribute;
}

export function createTeacherArm(mesh) {
  const geometry = mesh.geometry;
  const position = writableAttribute(geometry,'position');
  const normal = writableAttribute(geometry,'normal');
  const vertices = [];
  const arm = new Set();
  const tail = mesh.userData.tailVertexSet;
  const points = position.array, normals = normal.array;

  for (let i=0;i<position.count;i++) {
    const offset = i * 3;
    const x = points[offset], y = points[offset+1], z = points[offset+2];
    if (x>-.079 || y<.098 || y>.302 || z<-.059 || z>.097 || tail?.has(i)) continue;
    // Follow the shirt opening down to the paw, tapering into the fixed torso.
    const seam = .121 - .25 * Math.max(0,y-.149) + .16 * Math.max(0,y-.242);
    const edge = smooth(-x,seam-.023,seam+.029);
    const height = smooth(y,.098,.128) * (1 - smooth(y,.252,.302));
    const depth = smooth(z,-.059,-.028) * (1 - smooth(z,.062,.097));
    const strength = edge * height * depth;
    if (strength<.001) continue;
    const nx = normals[offset], ny = normals[offset+1], nz = normals[offset+2];

    // Round over the folded hem on the original textured sleeve. The ridge is
    // just above the angled shirt/forearm seam and blends away into the cloth.
    const hem = y - (.104 - .62*x + .025*(z-.025));
    const foldedEdge = (hem-.0045)/.004;
    const foldCrease = (hem-.0115)/.0045;
    const roll = strength * (.00125*Math.exp(-foldedEdge*foldedEdge) - .00029*Math.exp(-foldCrease*foldCrease));
    const restX = x + nx*roll, restY = y + ny*roll, restZ = z + nz*roll;
    points[offset] = restX;
    points[offset+1] = restY;
    points[offset+2] = restZ;

    const forearm = 1 - smooth(y,.192,.249);
    const paw = 1 - smooth(y,.142,.190);
    vertices.push({offset,x:restX,y:restY,z:restZ,nx,ny,nz,
      shoulderWeight:strength*(1-forearm),elbowWeight:strength*(forearm-paw),
      wristWeight:strength*paw,bodyWeight:1-strength});
    arm.add(i);
  }

  if (!vertices.length) throw new Error('The arm rig could not find the teacher’s free paw.');
  mesh.userData.teacherArmVertexSet = arm;
  const first = vertices[0].offset, count = vertices.at(-1).offset + 3 - first;
  position.addUpdateRange(first,count);
  position.needsUpdate = true;
  geometry.boundingBox?.expandByScalar(.040);
  if (geometry.boundingSphere) geometry.boundingSphere.radius += .040;

  const shoulder = new THREE.Matrix4(), elbow = new THREE.Matrix4(), wrist = new THREE.Matrix4();
  const angles = new THREE.Euler(0,0,0,'YXZ');
  const shoulderMotion = {...neutral}, elbowMotion = {...neutral}, wristMotion = {...neutral};
  let elapsed = Infinity, speaking = false;
  let lastShoulder = 0, lastElbow = 0, lastWrist = 0;

  function setSpeech(event) {
    if (event.type==='start' && !speaking) {
      speaking = true;
      elapsed = 0;
    } else if (event.type==='stop' || event.type==='pause') {
      elapsed = Infinity;
      if (event.type==='stop') speaking = false;
    } else if (event.type==='resume') {
      speaking = true;
    }
  }

  function update(dt,{reducedMotion=false,xr=false}={}) {
    elapsed += dt;
    const gain = reducedMotion ? 0 : xr ? .72 : 1;
    const lift = restIfTiny(settle(shoulderMotion,gain*gesture(elapsed),dt));
    const reach = restIfTiny(settle(elbowMotion,gain*gesture(elapsed-.046),dt));
    const offer = restIfTiny(settle(wristMotion,gain*gesture(elapsed-.093),dt));
    const change = Math.abs(lift-lastShoulder)+Math.abs(reach-lastElbow)+Math.abs(offer-lastWrist);
    if (change===0 || change<.00007 && lift+reach+offer>0) return;
    lastShoulder = lift;
    lastElbow = reach;
    lastWrist = offer;

    // The elbow follows the shoulder, and the paw follows the elbow. A slight
    // inward roll at the crest reads as an invitation toward the board.
    const a = localPose(shoulder,shoulderPivot,angles.set(-.110*lastShoulder,.025*lastShoulder,-.108*lastShoulder)).elements;
    a[13] += .005*lastShoulder;
    const b = localPose(elbow,elbowPivot,angles.set(-.263*lastElbow,.065*lastElbow,.120*lastElbow)).premultiply(shoulder).elements;
    const c = localPose(wrist,wristPivot,angles.set(-.070*lastWrist,.125*lastWrist,.235*lastWrist)).premultiply(elbow).elements;

    for (const vertex of vertices) {
      const {offset,x,y,z,nx,ny,nz,shoulderWeight:s,elbowWeight:e,wristWeight:w,bodyWeight:h} = vertex;
      const m00 = h+s*a[0]+e*b[0]+w*c[0], m01 = s*a[4]+e*b[4]+w*c[4], m02 = s*a[8]+e*b[8]+w*c[8];
      const m10 = s*a[1]+e*b[1]+w*c[1], m11 = h+s*a[5]+e*b[5]+w*c[5], m12 = s*a[9]+e*b[9]+w*c[9];
      const m20 = s*a[2]+e*b[2]+w*c[2], m21 = s*a[6]+e*b[6]+w*c[6], m22 = h+s*a[10]+e*b[10]+w*c[10];
      points[offset] = m00*x + m01*y + m02*z + s*a[12] + e*b[12] + w*c[12];
      points[offset+1] = m10*x + m11*y + m12*z + s*a[13] + e*b[13] + w*c[13];
      points[offset+2] = m20*x + m21*y + m22*z + s*a[14] + e*b[14] + w*c[14];
      const px=m00*nx+m01*ny+m02*nz, py=m10*nx+m11*ny+m12*nz, pz=m20*nx+m21*ny+m22*nz;
      const length = Math.hypot(px,py,pz) || 1;
      normals[offset] = px / length;
      normals[offset+1] = py / length;
      normals[offset+2] = pz / length;
    }
    position.addUpdateRange(first,count);
    position.needsUpdate = true;
    normal.clearUpdateRanges();
    normal.addUpdateRange(first,count);
    normal.needsUpdate = true;
  }

  return {setSpeech,update};
}
