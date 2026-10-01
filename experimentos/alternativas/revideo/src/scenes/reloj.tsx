/** @jsxImportSource @revideo/2d/lib */
// Revideo (fork de Motion Canvas): animación por generadores, renderizada sin editor desde Node.
// Un reloj de sol andaluz: la sombra del gnomon recorre las horas mientras el cielo cambia,
// y las cifras romanas aparecen una a una con muelle.
import { Circle, Line, Rect, Txt, makeScene2D } from "@revideo/2d";
import { all, createRef, createSignal, easeInOutCubic, easeOutBack, linear, sequence, waitFor, Color } from "@revideo/core";

export default makeScene2D("reloj", function* (view) {
  const hora = createSignal(6);
  const cielo = Color.createSignal("#1b2a4a");
  const fondo = createRef<Rect>();
  view.add(<Rect ref={fondo} width={1280} height={720} fill={cielo} />);
  const R = 250;
  const cara = createRef<Circle>();
  view.add(<Circle ref={cara} size={R * 2 + 40} fill={"#efe3c8"} stroke={"#8a5a2b"} lineWidth={10} y={40} />);
  const romanas = ["VI", "VII", "VIII", "IX", "X", "XI", "XII", "I", "II", "III", "IV", "V", "VI"];
  const cifras = romanas.map((t, i) => {
    const a = Math.PI + (i / 12) * Math.PI;
    const r = createRef<Txt>();
    view.add(<Txt ref={r} text={t} fontFamily={"DejaVu Serif"} fontWeight={700} fontSize={34} fill={"#5a3a1a"} x={Math.cos(a) * (R - 20)} y={40 + Math.sin(a) * (R - 20)} scale={0} />);
    view.add(<Line points={[[Math.cos(a) * (R - 60), 40 + Math.sin(a) * (R - 60)], [Math.cos(a) * (R - 80), 40 + Math.sin(a) * (R - 80)]]} stroke={"#5a3a1a"} lineWidth={3} />);
    return r;
  });
  const sombra = createRef<Line>();
  view.add(
    <Line ref={sombra} lineWidth={14} stroke={"#2b2118"} opacity={0.75} lineCap={"round"}
      points={() => {
        const a = Math.PI + ((hora() - 6) / 12) * Math.PI;
        return [[0, 40], [Math.cos(a) * (R - 40), 40 + Math.sin(a) * (R - 40)]];
      }} />,
  );
  view.add(<Circle size={34} fill={"#8a5a2b"} y={40} />);
  const titulo = createRef<Txt>();
  view.add(<Txt ref={titulo} text={"Reloj de sol"} fontFamily={"DejaVu Sans"} fontWeight={700} fontSize={56} fill={"#fff"} y={-300} opacity={0} />);
  const lectura = createRef<Txt>();
  view.add(<Txt ref={lectura} text={"6:00"} fontFamily={"DejaVu Sans Mono"} fontSize={40} fill={"#fff"} y={-235} x={330} opacity={0} />);
  view.add(<Txt text={"hecho con Revideo"} fontFamily={"DejaVu Sans"} fontSize={18} fill={"#ffffffaa"} x={-520} y={330} />);

  yield* all(titulo().opacity(1, 0.8), titulo().y(-290, 0.8, easeOutBack), lectura().opacity(1, 0.8));
  yield* sequence(0.08, ...cifras.map((c) => c().scale(1, 0.5, easeOutBack)));
  const leer = () => `${Math.floor(hora())}:${String(Math.floor((hora() % 1) * 60)).padStart(2, "0")}`;
  function* reloj() {
    for (let i = 0; i < 6 * 30; i++) { lectura().text(leer()); yield; }
  }
  yield* all(
    reloj(),
    hora(18, 6, linear),
    cielo("#ffb35c", 1.5, easeInOutCubic).to("#7cc4ff", 1.5).to("#ff8a4c", 1.5).to("#2a1b4a", 1.5),
  );
  yield* waitFor(0.8);
});
