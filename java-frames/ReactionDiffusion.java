import java.awt.image.BufferedImage;
import java.util.Random;
import java.util.stream.IntStream;

/**
 * Reacción-difusión de Gray-Scott: dos "químicos" virtuales que se comen y se
 * difunden. Los parámetros cambian de izquierda a derecha, así que en una sola
 * imagen salen manchas, laberintos y corales a la vez. Al final se ilumina
 * como si fuera un relieve.
 *
 * Uso: java ReactionDiffusion salida.png [semilla]
 */
public class ReactionDiffusion {
    static final int GW = 480, GH = 270;
    static final int STEPS = 14000;
    static final double DU = 1.0, DV = 0.5;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "reaction.png";
        Random rnd = new Random(Gfx.seedArg(args, 1, 7));

        double[] u = new double[GW * GH], v = new double[GW * GH];
        double[] u2 = new double[GW * GH], v2 = new double[GW * GH];
        java.util.Arrays.fill(u, 1.0);
        for (int s = 0; s < 260; s++) {
            int cx = rnd.nextInt(GW), cy = rnd.nextInt(GH), rad = 2 + rnd.nextInt(4);
            for (int y = -rad; y <= rad; y++)
                for (int x = -rad; x <= rad; x++) {
                    int k = idx(cx + x, cy + y);
                    u[k] = 0.5;
                    v[k] = 0.25;
                }
        }

        // Recorrido por el mapa de Pearson: laberinto -> coral -> huellas -> puntos
        double[][] keys = {{0.029, 0.057}, {0.0545, 0.062}, {0.039, 0.058}, {0.030, 0.062}};
        double[] feed = new double[GW], kill = new double[GW];
        for (int x = 0; x < GW; x++) {
            double t = x / (GW - 1.0) * (keys.length - 1);
            int i = Math.min((int) t, keys.length - 2);
            double f = Gfx.smoothstep(0, 1, t - i);
            feed[x] = keys[i][0] + (keys[i + 1][0] - keys[i][0]) * f;
            kill[x] = keys[i][1] + (keys[i + 1][1] - keys[i][1]) * f;
        }

        for (int step = 0; step < STEPS; step++) {
            final double[] cu = u, cv = v, nu = u2, nv = v2;
            IntStream.range(0, GH).parallel().forEach(y -> {
                for (int x = 0; x < GW; x++) {
                    int k = y * GW + x;
                    double lu = lap(cu, x, y), lv = lap(cv, x, y);
                    double uvv = cu[k] * cv[k] * cv[k];
                    nu[k] = cu[k] + DU * lu - uvv + feed[x] * (1 - cu[k]);
                    nv[k] = cv[k] + DV * lv + uvv - (feed[x] + kill[x]) * cv[k];
                }
            });
            double[] t = u; u = u2; u2 = t;
            t = v; v = v2; v2 = t;
        }

        // Render a 1920x1080 con interpolación bilineal + relieve iluminado
        int W = Gfx.W, H = Gfx.H;
        BufferedImage img = Gfx.newImage();
        final double[] fv = v;
        IntStream.range(0, H).parallel().forEach(py -> {
            for (int px = 0; px < W; px++) {
                double gx = px * (GW - 1.0) / (W - 1), gy = py * (GH - 1.0) / (H - 1);
                double val = sample(fv, gx, gy);
                double dx = sample(fv, gx + 0.5, gy) - sample(fv, gx - 0.5, gy);
                double dy = sample(fv, gx, gy + 0.5) - sample(fv, gx, gy - 0.5);
                double light = Gfx.clamp(0.6 - dx * 6 - dy * 6);
                double t = Gfx.smoothstep(0.05, 0.4, val);
                double[] c = Gfx.cosPalette(t * 0.6 + 0.25,
                        new double[]{0.5, 0.5, 0.5}, new double[]{0.5, 0.5, 0.5},
                        new double[]{1.0, 1.0, 0.5}, new double[]{0.80, 0.90, 0.30});
                double shade = 0.35 + light * 0.9;
                double spec = Math.pow(light, 8) * 0.5 * t;
                img.setRGB(px, py, Gfx.rgb(
                        c[0] * shade * (0.25 + t) + spec,
                        c[1] * shade * (0.25 + t) + spec,
                        c[2] * shade * (0.25 + t) + spec));
            }
        });
        Gfx.save(img, out);
    }

    /** Bordes "espejo" (no envuelve), así no aparece un marco raro en los lados. */
    static int idx(int x, int y) {
        x = Math.max(0, Math.min(GW - 1, x));
        y = Math.max(0, Math.min(GH - 1, y));
        return y * GW + x;
    }

    static double lap(double[] a, int x, int y) {
        return -a[idx(x, y)]
                + 0.2 * (a[idx(x - 1, y)] + a[idx(x + 1, y)] + a[idx(x, y - 1)] + a[idx(x, y + 1)])
                + 0.05 * (a[idx(x - 1, y - 1)] + a[idx(x + 1, y - 1)] + a[idx(x - 1, y + 1)] + a[idx(x + 1, y + 1)]);
    }

    static double sample(double[] a, double x, double y) {
        int x0 = (int) Math.floor(x), y0 = (int) Math.floor(y);
        double fx = x - x0, fy = y - y0;
        double top = a[idx(x0, y0)] * (1 - fx) + a[idx(x0 + 1, y0)] * fx;
        double bot = a[idx(x0, y0 + 1)] * (1 - fx) + a[idx(x0 + 1, y0 + 1)] * fx;
        return top * (1 - fy) + bot * fy;
    }
}
