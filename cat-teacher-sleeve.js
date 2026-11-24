import * as THREE from './three.module.min.js';

const smooth = THREE.MathUtils.smootherstep;

// Fitted to the baked amber mark between the two folds of the book-side sleeve.
// Anchor the mask to the sleeve's curved surface before any animation runs.
function sleeveWeight(x, y, z) {
  if (x < .116 || y < .158 || y > .249 || z < .024 || z > .101) return 0;
  const outward = smooth(x, .116, .129);
  const height = smooth(y, .158, .167) * (1 - smooth(y, .240, .249));
  const depth = smooth(z, .024, .031) * (1 - smooth(z, .092, .101));
  const side = .375 * x - .927 * z;
  const cuffEdge = .004 - .70 * Math.max(0, y - .182);
  const upperFold = .032 - 2.75 * Math.max(0, y - .224);
  const alongFold = smooth(side, cuffEdge - .010, cuffEdge - .006)
    * (1 - smooth(side, upperFold + .003, upperFold + .009));
  return outward * height * depth * alongFold;
}

export const teacherSleeveColorShader = /* glsl */ `
vec3 repairTeacherSleeveColor(vec3 color, float blend) {
  float amber = smoothstep(.13, .27, color.r - color.b);
  float shade = mix(color.r, color.g, .21);
  vec3 ivory = shade * vec3(1., .882, .829);
  return mix(color, ivory, blend * amber);
}
`;

export function repairTeacherSleeve(body) {
  const position = body.geometry.getAttribute('position');
  const weights = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    weights[i] = sleeveWeight(position.getX(i), position.getY(i), position.getZ(i));
  }
  body.geometry.setAttribute('teacherSleeveRepair', new THREE.BufferAttribute(weights, 1));
  const material = body.material.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = `
      attribute float teacherSleeveRepair;
      varying float vTeacherSleeveRepair;
      ` + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vTeacherSleeveRepair = teacherSleeveRepair;
    `);
    shader.fragmentShader = `
      varying float vTeacherSleeveRepair;
      ${teacherSleeveColorShader}
      ` + shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      diffuseColor.rgb = repairTeacherSleeveColor(diffuseColor.rgb, vTeacherSleeveRepair);
    `);
  };
  material.customProgramCacheKey = () => 'teacher-book-sleeve-repair';
  body.material = material;
}
