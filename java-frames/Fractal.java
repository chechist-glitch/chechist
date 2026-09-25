import java.awt.image.BufferedImage;
import java.util.stream.IntStream;

/**
 * Conjunto de Julia con coloreado suave y "orbit trap" en cruz, que dibuja
 * filamentos brillantes dentro del fractal. Supermuestreo 3x3 para bordes finos.
 *
 * Uso: java Fractal salida.png
 */
public class Fractal {
    static final double CR = -0.7269, CI = 0.1889;
    static final int MAX_IT = 600;
    static final int SS = 3;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "fractal.png";
        int W = Gfx.W, H = Gfx.H;
        BufferedImage img = Gfx.newImage();
        double scale = 3.0 / H;

        IntStream.range(0, H).parallel().forEach(py -> {
            for (int px = 0; px < W; px++) {
                double r = 0, g = 0, b = 0;
                for (int sy = 0; sy < SS; sy++) {
                    for (int sx = 0; sx < SS; sx++) {
                        double x = (px + (sx + 0.5) / SS - W / 2.0) * scale;
                        double y = (py + (sy + 0.5) / SS - H / 2.0) * scale;
                        double[] c = shade(x, y);
                        r += c[0];
                        g += c[1];
                        b += c[2];
                    }
                }
                int n = SS * SS;
                img.setRGB(px, py, Gfx.rgb(r / n, g / n, b / n));
            }
        });
        Gfx.save(img, out);
    }

    static double[] shade(double zr, double zi) {
        double trap = 1e9;
        int i = 0;
        double m2 = 0;
        for (; i < MAX_IT; i++) {
            double t = zr * zr - zi * zi + CR;
            zi = 2 * zr * zi + CI;
            zr = t;
            m2 = zr * zr + zi * zi;
            trap = Math.min(trap, Math.min(Math.abs(zr), Math.abs(zi)));
            if (m2 > 256) break;
        }
        double glow = Math.exp(-trap * 38);
        if (i == MAX_IT) {
            // Interior: morado profundo con filamentos del trap
            return new double[]{0.05 + glow * 0.9, 0.02 + glow * 0.4, 0.10 + glow * 0.8};
        }
        double smooth = i + 1 - Math.log(Math.log(Math.sqrt(m2))) / Math.log(2);
        double t = Math.sqrt(smooth / 60.0);
        double[] c = Gfx.cosPalette(t,
                new double[]{0.5, 0.5, 0.5}, new double[]{0.5, 0.5, 0.5},
                new double[]{1.0, 0.7, 0.4}, new double[]{0.00, 0.15, 0.20});
        double fade = Gfx.smoothstep(0, 12, smooth);
        for (int k = 0; k < 3; k++) c[k] = c[k] * fade + glow * 0.35;
        return c;
    }
}
