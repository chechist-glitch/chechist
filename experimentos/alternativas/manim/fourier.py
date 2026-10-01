# Manim (Community Edition): epiciclos de Fourier que dibujan una estrella de ocho puntas
# (la de los azulejos) con 40 círculos girando uno encima de otro.
# Render: manim -qh fourier.py Epiciclos
import numpy as np
from manim import *

config.background_color = "#0c1222"


def estrella(t):
    # contorno de una estrella de 8 puntas, parametrizado en [0, 1)
    a = t * TAU
    r = 1.0 + 0.38 * np.cos(8 * a) ** 3
    return r * np.exp(1j * a) * 2.25 + (1.6 - 0.45j)


class Epiciclos(Scene):
    def construct(self):
        N = 400
        muestras = np.array([estrella(k / N) for k in range(N)])
        coef = np.fft.fft(muestras) / N
        frecs = np.fft.fftfreq(N, 1 / N)
        orden = np.argsort(-np.abs(coef))[:40]
        coef, frecs = coef[orden], frecs[orden]

        titulo = Text("Epiciclos de Fourier", font_size=40, weight=BOLD).to_corner(UL)
        sub = Text("40 círculos girando dibujan una estrella de azulejo", font_size=22, color=GREY_B).next_to(titulo, DOWN, aligned_edge=LEFT)
        self.play(Write(titulo), FadeIn(sub, shift=UP * 0.2), run_time=1.2)

        t = ValueTracker(0)

        def puntos():
            p = 0j
            res = [p]
            for c, f in zip(coef, frecs):
                p += c * np.exp(1j * TAU * f * t.get_value())
                res.append(p)
            return res

        def circulos():
            g = VGroup()
            pts = puntos()
            for i, (c, f) in enumerate(zip(coef, frecs)):
                cen = pts[i]
                g.add(Circle(radius=abs(c), stroke_width=1, stroke_opacity=0.35, color=BLUE_C).move_to([cen.real, cen.imag, 0]))
                g.add(Line([cen.real, cen.imag, 0], [pts[i + 1].real, pts[i + 1].imag, 0], stroke_width=1.5, color=WHITE, stroke_opacity=0.7))
            return g

        brazos = always_redraw(circulos)
        traza = TracedPath(lambda: np.array([puntos()[-1].real, puntos()[-1].imag, 0]), stroke_color=GOLD, stroke_width=4)
        punta = always_redraw(lambda: Dot([puntos()[-1].real, puntos()[-1].imag, 0], color=GOLD, radius=0.05))
        self.add(brazos, traza, punta)
        self.play(t.animate.set_value(1), run_time=9, rate_func=linear)
        relleno = Polygon(*[[z.real, z.imag, 0] for z in muestras[::4]], stroke_width=0, fill_color=BLUE_E, fill_opacity=0.0)
        self.add(relleno)
        self.play(FadeOut(brazos), relleno.animate.set_fill(opacity=0.45), run_time=1.2)
        formula = Text("z(t) = Σ cₙ · e^(2πi·n·t)", font_size=32, color=GOLD_A).to_edge(DOWN)
        self.play(Write(formula), run_time=1.2)
        self.wait(1)
