import * as THREE from '../three.module.min.js';
import {createMoleculeStage} from '../molecule-lesson.js?v=reservation-room-36';
import {seatPose,SHARED_SEATS,SHARED_FLOOR,FURNITURE_INSET} from './shared-seating.js?v=trio-classroom-50';
import {createClassroomChair} from './classroom-chair.js?v=student-avatar-49';

export const BOARD_DEPTH = 4.8;

export function createStationCabin(scene, {board, localVideo, remoteVideo, projectedVideo, projection, workspace, displayOnly=false}) {
  const group = new THREE.Group();
  const structure = new THREE.Group();
  const teaching = new THREE.Group();
  group.name = 'Reservation glass classroom';
  structure.name = 'Glass room and learner furniture';
  teaching.name = 'Classroom surfaces';
  group.visible = false;
  group.add(structure,teaching);
  scene.add(group);

  // The same quiet materials and furniture as the existing cat classroom.
  // This room intentionally has no teacher character or character asset loader.
  const materials = {
    deck:new THREE.MeshPhysicalMaterial({color:0xc5c7c3,roughness:.29,metalness:.38,clearcoat:.35,clearcoatRoughness:.3}),
    edge:new THREE.MeshStandardMaterial({color:0x343943,roughness:.27,metalness:.72}),
    white:new THREE.MeshStandardMaterial({color:0xe1e2da,roughness:.48,metalness:.2}),
    dark:new THREE.MeshStandardMaterial({color:0x202a35,roughness:.5,metalness:.45}),
    glow:new THREE.MeshStandardMaterial({color:0xeeeadc,emissive:0xd5d9d5,emissiveIntensity:.65,roughness:.5}),
  };
  const frameMaterial = new THREE.MeshStandardMaterial({color:0xc5c2b9,emissive:0xe2ceb0,emissiveIntensity:.11,roughness:.25,metalness:.65});
  const trialPalette = {
    frame:new THREE.Color(0xcbd3db), frameGlow:new THREE.Color(0xa6c3de), deck:new THREE.Color(0xc4cbd0),
    wallGlow:new THREE.Color(0xd5e4f1), ring:new THREE.Color(0xbadbf5), white:new THREE.Color(0xedf0ef),
  };
  const desktopMaterial = new THREE.MeshPhysicalMaterial({color:0xc9c9b7,roughness:.43,clearcoat:.25,clearcoatRoughness:.32});
  const platformMaterial = new THREE.MeshStandardMaterial({color:0x343d48,roughness:.43,metalness:.58});
  const glass = new THREE.MeshPhysicalMaterial({color:0xc4d2e1,transparent:true,opacity:.045,roughness:.08,metalness:.08,clearcoat:1,clearcoatRoughness:.08,side:THREE.DoubleSide,depthWrite:false});
  const glassEdges = new THREE.LineBasicMaterial({color:0xb8c8d8,transparent:true,opacity:.16,depthWrite:false});
  const seamMaterial = new THREE.LineBasicMaterial({color:0x4a515a,transparent:true,opacity:.18});
  const rimMaterial = new THREE.MeshBasicMaterial({color:0xffdfb7});
  const haloMaterial = new THREE.MeshBasicMaterial({color:0xe1c6a1,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  const ringMaterials = [
    new THREE.LineBasicMaterial({color:0xffe1b9,transparent:true,opacity:.9}),
    new THREE.LineBasicMaterial({color:0xb4c7df,transparent:true,opacity:.14}),
    new THREE.LineBasicMaterial({color:0x9cabc0,transparent:true,opacity:.045}),
  ];
  const dark = new THREE.MeshBasicMaterial({color:0x10181d,toneMapped:false});

  // Room lighting switches together with the room when returning to the lounge.
  const ambient = new THREE.HemisphereLight(0xcbd7e8,0x343039,1.55);
  const key = new THREE.DirectionalLight(0xfff3e1,2.7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-9; key.shadow.camera.right=9;
  key.shadow.camera.top=8; key.shadow.camera.bottom=-8;
  key.shadow.normalBias=.035; key.shadow.bias=-.0002;
  const fill = new THREE.DirectionalLight(0x758fae,1.2);
  const lamp = new THREE.PointLight(0xfff3db,23,16,2);
  if(!displayOnly)group.add(ambient,key,key.target,fill,fill.target,lamp);

  const ink = new THREE.CanvasTexture(board);
  ink.colorSpace = THREE.SRGBColorSpace;
  ink.minFilter = THREE.LinearFilter;
  ink.generateMipmaps = false;
  workspace.addEventListener('board-ink',()=>{ink.needsUpdate=true;});
  const boardFace = new THREE.MeshBasicMaterial({color:0xe6e7df,toneMapped:false});
  const inkMaterial = new THREE.MeshBasicMaterial({map:ink,transparent:true,depthWrite:false,toneMapped:false});
  const screenMaterial = videoMaterial(projectedVideo);
  const selfMaterial = videoMaterial(localVideo);
  const remoteMaterial = videoMaterial(remoteVideo);
  const handTexture = new THREE.TextureLoader().load(new URL('./wizard-hand.png?v=station-room-37',import.meta.url).href);
  handTexture.colorSpace = THREE.SRGBColorSpace;
  const handMaterial = new THREE.MeshBasicMaterial({map:handTexture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});
  const handWidth = .45;
  const handHeight = handWidth*1199/1312;
  const hand = mesh(new THREE.PlaneGeometry(handWidth,handHeight),handMaterial,teaching);
  hand.name = 'Wizard hand';
  hand.visible = false;
  hand.renderOrder = 4;
  const models = createMoleculeStage(teaching);
  const surfacePlane = new THREE.Plane(new THREE.Vector3(0,0,1),BOARD_DEPTH);
  const intersection = new THREE.Vector3();
  let surface = null;
  let pointer = null;
  let screenMount = null;
  let screenMesh = null;
  let portraits = [];
  let activeModel = null;
  let classroom = false;

  function videoMaterial(video) {
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  }

  function mesh(geometry, material, parent, x=0, y=0, z=0) {
    const object = new THREE.Mesh(geometry,material);
    object.position.set(x,y,z);
    object.castShadow = !material.transparent;
    object.receiveShadow = !material.transparent;
    parent.add(object);
    return object;
  }

  function box(parent, material, x,y,z, width,height,depth) {
    return mesh(new THREE.BoxGeometry(width,height,depth),material,parent,x,y,z);
  }

  function furnitureBox(width,height,depth,material,x,y,z,parent) {
    return box(parent,material,x,y,z,width,height,depth);
  }

  function pane(width,height,x,y,z,rx=0,ry=0) {
    const geometry = new THREE.PlaneGeometry(width,height);
    const window = mesh(geometry,glass,structure,x,y,z);
    window.rotation.set(rx,ry,0);
    window.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),glassEdges));
    return window;
  }

  function ring(radius,y,x,z,material) {
    const points=[];
    for(let i=0;i<=160;i++) {
      const angle=i/160*Math.PI*2;
      points.push(new THREE.Vector3(Math.cos(angle)*radius+x,y,Math.sin(angle)*radius+z));
    }
    structure.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),material));
  }

  function disposeGroup(parent, preserve=[]) {
    const geometries = new Set();
    for (const child of [...parent.children]) {
      if (preserve.includes(child)) continue;
      child.traverse(node=>{if(node.geometry)geometries.add(node.geometry);});
      child.removeFromParent();
    }
    for (const geometry of geometries) geometry.dispose();
  }

  function addFurniture(baseY,shared) {
    // Keep the original desk and rounded chair geometry in both layouts.
    const table=new THREE.Group();table.position.set(0,baseY,-.96);structure.add(table);
    const desktopShape=new THREE.Shape(),w=.925,d=.455,r=.055;
    desktopShape.moveTo(-w+r,-d);desktopShape.lineTo(w-r,-d);desktopShape.quadraticCurveTo(w,-d,w,-d+r);
    desktopShape.lineTo(w,d-r);desktopShape.quadraticCurveTo(w,d,w-r,d);desktopShape.lineTo(-w+r,d);
    desktopShape.quadraticCurveTo(-w,d,-w,d-r);desktopShape.lineTo(-w,-d+r);desktopShape.quadraticCurveTo(-w,-d,-w+r,-d);
    const desktopGeometry=new THREE.ExtrudeGeometry(desktopShape,{depth:.065,bevelEnabled:true,bevelSize:.012,bevelThickness:.01,bevelSegments:3,steps:1,curveSegments:10});
    desktopGeometry.rotateX(-Math.PI/2);desktopGeometry.translate(0,.91,0);
    mesh(desktopGeometry,desktopMaterial,table);
    for(const x of [-.76,.76])for(const z of [-.32,.32])furnitureBox(.04,.82,.04,materials.edge,x,.49,z,table);
    const chair=createClassroomChair(materials);
    if (shared) {
      for (const seatId of SHARED_SEATS) {
        const {x,z,yaw}=seatPose(seatId);
        const instance=chair.clone();
        instance.position.set(x,baseY,z);
        instance.rotation.y=yaw;
        structure.add(instance);
      }
    } else {
      chair.position.set(0,baseY,0);
      structure.add(chair);
    }
  }

  function portrait(side,roomX,halfWidth,centerY,z,floorY) {
    const mount = new THREE.Group();
    const width = 1.08;
    const height = 1.38;
    mount.name = side<0 ? 'Left optional video display' : 'Right optional video display';
    mount.position.set(roomX+side*(halfWidth-.12),centerY,z);
    mount.rotation.y = -side*1.40;
    mount.visible = false;
    teaching.add(mount);
    box(mount,materials.dark,0,0,-.025,width+.058,height+.058,.05);
    box(mount,frameMaterial,0,0,.004,width+.022,height+.022,.012);
    const picture = mesh(new THREE.PlaneGeometry(width,height),dark,mount,0,0,.012);
    const supportHeight=Math.max(.05,centerY-height*.5-floorY);
    box(mount,frameMaterial,0,-height*.5-supportHeight*.5,-.038,.026,supportHeight,.026);
    box(mount,materials.edge,0,floorY-centerY+.016,-.038,.32,.032,.22);
    return {side,mount,picture,width,height};
  }

  function layout(camera, viewWidth, viewHeight, rect, inClassroom, sharedBoard=null) {
    classroom=Boolean(inClassroom);
    group.visible=classroom;
    if (!classroom) {
      surface=null;
      hand.visible=false;
      return;
    }
    disposeGroup(structure);
    disposeGroup(teaching,[models.group,hand]);
    frameMaterial.color.set(sharedBoard?trialPalette.frame:0xc5c2b9);
    frameMaterial.emissive.set(sharedBoard?trialPalette.frameGlow:0xe2ceb0);
    materials.deck.color.set(sharedBoard?trialPalette.deck:0xc5c7c3);
    materials.glow.emissive.set(sharedBoard?trialPalette.wallGlow:0xd5d9d5);
    rimMaterial.color.set(sharedBoard?trialPalette.ring:0xffdfb7);
    ringMaterials[0].color.set(sharedBoard?trialPalette.ring:0xffe1b9);
    haloMaterial.color.set(sharedBoard?trialPalette.ring:0xe1c6a1);
    boardFace.color.set(sharedBoard?trialPalette.white:0xe6e7df);
    key.color.set(sharedBoard?0xe3efff:0xfff3e1);
    lamp.color.set(sharedBoard?0xdceaff:0xfff3db);
    // Keep the interactive canvas and its physical face on the same ray plane.
    // The scene camera stays at the seated eye (0,0,0), looking along -Z.
    const vertical = 2*Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*BOARD_DEPTH;
    const units = vertical/Math.max(viewHeight,1);
    const hasRect = rect?.width>0 && rect?.height>0;
    const boardWidth = sharedBoard?.width ?? (hasRect ? rect.width*units : 4.45);
    const boardHeight = sharedBoard?.height ?? (hasRect ? rect.height*units : 2.46);
    const boardX = sharedBoard?.x ?? (hasRect ? (rect.left+rect.width*.5-viewWidth*.5)*units : -.8);
    const boardY = sharedBoard?.y ?? (hasRect ? (viewHeight*.5-rect.top-rect.height*.5)*units : .70);
    const floorY = sharedBoard?SHARED_FLOOR:Math.min(-1.38,boardY-boardHeight*.5-.17);
    const baseY = floorY-FURNITURE_INSET;
    const roomX = boardX;
    const halfWidth = Math.max(4.45,boardWidth*.5+1.12,Math.abs(roomX)+1.6);
    const top = Math.max(baseY+3.86,boardY+boardHeight*.5+.38);
    const frontZ = -5.36;
    const rearZ = sharedBoard?1.85:1.24;
    const length = rearZ-frontZ;
    const midZ = (frontZ+rearZ)*.5;
    const height = top-floorY;
    const radius = Math.max(6.35,Math.hypot(halfWidth+.15,length*.5+.15)+.55);

    // Original dark circular stage, pale reflective slab, and fine tile seams.
    mesh(new THREE.CylinderGeometry(radius,radius-.25,.32,112),materials.edge,structure,roomX,baseY-.28,midZ);
    mesh(new THREE.CylinderGeometry(radius-.11,radius-.11,.07,112),platformMaterial,structure,roomX,baseY-.075,midZ);
    ring(radius-.05,baseY-.19,roomX,midZ,ringMaterials[0]);
    const rim=mesh(new THREE.TorusGeometry(radius-.05,.014,8,160),rimMaterial,structure,roomX,baseY-.19,midZ);
    rim.rotation.x=Math.PI/2;
    const halo=mesh(new THREE.RingGeometry(radius-.13,radius+.08,160),haloMaterial,structure,roomX,baseY-.19,midZ);
    halo.rotation.x=-Math.PI/2;
    ring(radius+.30,baseY-.46,roomX,midZ,ringMaterials[1]);
    ring(radius+1.15,baseY-.9,roomX,midZ,ringMaterials[2]);
    box(structure,materials.deck,roomX,baseY+.025,midZ,halfWidth*2+.3,.13,length+.3);
    for(let x=roomX-Math.floor(halfWidth/1.2)*1.2;x<roomX+halfWidth;x+=1.2) {
      const geometry=new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x,floorY+.006,frontZ-.05),
        new THREE.Vector3(x,floorY+.006,rearZ+.05),
      ]);
      structure.add(new THREE.Line(geometry,seamMaterial));
    }

    // Floor-to-ceiling glazing on all four sides and across the ceiling.
    // Only the original 45–55 mm champagne frame interrupts the galaxy view.
    pane(halfWidth*2,height,roomX,floorY+height*.5,frontZ);
    pane(halfWidth*2,height,roomX,floorY+height*.5,rearZ);
    for(const side of [-1,1]) {
      const x=roomX+side*halfWidth;
      pane(length,height,x,floorY+height*.5,midZ,0,Math.PI/2);
      for(const z of [frontZ,rearZ])box(structure,frameMaterial,x,floorY+height*.5,z,.045,height,.045);
      box(structure,frameMaterial,x,top+.01,midZ,.055,.055,length+.05);
      box(structure,materials.glow,x-side*.05,top-.05,midZ,.028,.028,length-.7);
    }
    pane(halfWidth*2,length,roomX,top,midZ,Math.PI/2);
    for(const z of [frontZ,rearZ])box(structure,frameMaterial,roomX,top+.01,z,halfWidth*2+.05,.055,.055);
    box(structure,materials.glow,roomX,top-.05,frontZ+.04,halfWidth*2-1,.028,.038);
    if(!displayOnly)addFurniture(baseY,Boolean(sharedBoard));

    key.position.set(roomX-3,baseY+9,midZ+5);
    key.target.position.set(roomX,baseY,midZ);
    fill.position.set(roomX+7,baseY+4,midZ-5);
    fill.target.position.set(roomX,baseY,midZ);
    lamp.position.set(roomX,baseY+4,midZ);

    surface={x:boardX,y:boardY,width:boardWidth,height:boardHeight};
    const faceZ = -BOARD_DEPTH;
    box(teaching,materials.dark,boardX,boardY,faceZ-.064,boardWidth+.13,boardHeight+.14,.11);
    box(teaching,materials.white,boardX,boardY,faceZ-.012,boardWidth+.026,boardHeight+.026,.02);
    const boardBottom=boardY-boardHeight*.5;
    const supportHeight=boardBottom-floorY;
    for(const side of [-1,1]) {
      box(teaching,materials.edge,boardX+side*boardWidth*.35,floorY+supportHeight*.5,faceZ-.09,.065,supportHeight,.08);
    }
    box(teaching,materials.white,boardX,boardBottom-.042,faceZ+.025,boardWidth+.08,.04,.20);
    mesh(new THREE.PlaneGeometry(boardWidth,boardHeight),boardFace,teaching,boardX,boardY,faceZ);
    mesh(new THREE.PlaneGeometry(boardWidth,boardHeight),inkMaterial,teaching,boardX,boardY,faceZ+.001);
    screenMount = new THREE.Group();
    screenMount.name = 'Whiteboard projection';
    screenMount.position.set(boardX,boardY,faceZ);
    screenMount.visible = false;
    teaching.add(screenMount);
    mesh(new THREE.PlaneGeometry(boardWidth,boardHeight),dark,screenMount,0,0,.002);
    screenMesh=mesh(new THREE.PlaneGeometry(boardWidth,boardHeight),screenMaterial,screenMount,0,0,.003);
    portraits=[-1,1].map(side=>portrait(side,roomX,halfWidth,boardY+.19,-3.69,floorY));
    models.group.scale.setScalar(.68);
    models.group.position.set(boardX+boardWidth*.5+.54,boardY-.67,-4.30);
    ink.needsUpdate=true;
    placePointer();
  }

  function setModel(model) {
    activeModel=model;
    models.setModels(model?.id?[model.id]:[]);
    if (model) models.setOrientation(model.yaw,model.pitch);
  }

  function boardPoint(ray, clamp=false) {
    if (!surface || ray.direction.z>=0 || !ray.intersectPlane(surfacePlane,intersection)) return null;
    const x = (intersection.x-surface.x)/surface.width+.5;
    const y = .5-(intersection.y-surface.y)/surface.height;
    if (!clamp && (x<0 || x>1 || y<0 || y>1)) return null;
    return [THREE.MathUtils.clamp(x,0,1),THREE.MathUtils.clamp(y,0,1)];
  }

  function hitModel(raycaster) {
    return classroom && Boolean(activeModel?.id) && models.hitTest(raycaster);
  }

  function placePointer() {
    hand.visible=Boolean(surface && pointer);
    if (!hand.visible) return;
    hand.position.set(
      surface.x+(pointer.x-.5)*surface.width+(.5-.112)*handWidth,
      surface.y+(.5-pointer.y)*surface.height+(.138-.5)*handHeight,
      -BOARD_DEPTH+.004,
    );
  }

  function setPointer(state) {
    pointer = state?.active && Number.isFinite(state.x) && Number.isFinite(state.y)
      ? {x:THREE.MathUtils.clamp(state.x,0,1),y:THREE.MathUtils.clamp(state.y,0,1)}
      : null;
    placePointer();
  }

  function hasLiveVideo(video) {
    return video.readyState>=2 && video.videoWidth>0 && video.videoHeight>0 &&
      Boolean(video.srcObject?.getVideoTracks().some(track=>track.readyState==='live' && track.enabled && !track.muted));
  }

  function update(time, elapsed) {
    if (!classroom) return;
    if (screenMount) {
      screenMount.visible=!projection.hidden && hasLiveVideo(projectedVideo);
      if (screenMount.visible) {
        const ratio=projectedVideo.videoWidth/projectedVideo.videoHeight;
        const boardRatio=surface.width/surface.height;
        screenMesh.scale.set(Math.min(1,ratio/boardRatio),Math.min(1,boardRatio/ratio),1);
      }
    }
    const learner=workspace.dataset.role==='student';
    for (const {side,mount,picture,width,height} of portraits) {
      const own=learner?side===1:side===-1;
      const video=own?localVideo:remoteVideo;
      const camera=own?workspace.dataset.localCamera:workspace.dataset.remoteCamera;
      mount.visible=camera==='true' && hasLiveVideo(video);
      if (!mount.visible) continue;
      const material = own ? selfMaterial : remoteMaterial;
      const ratio = video.videoWidth/video.videoHeight;
      const displayRatio = width/height;
      const horizontal = Math.min(1,displayRatio/ratio);
      const vertical = Math.min(1,ratio/displayRatio);
      material.map.repeat.set(horizontal,vertical);
      material.map.offset.set((1-horizontal)*.5,(1-vertical)*.5);
      picture.material = material;
    }
    if (activeModel) models.update(time/1000,elapsed);
  }

  return {group,layout,setModel,update,boardPoint,hitModel,setPointer,
    boardSurface:()=>surface && {...surface,z:-BOARD_DEPTH}};
}
