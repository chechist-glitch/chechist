import java.awt.image.BufferedImage;
import java.util.stream.IntStream;

/**
 * Op-art a lo Vasarely: una rejilla de cuadros con círculos que se hincha
 * como una esfera en un sitio y se hunde en otro. Se calcula por píxel
 * deformando las coordenadas antes de mirar qué casilla toca.
 *
 * Uso: java OpArt salida.png
 */
public class OpArt {
    static final double CELL = 56;
    // Paleta Vasarely: añil, violeta, magenta, naranja, amarillo
    static final double[][] PAL = {
            {0.106, 0.078, 0.392}, {0.416, 0.106, 0.604}, {0.847, 0.106, 0.376}, {0.984, 0.549, 0.0}, {0.992, 0.847, 0.208},
    };

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "opart.png";
        int W = Gfx.W, H = Gfx.H;
        BufferedImage img = Gfx.newImage();
        int ss = 3;
        IntStream.range(0, H).parallel().forEach(py -> {
            for (int px = 0; px < W; px++) {
                double r = 0, g = 0, b = 0;
                for (int sy = 0; sy < ss; sy++)
                    for (int sx = 0; sx < ss; sx++) {
                        double[] c = shade(px + (sx + 0.5) / ss, py + (sy + 0.5) / ss);
                        r += c[0];
                        g += c[1];
                        b += c[2];
                    }
                int n = ss * ss;
                img.setRGB(px, py, Gfx.rgb(r / n, g / n, b / n));
            }
        });
        Gfx.save(img, out);
    }

    /** Lente: dentro del radio R estira (k > 1, bulto) o encoge (k < 1, hundimiento) las coordenadas. */
    static double[] lens(double x, double y, double cx, double cy, double R, double k) {
        double dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
        if (d >= R || d == 0) return new double[]{x, y, 0};
        double t = d / R;
        double nt = Math.pow(t, k);
        return new double[]{cx + dx / d * nt * R, cy + dy / d * nt * R, 1 - t};
    }

    static double[] shade(double x, double y) {
        double[] a = lens(x, y, 720, 520, 470, 1.45);
        double[] b = lens(a[0], a[1], 1480, 560, 330, 0.55);
        double qx = b[0], qy = b[1];
        int i = (int) Math.floor(qx / CELL), j = (int) Math.floor(qy / CELL);
        double u = qx / CELL - i - 0.5, v = qy / CELL - j - 0.5;
        double t = Gfx.clamp((i + j * 0.6) / (1920 / CELL + 1080 / CELL * 0.6));
        double[] c1 = pal(t), c2 = pal(1 - t);
        boolean check = ((i + j) & 1) == 0;
        double[] bg = check ? c1 : c2, fg = check ? c2 : c1;
        // Círculo que cambia de tamaño a lo largo de la diagonal
        double rad = 0.18 + 0.2 * (0.5 + 0.5 * Math.sin((i - j) * 0.35));
        double d = Math.hypot(u, v);
        double edge = Gfx.smoothstep(rad + 0.01, rad - 0.01, d);
        double[] c = new double[3];
        for (int k = 0; k < 3; k++) c[k] = bg[k] * (1 - edge) + fg[k] * edge;
        // Sombreado suave para que el bulto parezca una esfera y el hueco un pozo
        double lit = 1 - 0.35 * Math.pow(1 - a[2], 3) * (a[2] > 0 ? 1 : 0) - 0.3 * b[2];
        for (int k = 0; k < 3; k++) c[k] *= lit;
        return c;
    }

    static double[] pal(double t) {
        t = Gfx.clamp(t) * (PAL.length - 1);
        int i = Math.min((int) t, PAL.length - 2);
        double f = t - i;
        return new double[]{
                PAL[i][0] + (PAL[i + 1][0] - PAL[i][0]) * f,
                PAL[i][1] + (PAL[i + 1][1] - PAL[i][1]) * f,
                PAL[i][2] + (PAL[i + 1][2] - PAL[i][2]) * f};
    }
}
