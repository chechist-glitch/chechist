import javax.imageio.ImageIO;
import java.awt.*;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Random;

/**
 * Genera un único frame de arte generativo: miles de partículas que siguen
 * un campo de flujo invisible creado con ruido Perlin.
 *
 * Uso: javac FlowField.java && java FlowField [salida.png] [semilla]
 */
public class FlowField {

    static final int W = 1920, H = 1080;
    static final int PARTICLES = 9000;
    static final int STEPS = 260;
    static final double SCALE = 0.0022;
    static final double STEP_LEN = 1.6;

    // Paleta: azul noche -> turquesa -> dorado -> coral
    static final Color[] PALETTE = {
            new Color(40, 70, 170),
            new Color(40, 190, 200),
            new Color(250, 200, 90),
            new Color(250, 90, 90),
    };

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "flowfield.png";
        long seed = args.length > 1 ? Long.parseLong(args[1]) : 1234L;

        Random rnd = new Random(seed);
        Perlin noise = new Perlin(seed);

        BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_STROKE_CONTROL, RenderingHints.VALUE_STROKE_PURE);

        // Fondo con degradado oscuro
        g.setPaint(new GradientPaint(0, 0, new Color(8, 8, 18), W, H, new Color(20, 10, 30)));
        g.fillRect(0, 0, W, H);

        g.setStroke(new BasicStroke(0.8f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));

        for (int i = 0; i < PARTICLES; i++) {
            double x = rnd.nextDouble() * W;
            double y = rnd.nextDouble() * H;

            Path2D.Double path = new Path2D.Double();
            path.moveTo(x, y);
            double avgAngle = 0;
            int steps = 0;

            for (int s = 0; s < STEPS; s++) {
                double n = noise.noise(x * SCALE, y * SCALE, 0.0);
                double angle = n * Math.PI * 4;
                avgAngle += angle;
                x += Math.cos(angle) * STEP_LEN;
                y += Math.sin(angle) * STEP_LEN;
                if (x < 0 || x >= W || y < 0 || y >= H) break;
                path.lineTo(x, y);
                steps++;
            }
            if (steps < 10) continue;

            // El color depende de la dirección media del trazo y de su posición
            double t = (Math.sin(avgAngle / steps) + 1) / 2 * 0.7 + (y / H) * 0.3;
            Color c = samplePalette(t);
            int alpha = 18 + rnd.nextInt(30);
            g.setColor(new Color(c.getRed(), c.getGreen(), c.getBlue(), alpha));
            g.draw(path);
        }

        vignette(img);
        g.dispose();
        ImageIO.write(img, "png", new File(out));
        System.out.println("Frame guardado en " + out);
    }

    static Color samplePalette(double t) {
        t = Math.max(0, Math.min(1, t)) * (PALETTE.length - 1);
        int i = Math.min((int) t, PALETTE.length - 2);
        double f = t - i;
        Color a = PALETTE[i], b = PALETTE[i + 1];
        return new Color(
                (int) (a.getRed() + (b.getRed() - a.getRed()) * f),
                (int) (a.getGreen() + (b.getGreen() - a.getGreen()) * f),
                (int) (a.getBlue() + (b.getBlue() - a.getBlue()) * f));
    }

    /** Oscurece los bordes para centrar la mirada. */
    static void vignette(BufferedImage img) {
        double cx = W / 2.0, cy = H / 2.0, maxD = Math.hypot(cx, cy);
        for (int y = 0; y < H; y++) {
            for (int x = 0; x < W; x++) {
                double d = Math.hypot(x - cx, y - cy) / maxD;
                double k = 1.0 - Math.pow(d, 2.2) * 0.75;
                int rgb = img.getRGB(x, y);
                int r = (int) (((rgb >> 16) & 255) * k);
                int gg = (int) (((rgb >> 8) & 255) * k);
                int b = (int) ((rgb & 255) * k);
                img.setRGB(x, y, (r << 16) | (gg << 8) | b);
            }
        }
    }

    /** Ruido Perlin mejorado (Ken Perlin, 2002) con permutación según semilla. */
    static class Perlin {
        private final int[] p = new int[512];

        Perlin(long seed) {
            int[] perm = new int[256];
            for (int i = 0; i < 256; i++) perm[i] = i;
            Random r = new Random(seed);
            for (int i = 255; i > 0; i--) {
                int j = r.nextInt(i + 1);
                int tmp = perm[i];
                perm[i] = perm[j];
                perm[j] = tmp;
            }
            for (int i = 0; i < 512; i++) p[i] = perm[i & 255];
        }

        double noise(double x, double y, double z) {
            int X = (int) Math.floor(x) & 255, Y = (int) Math.floor(y) & 255, Z = (int) Math.floor(z) & 255;
            x -= Math.floor(x);
            y -= Math.floor(y);
            z -= Math.floor(z);
            double u = fade(x), v = fade(y), w = fade(z);
            int A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
            int B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
            return lerp(w,
                    lerp(v, lerp(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)),
                            lerp(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
                    lerp(v, lerp(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)),
                            lerp(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
        }

        static double fade(double t) { return t * t * t * (t * (t * 6 - 15) + 10); }

        static double lerp(double t, double a, double b) { return a + t * (b - a); }

        static double grad(int hash, double x, double y, double z) {
            int h = hash & 15;
            double u = h < 8 ? x : y, v = h < 4 ? y : (h == 12 || h == 14) ? x : z;
            return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
        }
    }
}
