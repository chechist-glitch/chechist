import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.Random;

/** Utilidades compartidas por todos los generadores y filtros. */
final class Gfx {
    static final int W = 1920, H = 1080;

    private Gfx() {}

    static BufferedImage newImage() {
        return new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
    }

    static BufferedImage load(String path) throws IOException {
        BufferedImage src = ImageIO.read(new File(path));
        BufferedImage img = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
        img.getGraphics().drawImage(src, 0, 0, null);
        return img;
    }

    static void save(BufferedImage img, String path) throws IOException {
        File f = new File(path);
        if (f.getParentFile() != null) f.getParentFile().mkdirs();
        ImageIO.write(img, "png", f);
        System.out.println("  -> " + path);
    }

    static double clamp(double v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

    static int rgb(double r, double g, double b) {
        return ((int) (clamp(r) * 255 + 0.5) << 16) | ((int) (clamp(g) * 255 + 0.5) << 8) | (int) (clamp(b) * 255 + 0.5);
    }

    static double r(int c) { return ((c >> 16) & 255) / 255.0; }
    static double g(int c) { return ((c >> 8) & 255) / 255.0; }
    static double b(int c) { return (c & 255) / 255.0; }

    static double lum(int c) { return 0.299 * r(c) + 0.587 * g(c) + 0.114 * b(c); }

    static double smoothstep(double e0, double e1, double x) {
        double t = clamp((x - e0) / (e1 - e0));
        return t * t * (3 - 2 * t);
    }

    /** Paleta coseno de Inigo Quilez: a + b*cos(2π(c*t + d)). Devuelve {r,g,b}. */
    static double[] cosPalette(double t, double[] a, double[] b, double[] c, double[] d) {
        double[] out = new double[3];
        for (int i = 0; i < 3; i++) out[i] = a[i] + b[i] * Math.cos(2 * Math.PI * (c[i] * t + d[i]));
        return out;
    }

    static long seedArg(String[] args, int idx, long def) {
        return args.length > idx ? Long.parseLong(args[idx]) : def;
    }

    /** Ruido Perlin mejorado (Ken Perlin, 2002) con permutación según semilla. */
    static final class Perlin {
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

        double noise(double x, double y) {
            int X = (int) Math.floor(x) & 255, Y = (int) Math.floor(y) & 255;
            x -= Math.floor(x);
            y -= Math.floor(y);
            double u = fade(x), v = fade(y);
            int A = p[X] + Y, B = p[X + 1] + Y;
            return lerp(v,
                    lerp(u, grad(p[p[A]], x, y), grad(p[p[B]], x - 1, y)),
                    lerp(u, grad(p[p[A + 1]], x, y - 1), grad(p[p[B + 1]], x - 1, y - 1)));
        }

        /** Ruido fractal (fractional Brownian motion), aprox. en [-1, 1]. */
        double fbm(double x, double y, int octaves) {
            double sum = 0, amp = 0.5, freq = 1;
            for (int i = 0; i < octaves; i++) {
                sum += amp * noise(x * freq, y * freq);
                freq *= 2.02;
                amp *= 0.5;
            }
            return sum * 1.6;
        }

        private static double fade(double t) { return t * t * t * (t * (t * 6 - 15) + 10); }

        private static double lerp(double t, double a, double b) { return a + t * (b - a); }

        private static double grad(int hash, double x, double y) {
            switch (hash & 7) {
                case 0: return x + y;
                case 1: return -x + y;
                case 2: return x - y;
                case 3: return -x - y;
                case 4: return x;
                case 5: return -x;
                case 6: return y;
                default: return -y;
            }
        }
    }
}
