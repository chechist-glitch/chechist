import java.awt.image.BufferedImage;
import java.util.Arrays;

/**
 * Pixel sorting (glitch): en cada columna busca tramos de píxeles con brillo
 * dentro de un rango y los ordena de oscuro a claro. La imagen "gotea" hacia
 * abajo como si se estuviera derritiendo.
 *
 * Uso: java PixelSort entrada.png salida.png [umbralBajo] [umbralAlto]
 */
public class PixelSort {
    public static void main(String[] args) throws Exception {
        BufferedImage img = Gfx.load(args[0]);
        String out = args[1];
        double lo = args.length > 2 ? Double.parseDouble(args[2]) : 0.25;
        double hi = args.length > 3 ? Double.parseDouble(args[3]) : 0.92;
        int w = img.getWidth(), h = img.getHeight();

        int[] col = new int[h];
        for (int x = 0; x < w; x++) {
            img.getRGB(x, 0, 1, h, col, 0, 1);
            int y = 0;
            while (y < h) {
                while (y < h && !inRange(col[y], lo, hi)) y++;
                int start = y;
                while (y < h && inRange(col[y], lo, hi)) y++;
                sortSpan(col, start, y);
            }
            img.setRGB(x, 0, 1, h, col, 0, 1);
        }
        Gfx.save(img, out);
    }

    static boolean inRange(int c, double lo, double hi) {
        double l = Gfx.lum(c);
        return l >= lo && l <= hi;
    }

    static void sortSpan(int[] a, int from, int to) {
        if (to - from < 2) return;
        // Empaqueta brillo en los bits altos para ordenar con un sort de long
        long[] keys = new long[to - from];
        for (int i = from; i < to; i++) {
            long l = (long) (Gfx.lum(a[i]) * 65535);
            keys[i - from] = (l << 32) | (a[i] & 0xFFFFFFFFL);
        }
        Arrays.sort(keys);
        for (int i = from; i < to; i++) a[i] = (int) keys[i - from];
    }
}
