// A stone-built hearth, with the fire rooted between charred logs.
// All light and motion belong to this group so changing rooms can hide it cleanly.
export function createMedievalHearth(THREE) {
  const group = new THREE.Group();
  group.name = 'Old stone hearth';
  group.position.set(-3.35, 0, -7.08);
  let seed = 4011;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness: .96, ...extra});
  const make = (geometry, surface, x = 0, y = 0, z = 0, parent = group) => {
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const box = (w, h, d, x, y, z, surface, parent) => make(new THREE.BoxGeometry(w, h, d), surface, x, y, z, parent);
  const surfaceMap = (charred = false) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = charred ? '#2a241f' : '#a69b87'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 25000; i++) {
      const dark = random() < .55;
      ctx.fillStyle = dark ? `rgba(28,24,18,${.018 + random() * .07})` : `rgba(246,235,211,${random() * .09})`;
      ctx.fillRect(random() * 512, random() * 512, 1 + random() * 7, 1 + random() * 3);
    }
    for (let i = 0; i < (charred ? 95 : 65); i++) {
      const x = random() * 512, y = random() * 512;
      ctx.strokeStyle = charred ? 'rgba(0,0,0,.45)' : 'rgba(40,34,24,.12)';
      ctx.lineWidth = charred ? 1 + random() * 2 : .3 + random();
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.lineTo(x + (charred ? (random() - .5) * 15 : 12 + random() * 30), y + 18 + random() * 60);
      ctx.stroke();
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    return map;
  };
  const stoneMap = surfaceMap(), coalMap = surfaceMap(true);
  const stones = ['#c8bca4', '#b8ac96', '#c1b49a', '#aa9f8d', '#d0c2a9'].map(color => material(color, {map: stoneMap, bumpMap: stoneMap, bumpScale: .024}));
  const soot = material('#2a2520', {map: coalMap, bumpMap: coalMap, bumpScale: .025});
  const sootEdge = material('#716452', {map: stoneMap, bumpMap: stoneMap, bumpScale: .02});
  const mortar = material('#6c6558');
  const iron = material('#2b2926', {metalness: .68, roughness: .88});
  const ash = material('#4e463a', {map: coalMap, roughness: 1});

  // Bevelled, lightly hand-dressed blocks, rather than a polished continuous mantel.
  function block(w, h, d, x, y, z, surface, bevel = .024) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + bevel, -h / 2 + bevel);
    shape.lineTo(w / 2 - bevel, -h / 2 + bevel);
    shape.lineTo(w / 2 - bevel, h / 2 - bevel);
    shape.lineTo(-w / 2 + bevel, h / 2 - bevel); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 1});
    geo.translate(0, 0, -d / 2 + bevel);
    return make(geo, surface, x, y, z);
  }
  // The upper chimney is broad masonry with visible lime joints and worn courses.
  box(2.54, 3.23, .66, 0, 2.075, -.21, mortar);
  for (let row = 0; row < 8; row++) {
    const y = .59 + row * .4;
    const span = 2.58 - row * .045;
    const widths = row % 2 ? [.25, .49, .51, .49, .25] : [.48, .5, .5, .5];
    const total = widths.reduce((a, b) => a + b, 0);
    let edge = -span / 2;
    for (const part of widths) {
      const width = part / total * span;
      block(width - .018, .377, .62 + random() * .025, edge + width / 2, y, -.19 + random() * .012, stones[Math.floor(random() * stones.length)], .017);
      edge += width;
    }
  }

  // A dark, recessed chamber and sooted inner lining provide genuine depth.
  const opening = new THREE.Shape();
  opening.moveTo(-.9, -1.76); opening.lineTo(.9, -1.76); opening.lineTo(.9, -.38);
  opening.absellipse(0, -.38, .9, .86, 0, Math.PI, false); opening.closePath();
  make(new THREE.ShapeGeometry(opening, 36), soot, 0, 0, -.255);
  box(.07, 1.38, .7, -.87, -1.08, .04, soot);
  box(.07, 1.38, .7, .87, -1.08, .04, soot);
  box(1.82, .05, .89, 0, -1.74, .1, ash);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      const surface = stones[(row + (side > 0 ? 2 : 0)) % stones.length];
      block(.38 + random() * .035, .335, .73, side * 1.079, -1.565 + row * .35, .045 + random() * .01, surface);
    }
    block(.53, .14, .89, side * 1.08, -1.765, .1, stones[3]);
  }
  // Individual radial stones form a thick round arch; the inner face is smoke-darkened.
  const wedgeCount = 13, rx = .9, ry = .86, thickness = .31;
  for (let i = 0; i < wedgeCount; i++) {
    const start = i * Math.PI / wedgeCount + .007;
    const end = (i + 1) * Math.PI / wedgeCount - .007;
    const shape = new THREE.Shape();
    for (let j = 0; j <= 5; j++) {
      const a = start + (end - start) * j / 5;
      const x = Math.cos(a) * (rx + thickness), y = Math.sin(a) * (ry + thickness);
      if (!j) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    for (let j = 5; j >= 0; j--) {
      const a = start + (end - start) * j / 5;
      shape.lineTo(Math.cos(a) * rx, Math.sin(a) * ry);
    }
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {depth: .7, bevelEnabled: true, bevelSize: .009, bevelThickness: .009, bevelSegments: 2, curveSegments: 1});
    make(geometry, stones[(i + 1) % stones.length], 0, -.38, -.28 + random() * .012);
    // A narrow recessed band retains the visual weight of the smoky opening.
    const inner = new THREE.Shape();
    for (let j = 0; j <= 5; j++) {
      const a = start + (end - start) * j / 5;
      const x = Math.cos(a) * (rx - .018), y = Math.sin(a) * (ry - .018);
      if (!j) inner.moveTo(x, y); else inner.lineTo(x, y);
    }
    for (let j = 5; j >= 0; j--) {
      const a = start + (end - start) * j / 5;
      inner.lineTo(Math.cos(a) * (rx + .025), Math.sin(a) * (ry + .025));
    }
    inner.closePath();
    make(new THREE.ExtrudeGeometry(inner, {depth: .56, bevelEnabled: false}), sootEdge, 0, -.38, -.26);
  }
  for (let i = 0; i < 4; i++) block(.74, .16, 1.43, (i - 1.5) * .755, -1.875, .27, stones[(i + 3) % stones.length], .025);
  block(2.08, .045, .86, 0, -1.765, .19, ash, .008);

  const glowingCoal = material('#55240e', {map: coalMap, emissive: '#ef4b0a', emissiveIntensity: 1.25});
  const coalDark = material('#292320', {map: coalMap, bumpMap: coalMap, bumpScale: .016});
  const coals = [];
  for (let i = 0; i < 38; i++) {
    const isHot = i % 3 !== 0;
    const surface = isHot ? glowingCoal.clone() : coalDark;
    const coal = make(new THREE.DodecahedronGeometry(.028 + random() * .047, 0), surface, (random() - .5) * 1.5, -1.695 + random() * .035, -.02 + random() * .6);
    coal.scale.set(1.35, .55, .8); coal.rotation.y = random() * Math.PI;
    if (isHot) coals.push({surface, phase: random() * 7});
  }
  // Simple forged firedogs cradle the logs, with rounded, blackened finials.
  for (const side of [-1, 1]) {
    box(.065, .056, .68, side * .54, -1.63, .25, iron);
    box(.065, .26, .065, side * .54, -1.62, .52, iron);
    box(.065, .14, .065, side * .54, -1.68, -.04, iron);
    make(new THREE.SphereGeometry(.045, 10, 8), iron, side * .54, -1.475, .52);
  }
  const logSurface = material('#493323', {map: coalMap, bumpMap: coalMap, bumpScale: .03});
  const endSurface = material('#58412e', {map: coalMap, roughness: 1});
  for (let i = 0; i < 5; i++) {
    const log = new THREE.Group(); group.add(log);
    log.position.set((i - 2) * .09, -1.57 + (i > 2 ? .13 : 0), .05 + (i % 3) * .18);
    log.rotation.set(.1 + (i % 2) * .1, (i - 2) * .11, Math.PI / 2 + (i - 2) * .075);
    const length = 1.1 + random() * .28, radius = .079 + random() * .018;
    make(new THREE.CylinderGeometry(radius * .8, radius, length, 12, 1), [logSurface, endSurface, endSurface], 0, 0, 0, log);
    // Thin warm fissures sit on the charred surface instead of making whole logs glow.
    for (let j = 0; j < 4; j++) {
      const crack = make(new THREE.CylinderGeometry(.002, .004, length * (.26 + random() * .4), 3), glowingCoal, Math.cos(j * 1.6) * radius * .94, (random() - .5) * length * .25, Math.sin(j * 1.6) * radius * .94, log);
      crack.rotation.z = (random() - .5) * .08;
    }
  }

  // Crossed translucent slices create rising, irregular tongues from a coherent
  // advected noise field. Fine breakup is strongest at the tips, never at the roots.
  const flameVertex = `varying vec2 vUv; uniform float uTime; uniform float uSeed;
    void main(){vUv=uv;vec3 p=position;
      p.x+=(sin(uTime*1.27+uSeed+uv.y*5.0)*.023+sin(uTime*2.19+uSeed*2.0)*.01)*uv.y*uv.y;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`;
  const flameFragment = `varying vec2 vUv;uniform float uTime;uniform float uSeed;uniform float uStrength;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}
    float fbm(vec2 p){float v=0.0,a=.52;for(int i=0;i<4;i++){v+=noise(p)*a;p=mat2(1.63,1.17,-1.17,1.63)*p+vec2(7.1,3.8);a*=.49;}return v;}
    void main(){
      vec2 uv=vUv;float y=uv.y;float t=uTime;
      vec2 flow=vec2(uv.x*3.1+uSeed,y*3.8-t*1.3);
      float broad=fbm(flow),fine=noise(flow*3.2+vec2(4.0,-t*.75));
      float bend=(fbm(vec2(y*2.9-t*.45,uSeed+t*.23))-.5)*.34*y;
      float x=uv.x-.5+bend;
      float stretch=.82+.15*noise(vec2(t*.8,uSeed+2.0));
      float taper=.40*pow(max(0.0,1.0-y/stretch),.68);
      float turbulence=(broad-.48)*(.05+.23*y)+(fine-.5)*.045*y;
      float edge=taper-abs(x)+turbulence;
      float body=smoothstep(-.055,.06,edge);
      float foot=smoothstep(0.0,.055,y);
      float tip=1.0-smoothstep(.82,1.0,y);
      float alpha=body*foot*tip*uStrength;
      if(alpha<.004)discard;
      float core=clamp(1.0-abs(x)*3.9-y*1.15+(broad-.5)*.45,0.0,1.0);
      vec3 color=mix(vec3(1.0,.105,.008),vec3(1.0,.57,.095),smoothstep(0.0,.7,core));
      color=mix(color,vec3(1.0,.87,.43),pow(core,3.1));
      float ribbon=.83+.17*fine;
      gl_FragColor=vec4(color*ribbon*1.15,alpha);
    }`;
  const flames = [];
  for (let i = 0; i < 8; i++) {
    const height = .62 + random() * .46;
    const width = .28 + random() * .17;
    const x = (i - 3.5) * .15, z = .07 + (i % 3) * .12;
    for (let slice = 0; slice < 2; slice++) {
      const surface = new THREE.ShaderMaterial({uniforms: {uTime: {value: 0}, uSeed: {value: i * 5.13 + slice * .39}, uStrength: {value: slice ? .38 : .6}}, vertexShader: flameVertex, fragmentShader: flameFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false});
      const flame = make(new THREE.PlaneGeometry(width, height, 2, 8), surface, x, -1.57 + height / 2, z);
      flame.rotation.y = slice * Math.PI / 2 + (random() - .5) * .5;
      flame.castShadow = false; flame.receiveShadow = false;
      flames.push(surface);
    }
  }
  const fireLight = new THREE.PointLight('#ffc075', 34, 13, 2); fireLight.position.set(0, -1.02, .72); group.add(fireLight);
  const fireBounce = new THREE.PointLight('#d5904e', 10, 7, 2); fireBounce.position.set(0, .55, 1.04); group.add(fireBounce);
  const sparks = [];
  for (let i = 0; i < 6; i++) {
    const surface = new THREE.MeshBasicMaterial({color: '#ffc47b', transparent: true, opacity: 0, depthWrite: false, toneMapped: false});
    const ember = make(new THREE.SphereGeometry(.005 + random() * .003, 5, 4), surface);
    ember.castShadow = false; ember.receiveShadow = false;
    sparks.push({mesh: ember, phase: random(), x: (random() - .5) * .96});
  }
  function update(time = 0, delta = 0, reducedMotion = false) {
    const t = reducedMotion ? 2.6 : time / 1000;
    for (const flame of flames) flame.uniforms.uTime.value = t;
    const breath = 1 + Math.sin(t * 2.17) * .027 + Math.sin(t * 5.37 + .9) * .025 + Math.sin(t * 8.13) * .014;
    fireLight.intensity = 34 * breath; fireBounce.intensity = 10 * (1 + (breath - 1) * .6);
    for (const coal of coals) coal.surface.emissiveIntensity = 1.0 + Math.sin(t * .61 + coal.phase) * .23;
    for (const spark of sparks) {
      const life = (t * .14 + spark.phase) % 1;
      spark.mesh.visible = !reducedMotion;
      spark.mesh.position.set(spark.x + Math.sin(life * 5 + spark.phase * 9) * life * .12, -1.46 + life * 1.54, .3 + Math.sin(life * 4) * .035);
      spark.mesh.material.opacity = Math.sin(life * Math.PI) * .55;
    }
  }
  update(0, 0, true);
  return {group, update};
}
