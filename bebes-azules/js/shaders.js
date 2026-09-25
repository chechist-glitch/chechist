/* ==========================================================================
   LOS BEBÉS AZULES — shaders
   Todo procedural: SDF + raymarching para los bebés, esferas analíticas para
   los planetas, y una cadena de post-proceso que imita película de 16 mm.
   ========================================================================== */
window.BB_SHADERS = (function () {

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main(){ vUv = aPos*.5+.5; gl_Position = vec4(aPos, 0., 1.); }`;

/* ------------------------------------------------------------------------ */
/*  Librería común de escena                                                 */
/* ------------------------------------------------------------------------ */
const COMMON = `
precision highp float;
precision highp int;
uniform vec2  uRes;
uniform float uT;     // tiempo local del plano
uniform float uDur;   // duración del plano
uniform float uG;     // tiempo global
uniform float uV;     // variante
out vec4 outCol;

#ifndef BODY
#define BODY 0
#endif

#define PI  3.14159265
#define TAU 6.28318531

float sat(float x){ return clamp(x,0.,1.); }
vec3  sat3(vec3 x){ return clamp(x,0.,1.); }
float ss(float a,float b,float x){ return smoothstep(a,b,x); }
float ease(float x){ x=sat(x); return x*x*(3.-2.*x); }
float easeOut(float x){ x=sat(x); return 1.-(1.-x)*(1.-x); }
float easeIn(float x){ x=sat(x); return x*x; }

/* ---- hashes (Dave Hoskins) ---- */
float hash11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float hash31(vec3 p3){ p3=fract(p3*.1031); p3+=dot(p3,p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
vec3  hash33(vec3 p3){ p3=fract(p3*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yxz+33.33); return fract((p3.xxy+p3.yxx)*p3.zyx); }

float noise3(vec3 x){
  vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.-2.*f);
  float a=hash31(i),               b=hash31(i+vec3(1.,0.,0.));
  float c=hash31(i+vec3(0.,1.,0.)),d=hash31(i+vec3(1.,1.,0.));
  float e=hash31(i+vec3(0.,0.,1.)),g=hash31(i+vec3(1.,0.,1.));
  float h=hash31(i+vec3(0.,1.,1.)),k=hash31(i+vec3(1.,1.,1.));
  return mix(mix(mix(a,b,f.x),mix(c,d,f.x),f.y), mix(mix(e,g,f.x),mix(h,k,f.x),f.y), f.z);
}
float noise2(vec2 x){
  vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x), mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x), f.y);
}
float fbm3(vec3 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,5.3); a*=.5; } return s*1.032; }
float fbm3s(vec3 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*noise3(p); p=p*2.03+vec3(1.7,9.2,5.3); a*=.5; } return s*1.143; }
const mat2 M2 = mat2(.8,.6,-.6,.8);
float fbm2(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*noise2(p); p=M2*p*2.02+vec2(3.1,1.7); a*=.5; } return s*1.032; }
float fbm2s(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*noise2(p); p=M2*p*2.02+vec2(3.1,1.7); a*=.5; } return s*1.143; }

// distancia al borde de celda de Voronoi (F2-F1): grietas
float crackNoise(vec3 x){
  vec3 p=floor(x), f=fract(x); float d1=10., d2=10.;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 b=vec3(float(i),float(j),float(k)); vec3 r=b+hash33(p+b)-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }
  }
  return sqrt(d2)-sqrt(d1);
}

/* ---- SDF ---- */
float smin(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
float smax(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return max(a,b)+h*h*k*.25; }
float sdEll(vec3 p, vec3 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.)/max(k1,1e-5); }
float sdCap(vec3 p, vec3 a, vec3 b, float r1, float r2){ vec3 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return length(pa-ba*h)-mix(r1,r2,h); }
float sdTorus(vec3 p, vec2 t){ vec2 q=vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; }
vec2 opSU(vec2 a, vec2 b, float k){ return vec2(smin(a.x,b.x,k), a.x<b.x ? a.y : b.y); }

mat3 rotX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
mat3 rotZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }

vec2 iSphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc=ro-c; float b=dot(oc,rd); float cc=dot(oc,oc)-r*r; float h=b*b-cc;
  if(h<0.) return vec2(-1.); h=sqrt(h); return vec2(-b-h, -b+h);
}
mat3 camLook(vec3 ro, vec3 ta, float roll){
  vec3 f=normalize(ta-ro); vec3 r=normalize(cross(f, vec3(sin(roll),cos(roll),0.))); vec3 u=cross(r,f);
  return mat3(r,u,f);
}
mat3 handBasis(vec3 f, vec3 n){ vec3 y=normalize(f); vec3 z=normalize(n-y*dot(n,y)); vec3 x=cross(y,z); return mat3(x,y,z); }
vec3 ik(vec3 a, vec3 c, float l1, float l2, vec3 pole){
  vec3 d=c-a; float L=clamp(length(d), .05, l1+l2-.002); vec3 dn=normalize(d);
  float x=(l1*l1-l2*l2+L*L)/(2.*L); float h=sqrt(max(l1*l1-x*x,0.));
  vec3 pv=normalize(pole-dn*dot(pole,dn));
  return a+dn*x+pv*h;
}

/* ------------------------------------------------------------------------ */
/*  Globales de escena (cada plano las fija en setup())                      */
/* ------------------------------------------------------------------------ */
vec3 camPos = vec3(0.,0.,5.), camTar = vec3(0.); float camFl = 2., camRoll = 0.;
mat3 camMat = mat3(1.);
float focusDist = 5., aperture = 0.;
vec3 sunDir = vec3(0.,1.,0.), sunCol = vec3(0.);
vec3 fillCol = vec3(0.);
vec3 rimDir = vec3(0.,0.,-1.), rimCol = vec3(0.);
vec3 xlPos = vec3(0.), xlCol = vec3(0.); float xlRange = 1.;       // luz extra (planeta)
vec3 boundC = vec3(0.,-.05,.1); float boundR = 1.45;
// cabeza
mat3 headRot = mat3(1.); vec3 headPivot = vec3(0.,-.62,-.1);
float lidUp = .065, lidLo = -.12;
vec3 gazeTarget = vec3(0.,0.,10.);
float eyeGlow = 1., pupil = .35, eyeLight = .7, eyeHalo = .0016, reflAmt = 1.;
vec3 gazeL = vec3(0.,0.,1.), gazeR = vec3(0.,0.,1.);
vec3 eyeWL = vec3(0.), eyeWR = vec3(0.);
const vec3 EYE_C = vec3(.30,-.05,.665);
const float EYE_R = .205;
const vec3 EYE_GLOW = vec3(1.,.11,.035);
// brazos
vec3 shR = vec3(-.98,-1.45,-.12), elR = vec3(-1.2,-2.4,.2), wrR = vec3(-1.2,-3.2,.5); mat3 hRotR = mat3(1.); float pointR = 1.;
vec3 shL = vec3( .98,-1.45,-.12), elL = vec3( 1.2,-2.4,.2), wrL = vec3( 1.2,-3.2,.5); mat3 hRotL = mat3(1.); float pointL = 0.;
float handScale = 1.2;
vec3 tipPos = vec3(0.,0.,-100.); float tipGlow = 0.; vec3 tipCol = vec3(1.,.2,.06);
// tierra
vec3 eC = vec3(0.,0.,-100.); float eR = 1.; mat3 eRot = mat3(1.);
float eBurn = 0.; vec3 eBurnDir = vec3(0.,1.,0.); float eBurnR = 0.; float eShock = -1.; float eShockI = 0.; float eCity = 1.;
vec3 eSun = vec3(1.,0.,0.);
// planeta rojo
vec3 mC = vec3(0.,0.,-1000.); float mR = 1.; mat3 mRot = mat3(1.); vec3 mSun = vec3(1.,0.,0.);
// fondo
float bgEyes = 0.; float nebula = 1.; vec3 nebCol = vec3(.035,.012,.01);
float CLOUD_Y = -3.1; float GROUND_Y = -5.7;
vec3 hazeCol = vec3(.5,.55,.6); float hazeK = .01;
vec3 reflC = vec3(0.,0.,-100.); float reflR = 0.;   // tierra reflejada en el ojo

vec3 tipLocal(){ return vec3(.14,.8,.04)*handScale; }

/* ------------------------------------------------------------------------ */
/*  Modelo del bebé                                                          */
/* ------------------------------------------------------------------------ */
const mat3 EAR_ROT = mat3(.9394,0.,.3429, 0.,1.,0., -.3429,0.,.9394);

vec2 mapHead(vec3 p){
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // cráneo + masa facial
  float d = sdEll(p - vec3(0., .14, -.12), vec3(.94, .98, 1.02));
  d = smin(d, sdEll(p - vec3(0., -.30, .16), vec3(.72, .64, .74)), .30);
  // mofletes
  d = smin(d, sdEll(q - vec3(.40, -.41, .50), vec3(.35, .32, .34)), .22);
  // barbilla
  d = smin(d, sdEll(p - vec3(0., -.72, .52), vec3(.22, .16, .18)), .16);
  // arcos superciliares suaves
  d = smin(d, sdEll(q - vec3(.28, .18, .69), vec3(.26, .11, .14)), .14);
  // ojo: la cuenca es la propia esfera de los párpados; bordes en almendra
  vec3 ec = q - EYE_C;
  float shell = length(ec) - (EYE_R + .01);
  d = smax(d, -shell, .02);
  float cu = lidUp - 2.6*ec.x*ec.x + ec.z*.1;
  float cl = lidLo + 1.8*ec.x*ec.x + ec.z*.05;
  float up = max(smax(shell, cu - ec.y, .06), -ec.z);
  float lo = max(smax(shell, ec.y - cl, .06), -ec.z);
  d = smin(d, min(up, lo), .03);
  // nariz
  d = smin(d, sdEll(p - vec3(0., -.285, .95), vec3(.105, .08, .085)), .09);
  d = smin(d, sdEll(p - vec3(0., -.15, .875), vec3(.06, .11, .05)), .08);
  d = smin(d, sdEll(q - vec3(.08, -.315, .9), vec3(.055, .045, .055)), .035);
  d = smax(d, -sdEll(q - vec3(.042, -.352, .962), vec3(.02, .012, .024)), .014);
  // boca: arco de cupido, labio inferior, línea de la boca, surco mentolabial
  d = smin(d, sdEll(q - vec3(.03, -.47, .855), vec3(.1, .042, .065)), .05);
  d = smin(d, sdEll(p - vec3(0., -.55, .835), vec3(.105, .045, .068)), .05);
  d = smax(d, -sdEll(p - vec3(0., -.508, .9), vec3(.1, .006, .035)), .03);
  // orejas
  vec3 e = EAR_ROT * (q - vec3(.92, -.10, -.06));
  float ear = sdEll(e, vec3(.085, .22, .15));
  ear = smax(ear, -sdEll(e - vec3(.085, -.01, .015), vec3(.035, .13, .085)), .04);
  d = smin(d, ear, .07);
  // globo ocular
  float eye = length(ec) - EYE_R;
  return eye < d ? vec2(eye, 2.) : vec2(d, 1.);
}

// mano derecha: muñeca en el origen, dedos hacia +y, palma hacia +z, pulgar en +x
float sdHand(vec3 p, float point){
  float b = length(p - vec3(0.,.4,.05)) - .62;
  if (b > .15) return b;
  float d = sdEll(p - vec3(0.,.19,0.), vec3(.22,.21,.115));
  d = smin(d, sdEll(p - vec3(0.,.02,0.), vec3(.15,.1,.1)), .1);
  d = smin(d, sdEll(p - vec3(.1,.12,.05), vec3(.1,.12,.08)), .06);
  // índice
  vec3 k  = vec3(.125,.37,0.);
  vec3 m1 = mix(vec3(.13,.47,.10), vec3(.135,.56,.02), point);
  vec3 t1 = mix(vec3(.13,.41,.19), vec3(.14,.76,.04), point);
  d = smin(d, sdCap(p, k, m1, .062, .056), .05);
  d = smin(d, sdCap(p, m1, t1, .056, .048), .02);
  // corazón, anular, meñique (doblados)
  for (int i=0;i<3;i++){
    float fi = float(i);
    float x = .035 - fi*.085;
    float sc = 1. - fi*.08;
    vec3 kk = vec3(x, .37 - fi*.015, 0.);
    vec3 mm = kk + vec3(0., .1, .09)*sc;
    vec3 tt = mm + vec3(0., -.06, .09)*sc;
    d = smin(d, sdCap(p, kk, mm, .06*sc, .054*sc), .045);
    d = smin(d, sdCap(p, mm, tt, .054*sc, .046*sc), .02);
  }
  // pulgar
  vec3 a = vec3(.17,.08,.05), bb = vec3(.23,.22,.13), c = vec3(.15,.32,.2);
  d = smin(d, sdCap(p, a, bb, .07, .06), .06);
  d = smin(d, sdCap(p, bb, c, .06, .05), .02);
  return d;
}

vec2 mapArm(vec3 p, vec3 sh, vec3 el, vec3 wr, mat3 hr, float point, float side){
  vec3 hc = wr + hr[1]*(.42*handScale);
  float b = min(sdCap(p, sh, el, .45, .45), min(sdCap(p, el, wr, .4, .4), length(p-hc) - .7*handScale));
  if (b > .2) return vec2(b, 1.);
  float up = sdCap(p, sh, el, .31, .25);
  float fo = sdCap(p, el, wr, .25, .165);
  // pliegue de la muñeca
  vec3 ph = (p - wr)*hr; ph.x *= side;
  float hand = sdHand(ph/handScale, point)*handScale;
  float skin = smin(fo, hand, .08);
  skin = smax(skin, -sdTorus((p-wr)*hr + vec3(0.,.04,0.), vec2(.17,.012)), .015);
  float d = smin(up, skin, .1);
  return vec2(d, up < skin - .015 ? 3. : 1.);
}

vec2 mapBody(vec3 p){
#if BODY == 1
  float b = min(sdCap(p, vec3(0.,-1.,-.1), vec3(0.,-3.2,.1), 1.3, 1.3), sdCap(p, vec3(0.,-3.2,.5), vec3(0.,-3.6,2.), 1.4,1.))-.05;
#else
  float b = sdCap(p, vec3(0.,-1.,-.1), vec3(0.,-5.,0.), 1.35, 1.1)-.05;
#endif
  if (b > .2) return vec2(b, 3.);
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float neck = sdCap(p, vec3(0.,-.55,-.15), vec3(0.,-1.2,-.15), .37, .42);
  float d = sdEll(p - vec3(0.,-1.5,-.15), vec3(1.05,.48,.66));
  d = smin(d, sdEll(p - vec3(0.,-2.05,-.1), vec3(.98,.95,.78)), .3);
  d = smin(d, sdEll(p - vec3(0.,-2.4,.12), vec3(.88,.78,.72)), .3);
  d = smin(d, sdEll(p - vec3(0.,-2.95,-.02), vec3(.95,.58,.8)), .3);
#if BODY == 1
  d = smin(d, sdCap(q, vec3(.5,-3.1,.1), vec3(.62,-3.25,1.3), .46, .38), .2);
  d = smin(d, sdCap(q, vec3(.62,-3.25,1.3), vec3(.5,-3.9,1.65), .36, .28), .12);
  d = smin(d, sdEll(q - vec3(.48,-4.05,1.85), vec3(.24,.18,.38)), .1);
#else
  d = smin(d, sdCap(q, vec3(.45,-3.1,0.), vec3(.48,-4.25,.05), .46, .37), .2);
  d = smin(d, sdCap(q, vec3(.48,-4.25,.05), vec3(.44,-5.3,0.), .35, .27), .12);
  d = smin(d, sdEll(q - vec3(.44,-5.52,.2), vec3(.25,.16,.42)), .1);
#endif
  // cuello del pelele
  d = smin(d, sdTorus(p - vec3(0.,-1.12,-.13), vec2(.4,.06)), .06);
  float r = smin(neck, d, .15);
  return vec2(r, neck < d ? 1. : 3.);
}

vec2 map(vec3 p){
  vec2 res = vec2(1e5, 0.);
#ifdef HAS_HEAD
  {
    vec3 ph = (p - headPivot)*headRot + headPivot;
    float b = length(ph - vec3(0.,0.,.02)) - 1.3;
    res = b > .2 ? vec2(b, 1.) : mapHead(ph);
  }
#endif
#if BODY > 0
  res = opSU(res, mapBody(p), .14);
#endif
#ifdef HAS_ARM_R
  res = opSU(res, mapArm(p, shR, elR, wrR, hRotR, pointR, 1.), .16);
#endif
#ifdef HAS_ARM_L
  res = opSU(res, mapArm(p, shL, elL, wrL, hRotL, pointL, -1.), .16);
#endif
  return res;
}

vec2 march(vec3 ro, vec3 rd, float tmax){
  vec2 bs = iSphere(ro, rd, boundC, boundR);
  if (bs.y < 0.) return vec2(1e4, -1.);
  float t = max(bs.x, .01); float tEnd = min(bs.y, tmax);
  for (int i=0;i<150;i++){
    if (t > tEnd) break;
    vec2 h = map(ro+rd*t);
    if (h.x < .0004*t + .0004) return vec2(t, h.y);
    t += h.x*.9;
  }
  return vec2(1e4, -1.);
}
vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1.,-1.); float e = .0015;
  return normalize(k.xyy*map(p+k.xyy*e).x + k.yyx*map(p+k.yyx*e).x + k.yxy*map(p+k.yxy*e).x + k.xxx*map(p+k.xxx*e).x);
}
float calcAO(vec3 p, vec3 n){
  float occ=0., sca=1.;
  for(int i=0;i<5;i++){ float h=.02+.17*float(i)/4.; float d=map(p+n*h).x; occ+=(h-d)*sca; sca*=.85; }
  return sat(1.-2.2*occ);
}
float softShadow(vec3 ro, vec3 rd, float k){
  float res=1., t=.03;
  for(int i=0;i<40;i++){
    float h=map(ro+rd*t).x; res=min(res, k*h/t); t+=clamp(h,.03,.5);
    if(res<.002||t>14.) break;
  }
  return sat(res);
}
vec3 ptLight(vec3 p, vec3 n, vec3 lp, vec3 lc, float r){
  vec3 l = lp-p; float d2 = dot(l,l); l *= inversesqrt(d2);
  return lc * sat(dot(n,l)*.75+.25) / (1.+d2/(r*r));
}
float glowLine(vec3 ro, vec3 rd, float tmax, vec3 lp, float k){
  vec3 oc = lp-ro; float h = dot(oc,rd); float b = sqrt(max(dot(oc,oc)-h*h, 1e-5));
  b = max(b, .012);
  return k*(atan(tmax-h, b) - atan(-h, b))/b;
}

/* ------------------------------------------------------------------------ */
/*  Planetas                                                                  */
/* ------------------------------------------------------------------------ */
vec3 earthColor(vec3 n, vec3 nw, vec3 rd, vec3 sun){
  float h  = fbm3(n*2.1 + vec3(2.,5.,1.));
  float hd = fbm3s(n*7.3);
  float land = ss(.515, .54, h + (hd-.5)*.06);
  vec3 ocean = mix(vec3(.012,.045,.11), vec3(.03,.10,.2), ss(.35,.515,h));
  vec3 grd = mix(vec3(.14,.17,.09), vec3(.30,.24,.15), hd);
  float ice = ss(.80,.88, abs(n.y) + .08*hd);
  vec3 alb = mix(ocean, grd, land); alb = mix(alb, vec3(.72,.76,.8), ice);
  float cl = ss(.55,.78, fbm3(n*4.2 + vec3(0.,0.,uG*.015)));
  float ndl = dot(nw, sun);
  float day = ss(-.1,.25, ndl);
  vec3 col = alb*(sat(ndl)*1.15 + .012);
  vec3 hv = normalize(sun - rd);
  col += (1.-land)*(1.-cl)*pow(sat(dot(nw,hv)),50.)*.7*day*vec3(1.,.9,.8);
  col = mix(col, vec3(.85,.88,.92)*(sat(ndl)*1.05 + .01), cl*.8);
  // luces de ciudades (lado noche) — rojas, enfermizas
  float city = land*(1.-ice)*ss(.66,.86,noise3(n*150.))*ss(.45,.7,fbm3s(n*11.));
  city += land*(1.-ice)*.12*ss(.55,.75,fbm3s(n*24.));
  vec3 em = vec3(1.,.26,.07)*city*(1.-day*.9)*2.*eCity*(1.-cl*.7);
  // grietas de lava desde el punto de contacto
  if (eBurn > 0.) {
    float ang = acos(clamp(dot(n, eBurnDir), -1., 1.));
    float inside = ss(eBurnR, eBurnR - .22, ang);
    vec3 w = vec3(fbm3s(n*2.7), fbm3s(n*2.7 + 7.1), fbm3s(n*2.7 + 13.3)) - .5;
    float vc  = crackNoise(n*4.5 + w*2.2);
    float vc2 = crackNoise(n*13. + w*3. + 4.);
    float cracks = (1.-ss(.0,.045,vc)) + .6*(1.-ss(.0,.035,vc2))*ss(.35,.6,fbm3s(n*5.));
    float edge = ss(eBurnR-.4, eBurnR-.05, ang)*inside;
    col *= 1. - .75*inside*eBurn;
    em += vec3(1.,.2,.04)*cracks*inside*eBurn*(2.2 + 5.*edge);
    em += vec3(.7,.07,.015)*inside*eBurn*(.25 + .5*fbm3s(n*6.+uG*.3));
  }
  if (eShockI > 0.) {
    float ang = acos(clamp(dot(n, eBurnDir), -1., 1.));
    float ring = exp(-pow((ang - eShock)/.045, 2.));
    em += vec3(1.,.55,.3)*ring*eShockI*6.;
  }
  // atmósfera en el disco
  float fre = pow(1.-sat(dot(nw,-rd)), 3.);
  vec3 atm = mix(vec3(.25,.5,1.), vec3(1.,.28,.08), sat(eBurn*.8));
  col += atm*fre*(.12 + 1.2*ss(-.3,.4,ndl));
  return col + em;
}
vec3 shadeEarth(vec3 pos, vec3 rd){
  vec3 nw = normalize(pos - eC);
  vec3 n = nw*eRot;
  return earthColor(n, nw, rd, eSun);
}
vec3 shadeRed(vec3 pos, vec3 rd){
  vec3 nw = normalize(pos - mC);
  vec3 n = nw*mRot;
  float h = fbm3(n*3.1 + 3.);
  float h2 = fbm3(n*11.);
  float maria = ss(.45,.6, fbm3s(n*1.6+7.));
  vec3 alb = mix(vec3(.26,.06,.02), vec3(.62,.26,.1), h)*(.7 + .6*h2);
  alb *= 1. - .5*maria;
  float ndl = dot(nw, mSun);
  vec3 col = alb*(sat(ndl)*1.5 + .015);
  vec3 w = vec3(fbm3s(n*2.3), fbm3s(n*2.3 + 5.), fbm3s(n*2.3 + 9.)) - .5;
  float vc = crackNoise(n*10. + w*3.);
  float cracks = (1. - ss(0.,.03,vc))*ss(.45,.68, fbm3s(n*2.5 + 1.));
  float night = 1. - ss(-.25,.3,ndl);
  col += vec3(1.,.2,.04)*cracks*(.25 + 1.5*night);
  col += vec3(.5,.06,.01)*night*ss(.5,.8,h2)*.25;
  float fre = pow(1.-sat(dot(nw,-rd)), 3.);
  col += vec3(1.,.35,.15)*fre*(.05 + .6*ss(-.3,.5,ndl));
  return col;
}
vec3 atmoHalo(vec3 ro, vec3 rd, float tHit, vec3 c, float r, vec3 acol, vec3 sun, float w){
  vec3 oc = c - ro; float h = dot(oc, rd);
  if (h < 0. || h > tHit) return vec3(0.);
  float b = sqrt(max(dot(oc,oc) - h*h, 0.));
  if (b < r) return vec3(0.);
  vec3 cp = normalize(ro + rd*h - c);
  float lit = sat(dot(cp, sun)*.7 + .3);
  return acol*exp(-(b - r)/(r*w))*lit;
}

/* ------------------------------------------------------------------------ */
/*  Fondos                                                                    */
/* ------------------------------------------------------------------------ */
vec3 stars(vec3 rd){
  vec3 col = vec3(0.);
  for (int i=0;i<2;i++){
    float sc = i==0 ? 70. : 150.;
    vec3 p = rd*sc; vec3 id = floor(p); vec3 f = fract(p) - .5;
    vec3 h = hash33(id);
    if (h.x > .9) {
      vec3 o = (hash33(id+7.) - .5)*.6;
      float d = length(f - o);
      col += mix(vec3(1.,.85,.75), vec3(.8,.9,1.), h.z)*(h.y*h.y)*ss(.1,.0,d)*(i==0 ? 2.2 : 1.2);
    }
  }
  return col;
}
vec3 bgSpace(vec3 rd, vec2 uv){
  vec3 col = vec3(.003,.004,.006);
  col += nebula*(nebCol*ss(.42,.85,fbm3s(rd*2.3)) + vec3(.006,.012,.02)*ss(.4,.75,fbm3s(rd*1.6+3.)));
  vec3 st = stars(rd);
  if (bgEyes > 0.) {
    // un rostro gigantesco en las estrellas
    vec2 fc = uv - vec2(.36, .16);
    float head = length(fc*vec2(1.,.92)) - .52;
    float mask = ss(.06, -.02, head);
    st *= 1. - mask*bgEyes;
    col += vec3(.01,.018,.03)*mask*bgEyes*ss(-.5,.2,fc.y + fc.x*.3);
    vec2 e1 = fc - vec2(-.13,-.02), e2 = fc - vec2(.13,-.02);
    float g = exp(-dot(e1,e1)*9000.) + exp(-dot(e2,e2)*9000.);
    float g2 = exp(-dot(e1,e1)*450.) + exp(-dot(e2,e2)*450.);
    col += EYE_GLOW*bgEyes*(g*14. + g2*.9);
  }
  return col + st;
}
vec3 bgDark(vec3 rd, vec2 uv){
  float n = fbm3s(rd*3. + vec3(0.,0.,uG*.05));
  return vec3(.0025,.003,.004) + nebCol*.25*ss(.4,.9,n)*nebula;
}
vec3 bgSky(vec3 rd){
  float y = rd.y;
  vec3 zen = vec3(.09,.15,.23), hor = vec3(.55,.6,.63);
  vec3 col = mix(hor, zen, ss(-.02, .45, y));
  if (y > -.02) {
    vec2 cuv = rd.xz/(max(y,0.)+.09)*.9 + vec2(uG*.012, 0.);
    float c  = fbm2(cuv*.9);
    float cs = fbm2(cuv*.9 + sunDir.xz*.12);
    float cov = ss(.38, .72, c);
    float lit = sat((c - cs)*6. + .4);
    vec3 cc = mix(vec3(.13,.17,.22), vec3(1.05,.98,.9), lit);
    cc = mix(cc, hor, ss(.2,.0,y)*.7);
    col = mix(col, cc, cov*ss(-.02,.08,y));
  }
  float sd = sat(dot(rd, sunDir));
  col += vec3(1.,.88,.7)*(pow(sd, 6.)*.35 + pow(sd, 200.)*2.);
  // avión lejano con estela (escala)
  {
    float tp = uT;
    vec3 pp = normalize(vec3(9. - tp*1.25, 3.2 + tp*.04, -30.));
    vec3 ax = normalize(vec3(-1.,.03,0.));
    vec3 dv = rd - pp;
    float along = dot(dv, ax);
    float perp = length(dv - ax*along - pp*dot(dv,pp));
    float body = ss(.0042,.0024, length(vec2(along*.35, perp)));
    float wing = ss(.0026,.0013, abs(along))*ss(.011,.008, perp);
    float trail = ss(.0028,.0008, perp)*ss(0., -.008, along)*exp(along*5.)*.8;
    col = mix(col, vec3(.08,.09,.1), max(body, wing));
    col += vec3(.8)*trail*(1.-max(body,wing));
  }
  return col;
}
vec3 bgMars(vec3 rd){
  float y = rd.y;
  vec3 col = mix(vec3(.30,.10,.05), vec3(.035,.012,.02), ss(-.02,.5,y));
  col += stars(rd)*ss(.1,.4,y)*.5;
  float d = fbm3s(rd*4. + vec3(uG*.05,0.,0.));
  col += vec3(.2,.07,.03)*ss(.4,.8,d)*ss(.25,-.02,y);
  return col;
}
vec3 background(vec3 rd, vec2 uv){
#if defined(BG_SPACE)
  return bgSpace(rd, uv);
#elif defined(BG_SKY)
  return bgSky(rd);
#elif defined(BG_MARS)
  return bgMars(rd);
#else
  return bgDark(rd, uv);
#endif
}

/* ------------------------------------------------------------------------ */
/*  Mar de nubes                                                              */
/* ------------------------------------------------------------------------ */
float cloudH(vec2 xz){
  vec2 q = xz*.45 + vec2(uG*.03, 0.);
  float s = 0., a = .5;
  for (int i=0;i<3;i++){ s += a*noise2(q); q = M2*q*2.1 + 1.3; a *= .5; }
  s *= 1.14;
  float big = noise2(xz*.09 + 4.);
  return CLOUD_Y + .6*big + 1.9*s*s*(.6 + .6*big);
}
float marchClouds(vec3 ro, vec3 rd){
  float top = CLOUD_Y + 2.2;
  if (rd.y >= 0. && ro.y > top) return 1e4;
  float t = ro.y > top ? (top - ro.y)/rd.y : 0.;
  for (int i=0;i<56;i++){
    vec3 p = ro + rd*t;
    float h = p.y - cloudH(p.xz);
    if (h < .002 + t*.0015) return t;
    t += max(h*.55, .03 + t*.006);
    if (t > 160.) break;
  }
  return 1e4;
}
vec3 cloudShade(vec3 p, vec3 rd, float t){
  vec2 e = vec2(.06, 0.);
  float h0 = cloudH(p.xz);
  vec3 n = normalize(vec3(h0 - cloudH(p.xz+e.xy), e.x, h0 - cloudH(p.xz+e.yx)));
  float hgt = sat((p.y - CLOUD_Y)/2.2);
  float dif = sat(dot(n, sunDir)*.55 + .45);
  float sh = 1.;
  if (length(p.xz - vec2(0.,.3)) < 7.) sh = .35 + .65*softShadow(p + vec3(0.,.05,0.), sunDir, 6.);
  vec3 c = mix(vec3(.24,.30,.38), vec3(1.,.96,.9), dif*sh*(.35 + .65*hgt));
  c *= .6 + .4*hgt;
  c += (1.-dif)*vec3(.06,.08,.1);
  c += ptLight(p, n, tipPos, tipCol*tipGlow*.8, 1.2);
  c = mix(c, hazeCol, 1. - exp(-t*hazeK));
  return c;
}

/* ------------------------------------------------------------------------ */
/*  Sombreado del bebé                                                        */
/* ------------------------------------------------------------------------ */
vec3 envRefl(vec3 d){
  vec3 c = background(d, vec2(0.)) * .6;
  if (reflR > 0.) {
    // la Tierra reflejada en la córnea
    vec2 is = iSphere(vec3(0.), d, reflC, reflR);
    if (is.x > 0.) {
      vec3 pos = d*is.x;
      vec3 nw = normalize(pos - reflC);
      c = earthColor(nw*eRot, nw, d, eSun)*1.4;
    }
  }
  return c;
}
void eyeLook(vec3 en, vec3 gz, out vec3 em, out float mask){
  float c = clamp(dot(en,gz), -1., 1.);
  float ang = acos(c);
  vec3 up = abs(gz.y) < .95 ? vec3(0.,1.,0.) : vec3(1.,0.,0.);
  vec3 ax = normalize(cross(up, gz)); vec3 ay = cross(gz, ax);
  float phi = atan(dot(en,ay), dot(en,ax));
  float r = ang/.5;
  float pr = mix(.2, .52, pupil);
  mask = 1. - ss(.94, 1.04, r);
  float fib = .5 + .5*noise3(vec3(cos(phi)*9., sin(phi)*9., r*3.));
  float fib2 = noise3(vec3(cos(phi)*26., sin(phi)*26., r*7.));
  float ring = ss(pr, pr+.06, r)*(1. - ss(pr+.05, pr+.35, r));
  float edge = ss(.7, .98, r);
  vec3 base = vec3(1.,.1,.03)*(.8 + 2.2*fib*fib2);
  base += vec3(1.,.35,.1)*1.6*ss(.55,.9,fib2)*(1.-edge);
  vec3 hot = vec3(1.,.42,.14)*2.6*ring*(.6+.8*fib);
  em = (base + hot)*(1. - .8*edge)*mask;
  float pm = 1. - ss(pr-.03, pr+.02, r);
  em = mix(em, vec3(.06,.003,0.) + vec3(1.,.3,.08)*3.*(1.-ss(0., pr*.3, r)), pm);
}

vec3 shadeBaby(vec3 p, vec3 n, vec3 rd, float mat){
  vec3 ph = (p - headPivot)*headRot + headPivot;
  vec3 alb; vec3 emis = vec3(0.); float spec = .22, shin = 20.;
  bool isEye = false;
  if (mat < 1.5) {
    alb = vec3(.31,.41,.57);
    float m = fbm3s(p*4.5);
    alb *= .82 + .32*m;
    float lips = ss(.16, .0, length((ph - vec3(0.,-.505,.8))*vec3(.9,2.2,1.)));
    alb = mix(alb, vec3(.42,.36,.46), lips*.6);
    float cheek = ss(.35, .0, length(vec3(abs(ph.x),ph.y,ph.z) - vec3(.42,-.38,.72)));
    alb = mix(alb, vec3(.44,.42,.54), cheek*.35);
  } else if (mat < 2.5) {
    isEye = true;
    float side = ph.x < 0. ? -1. : 1.;
    vec3 ec = ph - vec3(EYE_C.x*side, EYE_C.y, EYE_C.z);
    vec3 en = normalize(ec);
    vec3 gz = side < 0. ? gazeR : gazeL;
    vec3 iem; float im;
    eyeLook(en, gz, iem, im);
    alb = mix(vec3(.42,.32,.34), vec3(.03,.01,.01), im);
    emis = iem*eyeGlow;
    emis += vec3(.6,.05,.02)*eyeGlow*.12*(1.-im);
    spec = 1.; shin = 180.;
  } else {
    alb = vec3(.46,.5,.56)*(.8 + .3*fbm3s(p*9.));
    spec = .04; shin = 8.;
  }
  float ao = calcAO(p, n);
  float ndl = dot(n, sunDir);
  vec3 wrap = vec3(.45,.28,.22);
  vec3 dif = sat3((vec3(ndl) + wrap)/(1. + wrap));
  float sh = 1.;
  if (ndl > -.35 && dot(sunCol, vec3(1.)) > .02) sh = softShadow(p + n*.02, sunDir, 9.);
  vec3 lig = sunCol*dif*mix(vec3(sh), vec3(sh*.7+.3, sh*.45+.1, sh*.4+.05), .25);
  lig += fillCol*(.55 + .45*n.y)*ao;
  lig += rimCol*pow(sat(1. + dot(n, rd)), 2.2)*sat(dot(n, rimDir)*.6 + .4)*2.*ao;
  lig += ptLight(p, n, xlPos, xlCol, xlRange)*(.4 + .6*ao);
  if (!isEye) {
    lig += ptLight(p, n, eyeWL, EYE_GLOW*eyeGlow*eyeLight, .34);
    lig += ptLight(p, n, eyeWR, EYE_GLOW*eyeGlow*eyeLight, .34);
  }
  lig += ptLight(p, n, tipPos, tipCol*tipGlow, .55);
  vec3 col = alb*lig;
  vec3 hv = normalize(sunDir - rd);
  float fr = .04 + .96*pow(1. - sat(dot(-rd, hv)), 5.);
  col += sunCol*sh*spec*pow(sat(dot(n, hv)), shin)*fr*(shin > 100. ? 3. : 1.);
  float fre = pow(1. - sat(dot(n, -rd)), 4.);
  col += fre*.12*(fillCol + rimCol)*ao;
  if (isEye) {
    vec3 rf = reflect(rd, n);
    col += envRefl(rf)*(.08 + .5*pow(1. - sat(dot(n,-rd)), 3.))*reflAmt;
  }
  return col + emis;
}

/* ------------------------------------------------------------------------ */
void finishSetup(){
  vec3 gt = (gazeTarget - headPivot)*headRot + headPivot;
  vec3 cR = vec3(-EYE_C.x, EYE_C.y, EYE_C.z), cL = EYE_C;
  // los ojos giran menos de lo que pediría la mirada: así el iris nunca se esconde en el lagrimal
  gazeR = normalize(mix(vec3(0.,0.,1.), normalize(gt - cR), .55));
  gazeL = normalize(mix(vec3(0.,0.,1.), normalize(gt - cL), .55));
  eyeWR = headRot*(cR + gazeR*.235 - headPivot) + headPivot;
  eyeWL = headRot*(cL + gazeL*.235 - headPivot) + headPivot;
}

vec4 render(vec2 fc){
  vec2 uv = (fc - .5*uRes)/uRes.y;
  vec3 ro = camPos;
  camMat = camLook(ro, camTar, camRoll);
  vec3 rd = camMat*normalize(vec3(uv, camFl));
  vec3 col = background(rd, uv);
  float tHit = 1e4;
  float tE = 1e4, tM = 1e4, tG = 1e4, tC = 1e4;
#ifdef HAS_EARTH
  { vec2 ie = iSphere(ro, rd, eC, eR); if (ie.x > 0.) tE = ie.x; }
#endif
#ifdef HAS_RED
  { vec2 im = iSphere(ro, rd, mC, mR); if (im.x > 0.) tM = im.x; }
#endif
#ifdef HAS_GROUND
  if (rd.y < 0.) tG = (GROUND_Y - ro.y)/rd.y;
#endif
#ifdef HAS_CLOUDSEA
  tC = marchClouds(ro, rd);
#endif
  float tAn = min(min(tE, tM), min(tG, tC));
  vec2 bh = vec2(1e4, -1.);
#if defined(HAS_HEAD) || BODY > 0 || defined(HAS_ARM_R)
  bh = march(ro, rd, min(tAn, 400.));
#endif
  if (bh.y > 0. && bh.x < tAn) {
    vec3 p = ro + rd*bh.x;
    vec3 n = calcNormal(p);
    col = shadeBaby(p, n, rd, bh.y);
    tHit = bh.x;
#ifdef HAS_CLOUDSEA
    float ch = cloudH(p.xz);
    float mist = ss(ch + 1.0, ch - .05, p.y);
    vec3 mc = mix(vec3(.5,.56,.64), vec3(.95,.93,.9), sat(dot(n, sunDir)*.5+.5));
    col = mix(col, mc, mist*.9);
#endif
#if defined(HAS_CLOUDSEA) || defined(HAS_GROUND)
    col = mix(col, hazeCol, 1. - exp(-tHit*hazeK*.9));
#endif
  } else if (tAn < 1e4) {
    tHit = tAn;
    vec3 p = ro + rd*tAn;
    if (tAn == tE) col = shadeEarth(p, rd);
    else if (tAn == tM) col = shadeRed(p, rd);
#ifdef HAS_CLOUDSEA
    else if (tAn == tC) col = cloudShade(p, rd, tC);
#endif
#ifdef HAS_GROUND
    else if (tAn == tG) {
      vec2 g = p.xz;
      float h = fbm2(g*.6);
      float e = .04;
      vec2 gr = vec2(fbm2((g+vec2(e,0.))*.6) - h, fbm2((g+vec2(0.,e))*.6) - h)/e;
      vec3 n = normalize(vec3(-gr.x*.35, 1., -gr.y*.35));
      float rocks = ss(.62,.7, noise2(g*2.3))*ss(.4,.6,fbm2s(g*.8));
      vec3 alb = mix(vec3(.26,.09,.04), vec3(.45,.2,.1), h)*(1. - .5*rocks);
      float sh = softShadow(p + n*.05, sunDir, 7.);
      vec3 lig = sunCol*sat(dot(n,sunDir))*sh + fillCol*(.6+.4*n.y) + ptLight(p, n, tipPos, tipCol*tipGlow*.6, 1.);
      lig += ptLight(p, n, xlPos, xlCol, xlRange);
      col = alb*lig;
      col = mix(col, hazeCol, 1. - exp(-tG*hazeK));
    }
#endif
  }
#ifdef HAS_EARTH
  {
    vec3 acol = mix(vec3(.25,.5,1.), vec3(1.,.3,.08), sat(eBurn*.8))*(.45 + eShockI*2.);
    col += atmoHalo(ro, rd, tHit, eC, eR, acol, eSun, .045);
  }
#endif
#ifdef HAS_RED
  col += atmoHalo(ro, rd, tHit, mC, mR, vec3(1.,.3,.1)*.22, mSun, .035);
#endif
  // halos volumétricos de los ojos y del dedo
#ifdef HAS_HEAD
  col += EYE_GLOW*eyeGlow*(glowLine(ro, rd, tHit, eyeWL, eyeHalo) + glowLine(ro, rd, tHit, eyeWR, eyeHalo));
#endif
  if (tipGlow > 0.) col += tipCol*tipGlow*glowLine(ro, rd, tHit, tipPos, .008);
  float coc = min(aperture*abs(1. - focusDist/tHit), 14.);
  return vec4(max(col, vec3(0.)), coc);
}
`;

/* ------------------------------------------------------------------------ */
/*  Planos                                                                    */
/* ------------------------------------------------------------------------ */
const SHOTS = {};

// 0 · Ojos que se abren en la oscuridad (título) — también el epílogo (uV=1)
SHOTS.EYES = {
  defs: ['HAS_HEAD', 'BG_DARK'],
  setup: `
void setup(){
  float t = uT;
  bool rep = uV > .5;
  float k = t/uDur;
  float dist = rep ? mix(3.3, 2.75, k) : mix(4.7, 3.9, k);
  camPos = vec3(.03, -.06, dist); camTar = vec3(0., -.12, 0.); camFl = 2.1;
  float open = rep ? ease((t - .5)/1.3) : ease((t - 1.2)/.8);
  lidUp = mix(-.07, .06, open); lidLo = mix(-.06, -.12, open);
  eyeGlow = open*(1. + .12*sin(t*9.)) + .06*ss(.2, 1., t);
  gazeTarget = camPos;
  headRot = rotX(.05)*rotY(-.05)*rotZ(rep ? .12 : .0);
  fillCol = vec3(.006,.009,.015);
  eyeLight = 2.2; eyeHalo = .0012;
  rimDir = normalize(vec3(-.5,.6,-1.)); rimCol = vec3(.05,.08,.13);
  nebula = .6; nebCol = vec3(.03,.008,.006);
  focusDist = dist; aperture = 0.;
}`
};

// 1 · La Tierra desde el espacio
SHOTS.EARTH = {
  defs: ['HAS_EARTH', 'BG_SPACE'],
  setup: `
void setup(){
  float t = uT;
  float a = .25 + t*.028;
  camPos = vec3(sin(a)*5.4, .45, cos(a)*5.4); camTar = vec3(.45, .3, 0.); camFl = 1.9;
  eC = vec3(0.); eR = 1.;
  eRot = rotY(t*.05 + 2.3)*rotX(.35);
  eSun = normalize(vec3(-1., .3, .35));
  eCity = 1.3;
  bgEyes = ss(3.4, 5.6, t);
  nebula = 1.;
  focusDist = 3.2; aperture = 0.;
}`
};

// 2 · Sentado sobre el mar de nubes
SHOTS.CLOUDS = {
  defs: ['HAS_HEAD', 'BODY 1', 'HAS_ARM_R', 'HAS_ARM_L', 'BG_SKY', 'HAS_CLOUDSEA'],
  setup: `
void setup(){
  float t = uT;
  CLOUD_Y = -3.3;
  camPos = vec3(5. - t*.22, .9 + t*.02, 15.5 - t*.3); camTar = vec3(-.4, -.95, 0.); camFl = 2.05;
  headRot = rotY(.2 + .05*sin(t*.5))*rotX(-.04)*rotZ(.07);
  gazeTarget = camPos;
  sunDir = normalize(vec3(-.8,.38,.2)); sunCol = vec3(1.,.9,.75)*1.5;
  fillCol = vec3(.22,.28,.36)*.7;
  rimDir = sunDir; rimCol = vec3(.9,.85,.8)*.35;
  hazeCol = vec3(.5,.56,.61); hazeK = .016;
  vec3 tip = vec3(-1.3, .2 + .04*sin(t*1.2), 1.25);
  hRotR = handBasis(normalize(vec3(.06,1.,.1)), normalize(vec3(.35,-.05,1.)));
  wrR = tip - hRotR*tipLocal();
  elR = ik(shR, wrR, 1.1, .95, vec3(-1.,-.8,-.2));
  wrL = vec3(1.3,-3.,1.); hRotL = handBasis(vec3(.1,-1.,.35), vec3(-1.,0.,0.)); pointL = .2;
  elL = ik(shL, wrL, 1.1, .95, vec3(1.,-.2,-1.));
  tipPos = tip + hRotR[1]*.02; tipGlow = .9 + .35*sin(t*3.1);
  boundC = vec3(0.,-1.8,.6); boundR = 3.6;
  eyeGlow = 1.;
  focusDist = length(camPos); aperture = 0.;
}`
};

// 3 · Primer plano de la cara, la Tierra abajo
SHOTS.FACE = {
  defs: ['HAS_HEAD', 'BODY 1', 'HAS_EARTH', 'BG_SPACE'],
  setup: `
void setup(){
  float t = uT;
  float k = ease(t/uDur);
  camPos = mix(vec3(1.95,-.5,5.), vec3(1.5,-.42,4.1), k); camTar = vec3(.12,-.55,.35); camFl = 2.2;
  eC = vec3(.3,-1.72,1.62); eR = .68;
  eRot = rotY(t*.07 + 1.)*rotX(.4);
  eSun = normalize(vec3(-.6,.7,.3));
  eBurn = 1.; eBurnDir = normalize(vec3(.2,1.,.3)); eBurnR = .9; eCity = 1.5;
  headRot = rotX(.2 - .06*k)*rotY(.14);
  float blink = ss(3.55,3.7,t)*(1.-ss(3.85,4.05,t));
  lidUp = mix(.06, -.07, blink); lidLo = mix(-.12, -.06, blink);
  gazeTarget = mix(eC + vec3(0.,.6,0.), camPos, ss(1.2, 1.7, t));
  eyeGlow = 1.1;
  sunDir = normalize(vec3(-.8,.9,.5)); sunCol = vec3(.5,.62,.8)*.95;
  fillCol = vec3(.03,.045,.07);
  rimDir = normalize(vec3(-.3,.3,-1.)); rimCol = vec3(.25,.4,.6)*.6;
  xlPos = eC + vec3(0.,.3,0.); xlCol = vec3(1.,.3,.12)*.8; xlRange = .9;
  nebula = 1.4; nebCol = vec3(.06,.015,.01);
  boundC = vec3(0.,-1.1,.1); boundR = 2.4;
  focusDist = length(camPos - vec3(0.,-.05,.6)); aperture = 9.;
}`
};

// 4 · El toque: el dedo baja sobre la Tierra
SHOTS.TOUCH = {
  defs: ['HAS_HEAD', 'BODY 1', 'HAS_ARM_R', 'HAS_EARTH', 'BG_SPACE'],
  setup: `
void setup(){
  float t = uT;
  float T0 = 4.;
  float after = max(t - T0, 0.);
  eC = vec3(.1,-3.45,1.35); eR = 2.1;
  eRot = rotX(.45)*rotY(1.9);
  eSun = normalize(vec3(-1.,.45,-.25));
  vec3 n0 = normalize(vec3(-.36,.82,.45));
  vec3 contact = eC + n0*eR;
  vec3 fd = normalize(vec3(.17,-.88,.44));
  float appr = 1.25*(1. - easeOut(t/T0)) - .015*ss(T0, T0+.3, t);
  vec3 tip = contact - fd*appr;
  hRotR = handBasis(fd, normalize(vec3(-.9,-.1,-.3)));
  pointR = 1.;
  wrR = tip - hRotR*tipLocal();
  elR = ik(shR, wrR, 1.1, .95, vec3(-1.,-.2,-.6));
  tipPos = tip - fd*.03;
  tipGlow = mix(.4, 2.6, easeIn(t/T0)) * (t < T0 ? 1. : .55 + .45*exp(-after*2.));
  eBurnDir = n0*eRot;
  eBurn = ss(T0, T0+.15, t);
  eBurnR = .04 + after*.3;
  eShock = after*1.25; eShockI = t > T0 ? exp(-after*1.4) : 0.;
  eCity = 1.2;
  // cámara
  float k = t/uDur;
  camPos = mix(vec3(-.55,.75,8.4), vec3(-.4,.45,7.1), ease(k));
  camTar = vec3(-.25,-1.15,1.2); camFl = 1.9;
  float sk = .07*exp(-after*3.)*step(T0, t);
  camPos += sk*vec3(noise2(vec2(t*40.,1.))-.5, noise2(vec2(t*40.,7.))-.5, 0.);
  camRoll = sk*(noise2(vec2(t*30.,3.))-.5)*.5;
  // cabeza: mira el punto de contacto y ladea la cabeza tras el impacto
  headRot = rotX(.33)*rotY(-.08)*rotZ(-.18*ss(T0+.8, T0+4., t));
  float look = ss(T0+.6, T0+1.3, t);
  gazeTarget = mix(contact, camPos, look);
  lidUp = mix(.0, .07, look); lidLo = mix(-.17, -.12, look);
  eyeGlow = 1. + .6*ss(T0, T0+1., t);
  sunDir = normalize(vec3(-.6,.9,.6)); sunCol = vec3(.5,.6,.75)*.6;
  fillCol = vec3(.02,.03,.045);
  rimDir = normalize(vec3(.4,.4,-1.)); rimCol = vec3(.3,.45,.65)*.45;
  xlPos = contact + n0*.4; xlCol = vec3(1.,.28,.08)*(.4 + 3.*eBurn*(.5+.5*exp(-after*.8))); xlRange = 1.6;
  boundC = vec3(-.4,-1.6,.8); boundR = 3.4;
  nebula = 1.; nebCol = vec3(.045,.012,.01);
  focusDist = length(camPos - contact); aperture = 6.;
}`
};

// 5 · La Tierra como un juguete sobre la punta del dedo
SHOTS.TOY = {
  defs: ['HAS_HEAD', 'BODY 1', 'HAS_ARM_R', 'HAS_EARTH', 'HAS_RED', 'BG_SPACE'],
  setup: `
void setup(){
  float t = uT;
  float k = ease(t/uDur);
  camPos = mix(vec3(-3.9,-.2,2.8), vec3(-3.35,-.12,3.15), k); camTar = vec3(-.45,.02,.85); camFl = 2.0;
  eR = .3;
  vec3 tip = vec3(-.66, .08 + .03*sin(t*1.7), 1.5);
  eC = tip + vec3(0., eR + .015, 0.);
  eRot = rotY(t*1.6)*rotX(.4);
  eSun = normalize(vec3(-.6,.5,.6));
  eBurn = 1.; eBurnR = 3.3; eBurnDir = vec3(0.,1.,0.); eCity = 1.5;
  hRotR = handBasis(vec3(.02,1.,-.05), normalize(vec3(-.7,0.,.7)));
  wrR = tip - hRotR*tipLocal();
  elR = ik(shR, wrR, 1.1, .95, vec3(-.6,-1.,-.3));
  tipPos = tip; tipGlow = .6;
  headRot = rotY(-.28)*rotX(-.16)*rotZ(-.06);
  gazeTarget = eC;
  eyeGlow = 1.1;
  sunDir = normalize(vec3(-.7,.5,.5)); sunCol = vec3(.4,.52,.7)*.6;
  fillCol = vec3(.02,.028,.04);
  rimDir = normalize(vec3(1.,.3,-.5)); rimCol = vec3(1.,.35,.15)*.55;
  xlPos = eC; xlCol = vec3(1.,.32,.1)*2.4; xlRange = .75;
  vec3 f = normalize(camTar - camPos); vec3 r = normalize(cross(f, vec3(0.,1.,0.)));
  mC = camPos + f*60. + r*13. + vec3(0.,5.,0.); mR = 16.; mRot = rotY(t*.02); mSun = normalize(-r + vec3(0.,.3,0.));
  boundC = vec3(-.3,-1.,.5); boundR = 2.9;
  nebula = 1.; nebCol = vec3(.04,.012,.01);
  focusDist = length(camPos - vec3(-.2,-.05,.6)); aperture = 7.;
}`
};

// 6 · En pie sobre Marte, un planeta rojo enorme detrás
SHOTS.MARS = {
  defs: ['HAS_HEAD', 'BODY 2', 'HAS_ARM_R', 'HAS_ARM_L', 'HAS_RED', 'HAS_GROUND', 'BG_MARS'],
  setup: `
void setup(){
  float t = uT;
  GROUND_Y = -5.68;
  camPos = vec3(3.1 - t*.14, -4.75 + t*.03, 16.8 - t*.35); camTar = vec3(0.,-1.9,0.); camFl = 1.75;
  headRot = rotX(.06)*rotY(.12);
  gazeTarget = camPos;
  eyeGlow = 1.2;
  sunDir = normalize(vec3(-.3,.33,-1.)); sunCol = vec3(1.,.45,.25)*1.1;
  fillCol = vec3(.06,.035,.035);
  rimDir = sunDir; rimCol = vec3(1.,.4,.2)*.8;
  hazeCol = vec3(.28,.1,.05); hazeK = .018;
  wrR = vec3(-1.2,-3.45,.45); hRotR = handBasis(vec3(-.05,-1.,.35), vec3(1.,0.,.2)); pointR = 1.;
  elR = ik(shR, wrR, 1.1, .95, vec3(-.4,0.,-1.));
  wrL = vec3(1.25,-3.5,.3); hRotL = handBasis(vec3(.05,-1.,.2), vec3(-1.,0.,.2)); pointL = .15;
  elL = ik(shL, wrL, 1.1, .95, vec3(.4,0.,-1.));
  tipPos = wrR + hRotR*tipLocal(); tipGlow = .8 + .25*sin(t*2.3);
  mC = vec3(-16., 24., -100.); mR = 30.; mRot = rotY(t*.01 + .5)*rotX(.3); mSun = normalize(vec3(-.95,.25,.3));
  boundC = vec3(0.,-2.4,.2); boundR = 3.9;
  focusDist = length(camPos); aperture = 0.;
}`
};

// 7 · Primerísimo plano del ojo, la Tierra reflejada
SHOTS.EYE = {
  defs: ['HAS_HEAD', 'BG_DARK'],
  setup: `
void setup(){
  float t = uT;
  float k = ease(t/uDur);
  vec3 ec = vec3(-EYE_C.x, EYE_C.y, EYE_C.z);
  vec3 dir = normalize(vec3(-.12,.06,1.));
  camPos = ec + dir*mix(1.2, .78, k); camTar = ec + vec3(0.,.005,0.); camFl = 2.;
  gazeTarget = camPos;
  pupil = mix(.95, .15, ss(1.2, 2.6, t));
  eyeGlow = 1.15 + .9*ss(3.8, 5., t);
  lidUp = .075; lidLo = -.125;
  fillCol = vec3(.01,.012,.018);
  sunDir = normalize(vec3(-.4,.8,.6)); sunCol = vec3(.4,.5,.65)*.35;
  rimCol = vec3(.1,.15,.22); rimDir = normalize(vec3(.5,.4,-1.));
  eRot = rotY(t*.2)*rotX(.4); eSun = normalize(vec3(-1.,.3,.3));
  eBurn = 1.; eBurnR = 1.2; eBurnDir = normalize(vec3(0.,1.,.3)); eCity = 1.5;
  reflC = normalize(vec3(-.35,.25,1.))*9.; reflR = 3.2; reflAmt = 9.;
  nebula = .8; nebCol = vec3(.04,.01,.008);
  focusDist = length(camPos - (ec + vec3(0.,0.,EYE_R))); aperture = 10.;
}`
};

// Plano de prueba: luz neutra, cámara orbitando (uV = ángulo), uT = brillo de ojos
SHOTS.HEADTEST = {
  defs: ['HAS_HEAD', 'BG_DARK'],
  setup: `
void setup(){
  float a = uV;
  camPos = vec3(sin(a)*4.2, -.1, cos(a)*4.2); camTar = vec3(0.,-.15,0.); camFl = 2.3;
  gazeTarget = camPos;
  sunDir = normalize(vec3(-.5,.6,.7)); sunCol = vec3(1.,.97,.92)*1.2;
  fillCol = vec3(.25,.3,.38)*.5; rimCol = vec3(.4,.5,.6)*.4; rimDir = normalize(vec3(.5,.3,-1.));
  eyeGlow = uT; nebula = 0.;
}`
};

function sceneSource(name) {
  const s = SHOTS[name];
  const defs = s.defs.map(d => '#define ' + d).join('\n');
  return '#version 300 es\n' + defs + '\n' + COMMON + '\n' + s.setup +
    '\nvoid main(){ setup(); finishSetup(); outCol = render(gl_FragCoord.xy); }\n';
}

/* ------------------------------------------------------------------------ */
/*  Post-proceso                                                              */
/* ------------------------------------------------------------------------ */
const DOF = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel;
in vec2 vUv; out vec4 outCol;
void main(){
  vec4 c = texture(uTex, vUv);
  float r = c.a;
  if (r < .6) { outCol = vec4(c.rgb, 1.); return; }
  vec3 acc = c.rgb; float w = 1.;
  for (int i=0;i<40;i++){
    float fi = float(i) + .5;
    float rr = sqrt(fi/40.)*r;
    float an = fi*2.39996;
    vec4 s = texture(uTex, vUv + vec2(cos(an), sin(an))*rr*uTexel);
    float ww = smoothstep(rr - 1.5, rr, s.a + .5);
    float l = dot(s.rgb, vec3(.3,.5,.2));
    ww *= 1. + 2.*smoothstep(1., 4., l);
    acc += s.rgb*ww; w += ww;
  }
  outCol = vec4(acc/w, 1.);
}`;

const BRIGHT = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr;
in vec2 vUv; out vec4 outCol;
void main(){
  vec3 c = texture(uTex, vUv + uTexel*vec2(-.5,-.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,-.5)).rgb
         + texture(uTex, vUv + uTexel*vec2(-.5,.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,.5)).rgb;
  c *= .25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThr, uThr*2.5, l);
  outCol = vec4(c*k, 1.);
}`;

const BLUR = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uDir;
in vec2 vUv; out vec4 outCol;
void main(){
  const float W[5] = float[5](.227027, .1945946, .1216216, .054054, .016216);
  vec3 c = texture(uTex, vUv).rgb*W[0];
  for (int i=1;i<5;i++){
    vec2 o = uDir*float(i)*1.3846;
    c += (texture(uTex, vUv + o).rgb + texture(uTex, vUv - o).rgb)*W[i];
  }
  outCol = vec4(c, 1.);
}`;

const COPY = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uTexel;
in vec2 vUv; out vec4 outCol;
void main(){
  vec3 c = texture(uTex, vUv + uTexel*vec2(-.5,-.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,-.5)).rgb
         + texture(uTex, vUv + uTexel*vec2(-.5,.5)).rgb + texture(uTex, vUv + uTexel*vec2(.5,.5)).rgb;
  outCol = vec4(c*.25, 1.);
}`;

// Composición final: halación, gradación de color, grano, polvo, rayas, gate weave…
const FINAL = `#version 300 es
precision highp float;
uniform sampler2D uScene, uB1, uB2, uB3, uOverlay;
uniform vec2 uRes;
uniform float uFrame, uFlash, uFade, uRoll, uBurn, uHasScene, uExposure, uBloom, uShakeImg, uOvShake;
in vec2 vUv; out vec4 outCol;

float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 h22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float n2(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x), f.y); }
float n1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(h11(i), h11(i+1.), f); }

vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }

void main(){
  vec2 uv = vUv;
  float fr = uFrame;
  float asp = uRes.x/uRes.y;
  // gate weave + saltos ocasionales
  vec2 weave = vec2(n1(fr*.31) - .5, n1(fr*.23 + 17.) - .5)*vec2(.0022, .0035);
  weave.y += (h11(fr*1.7) > .985 ? (h11(fr*3.1) - .5)*.02 : 0.);
  weave += uShakeImg*(vec2(h11(fr*5.3), h11(fr*7.9)) - .5)*.03;
  vec2 suv = uv + weave;
  // la línea de fotograma se desliza (empalme mal hecho)
  suv.y += uRoll;
  float frameLine = 0.;
  if (suv.y > 1.) { suv.y -= 1.; }
  float fl = min(abs(suv.y - 1.), suv.y);
  if (uRoll > 0.) frameLine = smoothstep(.035, .02, fl);
  // barril suave
  vec2 cc = suv - .5;
  vec2 duv = .5 + cc*(1. - .025*dot(cc,cc));
  vec3 col = vec3(0.);
  if (uHasScene > .5) {
    float ca = .0016;
    col.r = texture(uScene, .5 + (duv-.5)*(1. + ca)).r;
    col.g = texture(uScene, duv).g;
    col.b = texture(uScene, .5 + (duv-.5)*(1. - ca)).b;
    vec3 bl = texture(uB1, duv).rgb*.35 + texture(uB2, duv).rgb*.5 + texture(uB3, duv).rgb*.65;
    col += bl*vec3(1.,.62,.5)*uBloom;
    // parpadeo de exposición
    col *= uExposure*(1. + (h11(fr*.917) - .5)*.07 + (n1(fr*.1) - .5)*.05);
    // hot-spot del proyector
    col *= 1.08 - .25*dot(cc*vec2(asp,1.), cc*vec2(asp,1.));
    col = aces(col*1.05);
    // gradación: sombras cian, altas luces cálidas, negros levantados
    float l = dot(col, vec3(.299,.587,.114));
    col = mix(vec3(l), col, .88);
    col += vec3(-.02,.035,.06)*(1.-l)*(1.-l)*.9;
    col += vec3(.05,.01,-.035)*l*l;
    col = col*.9 + vec3(.03,.036,.04);
  }
  // overlay (títulos, subtítulos, cuenta atrás) — también baila con el gate weave
  vec2 ouv = uv + weave*(1. + uOvShake);
  ouv.y += uRoll; if (ouv.y > 1.) ouv.y -= 1.;
  vec4 ov = texture(uOverlay, ouv);
  col = mix(col, ov.rgb, ov.a);
  col = mix(col, vec3(0.), frameLine);

  // ---- defectos de la película ----
  vec2 px = uv*uRes;
  // polvo y pelusas
  for (int i=0;i<12;i++){
    float fi = float(i);
    vec2 hp = h22(vec2(fr*1.37 + fi*7.1, fi*3.3 + fr*.71));
    float live = step(.55, h21(vec2(fr, fi*1.7)));
    vec2 p = hp*vec2(asp, 1.);
    vec2 q = uv*vec2(asp, 1.) - p;
    float sz = mix(.0012, .0065, pow(h21(vec2(fi, fr*.37)), 3.));
    float d = length(q*(1. + .5*vec2(n2(q*900.+fi), n2(q*900.-fi))));
    float m = smoothstep(sz, sz*.4, d)*live;
    if (h21(vec2(fi*9.1, fr)) > .7) col += vec3(.9,.88,.8)*m*.9;
    else col *= 1. - .85*m;
  }
  // pelo en la ventanilla
  if (h11(fr*.53) > .93) {
    vec2 o = h22(vec2(fr*.1, 3.3))*vec2(asp,1.);
    vec2 q = uv*vec2(asp,1.) - o;
    float a = h11(fr*.77)*6.28;
    q = mat2(cos(a),sin(a),-sin(a),cos(a))*q;
    float curve = q.y - .6*q.x*q.x*(h11(fr*.2)*2.-1.)*8. - .02*sin(q.x*40.);
    float hair = smoothstep(.0016,.0004, abs(curve))*smoothstep(.12,.1,abs(q.x));
    col *= 1. - .8*hair;
  }
  // rayas verticales persistentes
  for (int i=0;i<3;i++){
    float fi = float(i);
    float seg = floor(fr/(18. + fi*7.));
    float on = step(.78, h11(seg*3.7 + fi*11.));
    float x = h11(seg*1.3 + fi*5.) + (n1(fr*.07 + fi*9.) - .5)*.01;
    float w = .0007 + .0006*h11(seg + fi);
    float s = smoothstep(w, 0., abs(uv.x - x))*on*(.5 + .5*h11(fr + fi*3.));
    s *= .6 + .4*n2(vec2(uv.y*30., fr));
    col = mix(col, vec3(.9,.92,.85), s*.3);
  }
  // manchas grandes ocasionales
  if (h11(fr*1.13) > .97) {
    vec2 o = h22(vec2(fr, 9.))*vec2(asp,1.);
    float d = length(uv*vec2(asp,1.) - o);
    col *= 1. - .35*smoothstep(.08, .0, d + .03*n2(uv*40.));
  }
  // grano (más fuerte en los medios tonos)
  float l2 = dot(col, vec3(.299,.587,.114));
  vec2 gp = px/1.35 + vec2(h11(fr)*513., h11(fr+.5)*217.);
  float g = n2(gp) + n2(gp*1.9 + 7.) - 1.;
  vec3 gc = vec3(g, n2(gp + 31.) + n2(gp*1.9 + 41.) - 1., n2(gp + 71.) + n2(gp*1.9 + 91.) - 1.);
  gc = mix(vec3(g), gc, .35);
  col += gc*(.075 + .11*l2*(1.-l2)*4.)*.85;
  // viñeta y ventanilla redondeada
  vec2 v = (uv - .5)*vec2(asp, 1.);
  col *= 1. - .55*pow(length(v*vec2(.78, 1.)), 2.4);
  vec2 hq = abs(uv - .5)*vec2(asp, 1.);
  float rad = .07;
  vec2 cq = max(hq - (vec2(asp*.5, .5) - rad - .004), 0.);
  float gate = smoothstep(rad, rad - .012, length(cq));
  col *= gate;
  // flash de empalme / impacto
  col = mix(col, vec3(1.,.96,.88), uFlash);
  // película que se quema al final
  if (uBurn > 0.) {
    vec2 bc = (uv - vec2(.62,.45))*vec2(asp,1.);
    float r = length(bc) + (n2(bc*6. + fr*.05) - .5)*.25 + (n2(bc*25.) - .5)*.05;
    float R = uBurn*1.4;
    float inside = smoothstep(R, R - .02, r);
    float rim = smoothstep(R + .08, R, r)*(1. - inside);
    col = mix(col, col*vec3(.9,.55,.3), smoothstep(R + .25, R, r));
    col = mix(col, vec3(1.,.55,.15)*1.3, rim);
    col = mix(col, vec3(1.,.97,.9), inside);
  }
  col *= uFade;
  outCol = vec4(clamp(col, 0., 1.), 1.);
}`;

return { VERT, sceneSource, SHOTS, DOF, BRIGHT, BLUR, COPY, FINAL };
})();
