// POV-Ray 3.7: la escena se escribe como texto y se anima con la variable "clock".
// Patio andaluz: fuente de mármol con agua, arcos de herradura, macetas con geranios,
// suelo de olambrilla y luz de mediodía con radiosidad (luz rebotada) y sombras de área.
// Render: povray patio.ini
#version 3.7;
#include "colors.inc"
#include "textures.inc"
#include "stones.inc"
#include "woods.inc"

global_settings { assumed_gamma 1.0 radiosity { pretrace_start 0.08 pretrace_end 0.01 count 60 recursion_limit 1 nearest_count 8 error_bound 0.6 } }

#declare A = clock * 2 * pi;
camera { location <6.2 * sin(A * 0.2 - 0.5), 2.2, -6.2 * cos(A * 0.2 - 0.5)> look_at <0, 1.0, 0> angle 60 }
light_source { <12, 22, -8> color rgb <1.0, 0.95, 0.85> * 1.25 area_light <3, 0, 0>, <0, 0, 3>, 3, 3 adaptive 1 jitter }
sky_sphere { pigment { gradient y color_map { [0 color rgb <0.75, 0.85, 0.95>] [1 color rgb <0.2, 0.42, 0.8>] } } }

// suelo de olambrilla: barro con azulejitos azules
plane { y, 0
  texture { pigment { checker color rgb <0.72, 0.38, 0.22> color rgb <0.66, 0.33, 0.19> } scale 0.5 finish { diffuse 0.8 } }
}
#declare Azulejito = box { <-0.07, -0.01, -0.07>, <0.07, 0.005, 0.07> texture { pigment { color rgb <0.1, 0.3, 0.75> } finish { specular 0.4 reflection 0.05 } } }
#for (I, -6, 6) #for (J, -6, 6) object { Azulejito translate <I * 1 + 0.5, 0, J * 1 + 0.5> } #end #end

// muros encalados con arcos de herradura alrededor
#declare Arco = difference {
  box { <-1.6, 0, -0.25>, <1.6, 4.2, 0.25> }
  union { box { <-1.0, -0.1, -0.5>, <1.0, 2.2, 0.5> } cylinder { <0, 2.4, -0.5>, <0, 2.4, 0.5>, 1.12 } }
  texture { pigment { color rgb <0.95, 0.94, 0.9> } normal { granite 0.08 scale 0.4 } finish { diffuse 0.9 } }
}
#declare Dovelas = difference {
  cylinder { <0, 2.4, -0.26>, <0, 2.4, 0.26>, 1.32 }
  cylinder { <0, 2.4, -0.5>, <0, 2.4, 0.5>, 1.12 }
  box { <-2, -1, -1>, <2, 2.0, 1> }
  texture { pigment { radial frequency 18 color_map { [0.5 color rgb <0.62, 0.16, 0.1>] [0.5 color rgb <0.93, 0.88, 0.78>] } rotate x * 90 translate y * 2.4 } }
}
#for (K, 0, 3)
  union { object { Arco } object { Dovelas } translate <0, 0, 5> rotate y * (K * 90) }
  union { object { Arco } object { Dovelas } translate <3.2, 0, 5> rotate y * (K * 90) }
  union { object { Arco } object { Dovelas } translate <-3.2, 0, 5> rotate y * (K * 90) }
#end

// fuente: taza de mármol, pie y surtidor
#declare Marmol = texture { pigment { marble turbulence 0.9 color_map { [0 color rgb <0.95, 0.93, 0.9>] [0.85 color rgb <0.88, 0.86, 0.84>] [1 color rgb <0.55, 0.52, 0.5>] } scale 0.4 } finish { specular 0.6 reflection 0.06 } }
difference { cylinder { <0, 0, 0>, <0, 0.55, 0>, 1.5 } cylinder { <0, 0.12, 0>, <0, 1, 0>, 1.35 } texture { Marmol } }
cylinder { <0, 0, 0>, <0, 1.15, 0>, 0.16 texture { Marmol } }
difference { sphere { <0, 1.15, 0>, 0.55 scale <1, 0.45, 1> translate y * 0.62 } plane { y, 1.15 inverse } plane { y, 1.18 } texture { Marmol } }
// agua con ondas que se mueven con el reloj
#declare Agua = material { texture { pigment { color rgbf <0.8, 0.92, 1, 0.92> } normal { ripples 0.35 frequency 6 phase clock * 4 scale 0.6 } finish { reflection { 0.1, 0.9 fresnel on } specular 0.8 roughness 0.002 } } interior { ior 1.33 fade_distance 1.5 fade_power 2 fade_color <0.2, 0.55, 0.6> } }
cylinder { <0, 0.12, 0>, <0, 0.45, 0>, 1.35 material { Agua } }
cylinder { <0, 1.15, 0>, <0, 1.35, 0>, 0.48 material { Agua } }
// chorro: gotas en parábola
#for (G, 0, 59)
  #declare Ang = G / 60 * 2 * pi;
  #declare T = mod(G * 0.137 + clock * 3, 1);
  sphere { <cos(Ang) * 0.45 * T, 1.8 + 1.3 * T - 2.2 * T * T, sin(Ang) * 0.45 * T>, 0.035 material { Agua } }
#end
cylinder { <0, 1.3, 0>, <0, 1.85, 0>, 0.035 material { Agua } }

// macetas de barro con geranios rojos junto a los muros
#declare Geranio = union {
  difference { cone { <0, 0, 0>, 0.22, <0, 0.45, 0>, 0.3 } cone { <0, 0.08, 0>, 0.18, <0, 0.5, 0>, 0.26 } texture { pigment { color rgb <0.7, 0.32, 0.18> } finish { diffuse 0.85 } } }
  #for (H, 0, 24)
    sphere { <0, 0.55, 0>, 0.11 translate <0.18 * sin(H * 2.4), 0.05 * mod(H, 3), 0.18 * cos(H * 2.4)> scale <1, 0.8, 1> texture { pigment { color rgb <0.15, 0.42, 0.12> } } }
  #end
  #for (H, 0, 9)
    sphere { <0, 0.72, 0>, 0.07 translate <0.15 * sin(H * 1.7), 0.04 * mod(H, 2), 0.15 * cos(H * 1.7)> texture { pigment { color rgb <0.92, 0.05, 0.12> } finish { specular 0.3 } } }
  #end
}
#for (K, 0, 3) #for (Q, -1, 1)
  object { Geranio translate <Q * 3.2 + 1.5, 0, 4.4> rotate y * (K * 90) }
#end #end
// un naranjo en una esquina
union {
  cylinder { <0, 0, 0>, <0, 1.4, 0>, 0.09 texture { pigment { color rgb <0.35, 0.24, 0.16> } normal { bumps 0.6 scale 0.05 } } }
  sphere { <0, 2.0, 0>, 0.85 scale <1, 0.85, 1> texture { pigment { color rgb <0.12, 0.35, 0.1> } normal { bumps 0.9 scale 0.08 } } }
  #for (N, 0, 14)
    sphere { <0.82 * sin(N * 2.2), 1.9 + 0.4 * sin(N * 1.3), 0.82 * cos(N * 2.2)> * <0.9, 1, 0.9>, 0.08 texture { pigment { color rgb <1, 0.48, 0.05> } finish { specular 0.4 } } }
  #end
  translate <3.6, 0, 3.6>
}
