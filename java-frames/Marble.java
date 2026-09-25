import java.awt.image.BufferedImage;
import java.util.stream.IntStream;

/**
 * "Domain warping": ruido deformado por ruido deformado por ruido.
 * Sale una cosa entre mármol, nebulosa y pintura derramada.
 *
 * Uso: java Marble salida.png [semilla]
 */
public class Marble {
    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "marble.png";
        Gfx.Perlin n = new Gfx.Perlin(Gfx.seedArg(args, 1, 42));
        int W = Gfx.W, H = Gfx.H;
        BufferedImage img = Gfx.newImage();
        double s = 1.5 / H;

        IntStream.range(0, H).parallel().forEach(py -> {
            for (int px = 0; px < W; px++) {
                double x = px * s, y = py * s;
                double qx = 0.5 + 0.5 * n.fbm(x, y, 5);
                double qy = 0.5 + 0.5 * n.fbm(x + 5.2, y + 1.3, 5);
                double rx = 0.5 + 0.5 * n.fbm(x + 4 * qx + 1.7, y + 4 * qy + 9.2, 5);
                double ry = 0.5 + 0.5 * n.fbm(x + 4 * qx + 8.3, y + 4 * qy + 2.8, 5);
                double f = Gfx.clamp(0.5 + 0.5 * n.fbm(x + 4 * rx, y + 4 * ry, 5));

                // Mezcla de colores: turquesa -> crema, luego tinta azul y hielo
                double t = Gfx.clamp(f * f * 4);
                double cr = mix(0.10, 0.85, t), cg = mix(0.55, 0.62, t), cb = mix(0.62, 0.42, t);
                double lq = Gfx.clamp(Math.hypot(qx, qy) - 0.4);
                cr = mix(cr, 0.02, lq);
                cg = mix(cg, 0.02, lq);
                cb = mix(cb, 0.20, lq);
                double lr = Gfx.clamp(Math.abs(rx - 0.5) * 3);
                cr = mix(cr, 0.95, lr * 0.5);
                cg = mix(cg, 0.55, lr * 0.5);
                cb = mix(cb, 0.35, lr * 0.5);
                double k = f * f * f + 0.6 * f * f + 0.6 * f + 0.2;
                img.setRGB(px, py, Gfx.rgb(cr * k, cg * k, cb * k));
            }
        });
        Gfx.save(img, out);
    }

    static double mix(double a, double b, double t) { return a + (b - a) * Gfx.clamp(t); }
}
