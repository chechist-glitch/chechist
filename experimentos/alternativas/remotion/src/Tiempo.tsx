// Remotion: el vídeo es un componente de React y los datos entran como props.
// Un "parte del tiempo" de 10 s generado a partir de una tabla de temperaturas:
// barras con muelles (spring), contador animado, sol que gira y texto que entra palabra a palabra.
import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Sequence, Easing } from "remotion";

const DATOS = [
  { dia: "LUN", max: 31, min: 18, icono: "☀" },
  { dia: "MAR", max: 34, min: 20, icono: "☀" },
  { dia: "MIÉ", max: 38, min: 23, icono: "🔥" },
  { dia: "JUE", max: 41, min: 25, icono: "🔥" },
  { dia: "VIE", max: 36, min: 22, icono: "⛅" },
  { dia: "SÁB", max: 29, min: 17, icono: "🌧" },
  { dia: "DOM", max: 32, min: 19, icono: "☀" },
];

const Sol: React.FC<{ f: number }> = ({ f }) => (
  <svg width={260} height={260} viewBox="-130 -130 260 260" style={{ position: "absolute", right: 70, top: 50 }}>
    <g transform={`rotate(${f * 0.8})`}>
      {Array.from({ length: 16 }, (_, i) => (
        <rect key={i} x={-6} y={-122} width={12} height={34} rx={6} fill="#ffb703" transform={`rotate(${i * 22.5})`} />
      ))}
    </g>
    <circle r={78} fill="#ffd166" />
    <circle r={78} fill="url(#g)" />
    <defs>
      <radialGradient id="g" cx="0.35" cy="0.35"><stop offset="0" stopColor="#fff3b0" /><stop offset="1" stopColor="#fb8500" stopOpacity="0.6" /></radialGradient>
    </defs>
  </svg>
);

export const Tiempo: React.FC<{ ciudad: string }> = ({ ciudad }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fondo = interpolate(f, [0, 300], [0, 1]);
  const maxima = Math.max(...DATOS.map((d) => d.max));
  const contador = Math.round(interpolate(f, [150, 210], [0, maxima], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  const titulo = `El tiempo en ${ciudad}`.split(" ");
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, hsl(${200 - fondo * 30}, 70%, ${40 - fondo * 10}%), hsl(${20 + fondo * 10}, 85%, 55%))`, fontFamily: "DejaVu Sans, sans-serif", color: "white" }}>
      <Sol f={f} />
      <div style={{ position: "absolute", left: 70, top: 60, fontSize: 64, fontWeight: 800, display: "flex", gap: 18 }}>
        {titulo.map((p, i) => {
          const s = spring({ frame: f - i * 5, fps, config: { damping: 12 } });
          return <span key={i} style={{ transform: `translateY(${(1 - s) * 60}px)`, opacity: s }}>{p}</span>;
        })}
      </div>
      <div style={{ position: "absolute", left: 72, top: 150, fontSize: 26, opacity: interpolate(f, [20, 40], [0, 0.85], { extrapolateRight: "clamp" }) }}>
        semana del 28 de septiembre · datos de ejemplo
      </div>
      <div style={{ position: "absolute", left: 70, right: 70, bottom: 70, height: 360, display: "flex", alignItems: "flex-end", gap: 26 }}>
        {DATOS.map((d, i) => {
          const s = spring({ frame: f - 30 - i * 6, fps, config: { damping: 9, stiffness: 90 } });
          const alto = (d.max / 45) * 300 * s;
          const caliente = d.max >= 38;
          return (
            <div key={d.dia} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 30, opacity: s }}>{d.icono}</div>
              <div style={{ fontSize: 30, fontWeight: 700, opacity: s }}>{Math.round(d.max * s)}°</div>
              <div style={{ width: "100%", height: alto, borderRadius: 14, background: caliente ? "linear-gradient(#ff3d3d, #ff9e2c)" : "linear-gradient(#ffd166, #ffffff55)", boxShadow: caliente ? "0 0 30px #ff3d3d" : "none" }} />
              <div style={{ fontSize: 24, letterSpacing: 2 }}>{d.dia}</div>
            </div>
          );
        })}
      </div>
      <Sequence from={150}>
        <div style={{ position: "absolute", right: 360, top: 40, textAlign: "right", transform: `scale(${spring({ frame: f - 150, fps })})` }}>
          <div style={{ fontSize: 26, opacity: 0.85 }}>máxima de la semana</div>
          <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>{contador}°</div>
        </div>
      </Sequence>
      <Sequence from={230}>
        <div style={{ position: "absolute", left: 70, top: 200, textAlign: "left", fontSize: 54, fontWeight: 800, opacity: interpolate(f, [230, 245], [0, 1], { extrapolateRight: "clamp" }), textShadow: "0 4px 20px #0006" }}>
          Quillo, ponte a la sombra
        </div>
      </Sequence>
      <div style={{ position: "absolute", left: 24, bottom: 18, fontSize: 16, opacity: 0.7 }}>hecho con Remotion · React</div>
    </AbsoluteFill>
  );
};
