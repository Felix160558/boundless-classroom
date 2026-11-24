import * as THREE from '../three.module.min.js';

/** World-space controls for immersive sessions, where the page menu is hidden. */
export function createXRAvatarMenu(scene,rig,referenceSpace,selected,onSelect) {
  const group=new THREE.Group();
  group.name='Avatar menu';
  group.visible=false;
  scene.add(group);

  const raycaster=new THREE.Raycaster();
  const position=new THREE.Vector3(), direction=new THREE.Vector3();
  const quaternion=new THREE.Quaternion();
  const rows=[
    {name:'Avatar',id:null,y:0},
    {name:'Orange Cat',id:'orange-cat',y:-.103},
    {name:'Simple Figure',id:'simple',y:-.206},
  ].map(row=>{
    const canvas=document.createElement('canvas');
    canvas.width=384; canvas.height=98;
    const context=canvas.getContext('2d');
    const map=new THREE.CanvasTexture(canvas);
    map.colorSpace=THREE.SRGBColorSpace;
    const material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.355,.0905),material);
    mesh.position.y=row.y;
    group.add(mesh);
    return {...row,canvas,context,map,mesh};
  });
  const targets=rows.map(row=>row.mesh);
  const trigger=[targets[0]];
  let session=null, open=false, hovered=null, lastChoice=null;

  function draw() {
    lastChoice=selected();
    for (const {name,id,canvas,context:c,map,mesh} of rows) {
      mesh.visible=!id || open;
      const focused=mesh===hovered, checked=id && id===lastChoice;
      c.clearRect(0,0,canvas.width,canvas.height);
      c.beginPath();
      if (c.roundRect) c.roundRect(3,3,378,92,20);
      else c.rect(3,3,378,92);
      c.fillStyle=focused?'rgba(46,60,77,.97)':'rgba(17,25,36,.95)';
      c.fill();
      c.strokeStyle=checked?'#e8c395':'#638098';
      c.lineWidth=checked?4:2;
      c.stroke();
      c.textBaseline='middle';
      c.font='500 32px system-ui, sans-serif';
      c.fillStyle=checked?'#f2d4ad':'#e3eaf2';
      c.fillText(name,27,49);
      if (!id) c.fillText(open?'−':'+',326,48);
      else if (checked) c.fillText('✓',326,48);
      map.needsUpdate=true;
    }
  }

  function hit(frame,source,space) {
    if (!space || !source?.targetRaySpace) return null;
    const pose=frame.getPose(source.targetRaySpace,space);
    if (!pose) return null;
    const {position:p,orientation:q}=pose.transform;
    position.set(p.x,p.y,p.z).applyMatrix4(rig.matrixWorld);
    quaternion.set(q.x,q.y,q.z,q.w);
    direction.set(0,0,-1).applyQuaternion(quaternion).transformDirection(rig.matrixWorld);
    raycaster.set(position,direction);
    return raycaster.intersectObjects(open?targets:trigger,false)[0]?.object ?? null;
  }

  function select(event) {
    rig.updateWorldMatrix(true,false);
    const target=hit(event.frame,event.inputSource,referenceSpace());
    const row=rows.find(entry=>entry.mesh===target);
    if (!row) return;
    if (row.id) { onSelect(row.id); open=false; }
    else open=!open;
    hovered=null;
    draw();
  }

  return {
    attach(next,view) {
      session?.removeEventListener('select',select);
      session=next;
      group.visible=Boolean(session);
      open=false; hovered=null;
      if (!session) return;
      const origin=new THREE.Vector3().fromArray(view.position);
      group.rotation.y=view.yaw;
      group.position.set(.56,-.20,-1.28).applyEuler(group.rotation).add(origin);
      group.updateMatrixWorld(true);
      session.addEventListener('select',select);
      draw();
    },
    update(frame,space) {
      if (!session || !frame) return;
      rig.updateWorldMatrix(true,false);
      let target=null;
      for (const source of session.inputSources) {
        target=hit(frame,source,space);
        if (target) break;
      }
      if (target===hovered && lastChoice===selected()) return;
      hovered=target;
      draw();
    },
  };
}
