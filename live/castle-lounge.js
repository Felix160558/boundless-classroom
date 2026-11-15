import * as THREE from '../three.module.min.js';
import {createMedievalHearth} from './medieval-hearth.js?v=medieval-lounge-40';

// A quiet, fully modelled room. The origin is the visitor's standing eye point.
export function createCastleLounge(scene) {
  const group = new THREE.Group();
  group.name = 'Castle preparation lounge';
  scene.add(group);
  const portraits = [], candleFlames = [];
  let seed = 40;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const floorY = -1.92;
  const texture = (width, height, paint) => {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    paint(canvas.getContext('2d'), width, height);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  };
  // Warm hand-dressed limestone, varied bed joints and shallow chisel marks.
  // The palette is restrained; aging is a material detail rather than loose rubble.
  const stoneMap = texture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#70695b'; ctx.fillRect(0, 0, w, h);
    const courses = [0, 181, 395, 580, 802, 1024];
    for (let row = 0; row < courses.length - 1; row++) {
      let x = row % 2 ? -143 : -29;
      while (x < w) {
        const width = 230 + random() * 139, y = courses[row], height = courses[row + 1] - y;
        const shade = random() * 24;
        const corners = [[x+6,y+7],[x+width-7,y+4],[x+width-4,y+height-8],[x+7,y+height-5]];
        ctx.beginPath(); corners.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py)); ctx.closePath();
        ctx.fillStyle = `rgb(${154+shade},${143+shade},${123+shade})`; ctx.fill();
        ctx.save(); ctx.clip();
        const wash = ctx.createLinearGradient(x, y, x+width*.25, y+height);
        wash.addColorStop(0,'rgba(245,233,204,.16)'); wash.addColorStop(.4,'rgba(127,111,82,.01)'); wash.addColorStop(1,'rgba(48,43,34,.16)');
        ctx.fillStyle=wash;ctx.fillRect(x,y,width,height);
        for(let j=0;j<80;j++) {
          const px=x+random()*width,py=y+random()*height;
          ctx.strokeStyle=random()>.42?'rgba(241,222,186,.095)':'rgba(49,42,31,.09)';
          ctx.lineWidth=.6+random()*1.8;ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(px+3+random()*17,py-2-random()*5);ctx.stroke();
        }
        if(random()>.55){
          ctx.strokeStyle='rgba(53,47,36,.19)';ctx.lineWidth=1;
          ctx.beginPath();ctx.moveTo(x+width*.74,y+5);ctx.lineTo(x+width*.67,y+height*.23);ctx.lineTo(x+width*.7,y+height*.39);ctx.stroke();
        }
        ctx.restore();x+=width;
      }
    }
    for (let i = 0; i < 32000; i++) {
      const v = random() > .52 ? 245 : 30;
      ctx.fillStyle = `rgba(${v},${v},${v},${random() * .07})`;
      ctx.fillRect(random() * w, random() * h, 1 + random() * 4, 1 + random() * 2);
    }
  });
  stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping;
  stoneMap.repeat.set(3, 2);
  const woodMap = texture(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = '#6c4c2e'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const x = random() * w;
      ctx.strokeStyle = random() > .45 ? `rgba(217,174,105,${random() * .14})` : `rgba(16,9,3,${random() * .27})`;
      ctx.lineWidth = .3 + random() * 2.2;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 24) ctx.lineTo(x + Math.sin(y * .007 + i) * 3 + Math.sin(y * .02 + i) * .6, y);
      ctx.stroke();
    }
    // Quiet irregular knots, checking, and rubbed edges of old oak.
    for(let n=0;n<9;n++){
      const x=35+random()*(w-70),y=50+random()*(h-100);
      for(let ring=1;ring<8;ring++){
        ctx.strokeStyle=`rgba(28,16,6,${.17-ring*.014})`;ctx.lineWidth=1.2;
        ctx.beginPath();ctx.ellipse(x,y,2+ring*2.3,7+ring*7,.06,0,Math.PI*2);ctx.stroke();
      }
    }
    for(let n=0;n<36;n++){
      const x=random()*w,y=random()*h;
      ctx.strokeStyle='rgba(25,15,6,.22)';ctx.lineWidth=.4+random();
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+random()*3,y+20+random()*85);ctx.stroke();
    }
  });
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: .8, ...extra});
  const stone = mat('#e9dfcb', {map: stoneMap, bumpMap: stoneMap, bumpScale: .055, roughness: .96});
  const dressedMap = stoneMap.clone();dressedMap.repeat.set(.31,.20);dressedMap.needsUpdate=true;
  const cutStone = mat('#b9ac95', {map:dressedMap,bumpMap:dressedMap,bumpScale:.018,roughness: .94});
  const darkStone = mat('#706959', {roughness: .98});
  const walnut = mat('#c4a57d', {map: woodMap, bumpMap: woodMap,bumpScale:.012,roughness: .87});
  const darkWood = mat('#62432d', {map:woodMap,bumpMap:woodMap,bumpScale:.008,roughness: .92});
  const iron = mat('#282722', {metalness: .62, roughness: .77});
  const leather = mat('#492b20', {roughness: .91});
  const make = (geometry, material, x = 0, y = 0, z = 0, parent = group) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.receiveShadow = true; mesh.castShadow = true;
    parent.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, material, parent) => make(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
  const cylinder = (top, bottom, height, x, y, z, material, parent) => make(new THREE.CylinderGeometry(top, bottom, height, 24), material, x, y, z, parent);
  function roundedBox(w, h, d, radius, material, x, y, z, parent = group) {
    const shape = new THREE.Shape(), a = -w / 2, b = -h / 2, r = radius;
    shape.moveTo(a + r, b); shape.lineTo(a + w - r, b);
    shape.quadraticCurveTo(a + w, b, a + w, b + r);
    shape.lineTo(a + w, b + h - r); shape.quadraticCurveTo(a + w, b + h, a + w - r, b + h);
    shape.lineTo(a + r, b + h); shape.quadraticCurveTo(a, b + h, a, b + h - r);
    shape.lineTo(a, b + r); shape.quadraticCurveTo(a, b, a + r, b);
    const bevel=Math.min(.012,d*.12,h*.12,w*.12);
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: d - bevel*2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 8});
    geometry.translate(0, 0, -d / 2 + bevel);
    return make(geometry, material, x, y, z, parent);
  }
  function closedFrame(w, h, border, depth, material, x, y, z, parent = group) {
    const outer = new THREE.Shape(), hole = new THREE.Path();
    outer.moveTo(-w / 2, -h / 2); outer.lineTo(w / 2, -h / 2); outer.lineTo(w / 2, h / 2); outer.lineTo(-w / 2, h / 2); outer.closePath();
    hole.moveTo(-w / 2 + border, -h / 2 + border); hole.lineTo(-w / 2 + border, h / 2 - border); hole.lineTo(w / 2 - border, h / 2 - border); hole.lineTo(w / 2 - border, -h / 2 + border); hole.closePath();
    outer.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(outer, {depth, bevelEnabled: true, bevelSize: .014, bevelThickness: .012, bevelSegments: 2});
    return make(geometry, material, x, y, z, parent);
  }
  function stoneArch(cx, spring, z, rx, ry, width, depth, segments, parent = group) {
    for(let i=0;i<segments;i++) {
      const from=i*Math.PI/segments+.007,to=(i+1)*Math.PI/segments-.007;
      const shape=new THREE.Shape();
      for(let j=0;j<=4;j++){
        const t=from+(to-from)*j/4;
        if(j===0)shape.moveTo(Math.cos(t)*rx,Math.sin(t)*ry);else shape.lineTo(Math.cos(t)*rx,Math.sin(t)*ry);
      }
      for(let j=4;j>=0;j--){const t=from+(to-from)*j/4;shape.lineTo(Math.cos(t)*(rx-width),Math.sin(t)*(ry-width));}
      shape.closePath();
      const shade=cutStone.clone();shade.color.multiplyScalar(.9+random()*.19);
      make(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:1}),shade,cx,spring,z,parent);
    }
  }
  function peg(x,y,z,parent=group,metal=false){
    const pin=make(new THREE.CylinderGeometry(metal ? .018 : .022,metal ? .021 : .023,.014,metal?7:12),metal?iron:darkWood,x,y,z,parent);
    pin.rotation.x=Math.PI/2;return pin;
  }
  function plank(w,h,d,x,y,z,parent=group,material=walnut){
    return roundedBox(w,h,d,Math.min(.025,w*.12,h*.12),material,x,y,z,parent);
  }

  // The room envelope and a continuous barrel vault, with dressed stone ribs.
  const floorMap=stoneMap.clone();floorMap.repeat.set(5,7);floorMap.needsUpdate=true;
  const floorMaterial=mat('#b9b1a0',{map:floorMap,bumpMap:floorMap,bumpScale:.035,roughness:.94});
  box(13.6, .24, 18, 0, floorY - .12, -2, darkStone);
  const flags=make(new THREE.PlaneGeometry(13.3,18),floorMaterial,0,floorY+.002,-2);flags.rotation.x=-Math.PI/2;
  box(13.6, 7.5, .5, 0, 1.75, -7.65, stone);
  box(.45, 7.5, 18, -6.8, 1.75, -2, stone);
  box(.45, 7.5, 18, 6.8, 1.75, -2, stone);
  const vaultVertices = [], vaultUVs = [], vaultIndices = [];
  for (let i = 0; i <= 64; i++) {
    const a = i / 64 * Math.PI;
    for (const z of [-7.45, 5]) {
      vaultVertices.push(Math.cos(a) * 6.58, 1.58 + Math.sin(a) * 3.85, z);
      vaultUVs.push(i / 64 * 2, z / 8);
    }
    if (i < 64) { const n = i * 2; vaultIndices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  }
  const vaultGeometry = new THREE.BufferGeometry();
  vaultGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vaultVertices, 3));
  vaultGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(vaultUVs, 2));
  vaultGeometry.setIndex(vaultIndices); vaultGeometry.computeVertexNormals();
  const vaultMaterial = stone.clone(); vaultMaterial.side = THREE.DoubleSide;
  make(vaultGeometry, vaultMaterial);
  for (const z of [-7.35, -3.2, 1.1]) {
    stoneArch(0, 1.58, z, 6.55, 3.84, .22, .25, 29);
    for (const side of [-1, 1]) {
      for(let row=0;row<7;row++){
        const block=box(.38,.487,.4,side*6.34,floorY+.25+row*.5,z+.12,cutStone);
        block.rotation.y=(row%2?1:-1)*.007;
      }
      box(.6, .14, .58, side * 6.34, 1.54, z + .12, cutStone);
      box(.55, .17, .53, side * 6.34, floorY + .09, z + .12, darkStone);
    }
  }
  // Pegged oak planks and low rails, with no upholstered or decorative salon fittings.
  for(let i=0;i<42;i++){
    const x=-6.4+i*.31,height=.81+random()*.025;
    plank(.298,height,.09,x,floorY+height/2,-7.31);
    for(const y of [floorY+.12,floorY+.65])peg(x,y,-7.185);
  }
  for(const y of [floorY+.12,floorY+.65])plank(13.1,.095,.13,0,y,-7.27);
  for(const side of [-1,1]){
    const panel=new THREE.Group();panel.position.set(side*6.54,0,-1.3);panel.rotation.y=-side*Math.PI/2;group.add(panel);
    for(let i=0;i<39;i++)plank(.297,.82,.09,-5.9+i*.31,floorY+.41,0,panel);
    for(const y of [floorY+.12,floorY+.65])plank(12.1,.095,.13,0,y,.04,panel);
  }
  stoneArch(2.12,1.64,-7.36,3.0,2.8,.20,.18,21);
  for(const x of [-.78,5.02])for(let row=0;row<5;row++)box(.22,.49,.20,x,-.65+row*.5,-7.27,cutStone);

  // A deep, narrow stone window, dark iron bars and a weathered oak shutter.
  const windowGroup = new THREE.Group(); windowGroup.position.set(-5.7, .84, -7.30); group.add(windowGroup);
  const windowGlass = mat('#586e8b', {emissive: '#4b6386', emissiveIntensity: .72, roughness: .3, metalness: .16});
  box(1.14, 3.08, .18, 0, 0, -.04, darkStone, windowGroup);
  for (const x of [-.31, .31]) {
    box(.5, 2.78, .03, x, -.02, .07, windowGlass, windowGroup);
    for (let y = -.85; y <= .8; y += .82) box(.5, .024, .034, x, y, .092, iron, windowGroup);
  }
  for (const x of [-.61, 0, .61]) box(.065, 3.02, .24, x, -.02, .12, cutStone, windowGroup);
  box(1.48, .12, .56, 0, -1.56, .14, cutStone, windowGroup);
  stoneArch(0, 1.39, .005, .72, .72, .18, .27, 9, windowGroup);
  const shutter=new THREE.Group();shutter.position.set(.71,0,.13);shutter.rotation.y=-.54;windowGroup.add(shutter);
  for(let i=0;i<3;i++)plank(.19,2.83,.065,.13+i*.19,-.02,0,shutter);
  for(const y of [-.95,.9]){
    box(.57,.065,.026,.32,y,.047,iron,shutter);
    for(const x of [.1,.32,.55])peg(x,y,.069,shutter,true);
  }
  const moonFill = new THREE.PointLight('#b1c8ee', 24, 11, 2);
  moonFill.position.set(-5.3, 1.25, -6.3); group.add(moonFill);

  // The masonry hearth has its own contained fire, soot, embers and light response.
  const hearth=createMedievalHearth(THREE);
  group.add(hearth.group);

  // Worn oak portrait frames, hand-forged corner straps and candlelit surroundings.
  const loader = new THREE.TextureLoader();
  const portraitMaterials = [];
  const portraitUrl = new URL('./teacher-portraits-39.png', import.meta.url).href;
  const fallbackUrl = new URL('./teacher-study.png', import.meta.url).href;
  loader.load(portraitUrl, atlas => {
    atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
    portraitMaterials.forEach((material, index) => {
      const panel = atlas.clone(); panel.repeat.set(1 / 3, .731); panel.offset.set(index / 3, .169); panel.needsUpdate = true;
      material.map = panel; material.needsUpdate = true;
    });
    group.userData.requestRender?.();
  }, undefined, () => {
    loader.load(fallbackUrl, map => { map.colorSpace = THREE.SRGBColorSpace; portraitMaterials.forEach(material => { material.map = map; material.needsUpdate = true; }); group.userData.requestRender?.(); }, undefined, () => {});
  });
  for (let i = 0; i < 3; i++) {
    const x = .55 + i * 1.55, y = .70, z = -7.16;
    box(1.35, 1.84, .085, x, y, z - .02, darkWood);
    closedFrame(1.36, 1.85, .12, .10, walnut, x, y, z + .015);
    closedFrame(1.10, 1.59, .023, .025, darkWood, x, y, z + .11);
    for(const side of [-1,1])for(const level of [-1,1]){
      const sx=x+side*.595,sy=y+level*.845;
      box(.18,.035,.014,sx-side*.04,sy,z+.138,iron);
      box(.035,.17,.014,sx,sy-level*.055,z+.138,iron);
      peg(sx-side*.1,sy,z+.15,group,true);peg(sx,sy-level*.1,z+.15,group,true);
    }
    const material = mat('#fff6e6', {roughness: .94, emissive: '#ac8a5e', emissiveIntensity: .10});
    portraitMaterials.push(material);
    const portrait = make(new THREE.PlaneGeometry(1.056, 1.544), material, x, y, z + .145);
    portrait.name = `Teacher portrait ${i + 1}`; portrait.userData.teacherId = `teacher-${i + 1}`;
    portraits.push({id: portrait.userData.teacherId, mesh: portrait});
  }
  // Pair of simple wall candles. Their spill illuminates the portraits without picture lamps.
  for(const x of [-.49,4.69]){
    box(.13,.43,.045,x,.82,-7.1,iron);
    const stem=cylinder(.022,.026,.37,x,.74,-6.89,iron);stem.rotation.x=Math.PI/2;
    const bowl=make(new THREE.SphereGeometry(.11,20,8,0,Math.PI*2,Math.PI/2,Math.PI/2),iron,x,.77,-6.7);bowl.scale.y=.43;
    cylinder(.039,.048,.32,x,.96,-6.7,mat('#d9c7a2'));
    const glow=make(new THREE.SphereGeometry(.024,12,12),new THREE.MeshBasicMaterial({color:'#ffd390',toneMapped:false}),x,1.17,-6.7);
    glow.scale.set(1,2.8,1);glow.castShadow=false;candleFlames.push(glow);
    const light=new THREE.PointLight('#ffd5a0',8,5,2);light.position.set(x,1.15,-6.57);group.add(light);
  }

  // A faded handwoven wool runner, with quiet bands and visible warp and weft.
  const rugMap = texture(1024, 1024, (ctx, w, h) => {
    ctx.fillStyle='#574133';ctx.fillRect(0,0,w,h);
    for(const x of [35,68,w-75,w-42]){ctx.fillStyle='#99815c';ctx.fillRect(x,0,7,h);}
    for(const y of [24,44,h-51,h-31]){ctx.fillStyle='#9c825b';ctx.fillRect(22,y,w-44,6);}
    for(let y=0;y<h;y+=3){ctx.fillStyle=`rgba(213,187,143,${.035+random()*.055})`;ctx.fillRect(0,y,w,1);}
    for(let x=0;x<w;x+=3){ctx.fillStyle=`rgba(20,15,10,${.05+random()*.07})`;ctx.fillRect(x,0,1,h);}
    for(let i=0;i<13000;i++){ctx.fillStyle=`rgba(231,209,166,${random()*.085})`;ctx.fillRect(random()*w,random()*h,1,4);}
  });
  const rug = make(new THREE.PlaneGeometry(4.9, 7.2), mat('#eee1cc', {map: rugMap, roughness: 1}), -.3, floorY + .018, -2.65);
  rug.rotation.x = -Math.PI / 2;

  // Solid pegged oak furniture: trestle bench, two high-backed chairs and a plank table.
  const bench = new THREE.Group(); bench.position.set(2.1, floorY, -6.45); group.add(bench);
  for(const z of [-.19,.19])plank(4.42,.13,.365,0,.50,z,bench);
  for(const x of [-1.72,1.72]){
    plank(.24,.43,.58,x,.235,0,bench);
    plank(.38,.09,.78,x,.065,0,bench,darkWood);
    for(const z of [-.25,.25])peg(x,.42,z,bench);
  }
  plank(3.78,.14,.12,0,.24,0,bench);
  for(const x of [-1.92,1.92]){
    box(.07,.015,.73,x,.572,0,iron,bench);
    for(const z of [-.24,.24]){
      const pin=peg(x,.583,z,bench,true);pin.rotation.x=0;
    }
  }
  function chair(x, z, angle) {
    const seat = new THREE.Group(); seat.position.set(x, floorY, z); seat.rotation.y = angle; group.add(seat);
    for(const side of [-1,1]){
      plank(.115,1.50,.115,side*.365,.76,-.32,seat);
      plank(.115,.56,.115,side*.365,.29,.32,seat);
      plank(.08,.10,.70,side*.365,.21,0,seat);
      plank(.14,.09,.82,side*.39,.88,0,seat);
      plank(.09,.30,.09,side*.39,.72,.29,seat);
    }
    for(let i=0;i<3;i++)plank(.88,.12,.235,0,.55,-.245+i*.245,seat);
    for(let i=0;i<3;i++)plank(.218,.83,.065,(i-1)*.225,1.04,-.32,seat);
    for(const y of [.68,1.42])plank(.88,.105,.105,0,y,-.28,seat);
    plank(.78,.10,.09,0,.22,.32,seat);
    for(const x of [-.365,.365])for(const y of [.7,1.4])peg(x,y,-.209,seat);
    for(const x of [-.365,.365])peg(x,.24,.375,seat);
  }
  chair(-4.72, -4.24, .41); chair(-1.76, -4.95, -.44);
  const table=new THREE.Group();table.position.set(-3.24,floorY,-4.65);table.rotation.y=.05;group.add(table);
  for(let i=0;i<3;i++)plank(1.22,.13,.26,0,.77,(i-1)*.27,table);
  for(const x of [-.43,.43]){
    plank(.14,.67,.54,x,.35,0,table);
    plank(.25,.09,.72,x,.055,0,table,darkWood);
    peg(x,.67,.287,table);
  }
  plank(1.03,.13,.10,0,.25,0,table);
  const book=new THREE.Group();book.position.set(-.1,.87,-.02);book.rotation.y=-.18;table.add(book);
  box(.33,.07,.43,0,0,0,mat('#b6a47c'),book);
  for(const y of [-.044,.044])plank(.36,.018,.46,0,y,0,book,leather);
  box(.025,.087,.46,-.17,0,0,leather,book);
  box(.045,.012,.46,.09,.059,0,darkWood,book);
  cylinder(.06,.044,.095,.39,.88,.10,mat('#927251',{roughness:.86}),table);

  // Warm ambient light retains the stone colour; moonlight keeps the far corners legible.
  const ambient = new THREE.HemisphereLight('#eee3cf', '#3e3028', .72); group.add(ambient);
  const fill = new THREE.DirectionalLight('#d5dff0', .58); fill.position.set(-4, 4, 2); fill.target.position.set(0, -.5, -4);
  fill.castShadow = true; fill.shadow.mapSize.set(2048, 2048);
  Object.assign(fill.shadow.camera, {left: -10, right: 10, top: 8, bottom: -8, near: .5, far: 30});
  fill.shadow.bias = -.00025; fill.shadow.normalBias = .018; fill.shadow.radius = 3;
  group.add(fill, fill.target);
  const warmFill = new THREE.PointLight('#f6d5a0', 34, 17, 2); warmFill.position.set(2, 3.4, -3.7); group.add(warmFill);

  function update(time = 0, delta = 0, reducedMotion = false) {
    hearth.update(time,delta,reducedMotion);
    const t=reducedMotion?1.7:time/1000;
    for(let i=0;i<candleFlames.length;i++){
      candleFlames[i].scale.y=2.8+(reducedMotion?0:Math.sin(t*4.1+i)*.12+Math.sin(t*6.8+i)*.08);
    }
  }
  function layout(camera, width, height) {
    const narrow = width / Math.max(1, height) < .85;
    group.position.set(narrow ? -1.75 : 0, 0, narrow ? -1.65 : 0);
    group.updateMatrixWorld(true);
  }
  update(0, 0, true);
  return {group, update, layout, portraits};
}
