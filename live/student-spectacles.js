import * as THREE from '../three.module.min.js';

class OvalRim extends THREE.Curve {
  constructor(x, y, z, radiusX, radiusY, slopeX, slopeY) {
    super();
    this.center = new THREE.Vector3(x,y,z);
    this.radiusX = radiusX;
    this.radiusY = radiusY;
    this.slopeX = slopeX;
    this.slopeY = slopeY;
  }

  getPoint(t, target=new THREE.Vector3()) {
    const angle = t * Math.PI * 2;
    const x = Math.cos(angle) * this.radiusX;
    const y = Math.sin(angle) * this.radiusY;
    return target.set(
      this.center.x+x,
      this.center.y+y,
      this.center.z+x*this.slopeX+y*this.slopeY
    );
  }
}

export function createStudentSpectacles() {
  const frame = new THREE.Group();
  frame.name = 'Matte espresso spectacles';
  const material = new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const espresso = new THREE.Color(0x4c372d);
  const fill = new THREE.Vector3(-.35,.82,.43).normalize();
  const facing = new THREE.Vector3();

  function rimTube(curve, radius, steps, closed=false) {
    const geometry = new THREE.TubeGeometry(curve,steps,radius,10,closed);
    const {normal} = geometry.attributes;
    const shades = new Float32Array(normal.count * 3);
    for (let vertex = 0; vertex < normal.count; vertex++) {
      // Diffuse shaping only, so the same subdued finish reads in both
      // the classroom and the unlit avatar preview.
      facing.fromBufferAttribute(normal,vertex);
      const shading = .9+.22*Math.max(0,facing.dot(fill));
      shades[vertex*3] = espresso.r*shading;
      shades[vertex*3+1] = espresso.g*shading;
      shades[vertex*3+2] = espresso.b*shading;
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(shades,3));
    frame.add(new THREE.Mesh(geometry,material));
  }

  const left = new OvalRim(-.0829,.7298,.1662,.0578,.0572,.025,-.126);
  const right = new OvalRim(.0961,.7284,.1636,.0557,.0554,-.097,-.073);
  rimTube(left,.0032,96,true);
  rimTube(right,.0032,96,true);

  const point = (x,y,z) => new THREE.Vector3(x,y,z);
  const bridge = new THREE.CatmullRomCurve3([
    left.getPoint(.02), point(-.012,.743,.170),
    point(.021,.743,.170), right.getPoint(.479),
  ]);
  rimTube(bridge,.0024,36);

  const leftTemple = new THREE.CatmullRomCurve3([
    left.getPoint(.487), point(-.157,.736,.161),
    point(-.180,.723,.126), point(-.205,.706,.079), point(-.228,.693,.049),
  ]);
  const rightTemple = new THREE.CatmullRomCurve3([
    right.getPoint(.013), point(.163,.735,.157),
    point(.183,.725,.122), point(.206,.708,.078), point(.229,.695,.045),
  ]);
  rimTube(leftTemple,.00255,40);
  rimTube(rightTemple,.00255,40);
  return frame;
}
