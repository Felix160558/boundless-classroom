import * as THREE from '../three.module.min.js';

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
const seatedHip=[0,CHAIR_SEAT_HEIGHT+CHAIR_SEAT_THICKNESS/2,.045];
const eyeFromHip=[0,.82,-.144];
export function studentSeatMount(height,top=seatedHip[1],front=.31) {
  // Rest-space contact of the bent thighs and the torso offset behind the seat edge.
  return {y:top-.1235*height,z:front-.043*height};
}
export function seatPose(seatId) { return Object.hasOwn(seats,seatId)?seats[seatId]:null; }
export function seatedView(seatId,avatar) {
  const seat=seatPose(seatId);
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
  function box(root,material,x,y,z,w,h,d) {
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z); mesh.castShadow=true; mesh.receiveShadow=true;
    root.add(mesh);
  }
  const avatars=SHARED_SEATS.map((seatId,index)=>{
    const seat=seatPose(seatId);
    const anchor=new THREE.Group();
    anchor.position.set(seat.x,SHARED_FLOOR-FURNITURE_INSET,seat.z);
    anchor.rotation.y=seat.yaw;
    anchor.visible=false;
    const body=new THREE.Group();
    body.position.fromArray(seatedHip);
    anchor.add(body);
    const porcelain=new THREE.MeshStandardMaterial({color:0xc8d3dd,roughness:.58,metalness:.12});
    const jacket=new THREE.MeshStandardMaterial({color:seatId==='teacher'?0x354353:0x586e82,roughness:.72,metalness:.06});
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
    group.add(anchor);
    return {seatId,anchor,figure:body,phase:index*3.8,peerId:null,appearance:'simple',cat:null,loading:null,
      targetYaw:null,targetPitch:null,headYaw:0,headPitch:0};
  });

  function updateAppearance(avatar) {
    const useCat=avatar.appearance==='orange-cat' && Boolean(avatar.cat);
    avatar.anchor.visible=avatar.peerId!==null;
    avatar.figure.visible=!useCat;
    if (avatar.cat) avatar.cat.object.visible=useCat;
    onChange();
  }

  function loadCat(avatar) {
    if (avatar.cat || avatar.loading) return;
    avatar.loading=import('./student-avatar.js?v=student-avatar-49').then(async ({createStudentAvatar})=>{
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
        const {anchor,cat,targetYaw,targetPitch,phase}=avatar;
        if (!anchor.visible || !cat?.object.visible) continue;
        const tracking=targetYaw!==null && targetPitch!==null;
        avatar.headYaw=THREE.MathUtils.damp(avatar.headYaw,targetYaw ?? 0,12,elapsed);
        avatar.headPitch=THREE.MathUtils.damp(avatar.headPitch,targetPitch ?? 0,12,elapsed);
        const {headYaw,headPitch}=avatar;
        const settling=Math.abs(headYaw)+Math.abs(headPitch)>.025;
        const hint=tracking || settling?{headYaw,headPitch}:{};
        if (reduced) Object.assign(hint,{headYaw:hint.headYaw ?? 0,headPitch:hint.headPitch ?? 0,raise:0,tail:0});
        cat.update(reduced?0:time+phase,hint);
      }
    },
  };
}
