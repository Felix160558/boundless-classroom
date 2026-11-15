import * as THREE from './three.module.min.js';

const TAU = Math.PI * 2;
function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const ease = (a, b, t) => a + (b - a) * t;

export function createSpaceSky(scene, {compact = false} = {}) {
  // A volumetric particle ribbon: every point has real depth, never a flat galaxy card.
  // No solid planets or solar-system orbit decorations.
  const random=seeded(149),skyTime={value:0},pointScale={value:1};
  function gaussian(){return Math.sqrt(-2*Math.log(Math.max(.00001,random())))*Math.cos(TAU*random());}
  function particleField(data,flow=0,soft=false){
    const geometry=new THREE.BufferGeometry();
    for(const [name,values,size] of [['position',data.position,3],['aColor',data.color,3],['aSize',data.size,1],['aAlpha',data.alpha,1],['aPhase',data.phase,1],['aSpeed',data.speed,1]])geometry.setAttribute(name,new THREE.Float32BufferAttribute(values,size));
    const material=new THREE.ShaderMaterial({
      uniforms:{uTime:skyTime,uPointScale:pointScale,uFlow:{value:flow},uSoft:{value:soft?1:0}},
      transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,toneMapped:false,
      vertexShader:`
        uniform float uTime;
        uniform float uPointScale;
        uniform float uFlow;
        uniform float uSoft;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        attribute float aPhase;
        attribute float aSpeed;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          vec3 p=position;
          if(uFlow>.5){
            p.y=mod(p.y+uTime*(.42+aSpeed*.55)+180.,360.)-180.;
            p.x+=sin(uTime*.055+aPhase)*.7;
          }else{
            p.y+=sin(uTime*.075+p.x*.021)*2.3;
            p.z+=cos(uTime*.045+p.x*.015)*2.6;
          }
          vec4 viewPosition=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*viewPosition;
          gl_PointSize=clamp(aSize*uPointScale/max(1.,-viewPosition.z),1.35,uSoft>.5?180.:22.);
          vColor=aColor;
          vAlpha=aAlpha*(.73+.27*sin(uTime*(.48+aSpeed*.65)+aPhase));
        }`,
      fragmentShader:`
        uniform float uSoft;
        varying vec3 vColor;
        varying float vAlpha;
        void main(){
          float radius=length(gl_PointCoord-.5)*2.;
          if(radius>1.)discard;
          float core=exp(-radius*radius*(uSoft>.5?2.8:3.4));
          gl_FragColor=vec4(vColor,core*vAlpha);
          #include <colorspace_fragment>
        }`
    });
    const points=new THREE.Points(geometry,material);points.frustumCulled=false;return points;
  }
  function particleData(){return {position:[],color:[],size:[],alpha:[],phase:[],speed:[]};}
  function pushParticle(data,x,y,z,size,alpha,tint){
    data.position.push(x,y,z);data.color.push(tint*.94,tint*.97,tint);
    data.size.push(size);data.alpha.push(alpha);data.phase.push(random()*TAU);data.speed.push(random());
  }
  const distant=particleData();
  for(let i=0;i<3500;i++){
    const a=random()*TAU,u=random()*2-1,r=90+random()*160;
    pushParticle(distant,r*Math.sqrt(1-u*u)*Math.cos(a),u*180,r*Math.sqrt(1-u*u)*Math.sin(a),.40+random()*.90,.60+random()*.40,.57+random()*.4);
  }
  scene.add(particleField(distant,1));
  // A closed panoramic ribbon carries the same soft dust through the whole sky.
  // Its curved tails meet behind the classroom, without a visible start or finish.
  const nebula=new THREE.Group();nebula.position.set(-58,-35,-95);nebula.rotation.set(0,.59,-.30);scene.add(nebula);
  const ribbonLayers=[],ribbonRadius=130;
  function noiseHash(x,y){let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
  function noise(x,y){
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    return ease(ease(noiseHash(ix,iy),noiseHash(ix+1,iy),sx),ease(noiseHash(ix,iy+1),noiseHash(ix+1,iy+1),sx),sy);
  }
  function fbm(x,y){let value=0,amplitude=.55;for(let i=0;i<5;i++){value+=noise(x,y)*amplitude;x=x*2.04+3.7;y=y*2.03+1.9;amplitude*=.48;}return value;}
  function makeVeilTexture(){
    const c=document.createElement('canvas');c.width=1536;c.height=384;
    const ctx=c.getContext('2d'),pixels=ctx.createImageData(c.width,c.height),data=pixels.data;
    for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
      const u=x/(c.width-1),v=y/(c.height-1)*2-1,angle=u*TAU;
      // Sampling noise around a circle makes both texture edges agree in value
      // and slope, so the longer band has no repeated-card seam or end fade.
      const flow=fbm(Math.cos(angle)*2.4+v*.6+9,Math.sin(angle)*2.4+v*2.2+2.8);
      const filament=fbm(Math.cos(angle)*8.9+v*3+3,Math.sin(angle)*8.9+v*10+11);
      const bend=(flow-.46)*1.15+Math.sin(angle*2)*.10;
      const d=v-bend,width=.24+.18*flow;
      const core=Math.exp(-d*d/(width*width));
      const veil=Math.exp(-d*d/.22)*(.24+.62*filament);
      const folds=Math.pow(Math.max(.05,filament),1.4);
      const edge=Math.pow(Math.max(0,1-v*v),1.25);
      const alpha=Math.min(1,(core*(.06+folds*1.9)+veil*.36)*edge);
      const i=(y*c.width+x)*4;
      data[i]=187+filament*32;data[i+1]=199+filament*29;data[i+2]=216+filament*23;data[i+3]=Math.round(alpha*220);
    }
    ctx.putImageData(pixels,0,0);const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return map;
  }
  const veilMap=makeVeilTexture();
  function spine(angle){return Math.sin(angle*3+.3)*10.5+Math.sin(angle*6)*2.2;}
  function ribbonPosition(angle,height=0,depth=0){
    const radius=ribbonRadius-depth;
    return [Math.sin(angle)*radius,spine(angle)+height,ribbonRadius-Math.cos(angle)*radius+Math.sin(angle*2)*9];
  }
  const layerSettings=[[-10,24,.11,-3.6],[-4,15,.19,1.5],[1,8,.25,0],[7,17,.16,3],[14,27,.10,-1.2]];
  for(let layer=0;layer<layerSettings.length;layer++){
    const [depth,width,opacity,offset]=layerSettings[layer],vertices=[],uvs=[],indices=[];
    const nx=320,ny=18;
    for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
      const angle=(i/nx-.5)*TAU,v=j/ny*2-1;
      const breathing=1+.12*Math.sin(angle*4+layer);
      vertices.push(...ribbonPosition(angle,offset+Math.sin(angle*7+layer*2)*(layer-2)*.65+v*width*breathing,depth+v*v*3.5+Math.sin(angle*4+layer)*1.4));
      uvs.push(i/nx,j/ny);
    }
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const k=j*(nx+1)+i;indices.push(k,k+1,k+nx+1,k+1,k+nx+2,k+nx+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
    const material=new THREE.MeshBasicMaterial({map:veilMap,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
    const veil=new THREE.Mesh(geometry,material);veil.frustumCulled=false;nebula.add(veil);ribbonLayers.push({mesh:veil,opacity,phase:layer*.9});
  }
  // Roughly twice the former length; keep fine-grain density along the extension.
  const dust=particleData(),count=compact?48000:84000;
  for(let i=0;i<count;i++){
    const angle=(random()-.5)*TAU;
    const spread=3.5+4.5*(.5+.5*Math.sin(angle*3+1));
    const [x,y,z]=ribbonPosition(angle,gaussian()*spread,gaussian()*8.5),bright=random();
    pushParticle(dust,x,y,z,.24+Math.pow(bright,5)*.85,.18+random()*.28,.58+random()*.37);
  }
  nebula.add(particleField(dust));
  // Occasional small glints provide a gentle focal rhythm, without any solid celestial bodies.
  function glintTexture(){
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
    const g=ctx.createRadialGradient(128,128,0,128,128,120);g.addColorStop(0,'rgba(241,247,255,1)');g.addColorStop(.025,'rgba(226,236,255,.9)');g.addColorStop(.10,'rgba(199,218,255,.28)');g.addColorStop(1,'rgba(160,184,230,0)');ctx.fillStyle=g;ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='rgba(228,238,255,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(128,58);ctx.lineTo(128,198);ctx.moveTo(58,128);ctx.lineTo(198,128);ctx.stroke();
    return new THREE.CanvasTexture(c);
  }
  const glintMap=glintTexture(),glints=[];
  for(const [x,scale] of [[-104,4.5],[72,6.2]]){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:glintMap,transparent:true,depthWrite:false,opacity:.55,blending:THREE.AdditiveBlending}));
    sprite.position.set(...ribbonPosition(x/ribbonRadius,0,8));sprite.scale.set(scale,scale,scale);nebula.add(sprite);glints.push(sprite);
  }
  const near=particleData();
  for(let i=0;i<150;i++){
    const a=random()*TAU,r=72+random()*45;
    pushParticle(near,Math.cos(a)*r,(random()-.5)*180,Math.sin(a)*r,.32+random()*.65,.30+random()*.44,.80+random()*.18);
  }
  scene.add(particleField(near,1));

  function resize(height, pixelRatio) {
    pointScale.value = height * pixelRatio * .5;
  }

  function update(elapsed) {
    skyTime.value += elapsed;
    for(const layer of ribbonLayers){layer.mesh.position.y=Math.sin(skyTime.value*.06+layer.phase)*.65;layer.mesh.material.opacity=layer.opacity*(.95+.05*Math.sin(skyTime.value*.09+layer.phase));}
    glints.forEach((glint,i)=>{glint.material.opacity=.49+.10*Math.sin(skyTime.value*.42+i*2);});
  }

  return {resize, update};
}
