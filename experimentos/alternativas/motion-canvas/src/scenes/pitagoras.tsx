/** @jsxImportSource @motion-canvas/2d/lib */
// Motion Canvas: vídeo explicativo hecho con generadores. Demostración visual del teorema
// de Pitágoras: los dos cuadrados pequeños se trocean y sus piezas se recolocan dentro del grande.
import { Line, Rect, Txt, Layout, makeScene2D, Polygon } from "@motion-canvas/2d";
import { all, createRef, easeInOutCubic, easeOutBack, sequence, waitFor, Vector2 } from "@motion-canvas/core";

export default makeScene2D(function* (view) {
  view.fill("#101624");
  const a = 150, b = 200, c = 250; // triángulo 3-4-5
  const O = new Vector2(-180, 170);
  const P = O.add([b, 0]);
  const Q = O.add([0, -a]);
  const tri = createRef<Polygon>();
  view.add(<Line ref={tri} points={[O, P, Q]} closed fill={"#ffd166"} stroke={"#fff"} lineWidth={4} end={0} />);
  const titulo = createRef<Txt>();
  view.add(<Txt ref={titulo} text={"a² + b² = c²"} fontFamily={"DejaVu Serif"} fontSize={72} fontWeight={700} fill={"#fff"} y={-300} opacity={0} />);
  const sub = createRef<Txt>();
  view.add(<Txt ref={sub} text={"el teorema de Pitágoras, sin palabras"} fontFamily={"DejaVu Sans"} fontSize={28} fill={"#9fb3d1"} y={-240} opacity={0} />);
  view.add(<Txt text={"hecho con Motion Canvas"} fontFamily={"DejaVu Sans"} fontSize={18} fill={"#ffffff88"} x={-520} y={330} />);

  yield* all(titulo().opacity(1, 0.8), sub().opacity(1, 1), tri().end(1, 1.2, easeInOutCubic));
  // cuadrados sobre los catetos y la hipotenusa
  const sqA = createRef<Rect>(), sqB = createRef<Rect>();
  view.add(<Rect ref={sqA} width={a} height={a} x={O.x - a / 2} y={O.y - a / 2} fill={"#ef476f"} opacity={0} scale={0} />);
  view.add(<Rect ref={sqB} width={b} height={b} x={O.x + b / 2} y={O.y + b / 2} fill={"#118ab2"} opacity={0} scale={0} />);
  const dir = P.sub(Q).normalized;
  const n = new Vector2(dir.y, -dir.x);
  const sqC = createRef<Line>();
  view.add(<Line ref={sqC} points={[Q, P, P.add(n.scale(c)), Q.add(n.scale(c))]} closed stroke={"#06d6a0"} lineWidth={5} end={0} />);
  const et = (t: string, pos: Vector2, color: string) => <Txt text={t} fontFamily={"DejaVu Serif"} fontSize={56} fontWeight={700} fill={color} position={pos} opacity={0} />;
  const ea = createRef<Txt>(), eb = createRef<Txt>(), ec = createRef<Txt>();
  view.add(<Txt ref={ea} text={"a²"} fontFamily={"DejaVu Serif"} fontSize={56} fontWeight={700} fill={"#fff"} x={O.x - a / 2} y={O.y - a / 2} opacity={0} />);
  view.add(<Txt ref={eb} text={"b²"} fontFamily={"DejaVu Serif"} fontSize={56} fontWeight={700} fill={"#fff"} x={O.x + b / 2} y={O.y + b / 2} opacity={0} />);
  const centroC = Q.add(P).scale(0.5).add(n.scale(c / 2));
  view.add(<Txt ref={ec} text={"c²"} fontFamily={"DejaVu Serif"} fontSize={64} fontWeight={700} fill={"#06d6a0"} position={centroC} opacity={0} />);
  yield* sequence(0.3, all(sqA().opacity(1, 0.5), sqA().scale(1, 0.6, easeOutBack)), all(sqB().opacity(1, 0.5), sqB().scale(1, 0.6, easeOutBack)), sqC().end(1, 0.8));
  yield* all(ea().opacity(1, 0.4), eb().opacity(1, 0.4), ec().opacity(1, 0.4));
  yield* waitFor(0.4);
  // las piezas viajan al cuadrado grande: a² y b² se trocean en celdas que rellenan c²
  const piezas: { r: Rect; destino: Vector2; ang: number }[] = [];
  const cel = 25;
  const u = dir.scale(1), v = n;
  const celdasC: Vector2[] = [];
  for (let i = 0; i < c / cel; i++) for (let j = 0; j < c / cel; j++) celdasC.push(Q.add(u.scale((i + 0.5) * cel)).add(v.scale((j + 0.5) * cel)));
  let k = 0;
  const ang = Math.atan2(dir.y, dir.x) * 180 / Math.PI;
  for (const [sq, lado, color, cx, cy] of [[sqA, a, "#ef476f", O.x - a, O.y - a], [sqB, b, "#118ab2", O.x, O.y]] as const) {
    for (let i = 0; i < lado / cel; i++) for (let j = 0; j < lado / cel; j++) {
      const r = createRef<Rect>();
      view.add(<Rect ref={r} width={cel - 2} height={cel - 2} fill={color} x={cx + (i + 0.5) * cel} y={cy + (j + 0.5) * cel} />);
      piezas.push({ r: r(), destino: celdasC[k++ % celdasC.length], ang });
    }
  }
  sqA().opacity(0); sqB().opacity(0);
  yield* all(ea().opacity(0, 0.3), eb().opacity(0, 0.3), ec().opacity(0, 0.3));
  yield* sequence(0.012, ...piezas.map((p) => all(p.r.position(p.destino, 0.9, easeInOutCubic), p.r.rotation(p.ang, 0.9, easeInOutCubic))));
  ec().moveToTop();
  ec().fill("#ffffff");
  yield* ec().opacity(1, 0.5);
  const fin = createRef<Txt>();
  view.add(<Txt ref={fin} text={"9 + 16 = 25"} fontFamily={"DejaVu Serif"} fontSize={48} fill={"#ffd166"} x={360} y={260} opacity={0} />);
  yield* fin().opacity(1, 0.6);
  yield* waitFor(1.2);
});
