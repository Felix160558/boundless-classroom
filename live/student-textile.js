export const textileCoverage = /* glsl */ `
  float avatarWovenVest(vec3 p, vec3 color) {
    float vest = smoothstep(.245,.279,p.y) * (1.-smoothstep(.441,.498,p.y))
      * (1.-smoothstep(.142,.187,abs(p.x)));
    float oatmeal = smoothstep(.22,.46,color.r) * smoothstep(.14,.29,color.g)
      * (1.-smoothstep(.36,.57,color.r-color.b));
    return vest * oatmeal;
  }

  float avatarShirt(vec3 p, vec3 color) {
    float sleeve = smoothstep(.354,.390,p.y) * (1.-smoothstep(.492,.531,p.y))
      * smoothstep(.142,.186,abs(p.x));
    float collar = smoothstep(.487,.506,p.y) * (1.-smoothstep(.544,.565,p.y))
      * (1.-smoothstep(.127,.171,abs(p.x)));
    float cream = smoothstep(.49,.72,color.b) * (1.-smoothstep(.10,.23,color.r-color.b));
    return max(sleeve,collar) * cream;
  }
`;

export const textileFinish = /* glsl */ `
  ${textileCoverage}

  float avatarThreadPattern(vec2 plane, float knit) {
    const float tau = 6.2831853;
    vec2 uv = plane * mix(vec2(785.,910.),vec2(420.,640.),knit);
    float lod = 1.-smoothstep(.33,.98,max(fwidth(uv.x),fwidth(uv.y)));
    float row = uv.y + .06 * sin(uv.x * .15);
    float warp = sin(tau * (uv.x + .22 * knit * cos(3.14159265 * row)));
    float weft = sin(tau * row);
    return lod * (.5 * warp + .32 * weft + .18 * warp * weft);
  }

  float avatarWovenFinish(vec3 rest, vec3 normal, vec3 color) {
    float vest = avatarWovenVest(rest,color);
    float shirt = avatarShirt(rest,color);
    vec3 axes = normal * normal;
    axes *= axes;
    axes /= max(dot(axes,vec3(1.)),.0001);
    float knit = smoothstep(.08,.64,vest);
    float pattern = axes.x * avatarThreadPattern(rest.zy,knit)
      + axes.y * avatarThreadPattern(rest.xz,knit) + axes.z * avatarThreadPattern(rest.xy,knit);
    return 1. + pattern * max(vest * .055,shirt * .043);
  }
`;
