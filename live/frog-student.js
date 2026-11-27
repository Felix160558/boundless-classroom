import * as THREE from '../three.module.min.js';
import {createFrogLowerBody,frogFeetY,frogSeatMount} from '../frog-girl/full-body.js?v=frog-blink-69';
import {createFrogIdle,createFrogSeating,FROG_HIP_DEPTH,FROG_SEAT_DURATION} from '../frog-girl/frog-motion.js?v=frog-leaf-70';

const scale=.55;
const floorRise=.09;
const seatTop=.625-floorRise;
const seat=frogSeatMount(scale,seatTop);
const hip=new THREE.Vector3(0,seat.hipY,FROG_HIP_DEPTH);
const pitchAxis=new THREE.Vector3(1,0,0);
let template;

export function frogStudentEye(){
  return new THREE.Vector3(.226,.241,.075).sub(hip).applyAxisAngle(pitchAxis,seat.lean)
    .add(hip).multiplyScalar(scale)
    .add(new THREE.Vector3(-.205*scale,floorRise-frogFeetY*scale+seat.y,.151*scale+seat.z));
}

function loadTemplate(){
  // Share the high-resolution geometry and textures across classroom seats.
  template??=import('../frog-girl/frog-character.js?v=frog-hair-73').then(async ({loadFrogCharacter})=>{
    const actor=await loadFrogCharacter({modelScale:scale});
    if(!actor.finish)throw new Error('Frog Girl refinements could not load.');
    actor.finish.show('repaired');
    return actor;
  }).catch(error=>{template=null;throw error;});
  return template;
}

function showBelow(mesh,ceiling){
  const source=mesh.geometry;
  const indices=source.index.array;
  const vertices=source.attributes.position;
  const retained=new Uint32Array(indices.length);
  let count=0;
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2];
    if(Math.max(vertices.getY(a),vertices.getY(b),vertices.getY(c))>=ceiling)continue;
    retained[count++]=a;
    retained[count++]=b;
    retained[count++]=c;
  }
  const geometry=new THREE.BufferGeometry();
  for(const [name,attribute] of Object.entries(source.attributes))geometry.setAttribute(name,attribute);
  geometry.setIndex(new THREE.BufferAttribute(retained.slice(0,count),1));
  geometry.boundingSphere=source.boundingSphere;
  mesh.geometry=geometry;
}

export async function createFrogStudent({firstPerson=false}={}){
  const actor=await loadTemplate();
  const object=new THREE.Group();
  object.name='Frog Girl';
  object.position.y=floorRise;
  const model=new THREE.Group();
  const upperBody=actor.upperBody.clone(true), lowerBody=createFrogLowerBody();
  model.position.copy(actor.model.position);
  model.scale.setScalar(scale);
  model.add(upperBody,lowerBody);
  object.add(model);

  const hood=upperBody.getObjectByName('Frog hood and raincoat');
  const seams=upperBody.getObjectByName('Neck, waist and lining details');
  const head=upperBody.getObjectByName('Head and hair');
  const grip=upperBody.getObjectByName('Original hands, cuffs and stalk');
  if(firstPerson){
    // Keep the original hands and held stalk. Open the view above the collar.
    head.visible=false;
    upperBody.getObjectByName('Lotus-leaf parasol').visible=false;
    showBelow(hood,-.06);
    showBelow(seams,.075);
  }

  const seating=createFrogSeating({model,upperBody,lowerBody,scale},{seatTop});
  const idle=await createFrogIdle(upperBody);
  const motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const eyePosition=frogStudentEye();
  let active=false,started=null,settled=false;
  function resetSeat(){
    started=null;
    settled=Boolean(motion?.matches);
    grip.visible=true;
    idle.update(0,{still:true});
    seating.set(settled?1:0);
  }
  resetSeat();
  return {object,eyePosition,resetSeat,setActive(value){active=value;},update(time,{reducedMotion=false,lookDown=0}={}){
    if(!active)return;
    // The close-held prop fills the wearer's view when looking almost straight
    // down. Let the wearer see past it while other participants see the grip.
    if(firstPerson)grip.visible=lookDown<(grip.visible ? .91 : .87);
    started??=time;
    const still=reducedMotion||motion?.matches;
    if(!settled){
      const progress=still?1:THREE.MathUtils.clamp((time-started)/FROG_SEAT_DURATION,0,1);
      seating.set(progress);
      settled=progress===1;
    }
    idle.update(Math.max(0,time-started-FROG_SEAT_DURATION),{still});
  }};
}
