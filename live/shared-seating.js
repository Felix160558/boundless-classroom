import * as THREE from '../three.module.min.js';
import {blockStudentEye,createBlockStudent} from './block-student.js?v=block-vr-56';

export const SHARED_BOARD={x:0,y:.37,width:4.55,height:2.16};
export const SHARED_FLOOR=-1.38;
export const FURNITURE_INSET=.09;
export const CHAIR_SEAT_HEIGHT=.58;
export const CHAIR_SEAT_THICKNESS=.09;
export const SEATED_STUDENT_HEIGHT=1.40;
const seats={
  teacher:{x:-1.32,z:-.13,yaw:-.76},
  'student-2':{x:1.42,z:-.76,yaw:1.25},
  student:{x:.17,z:.35,yaw:.16},
};
export const SHARED_SEATS=Object.keys(seats);
export function studentSeatMount(height,top=CHAIR_SEAT_HEIGHT+CHAIR_SEAT_THICKNESS/2,front=.31) {
  // Rest-space contact of the bent thighs and the torso offset behind the seat edge.
  return {y:top-.1235*height,z:front-.043*height};
}
export function seatPose(seatId) { return Object.hasOwn(seats,seatId)?seats[seatId]:null; }
export function seatedView(seatId,avatar) {
  const seat=seatPose(seatId);
  if (!seat) return {position:[0,0,0],yaw:0};
  const simpleEye=blockStudentEye(SEATED_STUDENT_HEIGHT);
  let y=simpleEye.y, z=-simpleEye.z;
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
  const avatars=SHARED_SEATS.map((seatId,index)=>{
    const seat=seatPose(seatId);
    const anchor=new THREE.Group();
    anchor.position.set(seat.x,SHARED_FLOOR-FURNITURE_INSET,seat.z);
    anchor.rotation.y=seat.yaw;
    anchor.visible=false;
    const figure=createBlockStudent({height:SEATED_STUDENT_HEIGHT,teacher:seatId==='teacher'});
    // Shared seating faces -Z, while both avatar models face +Z.
    figure.object.rotation.y=Math.PI;
    anchor.add(figure.object);
    group.add(anchor);
    return {seatId,anchor,figure,phase:index*3.8,peerId:null,appearance:'simple',cat:null,loading:null,
      targetYaw:null,targetPitch:null,headYaw:0,headPitch:0};
  });

  function updateAppearance(avatar) {
    const useCat=avatar.appearance==='orange-cat' && Boolean(avatar.cat);
    avatar.anchor.visible=avatar.peerId!==null;
    avatar.figure.object.visible=!useCat;
    if (avatar.cat) avatar.cat.object.visible=useCat;
    onChange();
  }

  function loadCat(avatar) {
    if (avatar.cat || avatar.loading) return;
    avatar.loading=import('./student-avatar.js?v=block-vr-56').then(async ({createStudentAvatar})=>{
      const next=createStudentAvatar({height:SEATED_STUDENT_HEIGHT,seated:true});
      await next.ready;
      // Shared seating faces -Z; the student asset faces +Z.
      next.object.rotation.y=Math.PI;
      avatar.cat=next;
      avatar.anchor.add(next.object);
      updateAppearance(avatar);
    }).catch(()=>{
      // The participant's simple figure stays in place on load failure.
    }).finally(()=>{avatar.loading=null;});
  }

  return {
    show(localSeat,peers) {
      for (const avatar of avatars) {
        const peer=localSeat && avatar.seatId!==localSeat
          ? peers.find(person=>(person.seat || person.role)===avatar.seatId)
          : null;
        const peerId=peer?.peerId ?? null;
        const appearance=peer?.avatar==='orange-cat'?'orange-cat':'simple';
        if (avatar.peerId!==peerId || avatar.appearance!==appearance) {
          avatar.peerId=peerId;
          avatar.appearance=appearance;
          avatar.headYaw=0;
          avatar.headPitch=0;
          updateAppearance(avatar);
          if (appearance==='orange-cat') loadCat(avatar);
        }
        avatar.targetYaw=Number.isFinite(peer?.headYaw)?peer.headYaw:null;
        avatar.targetPitch=Number.isFinite(peer?.headPitch)?peer.headPitch:null;
      }
      group.visible=avatars.some(avatar=>avatar.anchor.visible);
    },
    update(time,elapsed,reduced=false) {
      if (!group.visible) return;
      for (const avatar of avatars) {
        const {anchor,cat,figure,targetYaw,targetPitch,phase}=avatar;
        if (!anchor.visible) continue;
        const tracking=targetYaw!==null && targetPitch!==null;
        avatar.headYaw=THREE.MathUtils.damp(avatar.headYaw,targetYaw ?? 0,12,elapsed);
        avatar.headPitch=THREE.MathUtils.damp(avatar.headPitch,targetPitch ?? 0,12,elapsed);
        const {headYaw,headPitch}=avatar;
        const settling=Math.abs(headYaw)+Math.abs(headPitch)>.025;
        const hint=tracking || settling?{headYaw,headPitch}:{};
        if (reduced) Object.assign(hint,{headYaw:hint.headYaw ?? 0,headPitch:hint.headPitch ?? 0,raise:0,tail:0});
        const model=cat?.object.visible?cat:figure;
        model.update(reduced?0:time+phase,hint);
      }
    },
  };
}
