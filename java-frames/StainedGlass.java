import java.awt.image.BufferedImage;
import java.util.Random;
import java.util.stream.IntStream;

/**
 * Vitral: parte la imagen en celdas de Voronoi, pinta cada una con el color
 * de la imagen de entrada en su centro, le pone plomo negro en las juntas y
 * textura de cristal con ruido.
 *
 * Uso: java StainedGlass entrada.png salida.png [tamañoCelda] [semilla]
 */
public class StainedGlass {
    public static void main(String[] args) throws Exception {
        BufferedImage src = Gfx.load(args[0]);
        String out = args[1];
        int cell = args.length > 2 ? Integer.parseInt(args[2]) : 38;
        long seed = Gfx.seedArg(args, 3, 99);
        int w = src.getWidth(), h = src.getHeight();

        // Una semilla por celda de rejilla, desplazada al azar (Voronoi con rejilla)
        int gw = w / cell + 2, gh = h / cell + 2;
        double[] sx = new double[gw * gh], sy = new double[gw * gh];
        int[] color = new int[gw * gh];
        Random rnd = new Random(seed);
        for (int j = 0; j < gh; j++) {
            for (int i = 0; i < gw; i++) {
                int k = j * gw + i;
                sx[k] = (i + 0.1 + rnd.nextDouble() * 0.8) * cell;
                sy[k] = (j + 0.1 + rnd.nextDouble() * 0.8) * cell;
                int px = (int) Math.min(w - 1, sx[k]), py = (int) Math.min(h - 1, sy[k]);
                color[k] = boost(src.getRGB(px, py), rnd.nextDouble());
            }
        }

        Gfx.Perlin n = new Gfx.Perlin(seed);
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        IntStream.range(0, h).parallel().forEach(y -> {
            for (int x = 0; x < w; x++) {
                int ci = x / cell, cj = y / cell;
                double d1 = 1e18, d2 = 1e18;
                int best = 0;
                for (int j = cj - 1; j <= cj + 1; j++) {
                    for (int i = ci - 1; i <= ci + 1; i++) {
                        if (i < 0 || j < 0 || i >= gw || j >= gh) continue;
                        int k = j * gw + i;
                        double d = Math.hypot(x - sx[k], y - sy[k]);
                        if (d < d1) { d2 = d1; d1 = d; best = k; }
                        else if (d < d2) d2 = d;
                    }
                }
                double edge = d2 - d1;
                double lead = Gfx.smoothstep(2.0, 3.6, edge);       // 0 en el plomo
                double inner = 0.55 + 0.45 * Gfx.smoothstep(0, cell * 0.45, edge);
                double tex = 0.88 + 0.12 * n.fbm(x * 0.03, y * 0.03, 4);
                double highlight = Math.pow(Gfx.clamp(1 - d1 / (cell * 0.8)), 6) * 0.25;
                int c = color[best];
                double k = inner * tex * lead;
                img.setRGB(x, y, Gfx.rgb(
                        Gfx.r(c) * k + highlight * lead + 0.03,
                        Gfx.g(c) * k + highlight * lead + 0.03,
                        Gfx.b(c) * k + highlight * lead + 0.035));
            }
        });
        Gfx.save(img, out);
    }

    /** Satura y aclara un poco, y a las celdas casi negras les da un tono de cristal oscuro. */
    static int boost(int c, double jitter) {
        double r = Gfx.r(c), g = Gfx.g(c), b = Gfx.b(c);
        double l = Gfx.lum(c);
        if (l < 0.08) {
            double t = jitter;
            return Gfx.rgb(0.10 + 0.10 * t, 0.06, 0.22 + 0.15 * t);
        }
        double sat = 1.35;
        return Gfx.rgb(l + (r - l) * sat, l + (g - l) * sat, l + (b - l) * sat);
    }
}
