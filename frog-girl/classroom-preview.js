import * as THREE from '../three.module.min.js';
import {createSpaceSky} from '../space-sky.js?v=medieval-lounge-40';
import {createStationCabin} from '../live/station-cabin.js?v=frog-peer-74';
import {SHARED_BOARD,SHARED_FLOOR} from '../live/shared-seating.js?v=trio-classroom-50';

export function createClassroomPreview(scene,camera){
  const group=new THREE.Group();
  group.name='Boundless Classroom display';
  scene.add(group);
  const background=new THREE.Group();
  background.rotation.set(.25,-.47,.045);
  group.add(background);
  const sky=createSpaceSky(background,{compact:true});

  const board=document.createElement('canvas');
  board.width=1536;board.height=720;
  const lettering=board.getContext('2d');
  lettering.fillStyle='#63736f';lettering.font='23px Georgia';
  lettering.fillText('BOUNDLESS CLASSROOM',70,78);
  lettering.strokeStyle='#afbbb2';
  lettering.beginPath();lettering.moveTo(70,103);lettering.lineTo(1466,103);lettering.stroke();

  const video=()=>document.createElement('video');
  const cabin=createStationCabin(group,{
    board,localVideo:video(),remoteVideo:video(),projectedVideo:video(),
    projection:{hidden:true},workspace:new EventTarget(),displayOnly:true
  });
  const scale=1.43;
  cabin.layout(camera,1,1,null,true,{...SHARED_BOARD,x:-1.25});
  cabin.group.scale.setScalar(scale);
  cabin.group.position.y=-SHARED_FLOOR*scale;
  return {
    group,sky,
    background:new THREE.Color(0x090e16),
    displayPosition:new THREE.Vector3(.48,0,-3.15)
  };
}
