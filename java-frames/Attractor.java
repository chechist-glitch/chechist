import java.awt.image.BufferedImage;

/**
 * Atractor de Clifford: un sistema caótico de dos ecuaciones que, iterado
 * 40 millones de veces, dibuja una especie de tela de humo. Cada píxel guarda
 * cuántas veces pasó el punto por él y hacia dónde iba, y eso se convierte
 * en brillo y color.
 *
 * Uso: java Attractor salida.png
 */
public class Attractor {
    static final double A = -1.4, B = 1.6, C = 1.0, D = 0.7;
    static final long ITER = 40_000_000L;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "attractor.png";
        int W = Gfx.W, H = Gfx.H;
        double[] count = new double[W * H];
        double[] hue = new double[W * H];

        double x = 0.1, y = 0.1;
        double sc = H / 4.0;
        for (long i = 0; i < ITER; i++) {
            double nx = Math.sin(A * y) + C * Math.cos(A * x);
            double ny = Math.sin(B * x) + D * Math.cos(B * y);
            double ang = Math.atan2(ny - y, nx - x);
            x = nx;
            y = ny;
            int px = (int) (W / 2.0 + x * sc);
            int py = (int) (H / 2.0 + y * sc);
            if (px >= 0 && px < W && py >= 0 && py < H) {
                int k = py * W + px;
                count[k]++;
                hue[k] += ang;
            }
        }

        double max = 0;
        for (double c : count) max = Math.max(max, c);
        double logMax = Math.log1p(max);

        BufferedImage img = Gfx.newImage();
        for (int py = 0; py < H; py++) {
            for (int px = 0; px < W; px++) {
                int k = py * W + px;
                double v = Math.log1p(count[k]) / logMax;
                v = Math.pow(v, 0.8);
                double t = count[k] > 0 ? (hue[k] / count[k]) / (2 * Math.PI) : 0;
                double[] c = Gfx.cosPalette(t * 0.8 + v * 0.4,
                        new double[]{0.5, 0.5, 0.5}, new double[]{0.5, 0.5, 0.5},
                        new double[]{1.0, 1.0, 1.0}, new double[]{0.30, 0.20, 0.20});
                // Fondo papel oscuro y el humo encima
                double bgR = 0.03, bgG = 0.035, bgB = 0.06;
                double white = Math.pow(v, 3) * 0.8;
                img.setRGB(px, py, Gfx.rgb(
                        bgR + c[0] * v + white,
                        bgG + c[1] * v + white,
                        bgB + c[2] * v + white));
            }
        }
        Gfx.save(img, out);
    }
}
