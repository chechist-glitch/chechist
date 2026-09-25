/* ==========================================================================
   蒼キ嬰児 — shaders
   3D con cel shading (dos tonos, luz de borde, línea de terminador) sobre
   SDF + raymarching. La escena escribe color y normal+profundidad (MRT); los
   contornos a tinta, las explosiones, las partículas y la composición de
   anime (resplandor, rayos, líneas de velocidad, impact frames) van en post.
   ========================================================================== */
window.AE_SHADERS = (function () {

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
uniform float uT, uG;
uniform vec3  uCamPos, uCamTar;
uniform float uCamFl, uCamRoll;
uniform vec3  uBPos; uniform mat3 uBRot; uniform float uBScale;
uniform mat3  uHeadRot;
uniform vec4  uFace;                 // párpado sup., párpado inf., sonrisa, ancho de pupila
uniform vec3  uGaze; uniform float uEyeGlow;
uniform vec3  uArmR[3]; uniform mat3 uHandR;
uniform vec3  uArmL[3]; uniform mat3 uHandL;
uniform vec2  uPoint;
uniform vec4  uTip;                  // punta del dedo (mundo) + brillo
uniform vec3  uKeyDir, uKeyCol, uShadowCol, uRimDir, uRimCol, uTermCol;
uniform float uRimW;
uniform vec3  uFogCol, uZenith, uHaze; uniform float uFogK;
uniform vec3  uMoonDir, uMoonCol; uniform float uMoonR;
uniform float uFlashL;               // relámpago
uniform vec4  uXL[4];                // luces puntuales (explosiones)
uniform vec4  uDome;                 // cúpula: centro + radio
uniform vec4  uFx;                   // cúpula, radio del anillo, intensidad del anillo, pilar
uniform vec4  uDestroy;              // centro xz, radio, cantidad
uniform float uWet, uEyeLight;
uniform vec3  uFillDir, uFillCol;
uniform vec4  uCityBox;
uniform vec4  uEarth;                // radio de grietas, radio de la onda, intensidad onda, -
layout(location=0) out vec4 outCol;
layout(location=1) out vec4 outND;

#ifndef BODY
#define BODY 0
#endif
#define PI  3.14159265
#define TAU 6.28318531

float sat(float x){ return clamp(x,0.,1.); }
vec3  sat3(vec3 x){ return clamp(x,0.,1.); }
float ss(float a,float b,float x){ return smoothstep(a,b,x); }

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
float crackNoise(vec3 x){
  vec3 p=floor(x), f=fract(x); float d1=10., d2=10.;
  for(int k=-1;k<=1;k++) for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec3 b=vec3(float(i),float(j),float(k)); vec3 r=b+hash33(p+b)-f; float d=dot(r,r);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }
  }
  return sqrt(d2)-sqrt(d1);
}

float smin(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return min(a,b)-h*h*k*.25; }
float smax(float a,float b,float k){ float h=max(k-abs(a-b),0.)/k; return max(a,b)+h*h*k*.25; }
float sdEll(vec3 p, vec3 r){ float k0=length(p/r); float k1=length(p/(r*r)); return k0*(k0-1.)/max(k1,1e-5); }
float sdCap(vec3 p, vec3 a, vec3 b, float r1, float r2){ vec3 pa=p-a, ba=b-a; float h=sat(dot(pa,ba)/dot(ba,ba)); return length(pa-ba*h)-mix(r1,r2,h); }
float sdTorus(vec3 p, vec2 t){ vec2 q=vec2(length(p.xz)-t.x,p.y); return length(q)-t.y; }
float sdBox(vec3 p, vec3 b){ vec3 q=abs(p)-b; return length(max(q,0.))+min(max(q.x,max(q.y,q.z)),0.); }
vec2 opSU(vec2 a, vec2 b, float k){ return vec2(smin(a.x,b.x,k), a.x<b.x ? a.y : b.y); }
vec2 opU(vec2 a, vec2 b){ return a.x<b.x ? a : b; }
mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }
vec2 iSphere(vec3 ro, vec3 rd, vec3 c, float r){
  vec3 oc=ro-c; float b=dot(oc,rd); float cc=dot(oc,oc)-r*r; float h=b*b-cc;
  if(h<0.) return vec2(-1.); h=sqrt(h); return vec2(-b-h, -b+h);
}
mat3 camLook(vec3 ro, vec3 ta, float roll){
  vec3 f=normalize(ta-ro); vec3 r=normalize(cross(f, vec3(sin(roll),cos(roll),0.))); vec3 u=cross(r,f);
  return mat3(r,u,f);
}

/* ------------------------------------------------------------ el bebé -- */
const vec3 EYE_C = vec3(.30,-.05,.665);
const float EYE_R = .205;
const vec3 HEAD_PIVOT = vec3(0.,-.62,-.1);
const vec3 SKIN = vec3(.2,.3,.62);
const vec3 CLOTH = vec3(.09,.1,.16);
const vec3 EYE_GLOW = vec3(1.,.1,.03);
const mat3 EAR_ROT = mat3(.9394,0.,.3429, 0.,1.,0., -.3429,0.,.9394);
vec3 gazeL = vec3(0.,0.,1.), gazeR = vec3(0.,0.,1.);
vec3 eyeWL = vec3(0.,-1e4,0.), eyeWR = vec3(0.,-1e4,0.);
bool gExact = false;
vec3 gRd = vec3(0.,0.,-1.);

vec2 mapHead(vec3 p){
  float lidUp = uFace.x, lidLo = uFace.y, sm = uFace.z;
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float d = sdEll(p - vec3(0., .14, -.12), vec3(.94, .98, 1.02));
  d = smin(d, sdEll(p - vec3(0., -.30, .16), vec3(.72, .64, .74)), .30);
  d = smin(d, sdEll(q - vec3(.40, -.41 + .03*sm, .50), vec3(.35, .32, .34)), .22);
  d = smin(d, sdEll(p - vec3(0., -.72, .52), vec3(.22, .16, .18)), .16);
  d = smin(d, sdEll(q - vec3(.28, .18, .69), vec3(.26, .11, .14)), .14);
  vec3 ec = q - EYE_C;
  float shell = length(ec) - (EYE_R + .01);
  d = smax(d, -shell, .02);
  float cu = lidUp - 2.6*ec.x*ec.x + ec.z*.1;
  float cl = lidLo + 1.8*ec.x*ec.x + ec.z*.05;
  float up = max(smax(shell, cu - ec.y, .06), -ec.z);
  float lo = max(smax(shell, ec.y - cl, .06), -ec.z);
  d = smin(d, min(up, lo), .03);
  d = smin(d, sdEll(p - vec3(0., -.285, .95), vec3(.105, .08, .085)), .09);
  d = smin(d, sdEll(p - vec3(0., -.15, .875), vec3(.06, .11, .05)), .08);
  d = smin(d, sdEll(q - vec3(.08, -.315, .9), vec3(.055, .045, .055)), .035);
  d = smax(d, -sdEll(q - vec3(.042, -.352, .962), vec3(.02, .012, .024)), .014);
  d = smin(d, sdEll(q - vec3(.03, -.47 + .012*sm, .855), vec3(.1, .042, .065)), .05);
  d = smin(d, sdEll(p - vec3(0., -.55 - .012*sm, .835), vec3(.105, .045, .068)), .05);
  // boca: una ranura que se curva hacia arriba (sonrisa) y se abre
  vec3 mp = p - vec3(0., -.508 + sm*1.5*p.x*p.x + .008*sm, .9);
  float mouth = sdEll(mp, vec3(.1 + .1*sm, .005 + .026*sm*(1. - ss(.0, .2, abs(p.x))), .035 + .035*sm));
  float mat = 1.;
  if (-mouth > d - .004*sm) mat = 4.;
  d = smax(d, -mouth, .02);
  vec3 e = EAR_ROT * (q - vec3(.92, -.10, -.06));
  float ear = sdEll(e, vec3(.085, .22, .15));
  ear = smax(ear, -sdEll(e - vec3(.085, -.01, .015), vec3(.035, .13, .085)), .04);
  d = smin(d, ear, .07);
  float eye = length(ec) - EYE_R;
  return eye < d ? vec2(eye, 2.) : vec2(d, mat);
}

float sdHand(vec3 p, float point){
  float b = length(p - vec3(0.,.4,.05)) - .62;
  if (b > .15) return b;
  float d = sdEll(p - vec3(0.,.19,0.), vec3(.22,.21,.115));
  d = smin(d, sdEll(p - vec3(0.,.02,0.), vec3(.15,.1,.1)), .1);
  d = smin(d, sdEll(p - vec3(.1,.12,.05), vec3(.1,.12,.08)), .06);
  vec3 k  = vec3(.125,.37,0.);
  vec3 m1 = mix(vec3(.13,.47,.10), vec3(.135,.56,.02), point);
  vec3 t1 = mix(vec3(.13,.41,.19), vec3(.14,.76,.04), point);
  d = smin(d, sdCap(p, k, m1, .062, .056), .05);
  d = smin(d, sdCap(p, m1, t1, .056, .048), .02);
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
  vec3 a = vec3(.17,.08,.05), bb = vec3(.23,.22,.13), c = vec3(.15,.32,.2);
  d = smin(d, sdCap(p, a, bb, .07, .06), .06);
  d = smin(d, sdCap(p, bb, c, .06, .05), .02);
  return d;
}
const float HANDS = 1.2;
vec2 mapArm(vec3 p, vec3 sh, vec3 el, vec3 wr, mat3 hr, float point, float side){
  vec3 hc = wr + hr[1]*(.42*HANDS);
  float b = min(sdCap(p, sh, el, .45, .45), min(sdCap(p, el, wr, .4, .4), length(p-hc) - .7*HANDS));
  if (b > .2) return vec2(b, 1.);
  float up = sdCap(p, sh, el, .31, .25);
  float fo = sdCap(p, el, wr, .25, .165);
  vec3 ph = (p - wr)*hr; ph.x *= side;
  float hand = sdHand(ph/HANDS, point)*HANDS;
  float skin = smin(fo, hand, .08);
  float d = smin(up, skin, .1);
  return vec2(d, up < skin - .015 ? 3. : 1.);
}
vec2 mapBody(vec3 p){
  float b = sdCap(p, vec3(0.,-1.,-.1), vec3(0.,-5.,0.), 1.35, 1.1)-.05;
  if (b > .2) return vec2(b, 3.);
  vec3 q = vec3(abs(p.x), p.y, p.z);
  float neck = sdCap(p, vec3(0.,-.55,-.15), vec3(0.,-1.2,-.15), .37, .42);
  float d = sdEll(p - vec3(0.,-1.5,-.15), vec3(1.05,.48,.66));
  d = smin(d, sdEll(p - vec3(0.,-2.05,-.1), vec3(.98,.95,.78)), .3);
  d = smin(d, sdEll(p - vec3(0.,-2.4,.12), vec3(.88,.78,.72)), .3);
  d = smin(d, sdEll(p - vec3(0.,-2.95,-.02), vec3(.95,.58,.8)), .3);
  d = smin(d, sdCap(q, vec3(.45,-3.1,0.), vec3(.48,-4.25,.05), .46, .37), .2);
  d = smin(d, sdCap(q, vec3(.48,-4.25,.05), vec3(.44,-5.3,0.), .35, .27), .12);
  d = smin(d, sdEll(q - vec3(.44,-5.52,.2), vec3(.25,.16,.42)), .1);
  d = smin(d, sdTorus(p - vec3(0.,-1.12,-.13), vec2(.4,.06)), .06);
  float r = smin(neck, d, .15);
  return vec2(r, neck < d ? 1. : 3.);
}
vec2 mapBaby(vec3 p){
  vec2 res = vec2(1e5, 0.);
#ifdef HAS_HEAD
  {
    vec3 ph = (p - HEAD_PIVOT)*uHeadRot + HEAD_PIVOT;
    float b = length(ph - vec3(0.,0.,.02)) - 1.3;
    res = b > .2 ? vec2(b, 1.) : mapHead(ph);
  }
#endif
#if BODY > 0
  res = opSU(res, mapBody(p), .14);
#endif
#ifdef HAS_ARM_R
  res = opSU(res, mapArm(p, uArmR[0], uArmR[1], uArmR[2], uHandR, uPoint.x, 1.), .16);
#endif
#ifdef HAS_ARM_L
  res = opSU(res, mapArm(p, uArmL[0], uArmL[1], uArmL[2], uHandL, uPoint.y, -1.), .16);
#endif
  return res;
}
vec2 mapBabyW(vec3 p){
  vec3 q = ((p - uBPos)*uBRot)/uBScale;
  float b = length(q - vec3(0.,-2.3,.3)) - 4.9;
  if (b > .6) return vec2(b*uBScale, 1.);
  vec2 r = mapBaby(q); r.x *= uBScale; return r;
}

/* ------------------------------------------------------------- ciudad -- */
const float CELL = 1.25;
float cityHeight(vec2 id){
  if (mod(id.x, 5.) == 0. || mod(id.y, 4.) == 0.) return 0.;
  float h = hash21(id*1.37 + 11.);
  float tall = step(.9, hash21(id*.71 + 3.));
  float H = .15 + .6*h*h + tall*(.8 + 1.8*hash21(id + 5.));
#ifdef RUINS
  H *= .25 + .35*hash21(id + 8.);
#endif
  if (uDestroy.w > 0.) {
    float dd = length((id + .5)*CELL - uDestroy.xy);
    H *= mix(1., .04*hash21(id+2.), uDestroy.w*ss(uDestroy.z + .6, uDestroy.z - .6, dd));
  }
  return H;
}
vec2 mapCity(vec3 p){
  float dg = p.y;
  vec2 bq = abs(p.xz - uCityBox.xy) - uCityBox.zw;
  float bout = max(p.y - 3.55, max(bq.x, bq.y));
  if (bout > 0.) {
    // si el rayo ya se aleja de la ciudad no volverá a entrar: la ignoramos
    bool away = !gExact && ((p.y > 3.55 && gRd.y >= 0.) || (bq.x > 0. && (p.x - uCityBox.x)*gRd.x >= 0.) || (bq.y > 0. && (p.z - uCityBox.y)*gRd.z >= 0.));
    float dc = away ? 1e4 : max(bout, .1);
    if (!gExact) return vec2(dc, 5.);
    return dg < dc ? vec2(dg, 6.) : vec2(dc, 5.);
  }
  vec2 id = floor(p.xz/CELL);
  vec2 q = p.xz - (id + .5)*CELL;
  float h = cityHeight(id);
  float db = 1e5;
  if (h > 0.) {
    vec2 hs = CELL*vec2(.3 + .12*hash21(id+5.), .3 + .12*hash21(id+9.));
    db = sdBox(vec3(q.x, p.y - h*.5, q.y), vec3(hs.x, h*.5, hs.y));
#ifdef RUINS
    vec3 nrm = normalize(vec3(hash21(id+1.)-.5, 1.2, hash21(id+4.)-.5));
    db = max(db, dot(vec3(q.x, p.y - h, q.y), nrm));
#endif
  }
  if (!gExact) {
    // salto hasta la pared de la celda en la dirección del rayo (tipo DDA)
    vec2 rdc = gRd.xz + vec2(gRd.x >= 0. ? 1e-5 : -1e-5, gRd.z >= 0. ? 1e-5 : -1e-5);
    vec2 tb = (sign(rdc)*CELL*.5 - q)/rdc;
    float tex = max(min(tb.x, tb.y), 0.) + .03;
    if (gRd.y > 0. && p.y > 3.55) tex = 1e4;
    db = min(db, tex);
  }
  if (!gExact) return vec2(db, 5.);
  return dg < db ? vec2(dg, 6.) : vec2(db, 5.);
}

/* ------------------------------------------------------------ mapa total -- */
#ifdef HORDE
const int NH = 5;
vec4 hordeT(int i){   // posición xz, escala, giro
  if (i == 0) return vec4(-17., -58., 3.4, .35);
  if (i == 1) return vec4( 21., -92., 3.6, -.3);
  if (i == 2) return vec4(-62., -150., 3.9, .6);
  if (i == 3) return vec4( 70., -185., 4.2, -.5);
  return vec4(4., -260., 4.6, .05);
}
vec4 HD[NH]; mat3 HRi[NH];
void hordeSetup(){ for (int i=0;i<NH;i++){ HD[i] = hordeT(i); HRi[i] = rotY(-HD[i].w); } }
vec2 mapHorde(vec3 p){
  vec2 res = vec2(1e5, 0.);
  for (int i=0;i<NH;i++){
    vec4 h = HD[i];
    vec3 bp = vec3(h.x, 5.62*h.z, h.y);
    vec3 dp = p - bp;
    if (length(dp - vec3(0.,-2.3*h.z,0.)) - 5.6*h.z > 1.) { res = opU(res, vec2(length(dp - vec3(0.,-2.3*h.z,0.)) - 5.6*h.z, 1.)); continue; }
    vec3 q = (HRi[i]*dp)/h.z;
    float b = length(q - vec3(0.,-2.3,.3)) - 4.9;
    vec2 r = b > .6 ? vec2(b, 1.) : mapBaby(q);
    r.x *= h.z;
    res = opU(res, r);
  }
  return res;
}
#endif
vec2 map(vec3 p){
  vec2 res = vec2(1e5, 0.);
#if defined(HAS_HEAD) || BODY > 0 || defined(HAS_ARM_R)
#ifndef HORDE
  res = mapBabyW(p);
#endif
#endif
#ifdef HORDE
  res = opU(res, mapHorde(p));
#endif
#ifdef HAS_CITY
  res = opU(res, mapCity(p));
#endif
  return res;
}
vec2 march(vec3 ro, vec3 rd, float tmax){
  gRd = rd;
  float t = .02;
  for (int i=0;i<260;i++){
    vec2 h = map(ro + rd*t);
    if (h.x < .00025*t + .0004) return vec2(t, h.y);
    t += h.x*.92;
    if (t > tmax) break;
  }
  return vec2(1e4, -1.);
}
vec3 calcNormal(vec3 p, float t){
  gExact = true;
  vec2 k = vec2(1.,-1.); float e = .0006*t + .0008;
  vec3 n = normalize(k.xyy*map(p+k.xyy*e).x + k.yyx*map(p+k.yyx*e).x + k.yxy*map(p+k.yxy*e).x + k.xxx*map(p+k.xxx*e).x);
  gExact = false;
  return n;
}
float calcAO(vec3 p, vec3 n, float s){
  gExact = true;
  float occ=0., sca=1.;
  for(int i=0;i<5;i++){ float h=(.02+.17*float(i)/4.)*s; float d=map(p+n*h).x; occ+=(h-d)*sca/s; sca*=.85; }
  gExact = false;
  return sat(1.-2.2*occ);
}
float softShadow(vec3 ro, vec3 rd, float k, float s){
  float res=1., t=.03*s;
  for(int i=0;i<40;i++){
    float h=map(ro+rd*t).x; res=min(res, k*h/t); t+=clamp(h,.03*s,.6*s);
    if(res<.002||t>14.*s) break;
  }
  return sat(res);
}
float glowLine(vec3 ro, vec3 rd, float tmax, vec3 lp, float k){
  vec3 oc = lp-ro; float h = dot(oc,rd); float b = sqrt(max(dot(oc,oc)-h*h, 1e-5));
  b = max(b, .002);
  return k*(atan(tmax-h, b) - atan(-h, b))/b;
}
float bandPt(vec3 p, vec3 n, vec3 lp, float r){
  vec3 l = lp - p; float d2 = dot(l,l); l *= inversesqrt(d2);
  float a = sat(dot(n,l)*.7 + .3)/(1. + d2/(r*r));
  return ss(.12,.16,a)*.35 + ss(.35,.4,a)*.35 + ss(.7,.75,a)*.5;
}

/* ------------------------------------------------------------- fondos -- */
vec3 stars(vec3 rd){
  vec3 p = rd*110.; vec3 id = floor(p); vec3 f = fract(p) - .5;
  vec3 h = hash33(id);
  if (h.x < .93) return vec3(0.);
  return vec3(.9,.8,.8)*h.y*ss(.12,.0,length(f - (h - .5)*.6))*1.5;
}
vec3 skyline(vec3 rd, vec3 col, vec3 bcol, float ruins){
  float az = atan(rd.x, -rd.z), el = rd.y;
  for (int l=1;l>=0;l--){
    float fl = float(l);
    float sc = 70. + fl*60.;
    float x = az*sc;
    float cell = floor(x);
    float h = hash11(cell*1.31 + fl*7.);
    float H = (.006 + .03*h*h + step(.92, hash11(cell*.71 + fl*3.))*.035)*(1. - fl*.4);
    if (ruins > .5) H *= .45 + .55*abs(fract(x*1.7 + h) - .5)*2.;
    if (el < H) {
      col = bcol*(1. + fl*.8);
      vec2 w = vec2(x*6., el*520.);
      float win = step(.78, hash21(floor(w) + fl*13.))*step(.3, fract(w.x))*step(.35, fract(w.y));
      col += mix(vec3(1.,.7,.35), vec3(.6,.75,1.), step(.6, hash21(floor(w)*1.3)))*win*(.35 - ruins*.25)*(1. - fl*.5);
      if (ruins > .5) col += vec3(1.,.3,.05)*ss(.012, .0, el)*(.6 + .4*noise2(vec2(x*.5, uG*2.)));
    }
  }
  return col;
}
vec3 skyNight(vec3 rd){
  float y = rd.y;
  vec3 col = mix(uFogCol, uZenith, ss(-.05, .55, y));
  col += stars(rd)*ss(.08, .35, y);
  float mc = clamp(dot(rd, uMoonDir), -1., 1.);
  float md = acos(mc);
  col += uMoonCol*(.3*exp(-max(md - uMoonR, 0.)*14.) + .03*exp(-md*2.));
  if (md < uMoonR) {
    vec3 tx = normalize(cross(uMoonDir, vec3(0.,1.,0.))); vec3 ty = cross(tx, uMoonDir);
    vec2 mp = vec2(dot(rd, tx), dot(rd, ty))/sin(uMoonR);
    float cr = fbm2(mp*2.1 + 3.), cr2 = noise2(mp*6.5 + 1.);
    vec3 mcol = uMoonCol*1.15;
    mcol *= mix(1., .7, ss(.53, .55, cr));
    mcol *= mix(1., .85, ss(.62, .64, cr2));
    mcol *= mix(1., .78, ss(.8, .82, length(mp)));
    col = mcol;
  }
#ifdef HAS_CLOUDS
  if (y > -.03) {
    float az = atan(rd.x, -rd.z);
    float maz = atan(uMoonDir.x, -uMoonDir.z);
    vec2 cp = vec2(az*2.4, y*11.) + vec2(uG*.015, 0.);
    float dens = ss(.6, .05, y);
    float c = fbm2(cp*vec2(1., 1.6) + 7.);
    float th = .62 - .25*dens;
    float mask = ss(th, th + .01, c);
    vec2 toMoon = normalize(vec2(maz*2.4, uMoonDir.y*11.) - cp + 1e-4);
    float c2 = fbm2((cp + toMoon*.018)*vec2(1., 1.6) + 7.);
    float rim = sat(mask - ss(th, th + .01, c2));
    float near = exp(-md*3.);
    vec3 cc = mix(vec3(.008,.003,.008), vec3(.025,.006,.014), ss(th, th + .25, c));
    col = mix(col, cc, mask);
    col += uMoonCol*rim*(.06 + 1.5*near);
  }
#endif
#ifdef SKYLINE
  col = skyline(rd, col, vec3(.012,.01,.02), 0.);
#endif
  return col;
}
vec3 skyFire(vec3 rd){
  float y = rd.y;
  vec3 col = mix(vec3(.55,.08,.02), vec3(.012,.004,.006), ss(-.02, .35, y));
  col += vec3(1.,.35,.08)*exp(-max(y, 0.)*18.)*.6;
  // columnas de humo recortadas contra el resplandor
  float az = atan(rd.x, -rd.z);
  float sm = 0.;
  for (int i=0;i<4;i++){
    float fi = float(i);
    float cx = (hash11(fi*7.3) - .5)*1.6;
    float w = .03 + .05*hash11(fi*3.1) + y*.25;
    float n = fbm2(vec2(az*9. + fi*13., y*6. - uG*.35 - fi));
    float col_ = ss(w, w*.6, abs(az - cx + (n - .5)*.12*(1. + y*4.)))*ss(.7, .0, y);
    sm = max(sm, col_);
  }
  col = mix(col, vec3(.035,.012,.012), sm*.9);
  col += stars(rd)*ss(.25, .5, y)*.5;
  float mc = clamp(dot(rd, uMoonDir), -1., 1.); float md = acos(mc);
  col += uMoonCol*(.4*exp(-max(md - uMoonR, 0.)*10.));
  if (md < uMoonR) col = uMoonCol*1.5*mix(1., .8, ss(.8,.82, md/uMoonR));
  col = skyline(rd, col, vec3(.02,.008,.008), 1.);
  return col;
}
vec3 background(vec3 rd){
#if defined(BG_NIGHT)
  return skyNight(rd);
#elif defined(BG_FIRE)
  return skyFire(rd);
#else
  return mix(uFogCol, uZenith, ss(-.4, .6, rd.y));
#endif
}

/* ---------------------------------------------------------- sombreado -- */
vec3 shadeEye(vec3 ph, vec3 rdh){
  float side = ph.x < 0. ? -1. : 1.;
  vec3 ec = ph - vec3(EYE_C.x*side, EYE_C.y, EYE_C.z);
  vec3 en = normalize(ec);
  vec3 gz = side < 0. ? gazeR : gazeL;
  vec3 ax = normalize(cross(vec3(0.,1.,0.), gz)); vec3 ay = cross(gz, ax);
  float c = dot(en, gz);
  vec2 ip = vec2(dot(en, ax), dot(en, ay))/.479;
  float r = length(ip);
  float iris = step(0., c)*(1. - ss(.97, 1.01, r));
  vec3 col = vec3(.01,.003,.006);
  vec3 ic = mix(vec3(1.,.3,.07), vec3(.3,.0,.015), ss(-.8, .85, ip.y));
  ic *= 1. + .6*ss(.5, .6, r)*(1. - ss(.72, .85, r));
  float fib = noise2(vec2(atan(ip.y, ip.x)*5., r*4.));
  ic *= .8 + .4*fib;
  ic = mix(ic, vec3(.2,0.,.01), ss(.86, .95, r));
  float pupil = 1. - ss(.92, 1.06, length(vec2(ip.x/uFace.w, ip.y/.78)));
  ic = mix(ic, vec3(.015,0.,0.), pupil);
  col = mix(col, ic*1.9*uEyeGlow, iris);
  vec3 hl = normalize(-rdh + vec3(-.32,.42,0.));
  vec3 hl2 = normalize(-rdh + vec3(.26,-.3,0.));
  float s1 = ss(.972, .976, dot(en, hl));
  float s2 = ss(.993, .995, dot(en, hl2));
  col = mix(col, vec3(1.,.96,.96)*2.2, max(s1, s2*.85));
  return col;
}
vec3 shadeBaby(vec3 p, vec3 n, vec3 rd, float mat, float t, vec3 bpos, mat3 brot, float bsc){
  vec3 pl = ((p - bpos)*brot)/bsc;
  vec3 ph = (pl - HEAD_PIVOT)*uHeadRot + HEAD_PIVOT;
  if (mat > 1.5 && mat < 2.5) {
    vec3 rdh = (rd*brot)*uHeadRot;
    vec3 c = shadeEye(ph, rdh);
    return mix(c, c + vec3(1.3,1.4,1.8)*.35, uFlashL);
  }
  vec3 alb = mat < 1.5 ? SKIN : (mat < 3.5 ? CLOTH : vec3(.05,.0,.01));
  float ndl = dot(n, uKeyDir);
  float sh = 1.;
#ifdef SHADOWS
  if (ndl > 0.) sh = ss(.3, .6, softShadow(p + n*.01*bsc, uKeyDir, 16., bsc));
#endif
  float lit = ss(-.015, .015, ndl)*sh;
  float ao = calcAO(p, n, bsc);
  vec3 light = mix(uShadowCol, uKeyCol, lit);
  light *= mix(.4, 1., ss(.3, .55, ao));
  vec3 col = alb*light;
  col += alb*uTermCol*ss(-.14, -.04, ndl)*(1. - lit)*ss(.3,.6,ao);
  float fres = 1. - sat(dot(n, -rd));
  float rimAlign = sat(dot(n, uRimDir)*1.4 + .35);
  float rim = ss(uRimW, uRimW + .035, fres*rimAlign);
  col = mix(col, uRimCol*(.7 + .6*alb), rim);
  // ojos que iluminan la cara (en bandas, como en el anime)
  col += alb*uFillCol*ss(-.02, .02, dot(n, uFillDir))*(1. - lit)*ss(.3, .6, ao);
  float eg = bandPt(p, n, eyeWL, bsc*.34) + bandPt(p, n, eyeWR, bsc*.34);
  col += EYE_GLOW*uEyeGlow*eg*(alb*.8 + vec3(.03,0.,0.))*uEyeLight;
  if (uTip.w > 0.) col += vec3(1.,.25,.08)*uTip.w*bandPt(p, n, uTip.xyz, bsc*.5)*(alb + .1)*2.;
  for (int i=0;i<4;i++){
    if (uXL[i].w > 0.) col += vec3(1.,.5,.15)*uXL[i].w*bandPt(p, n, uXL[i].xyz, bsc*1.4)*(alb + .05)*2.5;
  }
#ifdef SEARCHLIGHTS
  for (int i=0;i<5;i++){
    vec3 B, D; searchBeam(i, B, D);
    vec3 v = p - B; float s = dot(v, D);
    if (s > 0.) {
      float w = .09 + s*.028;
      float pool = ss(w, w*.9, length(v - D*s))*sat(dot(n, -D)*2. + .5);
      col += alb*vec3(.8,.9,1.2)*pool*1.4;
    }
  }
#endif
  // relámpago: luz blanca dura desde la cámara
  float fl = ss(-.05, .05, dot(n, normalize(uCamPos - p) + vec3(0.,.4,0.)));
  col = mix(col, alb*vec3(1.5,1.65,2.1)*fl + vec3(.05,.07,.12), uFlashL*.85);
  // agua que chorrea
  if (uWet > 0. && mat < 3.5) {
    float w = uWet*exp(-max(p.y, 0.)*.18/bsc);
    float st = noise2(vec2((pl.x*1.3 + pl.z)*16., pl.y*2.2 + uG*2.6));
    float st2 = noise2(vec2((pl.x - pl.z*1.2)*30., pl.y*3.5 + uG*3.8));
    float lines = ss(.7, .73, st)*.6 + ss(.78, .8, st2)*.3;
    col += vec3(.35,.5,.85)*lines*w*.35;
    col *= 1. - .25*w;
  }
  return col;
}
vec3 shadeCity(vec3 p, vec3 n, vec3 rd, float mat, float t){
  vec2 id = floor(p.xz/CELL);
  if (mat > 5.5) {
    vec3 c = vec3(.02,.02,.03)*mix(uShadowCol, uKeyCol, .3);
#ifdef RUINS
    float fire = fbm2(p.xz*.8 + vec2(0., uG*.2));
    c += vec3(1.,.3,.05)*ss(.62, .66, fire)*(.6 + .4*noise2(p.xz*3. + uG*4.))*1.4;
#endif
    return c;
  }
  vec3 alb = vec3(.03,.034,.06)*(.7 + .6*hash21(id + 2.));
  float ndl = dot(n, uKeyDir);
  vec3 col = alb*mix(uShadowCol, uKeyCol, ss(-.02, .02, ndl))*1.2;
  float fres = 1. - sat(dot(n, -rd));
  col = mix(col, uRimCol*.35, ss(.8, .83, fres)*sat(dot(n, uRimDir)*2.));
  float h = cityHeight(id);
  if (abs(n.y) < .5) {
    vec2 fuv = abs(n.x) > .5 ? vec2(p.z, p.y) : vec2(p.x, p.y);
    vec2 wc = fuv*vec2(1./.065, 1./.05);
    vec2 wid = floor(wc); vec2 wf = fract(wc);
    float win = step(.25, wf.x)*step(wf.x, .75)*step(.28, wf.y)*step(wf.y, .78);
    float on = step(.74, hash21(wid + id*31.7));
    vec3 wcol = mix(vec3(1.,.72,.38), vec3(.65,.8,1.), step(.62, hash21(wid*1.7 + id)));
    float fade = exp(-t*.035);
#ifdef RUINS
    on *= .2;
#endif
    col += wcol*win*on*1.1*fade;
  } else if (n.y > .5 && h > 1.2) {
    // balizas rojas en las azoteas de las torres
    vec2 q = p.xz - (id + .5)*CELL;
    float bl = step(.5, fract(uG*.7 + hash21(id)))*ss(.05, .02, length(q));
    col += vec3(1.,.05,.02)*bl*3.;
  }
#ifdef RUINS
  col += vec3(1.,.3,.05)*ss(.35, .0, p.y)*ss(.55, .6, fbm2(p.xz*1.2 + uG*.3))*1.2;
#endif
  return col;
}

void finishSetup(){
  vec3 gl = ((uGaze - uBPos)*uBRot)/uBScale;
  vec3 gt = (gl - HEAD_PIVOT)*uHeadRot + HEAD_PIVOT;
  vec3 cR = vec3(-EYE_C.x, EYE_C.y, EYE_C.z), cL = EYE_C;
  gazeR = normalize(mix(vec3(0.,0.,1.), normalize(gt - cR), .6));
  gazeL = normalize(mix(vec3(0.,0.,1.), normalize(gt - cL), .6));
  vec3 lR = uHeadRot*(cR + gazeR*.23 - HEAD_PIVOT) + HEAD_PIVOT;
  vec3 lL = uHeadRot*(cL + gazeL*.23 - HEAD_PIVOT) + HEAD_PIVOT;
  eyeWR = uBPos + uBRot*(lR*uBScale);
  eyeWL = uBPos + uBRot*(lL*uBScale);
}
`;

/* ------------------------------------------------------------------------ */
/*  Módulos opcionales por plano                                             */
/* ------------------------------------------------------------------------ */
const SEARCH = `
void searchBeam(int i, out vec3 B, out vec3 D){
  float fi = float(i);
  B = vec3(-10. + fi*5.2 + hash11(fi)*2., 0., -8. - 6.*hash11(fi*3.1));
  float a = .35*sin(uG*(.35 + .1*fi) + fi*1.7) + (fi - 2.)*.12;
  float e = .55 + .38*sin(uG*(.27 + .07*fi) + fi*1.9);
  D = normalize(vec3(sin(a)*cos(e), sin(e), -cos(a)*cos(e)));
}
vec3 searchVolume(vec3 ro, vec3 rd, float tHit){
  vec3 acc = vec3(0.);
  for (int i=0;i<5;i++){
    vec3 B, D; searchBeam(i, B, D);
    vec3 w0 = ro - B; float b = dot(rd, D), d = dot(rd, w0), e = dot(D, w0);
    float den = 1. - b*b; if (den < 1e-4) continue;
    float sr = (b*e - d)/den, sb = (e - b*d)/den;
    if (sr < 0. || sr > tHit || sb < 0.) continue;
    float dist = length(ro + rd*sr - B - D*sb);
    float w = .09 + sb*.028;
    float core = ss(w, w*.35, dist);
    acc += vec3(.55,.65,.9)*(core*.22 + ss(w*.25, 0., dist)*.35)*exp(-sb*.02);
  }
  return acc;
}
`;

const DOME = `
vec3 domeVolume(vec3 ro, vec3 rd, float tHit){
  vec3 acc = vec3(0.);
  if (uFx.x > 0.) {
    vec2 is = iSphere(ro, rd, uDome.xyz, uDome.w);
    if (is.y > 0.) {
      float t0 = max(is.x, 0.), t1 = min(is.y, tHit);
      if (t1 > t0) {
        float ch = (t1 - t0)/(2.*uDome.w);
        vec3 dn = normalize(ro + rd*t0 - uDome.xyz);
        float k = ch + (fbm3s(dn*5. + uG*3.) - .5)*.3;
        acc += (vec3(1.,.12,.04)*ss(.0, .06, k)*.8 + vec3(1.,.5,.15)*ss(.22, .28, k)*1.6 + vec3(1.,.95,.85)*ss(.45, .5, k)*4.)*uFx.x;
      }
    }
  }
  // muro de polvo y fuego del anillo de choque
  if (uFx.z > 0.) {
    vec2 o = ro.xz - uDome.xz; vec2 d2 = rd.xz;
    float a = dot(d2,d2), b = dot(o,d2), c = dot(o,o) - uFx.y*uFx.y;
    float h = b*b - a*c;
    if (h > 0.) {
      h = sqrt(h);
      for (int s=0;s<2;s++){
        float t = (-b + (s==0 ? -h : h))/a;
        if (t > 0. && t < tHit) {
          vec3 q = ro + rd*t;
          float H = .6 + .25*uFx.y;
          float az = atan(q.z - uDome.z, q.x - uDome.x);
          float n = fbm2(vec2(az*6., q.y*1.5 - uG*2.));
          float wall = ss(H*(.5 + .6*n), H*(.3 + .6*n), q.y)*ss(-.1, .1, q.y);
          acc += mix(vec3(1.,.45,.12), vec3(.25,.08,.06), ss(.0, H, q.y))*wall*uFx.z*(s==0 ? 1. : .5);
        }
      }
    }
  }
  // pilar de luz
  if (uFx.w > 0.) {
    vec3 B = uDome.xyz, D = vec3(0.,1.,0.);
    vec3 w0 = ro - B; float b = dot(rd, D), d = dot(rd, w0), e = dot(D, w0);
    float den = 1. - b*b;
    if (den > 1e-4) {
      float sr = (b*e - d)/den, sb = (e - b*d)/den;
      if (sr > 0. && sr < tHit && sb > 0.) {
        float dist = length(ro + rd*sr - B - D*sb);
        float w = .35 + sb*.01;
        acc += (vec3(1.,.95,.9)*ss(w*.45, 0., dist)*3. + vec3(1.,.2,.06)*ss(w*1.6, w*.4, dist))*uFx.w;
      }
    }
  }
  return acc;
}
`;

const OCEAN = `
float waveH(vec2 q){
  float h = .35*noise2(q*.35 + vec2(uG*.22, uG*.08));
  h += .2*noise2(M2*q*.9 - vec2(uG*.35, 0.));
  h += .1*noise2(q*2.3 + vec2(0., uG*.55));
  return h;
}
vec3 shadeOcean(vec3 p, vec3 rd, float t){
  float e = .05 + t*.003;
  vec2 q = p.xz;
  float h0 = waveH(q);
  vec3 n = normalize(vec3((h0 - waveH(q + vec2(e,0.)))*mix(1., .15, ss(10., 80., t)), e, (h0 - waveH(q + vec2(0.,e)))*mix(1., .15, ss(10., 80., t))));
  vec3 r = reflect(rd, n); r.y = abs(r.y);
  float fres = .03 + .97*pow(1. - sat(dot(n, -rd)), 5.);
  vec3 col = vec3(.003,.004,.01);
  vec3 sky = skyNight(r);
  col = mix(col, sky*.35, ss(.15, .35, fres)*.6 + .2*fres);
  float g = dot(r, uMoonDir);
  col += uMoonCol*ss(cos(uMoonR*1.7), cos(uMoonR*1.25), g)*1.5*ss(.5, .56, noise2(p.xz*vec2(3., 9.) + uG));
  // reflejo de los ojos: dos columnas temblorosas
  vec3 rr = reflect(rd, vec3(0.,1.,0.));
  float eyeR = glowLine(p, normalize(rr + (n - vec3(0.,1.,0.))*1.4), 400., eyeWL, .004*uBScale) + glowLine(p, normalize(rr + (n - vec3(0.,1.,0.))*1.4), 400., eyeWR, .004*uBScale);
  col += EYE_GLOW*uEyeGlow*min(eyeR, 3.)*.6;
  // espuma alrededor del cuerpo
  float db = mapBabyW(p).x/uBScale;
  float foam = ss(.35, .0, db)*ss(.35, .7, noise2(p.xz*3. + vec2(uG*1.5)) + ss(.15,.0,db));
  col = mix(col, vec3(.55,.62,.8)*(.35 + .65*uFlashL), foam*.85);
  col = mix(col, col + vec3(.2,.24,.35), uFlashL*.6);
  return col;
}
`;

/* ------------------------------------------------------------------------ */
/*  Render genérico                                                          */
/* ------------------------------------------------------------------------ */
const RENDER = `
void main(){
  finishSetup();
#ifdef HORDE
  hordeSetup();
#endif
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  mat3 ca = camLook(uCamPos, uCamTar, uCamRoll);
  vec3 ro = uCamPos, rd = ca*normalize(vec3(uv, uCamFl));
  vec3 col = background(rd);
  col = mix(col, col + vec3(.12,.14,.22)*ss(-.1,.5,rd.y), uFlashL);
  float tHit = 1e4; vec3 nOut = vec3(0.);
  float tO = 1e4;
#ifdef HAS_OCEAN
  if (rd.y < 0.) tO = -ro.y/rd.y;
#endif
  float tG = 1e4;
#ifdef HAS_CITY
  if (rd.y < 0.) tG = -ro.y/rd.y;
#endif
  vec2 h = march(ro, rd, min(min(tO, tG), 900.));
#ifdef HAS_CITY
  if (h.y < 0. && tG < 1e4) h = vec2(tG, 6.);
#endif
  if (h.y > 0. && h.x < tO) {
    vec3 p = ro + rd*h.x;
    vec3 n = h.y > 5.5 ? vec3(0.,1.,0.) : calcNormal(p, h.x);
    tHit = h.x; nOut = n;
    if (h.y < 4.5) {
#ifdef HORDE
      // localizar a qué gigante pertenece el punto
      int best = 0; float bd = 1e9;
      for (int i=0;i<NH;i++){ vec4 hh = hordeT(i); float dd = length(p.xz - hh.xy); if (dd < bd){ bd = dd; best = i; } }
      vec4 hb = hordeT(best);
      col = shadeBaby(p, n, rd, h.y, h.x, vec3(hb.x, 5.62*hb.z, hb.y), rotY(hb.w), hb.z);
#else
      col = shadeBaby(p, n, rd, h.y, h.x, uBPos, uBRot, uBScale);
#endif
    } else {
#ifdef HAS_CITY
      col = shadeCity(p, n, rd, h.y, h.x);
#endif
    }
    col = mix(col, uHaze, 1. - exp(-h.x*uFogK));
  } else if (tO < 1e4) {
#ifdef HAS_OCEAN
    vec3 p = ro + rd*tO;
    col = shadeOcean(p, rd, tO);
    col = mix(col, uHaze*.8, 1. - exp(-tO*uFogK));
    tHit = tO; nOut = vec3(0.,1.,0.);
#endif
  }
#ifdef SEARCHLIGHTS
  col += searchVolume(ro, rd, tHit);
#endif
#ifdef HAS_DOME
  col += domeVolume(ro, rd, tHit);
#endif
#if defined(HAS_HEAD) && !defined(HORDE)
  col += EYE_GLOW*uEyeGlow*min(glowLine(ro, rd, tHit, eyeWL, .0011*uBScale) + glowLine(ro, rd, tHit, eyeWR, .0011*uBScale), 6.);
#endif
#ifdef HORDE
  for (int i=0;i<NH;i++){
    vec4 hb = hordeT(i);
    vec3 bp = vec3(hb.x, 5.62*hb.z, hb.y);
    mat3 R = rotY(hb.w);
    vec3 l = bp + R*(vec3(.3,-.05,.9)*hb.z), r = bp + R*(vec3(-.3,-.05,.9)*hb.z);
    col += EYE_GLOW*uEyeGlow*min(glowLine(ro, rd, tHit, l, .0016*hb.z) + glowLine(ro, rd, tHit, r, .0016*hb.z), 6.);
  }
#endif
  if (uTip.w > 0.) col += vec3(1.,.25,.08)*uTip.w*min(glowLine(ro, rd, tHit, uTip.xyz, .004*uBScale), 8.);
  outCol = vec4(max(col, vec3(0.)), 1.);
  outND = vec4(nOut, tHit);
}
`;

/* ------------------------------------------------------------------------ */
/*  La Tierra vista desde la órbita (plano propio)                            */
/* ------------------------------------------------------------------------ */
const EARTH = `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  mat3 ca = camLook(uCamPos, uCamTar, uCamRoll);
  vec3 ro = uCamPos, rd = ca*normalize(vec3(uv, uCamFl));
  vec3 col = vec3(.003,.002,.006) + stars(rd)*.9;
  float mc = clamp(dot(rd, uMoonDir), -1., 1.); float md = acos(mc);
  col += uMoonCol*(.5*exp(-max(md - uMoonR, 0.)*10.));
  if (md < uMoonR) col = uMoonCol*1.6*mix(1., .75, ss(.55,.57, fbm2(rd.xy*40.)));
  float tHit = 1e4; vec3 nOut = vec3(0.);
  float R = 10.;
  vec2 is = iSphere(ro, rd, vec3(0.), R);
  vec3 sun = normalize(vec3(-1., .35, .25));
  vec3 bc = normalize(vec3(.35, .42, .84));   // punto del impacto
  if (is.x > 0.) {
    vec3 p = ro + rd*is.x; vec3 n = normalize(p);
    tHit = is.x; nOut = n;
    mat3 er = rotY(.3 + uG*.004);
    vec3 o = n*er;
    float land = ss(.515, .52, fbm3(o*2.2 + vec3(2.,5.,1.)));
    float day = ss(-.02, .02, dot(n, sun));
    vec3 ocean = mix(vec3(.004,.008,.025), vec3(.03,.09,.25), day);
    vec3 grd = mix(vec3(.012,.012,.016), vec3(.09,.1,.07), day);
    col = mix(ocean, grd, land);
    col = mix(col, col*1.35 + vec3(.02,.03,.05), day*ss(.55,.58, fbm3s(o*3.3 + 9.)));   // nubes planas
    float city = land*ss(.62, .66, noise3(o*90.))*ss(.5, .6, fbm3s(o*6.))*(1. - day);
    col += vec3(1.,.45,.15)*city*1.2;
    float ang = acos(clamp(dot(n, bc), -1., 1.));
    float inside = ss(uEarth.x, uEarth.x - .06, ang);
    vec3 w = vec3(fbm3s(o*2.5), fbm3s(o*2.5 + 7.), fbm3s(o*2.5 + 13.)) - .5;
    float cr = 1. - ss(.0, .03, crackNoise(o*4. + w*2.5));
    float cr2 = 1. - ss(.0, .025, crackNoise(o*11. + w*3.));
    col *= 1. - .6*inside;
    col += vec3(1.,.18,.04)*(cr + .6*cr2)*inside*2.5;
    col += vec3(1.,.9,.7)*cr*ss(uEarth.x - .25, uEarth.x - .02, ang)*inside*4.;
    col += vec3(1.,.55,.3)*exp(-pow((ang - uEarth.y)/.02, 2.))*uEarth.z*4.;
    float fres = 1. - sat(dot(n, -rd));
    col += mix(vec3(.25,.5,1.), vec3(1.,.25,.06), sat(uEarth.x*.9))*ss(.78, .8, fres)*(.25 + day*.6);
  } else {
    vec3 oc = -ro; float hh = dot(oc, rd); float b = sqrt(max(dot(oc,oc) - hh*hh, 0.));
    if (hh > 0. && b > R) col += mix(vec3(.2,.45,1.), vec3(1.,.25,.06), sat(uEarth.x*.9))*exp(-(b - R)/.25)*.9;
  }
  outCol = vec4(col, 1.);
  outND = vec4(nOut, tHit);
}
`;

/* ------------------------------------------------------------------------ */
/*  Planos                                                                    */
/* ------------------------------------------------------------------------ */
const SHOTS = {
  SEA:    { defs: ['HAS_HEAD', 'BODY 2', 'HAS_OCEAN', 'BG_NIGHT', 'HAS_CLOUDS'], mods: [OCEAN] },
  EYES:   { defs: ['HAS_HEAD', 'BG_DARK'], mods: [] },
  CITY:   { defs: ['HAS_HEAD', 'BODY 2', 'HAS_ARM_R', 'HAS_ARM_L', 'HAS_CITY', 'BG_NIGHT', 'HAS_CLOUDS', 'SEARCHLIGHTS', 'SKYLINE'], mods: [SEARCH], pre: true },
  ATTACK: { defs: ['HAS_HEAD', 'BODY 2', 'HAS_ARM_R', 'HAS_ARM_L', 'BG_NIGHT', 'HAS_CLOUDS', 'SKYLINE'], mods: [] },
  RAISE:  { defs: ['HAS_HEAD', 'BODY 2', 'HAS_ARM_R', 'HAS_ARM_L', 'BG_NIGHT', 'HAS_CLOUDS', 'SKYLINE'], mods: [] },
  TOUCH:  { defs: ['HAS_ARM_R', 'HAS_CITY', 'BG_NIGHT', 'HAS_DOME', 'SKYLINE'], mods: [DOME], pre: true },
  EARTH:  { defs: [], mods: [], main: EARTH },
  HORDE:  { defs: ['HAS_HEAD', 'BODY 2', 'HORDE', 'HAS_CITY', 'RUINS', 'BG_FIRE'], mods: [] },
  SMILE:  { defs: ['HAS_HEAD', 'BODY 2', 'BG_DARK'], mods: [] },
  HEADTEST: { defs: ['HAS_HEAD', 'BG_DARK'], mods: [] },
};

function sceneSource(name) {
  const s = SHOTS[name];
  const defs = s.defs.map(d => '#define ' + d).join('\n');
  // SEARCH se declara antes de COMMON porque shadeBaby lo usa
  let src = '#version 300 es\n' + defs + '\n';
  const head = COMMON.split('/* ---------------------------------------------------------- sombreado -- */');
  src += head[0];
  if (s.pre) for (const m of s.mods) if (m === SEARCH) src += m;
  src += '/* sombreado */' + head[1];
  for (const m of s.mods) if (!(s.pre && m === SEARCH)) src += m;
  src += s.main || RENDER;
  return src;
}

/* ------------------------------------------------------------------------ */
/*  Post                                                                      */
/* ------------------------------------------------------------------------ */
// Contornos: Sobel sobre profundidad (solo lado cercano) y normales
const LINES = `#version 300 es
precision highp float;
uniform sampler2D uND; uniform vec2 uTexel; uniform float uLineFog, uLineW, uNormTh;
in vec2 vUv; out vec4 outCol;
void main(){
  vec4 c = texture(uND, vUv);
  float dc = c.w;
  float e = 0.;
  vec2 o[4]; o[0] = vec2(uTexel.x, 0.); o[1] = vec2(-uTexel.x, 0.); o[2] = vec2(0., uTexel.y); o[3] = vec2(0., -uTexel.y);
  for (int i=0;i<4;i++){
    vec4 s = texture(uND, vUv + o[i]*uLineW);
    float dn = s.w;
    float rel = (dn - dc)/max(dc, 1e-3);
    if (dc < 9000.) {
      e = max(e, smoothstep(.04, .1, rel));
      if (dn < 9000.) e = max(e, smoothstep(uNormTh, uNormTh + .12, 1. - dot(c.xyz, s.xyz)));
    }
  }
  float fade = dc < 9000. ? exp(-dc*uLineFog) : 0.;
  outCol = vec4(e*fade, 0., 0., 1.);
}`;

// Composición: capa 2D (estelas, rayos), explosiones de anime, partículas y destellos
const COMP = `#version 300 es
precision highp float;
uniform sampler2D uScene, uFxTex;
uniform vec2 uRes; uniform float uG, uFrame;
uniform vec4 uExp[12]; uniform int uExpN;
uniform vec4 uFlare[8]; uniform int uFlareN;
uniform float uRain, uAsh, uEmbers, uSpray;
uniform vec4 uCharge, uDebris;
in vec2 vUv; out vec4 outCol;
float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 h22(vec2 p){ vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3+=dot(p3,p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float n2(vec2 x){ vec2 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x), f.y); }
float fb(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n2(p); p=p*2.03+1.7; a*=.5; } return s*1.07; }
float ss(float a,float b,float x){ return smoothstep(a,b,x); }

void explosion(vec2 p, vec4 e, float seed, inout vec3 col, inout float cov){
  vec2 d = (p - e.xy)/e.z;
  float r = length(d);
  if (r > 2.2) return;
  float age = e.w;
  float grow = 1. - pow(1. - clamp(age/.22, 0., 1.), 3.);
  // fuego
  float R = grow*(.78 + .5*(fb(d*2.2 + seed + age*.8) - .5)*1.6);
  float fire = 1. - ss(R - .015, R + .015, r);
  float heat = clamp(1. - age*1.25, 0., 1.);
  float band = r/max(R, 1e-3);
  vec3 fc = vec3(1.,.95,.85)*3.5;
  fc = mix(fc, vec3(1.,.72,.2)*2.4, ss(.25*heat, .3*heat + .02, band));
  fc = mix(fc, vec3(1.,.28,.05)*1.8, ss(.55*heat, .6*heat + .02, band));
  fc = mix(fc, vec3(.55,.05,.02), ss(.85*heat, .9*heat + .02, band));
  float fireA = fire*(1. - ss(.55, .8, age));
  // humo de anime: bolas grises con lado iluminado
  vec2 ds = d - vec2(0., age*.5);
  float Rs = (.5 + age*1.1)*(.8 + .55*(fb(ds*1.7 + seed*1.3 + 9.) - .5)*1.8);
  float smoke = (1. - ss(Rs - .015, Rs + .015, length(ds)))*ss(.2, .45, age)*(1. - ss(.8, 1., age));
  float lit = ss(.48, .52, fb(ds*1.7 + seed*1.3 + 9. + vec2(-.06, .06)) - fb(ds*1.7 + seed*1.3 + 9.) + .5);
  vec3 sc = mix(vec3(.05,.03,.035), vec3(.2,.1,.08), lit);
  col = mix(col, sc, smoke*.95);
  cov = max(cov, smoke);
  col = mix(col, fc, fireA);
  cov = max(cov, fireA);
}

void main(){
  vec2 uv = vUv;
  float asp = uRes.x/uRes.y;
  vec2 p = (uv - .5)*vec2(asp, 1.);
  vec3 col = texture(uScene, uv).rgb;
  float cov = 0.;
  vec4 fx = texture(uFxTex, uv);
  col = col*(1. - fx.a) + fx.rgb;
  cov = max(cov, fx.a);
  for (int i=0;i<12;i++){
    if (i >= uExpN) break;
    explosion(p, uExp[i], float(i)*7.31, col, cov);
  }
  // lluvia
  if (uRain > 0.) {
    for (int l=0;l<3;l++){
      float fl = float(l);
      float sc = 18. + fl*14.;
      vec2 q = p*vec2(sc, sc*.12);
      q.x += q.y*.9*.12*6.;
      q.y += uG*(9. + fl*4.);
      vec2 id = floor(q); vec2 f = fract(q);
      float h = h21(id + fl*17.);
      float x = h21(id*1.7 + 3.);
      float s = ss(.06, .0, abs(f.x - x))*ss(0., .3, f.y)*ss(1., .7, f.y)*step(.55, h);
      col += vec3(.55,.62,.8)*s*uRain*(.35 - fl*.08);
    }
  }
  // ceniza
  if (uAsh > 0.) {
    for (int l=0;l<2;l++){
      float fl = float(l);
      float sc = 9. + fl*9.;
      vec2 q = p*sc + vec2(sin(uG*.7 + fl)*.6, uG*(.8 + fl*.5));
      vec2 id = floor(q); vec2 f = fract(q) - .5;
      vec2 o = (h22(id + fl*9.) - .5)*.6;
      float s = ss(.07, .04, length(f - o))*step(.6, h21(id + 5.));
      col = mix(col, vec3(.45,.4,.42), s*uAsh*.7);
    }
  }
  // brasas
  if (uEmbers > 0.) {
    for (int l=0;l<2;l++){
      float fl = float(l);
      float sc = 7. + fl*8.;
      vec2 q = p*sc + vec2(sin(uG*1.3 + p.y*3.)*.4, -uG*(1.2 + fl*.7));
      vec2 id = floor(q); vec2 f = fract(q) - .5;
      vec2 o = (h22(id + fl*13.) - .5)*.6;
      float fl2 = .5 + .5*sin(uG*9. + h21(id)*30.);
      float s = ss(.05, .0, length(f - o))*step(.72, h21(id + 2.));
      col += vec3(1.,.35,.08)*s*uEmbers*(1.5 + 2.*fl2);
    }
  }
  // gotas que salen despedidas (mar)
  if (uSpray > 0.) {
    vec2 q = p*vec2(40., 22.) + vec2(0., uG*6.);
    vec2 id = floor(q); vec2 f = fract(q) - .5;
    float s = ss(.12, .0, length(f*vec2(1., .4)))*step(.8, h21(id));
    col += vec3(.5,.6,.85)*s*uSpray*ss(.1, -.3, p.y);
  }
  // carga: partículas que convergen hacia un punto
  if (uCharge.w > 0.) {
    vec2 d = p - uCharge.xy; float r = length(d); float a = atan(d.y, d.x);
    float bins = 90.;
    float bi = floor((a + 3.14159)/6.28318*bins);
    float hb = h11(bi*1.37);
    float ph = fract(uG*(.9 + hb) + hb*7.);
    float rp = uCharge.z*(1. - ph)*(.5 + hb);
    float ac = abs(fract((a + 3.14159)/6.28318*bins) - .5);
    float s = ss(.12, .0, ac)*ss(.06, .0, abs(r - rp) - .03*(1. - ph))*step(.35, hb);
    col += vec3(1.,.4,.15)*s*uCharge.w*2.5;
    col += vec3(1.,.25,.08)*exp(-r*r/(uCharge.z*uCharge.z*.02))*uCharge.w*.8;
  }
  // escombros radiales
  if (uDebris.w > 0.) {
    vec2 d = p - uDebris.xy; float r = length(d); float a = atan(d.y, d.x);
    float bins = 140.;
    float bi = floor((a + 3.14159)/6.28318*bins);
    float hb = h11(bi*2.13 + 4.);
    float rp = uDebris.z*(.4 + 1.8*hb);
    float ac = abs(fract((a + 3.14159)/6.28318*bins) - .5);
    float len = .05 + .12*hb;
    float s = ss(.2, .05, ac)*ss(len, 0., abs(r - rp))*step(.4, h11(bi*5.1));
    col = mix(col, vec3(.08,.05,.05), s*uDebris.w);
    col += vec3(1.,.5,.2)*s*uDebris.w*step(.75, hb)*2.;
  }
  // destellos de anime (ojos, punta del dedo)
  for (int i=0;i<8;i++){
    if (i >= uFlareN) break;
    vec4 f = uFlare[i];
    vec2 d = p - f.xy;
    float s = f.z;
    float core = exp(-dot(d,d)/(s*s*.004));
    float halo = exp(-length(d)/(s*.12));
    float streak = exp(-abs(d.y)/(s*.006))*exp(-abs(d.x)/(s*.7));
    float streak2 = exp(-abs(d.x)/(s*.004))*exp(-abs(d.y)/(s*.18));
    vec3 c = f.w > 0. ? vec3(1.,.14,.05) : vec3(1.,.9,.85);
    col += c*abs(f.w)*(core*3. + halo*.35 + streak*1.1 + streak2*.4);
  }
  outCol = vec4(col, cov);
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
  outCol = vec4(c*smoothstep(uThr, uThr*2.2, l), 1.);
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

// Rayos de luz (radial blur desde una fuente)
const RAYS = `#version 300 es
precision highp float;
uniform sampler2D uTex; uniform vec2 uPos; uniform float uLen;
in vec2 vUv; out vec4 outCol;
void main(){
  vec2 d = (uPos - vUv);
  vec3 acc = vec3(0.); float w = 0.;
  for (int i=0;i<40;i++){
    float k = float(i)/40.;
    float wt = 1. - k;
    acc += texture(uTex, vUv + d*k*uLen).rgb*wt;
    w += wt;
  }
  outCol = vec4(acc/w, 1.);
}`;

// Composición final: contornos nítidos, resplandor, gradación, líneas de velocidad, impact frames
const FINAL = `#version 300 es
precision highp float;
uniform sampler2D uComp, uLine, uB1, uB2, uB3, uRays, uOverlay;
uniform vec2 uRes; uniform float uFrame, uG;
uniform vec2 uShake; uniform float uZoom;
uniform float uImpact, uSpeed, uSpeedDark; uniform vec2 uSpeedPos;
uniform float uFlash; uniform vec3 uFlashCol; uniform float uFade;
uniform float uRaysAmt, uBloom, uCA, uHasScene;
uniform vec3 uLineCol; uniform vec4 uGrade;
in vec2 vUv; out vec4 outCol;
float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14), 0., 1.); }
float ss(float a,float b,float x){ return smoothstep(a,b,x); }
void main(){
  vec2 uv = vUv;
  float asp = uRes.x/uRes.y;
  vec2 cuv = (uv - .5)/uZoom + .5 + uShake;
  vec3 col = vec3(0.);
  if (uHasScene > .5) {
    vec2 dca = (cuv - .5)*uCA;
    col.r = texture(uComp, cuv + dca).r;
    col.g = texture(uComp, cuv).g;
    col.b = texture(uComp, cuv - dca).b;
    float cov = texture(uComp, cuv).a;
    float ln = ss(.28, .62, texture(uLine, cuv).r)*(1. - cov);
    col = mix(col, uLineCol, ln);
    vec3 bl = texture(uB1, cuv).rgb*.55 + texture(uB2, cuv).rgb*.75 + texture(uB3, cuv).rgb*1.;
    col += bl*uBloom;
    col += texture(uRays, cuv).rgb*uRaysAmt;
    col = aces(col*uGrade.x);
    float l = dot(col, vec3(.2126,.7152,.0722));
    col = mix(vec3(l), col, uGrade.y);
    col = clamp((col - .5)*uGrade.z + .5, 0., 1.);
    col += vec3(-.006,0.,.025)*(1. - l)*(1. - l);
    col *= vec3(1. + uGrade.w, 1., 1.);
    // viñeta suave
    vec2 v = (uv - .5)*vec2(asp, 1.);
    col *= 1. - .35*pow(length(v*vec2(.72, 1.)), 2.2);
  }
  // líneas de velocidad (集中線)
  if (uSpeed > 0.) {
    vec2 d = (uv - uSpeedPos)*vec2(asp, 1.);
    float r = length(d); float a = atan(d.y, d.x);
    float seed = floor(uFrame*.5);
    float bins = 220.;
    float bi = floor((a + 3.14159)/6.28318*bins);
    float hb = h11(bi*1.31 + seed*7.7);
    float f = abs(fract((a + 3.14159)/6.28318*bins) - .5);
    float w = .08 + .35*h11(bi*3.7 + seed);
    float r0 = .22 + .35*h11(bi*5.3 + seed*3.1);
    float line = ss(w, w*.2, f)*ss(r0, r0 + .25, r)*step(.45, hb);
    col = mix(col, uSpeedDark > .5 ? vec3(0.) : vec3(1.), line*uSpeed);
  }
  // impact frames: blanco/negro/rojo a tope de contraste
  if (uImpact > .5) {
    float l = dot(col, vec3(.3,.55,.15));
    float red = ss(.15, .3, col.r - max(col.g, col.b));
    vec3 bw = vec3(step(.33, l));
    if (uImpact < 1.5) col = mix(bw, vec3(.95,.05,.05), red*step(l, .9));
    else if (uImpact < 2.5) col = mix(1. - bw, vec3(.05), red);
    else col = mix(vec3(.02), vec3(1.,.06,.04), step(.25, l));
  }
  // grano digital muy fino
  col += (h21(uv*uRes + uFrame*.37) - .5)*.035;
  vec4 ov = texture(uOverlay, uv);
  col = mix(col, ov.rgb, ov.a);
  col = mix(col, uFlashCol, uFlash);
  col *= uFade;
  outCol = vec4(clamp(col, 0., 1.), 1.);
}`;

return { VERT, sceneSource, SHOTS, LINES, COMP, BRIGHT, BLUR, COPY, RAYS, FINAL };
})();
