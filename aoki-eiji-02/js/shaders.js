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
uniform vec3  uMPos; uniform mat3 uMRot; uniform float uMScale;
uniform mat3  uMHead; uniform vec4 uMFace;          // mandíbula, visera, empuje, brazo izq. cortado
uniform vec3  uMArmR[3]; uniform mat3 uMHandR; uniform vec3 uMArmL[3]; uniform mat3 uMHandL;
uniform vec3  uMLegR[3]; uniform vec3 uMLegL[3];
uniform vec4  uSquad[8]; uniform int uSquadN; uniform float uSquadScale;
uniform vec4  uBeamA[10], uBeamB[10]; uniform int uBeamN;
uniform vec4  uWound;                               // herida del gigante (local) + radio
uniform vec4  uCrack;                               // grietas en el suelo: xz, radio, intensidad
uniform vec3  uDomeCore, uDomeEdge;
uniform vec4  uArmOff;                              // brazo cortado volando: posición + giro
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
  if (uWound.w > 0.) {
    float wd = length(p - uWound.xyz) - uWound.w;
    wd += .06*sin(p.x*9.)*sin(p.y*11.)*sin(p.z*7.);
    if (-wd > res.x - .01) res.y = 7.;
    res.x = smax(res.x, -wd, .05);
  }
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


/* ------------------------------------------------------------- el mecha -- */
float sdRBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q,0.)) + min(max(q.x,max(q.y,q.z)),0.) - r; }
float sdCylX(vec3 p, float r, float h){ vec2 d = abs(vec2(length(p.yz), p.x)) - vec2(r,h); return min(max(d.x,d.y),0.) + length(max(d,0.)); }
const vec3 M_HP = vec3(0.,-.6,-.1);
// materiales: 10 blindaje · 11 rojo militar · 12 luz · 13 mecánica oscura · 14 careta · 15 franjas de peligro
vec2 mechaHead(vec3 p, float jaw){
  float b = length(p - vec3(0.,.15,.1)) - 1.85;
  if (b > .25) return vec2(b, 10.);
  vec3 q = vec3(abs(p.x), p.y, p.z);
  // cráneo acorazado de bebé
  float sk = sdEll(p - vec3(0.,.25,-.15), vec3(1.1,1.04,1.08));
  sk = smax(sk, -sdEll(p - vec3(0.,-.55,.7), vec3(.92,.75,.76)), .05);

  vec2 r = vec2(sk, 10.);
  // cresta blindada con remaches
  float ridge = sdRBox(p - vec3(0.,1.02,-.12), vec3(.2,.3,1.), .07);
  ridge = max(ridge, sdEll(p - vec3(0.,.25,-.15), vec3(1.22,1.16,1.2)));
  r = opU(r, vec2(ridge, 13.));
  // placas laterales del casco
  float sp = max(sdEll(p - vec3(0.,.2,-.2), vec3(1.16,.9,1.12)), -q.y + .02 - .35*q.z);
  sp = max(sp, .55 - q.x);
  r = opU(r, vec2(sp, 11.));
  // careta de bebé en acero, hundida bajo el casco
  float face = sdEll(p - vec3(0.,-.32,.3), vec3(.74,.72,.68));
  face = smin(face, length(q - vec3(.4,-.52,.5)) - .32, .15);
  // rendijas de los ojos con el ceño hacia abajo
  vec3 eq = q - vec3(.32,-.04,.9); eq.y -= .28*(eq.x);
  float sock = sdEll(eq, vec3(.25,.075,.3));
  face = smax(face, -sock, .025);
  r = opU(r, vec2(face, 14.));
  r = opU(r, vec2(sdEll(eq + vec3(0.,0.,.12), vec3(.24,.065,.12)), 13.));
  r = opU(r, vec2(sdEll(eq + vec3(.03,0.,.04), vec3(.13,.028,.05)), 12.));
  // visera del casco (labio blindado sobre los ojos)
  float lip = sdEll(p - vec3(0.,.17,.12), vec3(1.0,.1,.92));
  lip = max(lip, -p.z + .1);
  r = opU(r, vec2(lip, 10.));
  // respirador en forma de chupete, con filtros de máscara de gas
  vec3 mq = p - vec3(0.,-.66 - .25*jaw,.98 + .12*jaw);
  r = opU(r, vec2(sdCap(p, vec3(0.,-.6,.55), vec3(0.,-.64,.92), .24, .2), 13.));
  float shield = sdEll(mq, vec3(.44,.3,.08));
  shield = smax(shield, -(length(mq.xy) - .12), .02);
  r = opU(r, vec2(shield, 11.));
  r = opU(r, vec2(sdTorus((mq - vec3(0.,-.02,.14)).xzy, vec2(.14, .04)), 13.));
  vec3 gq = mq; gq.x = abs(gq.x);
  r = opU(r, vec2(length(vec2(length(gq.xy - vec2(.26,.02)) - .045, gq.z - .06)) - .02, 13.));
  if (jaw > .01) {
    r = opU(r, vec2(sdTorus((p - vec3(0.,-.6,.93)).xzy, vec2(.2*jaw, .05)), 13.));
    r = opU(r, vec2(length(p - vec3(0.,-.6,.9)) - .17*jaw, 12.));
  }
  r = opU(r, vec2(sdCap(q, vec3(.2,-.62,.82), vec3(.62,-.9,.72), .12, .12), 13.));
  r = opU(r, vec2(sdCap(q, vec3(.62,-.9,.72), vec3(.72,-.97,.7), .16, .16), 11.));
  // orejeras y antenas en cuchilla
  r = opU(r, vec2(sdCylX(q - vec3(1.06,.0,-.12), .34, .16), 13.));
  r = opU(r, vec2(sdCylX(q - vec3(1.2,.0,-.12), .2, .06), 11.));
  r = opU(r, vec2(sdCap(q, vec3(1.18,.2,-.35), vec3(1.4,1.25,-1.05), .06, .012), 13.));
  // cuerno frontal
  r = opU(r, vec2(sdCap(p, vec3(0.,.78,.72), vec3(0.,1.62,1.3), .1, .012), 11.));
  return r;
}
vec2 mechaLeg(vec3 p, vec3 h, vec3 k, vec3 a){
  float b = sdCap(p, h, a, .75, .75); if (b > .3) return vec2(b, 10.);
  vec3 kd = normalize(k - h), sd = normalize(a - k);
  vec2 r = vec2(length(p - h) - .36, 13.);
  r = opU(r, vec2(sdCap(p, h + kd*.25, k - kd*.2, .5, .43), 10.));
  r = opU(r, vec2(length(p - k) - .32, 13.));
  r = opU(r, vec2(sdRBox(p - k - vec3(0.,.02,.26), vec3(.3,.34,.13), .06), 10.));
  r = opU(r, vec2(sdRBox(p - k - vec3(0.,.02,.38), vec3(.1,.28,.04), .02), 11.));
  r = opU(r, vec2(sdCap(p, k + sd*.2, a - sd*.1, .45, .34), 10.));
  // pistón hidráulico
  vec3 bk = vec3(0.,0.,-.42);
  r = opU(r, vec2(sdCap(p, mix(h, k, .25) + bk*.9, mix(k, a, .55) + bk, .07, .07), 13.));
  r = opU(r, vec2(sdCap(p, mix(h, k, .25) + bk*.9, mix(k, a, .1) + bk*1.05, .12, .12), 13.));
  // bota pesada con garras
  r = opU(r, vec2(sdRBox(p - a - vec3(0.,-.16,.22), vec3(.36,.16,.56), .08), 13.));
  r = opU(r, vec2(sdEll(p - a - vec3(0.,-.02,.42), vec3(.36,.2,.36)), 10.));
  vec3 fq = p - a - vec3(0.,-.22,.8); fq.x = abs(fq.x);
  r = opU(r, vec2(sdCap(fq, vec3(.18,0.,0.), vec3(.22,-.02,.2), .07, .02), 13.));
  return r;
}
vec2 mechaArm(vec3 p, vec3 sh, vec3 el, vec3 wr, mat3 hr, float side, float cut){
  float b = min(sdCap(p, sh, el, .55, .55), sdCap(p, el, wr + hr[1]*.7, .8, .8)); if (b > .3) return vec2(b, 10.);
  vec3 ud = normalize(el - sh);
  vec2 r = vec2(sdCap(p, sh, el, .24, .22), 13.);
  r = opU(r, vec2(sdCap(p, sh + ud*.3, el - ud*.28, .36, .33), 10.));
  r = opU(r, vec2(length(p - el) - .3, 13.));
  if (cut < .5) {
    vec3 fd = normalize(wr - el);
    r = opU(r, vec2(sdCap(p, el + fd*.22, wr - fd*.08, .42, .35), 10.));
    r = opU(r, vec2(sdCap(p, mix(el, wr, .62), mix(el, wr, .78), .44, .38), 11.));
    vec3 ph = (p - wr)*hr; ph.x *= side;
    r = opU(r, vec2(sdHand(ph/1.5, .1)*1.5, 13.));
    r = opU(r, vec2(sdRBox(ph - vec3(0.,.28,-.12), vec3(.3,.26,.08), .05), 10.));
  } else {
    r = opU(r, vec2(sdCap(p, el, mix(el, wr, .3), .42, .4), 10.));
    r = opU(r, vec2(sdCap(p, mix(el, wr, .3), mix(el, wr, .42), .16, .08), 13.));
  }
  return r;
}
vec2 mechaTorso(vec3 q){
  vec3 qa = vec3(abs(q.x), q.y, q.z);
  vec2 r = vec2(sdCap(q, vec3(0.,-.5,-.12), vec3(0.,-1.2,-.12), .36, .4), 13.);
  // pecho y barriga blindados
  float ch = sdRBox(q - vec3(0.,-1.72,.04), vec3(.92,.5,.6), .36);
  float be = sdEll(q - vec3(0.,-2.38,.12), vec3(.9,.72,.8));
  float tor = smin(ch, be, .2);
  float core = length(q - vec3(0.,-2.32,.88)) - .34;
  tor = smax(tor, -core, .03);
  r = opU(r, vec2(tor, 10.));
  r = opU(r, vec2(sdEll(q - vec3(0.,-1.14,.02), vec3(.98,.24,.74)), 13.));
  r = opU(r, vec2(sdTorus(vec3(q.x, q.z - .78, q.y + 2.32), vec2(.36, .07)), 11.));
  r = opU(r, vec2(length(q - vec3(0.,-2.32,.62)) - .3, 12.));
  vec3 gq = q - vec3(0.,-2.32,.8);
  float gr = sdBox(vec3(gq.x, mod(gq.y + .06, .12) - .06, gq.z), vec3(.34, .018, .03));
  r = opU(r, vec2(max(gr, length(gq.xy) - .34), 13.));
  // placa pectoral
  r = opU(r, vec2(sdRBox(q - vec3(0.,-1.56,.62), vec3(.5,.2,.1), .06), 11.));
  // pañal blindado
  r = opU(r, vec2(sdEll(q - vec3(0.,-3.06,0.), vec3(.96,.5,.74)), 13.));
  r = opU(r, vec2(sdRBox(q - vec3(0.,-3.0,.62), vec3(.46,.3,.12), .06), 10.));
  r = opU(r, vec2(sdRBox(qa - vec3(.84,-2.92,.36), vec3(.12,.2,.2), .04), 15.));
  // mochila, toberas y cables
  r = opU(r, vec2(sdRBox(q - vec3(0.,-1.9,-.88), vec3(.82,.72,.38), .12), 13.));
  r = opU(r, vec2(sdCap(qa, vec3(.42,-2.3,-.95), vec3(.5,-2.8,-1.25), .22, .3), 13.));
  r = opU(r, vec2(sdCap(qa, vec3(.5,-2.7,-1.2), vec3(.52,-2.82,-1.27), .33, .33), 11.));
  r = opU(r, vec2(sdCap(qa, vec3(.45,-.85,-.55), vec3(.55,-1.5,-1.12), .08, .08), 13.));
  r = opU(r, vec2(sdCap(qa, vec3(.6,-1.35,-1.05), vec3(1.05,-.35,-1.55), .13, .03), 13.));
  // hombreras enormes con lanzamisiles
  r = opU(r, vec2(sdRBox(qa - vec3(1.36,-1.2,-.05), vec3(.56,.42,.64), .18), 10.));
  float pod = sdRBox(qa - vec3(1.36,-.7,-.12), vec3(.44,.17,.52), .05);
  vec2 hp = mod(vec2(qa.x - 1.36, qa.z + .12) + .13, .26) - .13;
  pod = smax(pod, -max(length(hp) - .075, -.62 - qa.y), .01);
  if (q.x > 0.) r = opU(r, vec2(pod, 15.));
  else {
    // cañón de riel sobre la hombrera derecha
    vec3 cq = q - vec3(-1.36,-.52,0.);
    r = opU(r, vec2(sdRBox(cq - vec3(0.,0.,-.25), vec3(.3,.2,.45), .06), 13.));
    r = opU(r, vec2(sdRBox(cq - vec3(0.,.02,.6), vec3(.16,.1,.9), .03), 10.));
    r = opU(r, vec2(sdRBox(cq - vec3(0.,.02,1.55), vec3(.2,.13,.12), .03), 11.));
    r = opU(r, vec2(sdRBox(cq - vec3(0.,.02,.6), vec3(.06,.14,.95), .02), 13.));
  }
  return r;
}
vec2 mechaLocal(vec3 q){
  float b = length(q - vec3(0.,-2.2,0.)) - 5.3;
  if (b > .5) return vec2(b, 10.);
  vec3 ph = (q - M_HP)*uMHead + M_HP;
  vec2 r = mechaHead(ph, uMFace.x);
  float bb = sdCap(q, vec3(0.,-1.,-.2), vec3(0.,-3.2,-.2), 2.1, 1.5);
  r = opU(r, bb < .3 ? mechaTorso(q) : vec2(bb, 10.));
  r = opU(r, mechaLeg(q, uMLegR[0], uMLegR[1], uMLegR[2]));
  r = opU(r, mechaLeg(q, uMLegL[0], uMLegL[1], uMLegL[2]));
  r = opU(r, mechaArm(q, uMArmR[0], uMArmR[1], uMArmR[2], uMHandR, 1., 0.));
  r = opU(r, mechaArm(q, uMArmL[0], uMArmL[1], uMArmL[2], uMHandL, -1., uMFace.w));
  return r;
}
vec2 mapMechaW(vec3 p){
  vec3 q = ((p - uMPos)*uMRot)/uMScale;
  float b = length(q - vec3(0.,-2.2,0.)) - 5.5;
  if (b > .6) return vec2(b*uMScale, 10.);
  vec2 r = mechaLocal(q); r.x *= uMScale; return r;
}
vec2 mapSquad(vec3 p){
  vec2 res = vec2(1e5, 10.);
  for (int i=0;i<8;i++){
    if (i >= uSquadN) break;
    vec4 s = uSquad[i];
    vec3 d = p - s.xyz;
    float bd = length(d - vec3(0.,-2.2*uSquadScale,0.)) - 5.5*uSquadScale;
    if (bd > uSquadScale) { res = opU(res, vec2(bd, 10.)); continue; }
    float c = cos(s.w), sn = sin(s.w);
    vec3 q = vec3(c*d.x - sn*d.z, d.y, sn*d.x + c*d.z)/uSquadScale;
    vec2 r;
    if (length(s.xyz - uCamPos) > 45.) {
      vec3 qa = vec3(abs(q.x), q.y, q.z);
      float d = sdEll(q - vec3(0.,.2,0.), vec3(1.1,1.08,1.1));
      d = min(d, sdRBox(q - vec3(0.,-2.1,0.), vec3(.95,1.05,.7), .35));
      d = min(d, sdRBox(qa - vec3(1.36,-1.05,-.05), vec3(.56,.55,.64), .18));
      d = min(d, sdCap(qa, vec3(1.3,-1.5,0.), vec3(2.4,-2.4,.3), .36, .4));
      d = min(d, sdCap(qa, vec3(.45,-3.1,0.), vec3(.6,-5.4,-.2), .48, .38));
      r = vec2(d, 10.);
    } else r = mechaLocal(q);
    r.x *= uSquadScale;
    res = opU(res, r);
  }
  return res;
}
// brazo cortado que sale volando
vec2 mapArmOff(vec3 p){
  vec3 d = p - uArmOff.xyz;
  float b = length(d) - 2.4*uMScale; if (b > 1.) return vec2(b, 10.);
  float c = cos(uArmOff.w), s = sin(uArmOff.w);
  vec3 q = vec3(d.x, c*d.y - s*d.z, s*d.y + c*d.z)/uMScale;
  vec2 r = vec2(sdCap(q, vec3(0.,.5,0.), vec3(0.,-.6,0.), .42, .35), 10.);
  r = opU(r, vec2(sdCap(q, vec3(0.,-.2,0.), vec3(0.,-.4,0.), .44, .38), 11.));
  r = opU(r, vec2(sdCap(q, vec3(0.,.5,0.), vec3(0.,.75,0.), .16, .08), 13.));
  r = opU(r, vec2(sdHand((q - vec3(0.,-.68,0.))*vec3(1.,-1.,1.)/1.5, .1)*1.5, 13.));
  r.x *= uMScale;
  return r;
}
// el silo de lanzamiento
vec2 mapShaft(vec3 p){
  float rr = length(p.xz);
  float wall = 6.2 - rr;
  vec2 res = vec2(wall, 20.);
  float ry = mod(p.y, 2.6) - 1.3;
  res = opU(res, vec2(sdTorus(vec3(p.x, ry, p.z), vec2(6.05, .16)), 21.));
  float a = atan(p.z, p.x);
  float sec = floor(a/(TAU/6.) + .5)*(TAU/6.);
  vec2 cp = vec2(cos(sec), sin(sec))*5.85;
  res = opU(res, vec2(sdBox(vec3(p.x - cp.x, 0., p.z - cp.y), vec3(.28, 1e3, .28)), 20.));
  return res;
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
#ifdef HAS_MECHA
  res = opU(res, mapMechaW(p));
#endif
#ifdef HAS_SQUAD
  res = opU(res, mapSquad(p));
#endif
#ifdef HAS_ARMOFF
  res = opU(res, mapArmOff(p));
#endif
#ifdef HAS_SHAFT
  res = opU(res, mapShaft(p));
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
  if (mat > 6.5) {
    float fl = noise3(pl*14.);
    vec3 c = mix(vec3(.25,0.,.02), vec3(.7,.05,.06), ss(.3,.7, fl));
    c += vec3(1.,.5,.4)*ss(.9,.93, dot(reflect(rd,n), uKeyDir))*.8;
    return c*(.6 + .8*sat(dot(n,-rd)));
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


vec3 shadeMecha(vec3 p, vec3 n, vec3 rd, float mat, float t){
  vec3 lq = ((p - uMPos)*uMRot)/uMScale;
  vec3 ln = n*uMRot;
  float fres = 1. - sat(dot(n, -rd));
  if (mat > 11.5 && mat < 12.5) {
    return vec3(.35,1.,.85)*(.7 + 2.8*uMFace.y) + vec3(1.)*ss(.3,.0,fres)*uMFace.y*1.5;
  }
  // desgaste
  float grime = fbm3s(lq*2.3);
  float scr = ss(.8, .84, noise3(lq*11.))*ss(.45, .7, noise3(lq*1.3 + 3.))*.6;
  vec3 alb;
  if (mat < 10.5) alb = mix(vec3(.13,.14,.13), vec3(.27,.28,.26), grime);
  else if (mat < 11.5) alb = mix(vec3(.16,.03,.022), vec3(.3,.06,.035), grime);
  else if (mat < 13.5) alb = vec3(.045,.048,.055)*(.8 + .5*grime);
  else if (mat < 14.5) alb = mix(vec3(.2,.19,.18), vec3(.36,.34,.31), grime);
  else {
    float st = step(.5, fract((lq.x*sign(lq.x) + lq.y + lq.z)*2.6));
    alb = mix(vec3(.05,.045,.03), vec3(.78,.52,.05)*(.7 + .4*grime), st);
  }
  // paneles y remaches (en coordenadas del mecha)
  float pl = 0.;
  if (mat < 11.5) {
    vec3 an = abs(ln);
    float row = floor(lq.y*1.5 + .3);
    float ry = abs(fract(lq.y*1.5 + .3) - .5);
    float u = an.x > .6 ? lq.z : an.z > .6 ? lq.x : (lq.x + lq.z*.7);
    if (an.y > .6) { row = floor(lq.z*1.4); ry = abs(fract(lq.z*1.4) - .5); u = lq.x; }
    float cu = u*1.2 + hash11(row*7.1)*3.;
    float rx = abs(fract(cu) - .5)*step(.35, hash11(floor(cu)*3.7 + row));
    float lx = max(ry, rx);
    pl = ss(.47, .485, lx);
    float nearL = ss(.4, .44, ry)*(1. - pl);
    float rvd = abs(fract(u*9.) - .5);
    alb += vec3(.18)*ss(.14, .06, length(vec2(rvd, (.5 - ry)*6. - .45)))*nearL;
    alb *= 1. - .6*pl;
    alb += vec3(.25)*ss(.13, .09, rvd)*nearL*(1. - pl);
  }
  // óxido y churretes
  float rust = ss(.6, .78, fbm3s(lq*vec3(4.,.7,4.) + 7.))*step(mat, 11.5);
  alb = mix(alb, vec3(.14,.05,.025), rust*.7);
  float ndl = dot(n, uKeyDir);
  float lit = ss(-.02, .02, ndl);
  float half_ = ss(.35, .4, ndl);
  vec3 col = alb*mix(uShadowCol*1.2, uKeyCol*(.75 + .35*half_), lit);
  col += alb*uFillCol*ss(-.02, .02, dot(n, uFillDir))*(1. - lit)*.8;
  vec3 rf = reflect(rd, n);
  float glossy = mat > 13.5 && mat < 14.5 ? .9 : (mat > 10.5 && mat < 11.5 ? .35 : (mat > 12.5 && mat < 13.5 ? .45 : .6));
  col += uKeyCol*ss(.955, .965, dot(rf, uKeyDir))*glossy*(1. - .6*grime)*(1. - pl);
  // arañazos que pillan la luz
  col += (uKeyCol*.5 + .06)*scr*(1. - pl)*(mat > 12.5 && mat < 13.5 ? .3 : 1.);
  float rim = ss(uRimW, uRimW + .035, fres*sat(dot(n, uRimDir)*1.4 + .35));
  col = mix(col, uRimCol*(.5 + .4*alb), rim*.85);
  // reflejo de la luz de los ojos en la careta
  if (mat > 13.5 && mat < 14.5) col += vec3(.3,1.,.85)*uMFace.y*.5*ss(.3,.0,length(vec2(abs(lq.x) - .32, (lq.y + .64)*2.)))*step(.6, lq.z);
  for (int i=0;i<4;i++){
    if (uXL[i].w > 0.) col += vec3(1.,.5,.15)*uXL[i].w*bandPt(p, n, uXL[i].xyz, uMScale*1.6)*(alb + .05)*2.5;
  }
  float ao = calcAO(p, n, uMScale);
  col *= mix(.35, 1., ss(.25, .55, ao));
  return col;
}
vec3 shadeShaft(vec3 p, vec3 n, vec3 rd, float mat, float t){
  vec3 col = vec3(.03,.032,.04)*mix(.6, 1.2, ss(-.2,.2, dot(n, vec3(0.,-1.,0.))));
  if (mat > 20.5) {
    float a = atan(p.z, p.x);
    float lamp = step(.5, fract(a*6./TAU*4.))*step(.3, fract(p.y*.8));
    col = vec3(.08,.07,.07) + vec3(1.,.55,.2)*lamp*2.2;
  } else {
    float v = ss(.46, .49, abs(fract(p.y*.9) - .5));
    col *= 1. - .5*v;
    float a = atan(p.z, p.x);
    col += vec3(1.,.08,.04)*step(.93, fract(a*6./TAU*2. + .25))*step(.5, fract(p.y*.15 - uG*.8))*1.5;
  }
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
        acc += (uDomeEdge*ss(.0, .06, k)*.8 + mix(uDomeEdge, uDomeCore, .5)*ss(.22, .28, k)*1.6 + uDomeCore*ss(.45, .5, k)*4.)*uFx.x;
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

vec3 beamGlow(vec3 ro, vec3 rd, float tHit){
  vec3 acc = vec3(0.);
  for (int i=0;i<10;i++){
    if (i >= uBeamN) break;
    vec3 A = uBeamA[i].xyz, B = uBeamB[i].xyz; float w = uBeamA[i].w, k = uBeamB[i].w;
    vec3 ab = B - A, r0 = ro - A;
    float e = dot(ab,ab), f = dot(ab,r0), c = dot(rd,r0), b = dot(rd,ab);
    float den = e - b*b;
    float u = den > 1e-6 ? clamp((f - b*c)/den, 0., 1.) : 0.;
    vec3 Q = A + ab*u;
    float s = max(dot(Q - ro, rd), 0.);
    if (s > tHit + w) continue;
    float dist = length(ro + rd*s - Q);
    vec3 col = k >= 10. ? vec3(1.,.55,.18) : (k > 0. ? vec3(.3,1.,.9) : vec3(1.,.08,.04));
    float kk = k >= 10. ? k - 10. : abs(k);
    acc += (vec3(1.)*ss(w*.35, 0., dist)*2.5 + col*ss(w, w*.3, dist)*2. + col*exp(-dist/(w*2.5))*.5)*kk;
  }
  return acc;
}
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
    vec3 n = (h.y > 5.5 && h.y < 6.5) ? vec3(0.,1.,0.) : calcNormal(p, h.x);
    tHit = h.x; nOut = n;
    if (h.y > 19.5) {
#ifdef HAS_SHAFT
      col = shadeShaft(p, n, rd, h.y, h.x);
#endif
    } else if (h.y > 9.5) {
      col = shadeMecha(p, n, rd, h.y, h.x);
    } else if (h.y < 4.5 || h.y > 6.5) {
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
      if (uCrack.w > 0. && h.y > 5.5) {
        vec2 dq = p.xz - uCrack.xy; float dd = length(dq);
        float cr = 1. - ss(0., .04, crackNoise(vec3(dq*1.6, 1.)));
        col = mix(col, vec3(1.,.4,.1)*2., cr*ss(uCrack.z, uCrack.z*.7, dd)*uCrack.w);
        col *= 1. - .5*ss(uCrack.z*.5, 0., dd)*uCrack.w;
      }
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
  if (uBeamN > 0) col += beamGlow(ro, rd, tHit);
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
const CITYN = ['HAS_CITY', 'BG_NIGHT', 'HAS_CLOUDS', 'SKYLINE'];
const GIANT = ['HAS_HEAD', 'BODY 2', 'HAS_ARM_R', 'HAS_ARM_L'];
const SHOTS = {
  OPEN:   { defs: [...GIANT, 'BG_FIRE'], mods: [] },
  SHAFT:  { defs: ['HAS_MECHA', 'HAS_SHAFT', 'BG_DARK'], mods: [] },
  BURST:  { defs: ['HAS_MECHA', ...CITYN, 'HAS_DOME'], mods: [DOME] },
  LAND:   { defs: ['HAS_MECHA', ...CITYN, 'HAS_DOME'], mods: [DOME] },
  RUSH:   { defs: ['HAS_MECHA', ...GIANT, ...CITYN], mods: [] },
  PUNCH:  { defs: ['HAS_MECHA', ...GIANT, ...CITYN], mods: [] },
  LASER:  { defs: ['HAS_MECHA', 'HAS_ARMOFF', ...GIANT, ...CITYN], mods: [] },
  SQUAD:  { defs: ['HAS_SQUAD', ...GIANT, ...CITYN], mods: [] },
  CANNON: { defs: ['HAS_MECHA', ...GIANT, ...CITYN, 'HAS_DOME'], mods: [DOME] },
  AFTER:  { defs: ['HAS_MECHA', 'HAS_HEAD', 'BODY 2', 'HORDE', 'HAS_CITY', 'RUINS', 'BG_FIRE'], mods: [] },
  MECHATEST: { defs: ['HAS_MECHA', 'BG_DARK'], mods: [] },
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
uniform vec4 uExp[24]; uniform int uExpN;
uniform vec4 uSplat[10]; uniform int uSplatN;
uniform vec4 uRing[4]; uniform int uRingN;
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


// salpicadura (gore): sangre oscura del gigante (+) o refrigerante del mecha (−)
void splat(vec2 p, vec4 sp, float seed, inout vec3 col, inout float cov){
  float S = abs(sp.z), age = sp.w;
  vec2 d = (p - sp.xy)/S;
  if (length(d) > 4.) return;
  vec3 c0 = sp.z > 0. ? vec3(.2,0.,.02) : vec3(.35,1.,.85);
  vec3 c1 = sp.z > 0. ? vec3(.55,.02,.05) : vec3(.85,1.,.95);
  float ang = atan(d.y, d.x), r = length(d);
  float dir = seed*2.1 + 1.2;
  float lobe = pow(max(cos(ang - dir), 0.), 3.);
  float nz = fb(vec2(cos(ang), sin(ang))*1.7 + seed + age*.6);
  float grow = 1. - pow(1. - clamp(age*4.5, 0., 1.), 3.);
  float R = grow*(.28 + .5*nz + 1.4*lobe*(.4 + nz));
  R += .08*fb(d*6. + seed);
  float fade = 1. - smoothstep(.55, 1., age);
  float blob = (1. - smoothstep(R - .03, R + .03, r))*fade;
  float drops = 0.;
  for (int i=0;i<16;i++){
    float fi = float(i);
    float a = dir + (h11(fi*3.1 + seed) - .5)*1.6, v = 1. + 2.2*h11(fi*5.7 + seed);
    vec2 dp = vec2(cos(a), sin(a))*v*age*1.6 - vec2(0., 2.6*age*age);
    vec2 dd = d - dp; float rr = (.05 + .07*h11(fi + seed))*(1. - .4*age);
    float st = 1. + 2.5*age*h11(fi*2.3 + seed);
    vec2 vv = normalize(vec2(cos(a), sin(a) - 3.*age) + 1e-4);
    float along = dot(dd, vv), perp = dot(dd, vec2(-vv.y, vv.x));
    drops = max(drops, 1. - smoothstep(rr - .02, rr, length(vec2(along/st, perp))));
  }
  drops *= 1. - smoothstep(.7, 1., age);
  float m = max(blob, drops);
  float hl = smoothstep(.1, .2, fb(d*4. + seed + vec2(-.08, .08)) - fb(d*4. + seed) + .1);
  vec3 c = mix(c0, c1, hl*.6 + .2);
  if (sp.z < 0.) c *= 1.8;
  col = mix(col, c, m);
  cov = max(cov, m);
}
void ring(vec2 p, vec4 rg, inout vec3 col){
  float r = length((p - rg.xy)*vec2(1., 1.6));
  float w = .012 + .03*(1. - rg.w);
  col += vec3(1.,.9,.8)*smoothstep(w, 0., abs(r - rg.z))*rg.w*2.;
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
  for (int i=0;i<24;i++){
    if (i >= uExpN) break;
    explosion(p, uExp[i], float(i)*7.31, col, cov);
  }
  for (int i=0;i<10;i++){ if (i >= uSplatN) break; splat(p, uSplat[i], float(i)*3.7 + 1., col, cov); }
  for (int i=0;i<4;i++){ if (i >= uRingN) break; ring(p, uRing[i], col); }
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
uniform sampler2D uComp, uLine, uB1, uB2, uB3, uRays, uOverlay, uND;
uniform float uMotionNear;
uniform vec2 uRes; uniform float uFrame, uG;
uniform vec2 uShake; uniform float uZoom;
uniform float uImpact, uSpeed, uSpeedDark; uniform vec2 uSpeedPos;
uniform float uFlash; uniform vec3 uFlashCol; uniform float uFade;
uniform float uRaysAmt, uBloom, uCA, uHasScene;
uniform vec3 uLineCol; uniform vec4 uGrade; uniform vec2 uMotion;
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
    if (dot(uMotion, uMotion) > 1e-7) {
      float dp = texture(uND, cuv).w;
      float mb = smoothstep(uMotionNear, uMotionNear*1.7, dp);
      if (mb > 0.) {
        vec3 acc = vec3(0.); float wsum = 0.;
        for (int i=0;i<12;i++){ float k = float(i)/11. - .5; vec2 su = cuv + uMotion*k; float w = smoothstep(uMotionNear*.8, uMotionNear*1.3, texture(uND, su).w) + .05; acc += texture(uComp, su).rgb*w; wsum += w; }
        col = mix(col, acc/wsum, mb);
      }
    }
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
  col += (h21(uv*uRes + uFrame*.37) - .5)*.018;
  vec4 ov = texture(uOverlay, uv);
  col = mix(col, ov.rgb, ov.a);
  col = mix(col, uFlashCol, uFlash);
  col *= uFade;
  outCol = vec4(clamp(col, 0., 1.), 1.);
}`;

return { VERT, sceneSource, SHOTS, LINES, COMP, BRIGHT, BLUR, COPY, RAYS, FINAL };
})();
