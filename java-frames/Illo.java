import java.awt.*;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.awt.image.DataBufferByte;
import java.util.Random;
import java.util.stream.IntStream;

/** Utilidades para la serie de ilustración: formas orgánicas, papel y risografía. */
final class Illo {
    private Illo() {}

    static Graphics2D g2(BufferedImage img) {
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        return g;
    }

    static Color hex(String s) { return new Color(Integer.parseInt(s.replace("#", ""), 16)); }

    static Color alpha(Color c, int a) { return new Color(c.getRed(), c.getGreen(), c.getBlue(), a); }

    static Color shade(Color c, double k) {
        return new Color(Gfx.rgb(c.getRed() / 255.0 * k, c.getGreen() / 255.0 * k, c.getBlue() / 255.0 * k));
    }

    static Color pick(Random r, Color... cs) { return cs[r.nextInt(cs.length)]; }

    static double range(Random r, double a, double b) { return a + r.nextDouble() * (b - a); }

    static BasicStroke stroke(double w) {
        return new BasicStroke((float) w, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND);
    }

    /** Curva cerrada suave que pasa por todos los puntos (Catmull-Rom pasado a Bézier). */
    static Path2D.Double smoothClosed(double[] xs, double[] ys) {
        int n = xs.length;
        Path2D.Double p = new Path2D.Double();
        p.moveTo(xs[0], ys[0]);
        for (int i = 0; i < n; i++) {
            int i0 = (i - 1 + n) % n, i2 = (i + 1) % n, i3 = (i + 2) % n;
            double c1x = xs[i] + (xs[i2] - xs[i0]) / 6, c1y = ys[i] + (ys[i2] - ys[i0]) / 6;
            double c2x = xs[i2] - (xs[i3] - xs[i]) / 6, c2y = ys[i2] - (ys[i3] - ys[i]) / 6;
            p.curveTo(c1x, c1y, c2x, c2y, xs[i2], ys[i2]);
        }
        p.closePath();
        return p;
    }

    /** Mancha orgánica alrededor de (cx, cy); wobble = cuánto se deforma. */
    static Path2D.Double blob(Random r, double cx, double cy, double rx, double ry, double wobble, int n) {
        double[] xs = new double[n], ys = new double[n];
        double ph = r.nextDouble() * Math.PI * 2;
        for (int i = 0; i < n; i++) {
            double a = ph + i * 2 * Math.PI / n;
            double k = 1 + (r.nextDouble() * 2 - 1) * wobble;
            xs[i] = cx + Math.cos(a) * rx * k;
            ys[i] = cy + Math.sin(a) * ry * k;
        }
        return smoothClosed(xs, ys);
    }

    /** Polígono con los bordes "rasgados", como un trozo de papel. */
    static Path2D.Double torn(Random r, double[] xs, double[] ys, double rough) {
        Path2D.Double p = new Path2D.Double();
        int n = xs.length;
        p.moveTo(xs[0], ys[0]);
        for (int i = 0; i < n; i++) {
            double ax = xs[i], ay = ys[i], bx = xs[(i + 1) % n], by = ys[(i + 1) % n];
            double len = Math.hypot(bx - ax, by - ay);
            int steps = Math.max(2, (int) (len / 7));
            double nx = -(by - ay) / len, ny = (bx - ax) / len;
            for (int s = 1; s <= steps; s++) {
                double t = (double) s / steps;
                double j = s == steps ? 0 : (r.nextDouble() * 2 - 1) * rough;
                p.lineTo(ax + (bx - ax) * t + nx * j, ay + (by - ay) * t + ny * j);
            }
        }
        p.closePath();
        return p;
    }

    /** Grano de papel: ruido fino por píxel y manchas suaves. */
    static void grain(BufferedImage img, long seed, double amount) {
        Gfx.Perlin n = new Gfx.Perlin(seed);
        int w = img.getWidth(), h = img.getHeight();
        IntStream.range(0, h).parallel().forEach(y -> {
            Random r = new Random(seed * 7919 + y);
            for (int x = 0; x < w; x++) {
                int c = img.getRGB(x, y);
                double k = 1 + (r.nextDouble() - 0.5) * amount + n.fbm(x * 0.004, y * 0.004, 3) * amount * 0.5;
                img.setRGB(x, y, Gfx.rgb(Gfx.r(c) * k, Gfx.g(c) * k, Gfx.b(c) * k));
            }
        });
    }

    /**
     * Imprenta risográfica virtual. Cada tinta es una capa en escala de grises
     * (blanco = tinta a tope). Al "imprimir", cada capa se desplaza unos
     * píxeles (mal registro), se le mete textura irregular y se multiplica
     * sobre el papel, así que las tintas solapadas crean colores nuevos.
     */
    static final class Riso {
        final int w, h;
        final Color[] inks;
        final BufferedImage[] masks;
        final int[][] off;

        Riso(int w, int h, long seed, Color... inks) {
            this.w = w;
            this.h = h;
            this.inks = inks;
            masks = new BufferedImage[inks.length];
            off = new int[inks.length][2];
            Random r = new Random(seed);
            for (int i = 0; i < inks.length; i++) {
                masks[i] = new BufferedImage(w, h, BufferedImage.TYPE_BYTE_GRAY);
                off[i][0] = r.nextInt(13) - 6;
                off[i][1] = r.nextInt(13) - 6;
            }
        }

        Graphics2D layer(int i) { return g2(masks[i]); }

        /** Color para dibujar en una capa: densidad de tinta 0..1. */
        static Color ink(double density) {
            int v = (int) Math.round(Gfx.clamp(density) * 255);
            return new Color(v, v, v);
        }

        BufferedImage print(Color paper, long seed) {
            BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            byte[][] data = new byte[inks.length][];
            for (int i = 0; i < inks.length; i++)
                data[i] = ((DataBufferByte) masks[i].getRaster().getDataBuffer()).getData();
            Gfx.Perlin n = new Gfx.Perlin(seed);
            double pr = paper.getRed() / 255.0, pg = paper.getGreen() / 255.0, pb = paper.getBlue() / 255.0;
            IntStream.range(0, h).parallel().forEach(y -> {
                Random rnd = new Random(seed * 31 + y);
                for (int x = 0; x < w; x++) {
                    double r = pr, g = pg, b = pb;
                    for (int i = 0; i < inks.length; i++) {
                        int sx = x - off[i][0], sy = y - off[i][1];
                        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
                        double m = (data[i][sy * w + sx] & 255) / 255.0;
                        if (m <= 0) continue;
                        double blot = 0.84 + 0.16 * n.fbm(x * 0.007 + i * 13.1, y * 0.007, 3);
                        double speck = rnd.nextDouble() < 0.035 ? 0.4 : 0.93 + 0.07 * rnd.nextDouble();
                        m = Gfx.clamp(m * blot * speck);
                        Color c = inks[i];
                        r *= 1 - m * (1 - c.getRed() / 255.0);
                        g *= 1 - m * (1 - c.getGreen() / 255.0);
                        b *= 1 - m * (1 - c.getBlue() / 255.0);
                    }
                    out.setRGB(x, y, Gfx.rgb(r, g, b));
                }
            });
            return out;
        }
    }
}
