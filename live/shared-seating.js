import * as THREE from '../three.module.min.js';

export const SHARED_BOARD={x:0,y:.37,width:4.55,height:2.16};
export const SHARED_FLOOR=-1.38;
export const FURNITURE_INSET=.09;
export const CHAIR_SEAT_HEIGHT=.58;
export const CHAIR_SEAT_THICKNESS=.09;
export const SEATED_STUDENT_HEIGHT=1.40;
const seats={
  teacher:{x:-1.32,z:-.13,yaw:-.76},
  student:{x:.17,z:.35,yaw:.16},
  spare:{x:1.42,z:-.76,yaw:1.25},
};
const seatedHip=[0,CHAIR_SEAT_HEIGHT+CHAIR_SEAT_THICKNESS/2,.045];
const eyeFromHip=[0,.82,-.144];
export function studentSeatMount(height,top=seatedHip[1],front=.31) {
  // Rest-space contact of the bent thighs and the torso offset behind the seat edge.
  return {y:top-.1235*height,z:front-.043*height};
}
export function seatPose(role) { return seats[role] || null; }
export function seatedView(role,avatar) {
  const seat=seatPose(role);
  if (!seat) return {position:[0,0,0],yaw:0};
  let y=seatedHip[1]+eyeFromHip[1], z=seatedHip[2]+eyeFromHip[2];
  if (avatar==='orange-cat') {
    const height=SEATED_STUDENT_HEIGHT, mount=studentSeatMount(height);
    y=mount.y+.730*height;
    z=-(mount.z+.119*height);
  }
  return {position:[seat.x+Math.sin(seat.yaw)*z,SHARED_FLOOR-FURNITURE_INSET+y,
    seat.z+Math.cos(seat.yaw)*z],yaw:seat.yaw};
}

export function createSharedSeating(parent, onChange=()=>{}) {
  const group=new THREE.Group();
  group.name='Classroom participants';
  group.visible=false;
  parent.add(group);
  const avatars={};
  let remoteRole=null, appearance='simple', cat=null, catLoad=null;
  let targetYaw=null,targetPitch=null, headYaw=0,headPitch=0;
  function box(root,material,x,y,z,w,h,d) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true;
    root.add(mesh);
  }
  for (const role of ['teacher','student']) {
    const seat=seatPose(role);
    const avatar=new THREE.Group();
    avatar.position.set(seat.x,SHARED_FLOOR-FURNITURE_INSET,seat.z);
    avatar.rotation.y=seat.yaw;
    const body=new THREE.Group();
    body.position.fromArray(seatedHip);
    avatar.add(body);
    const porcelain=new THREE.MeshStandardMaterial({color:0xc8d3dd,roughness:.58,metalness:.12});
    const jacket=new THREE.MeshStandardMaterial({color:role==='teacher'?0x354353:0x586e82,roughness:.72,metalness:.06});
    const trim=new THREE.MeshStandardMaterial({color:0x1e2530,roughness:.54,metalness:.10});
    box(body,porcelain,0,.795,0,.30,.30,.29);
    box(body,trim,...eyeFromHip,.21,.058,.012);
    box(body,porcelain,0,.612,0,.113,.073,.108);
    box(body,jacket,0,.356,0,.43,.45,.25);
    box(body,trim,0,.09,0,.35,.14,.23);
    for (const side of [-1,1]) {
      box(body,jacket,side*.275,.325,-.032,.12,.31,.15);
      box(body,porcelain,side*.275,.16,-.105,.11,.102,.14);
      box(body,trim,side*.105,.071,-.131,.162,.142,.39);
      box(body,trim,side*.105,-.223,-.291,.145,.465,.149);
      box(body,trim,side*.105,FURNITURE_INSET-seatedHip[1]+.042,-.343,.149,.084,.24);
    }
    avatars[role]={seat:avatar,figure:body};
    group.add(avatar);
  }

  function updateAppearance() {
    const useCat=appearance==='orange-cat' && Boolean(cat && remoteRole);
    for (const [role,{seat,figure}] of Object.entries(avatars)) {
      seat.visible=role===remoteRole;
      figure.visible=!(useCat && seat.visible);
    }
    if (useCat) avatars[remoteRole].seat.add(cat.object);
    else cat?.object.removeFromParent();
    onChange();
  }

  function loadCat() {
    if (catLoad) return;
    catLoad=import('./student-avatar.js?v=student-avatar-49').then(async ({createStudentAvatar})=>{
      const next=createStudentAvatar({height:SEATED_STUDENT_HEIGHT,seated:true});
      try { await next.ready; }
      catch (error) { next.dispose(); throw error; }
      // Shared seating faces -Z; the student asset faces +Z.
      next.object.rotation.y=Math.PI;
      cat=next;
      updateAppearance();
    }).catch(()=>{}); // The participant's simple figure stays in place on load failure.
  }

  return {
    show(role,other,{avatar,headYaw:yaw,headPitch:pitch}={}) {
      const nextOther=role && other!==role && Object.hasOwn(avatars,other)?other:null;
      const nextAppearance=avatar==='orange-cat'?'orange-cat':'simple';
      if (nextOther!==remoteRole || nextAppearance!==appearance) {
        headYaw=0;headPitch=0;
        remoteRole=nextOther;appearance=nextAppearance;
        updateAppearance();
      }
      targetYaw=Number.isFinite(yaw)?yaw:null;
      targetPitch=Number.isFinite(pitch)?pitch:null;
      group.visible=Boolean(remoteRole);
      if (remoteRole && appearance==='orange-cat') loadCat();
    },
    update(time,elapsed,reduced=false) {
      if (!cat?.object.parent || !group.visible) return;
      const tracking=targetYaw!==null && targetPitch!==null;
      headYaw=THREE.MathUtils.damp(headYaw,targetYaw ?? 0,12,elapsed);
      headPitch=THREE.MathUtils.damp(headPitch,targetPitch ?? 0,12,elapsed);
      const settling=Math.abs(headYaw)+Math.abs(headPitch)>.025;
      const hint=tracking || settling?{headYaw,headPitch}:{};
      if (reduced) Object.assign(hint,{headYaw:hint.headYaw ?? 0,headPitch:hint.headPitch ?? 0,raise:0,tail:0});
      cat.update(reduced?0:time,hint);
    },
  };
}
