import java.awt.image.BufferedImage;
import java.util.stream.IntStream;

/**
 * Trama de semitono CMYK, como un cómic o un cartel pop-art impreso: cada
 * tinta es una rejilla de puntos girada a su ángulo, y el tamaño del punto
 * depende de cuánta tinta hace falta en esa zona.
 *
 * Uso: java Halftone entrada.png salida.png [tamañoPunto]
 */
public class Halftone {
    // Ángulos clásicos de imprenta: C 15°, M 75°, Y 0°, K 45°
    static final double[] ANGLES = {15, 75, 0, 45};
    static final double[][] INK = {
            {0.00, 0.62, 0.86},   // cian
            {0.90, 0.10, 0.50},   // magenta
            {1.00, 0.88, 0.05},   // amarillo
            {0.08, 0.07, 0.10},   // negro
    };

    public static void main(String[] args) throws Exception {
        BufferedImage src = Gfx.load(args[0]);
        String out = args[1];
        double cell = args.length > 2 ? Double.parseDouble(args[2]) : 11;
        int w = src.getWidth(), h = src.getHeight();
        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);

        IntStream.range(0, h).parallel().forEach(y -> {
            for (int x = 0; x < w; x++) {
                // Papel crema
                double pr = 0.96, pg = 0.93, pb = 0.85;
                for (int ch = 0; ch < 4; ch++) {
                    double a = Math.toRadians(ANGLES[ch]);
                    double ca = Math.cos(a), sa = Math.sin(a);
                    double u = (x * ca + y * sa) / cell, v = (-x * sa + y * ca) / cell;
                    double cu = Math.floor(u) + 0.5, cv = Math.floor(v) + 0.5;
                    // Centro del punto de vuelta a coordenadas de imagen
                    double sx = (cu * ca - cv * sa) * cell, sy = (cu * sa + cv * ca) * cell;
                    double ink = inkAt(src, sx, sy, ch);
                    double radius = Math.sqrt(ink) * 0.72;
                    double d = Math.hypot(u - cu, v - cv);
                    double cover = 1 - Gfx.smoothstep(radius - 0.06, radius + 0.06, d);
                    // Mezcla sustractiva: la tinta multiplica al papel
                    pr *= 1 - cover * (1 - INK[ch][0]);
                    pg *= 1 - cover * (1 - INK[ch][1]);
                    pb *= 1 - cover * (1 - INK[ch][2]);
                }
                img.setRGB(x, y, Gfx.rgb(pr, pg, pb));
            }
        });
        Gfx.save(img, out);
    }

    static double inkAt(BufferedImage src, double x, double y, int ch) {
        int ix = (int) Math.max(0, Math.min(src.getWidth() - 1, x));
        int iy = (int) Math.max(0, Math.min(src.getHeight() - 1, y));
        int c = src.getRGB(ix, iy);
        double r = Gfx.r(c), g = Gfx.g(c), b = Gfx.b(c);
        double k = 1 - Math.max(r, Math.max(g, b));
        if (ch == 3) return Gfx.clamp(k * 0.9);
        if (k >= 0.999) return 0;
        double v = ch == 0 ? r : ch == 1 ? g : b;
        return Gfx.clamp((1 - v - k) / (1 - k) * 0.9);
    }
}
