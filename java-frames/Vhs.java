import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Filtro de cinta VHS vieja: canales RGB desplazados, bandas que tiemblan
 * en horizontal, líneas de barrido, ruido, color corrido y el rótulo de PLAY.
 *
 * Uso: java Vhs entrada.png salida.png [semilla]
 */
public class Vhs {
    public static void main(String[] args) throws Exception {
        BufferedImage src = Gfx.load(args[0]);
        String out = args[1];
        Random rnd = new Random(Gfx.seedArg(args, 2, 1985));
        int w = src.getWidth(), h = src.getHeight();

        // Desplazamiento horizontal por fila: ondita suave + algunas bandas rotas
        int[] shift = new int[h];
        for (int y = 0; y < h; y++) shift[y] = (int) (Math.sin(y * 0.018) * 3);
        for (int band = 0; band < 7; band++) {
            int y0 = rnd.nextInt(h), len = 6 + rnd.nextInt(40), off = rnd.nextInt(90) - 45;
            for (int y = y0; y < Math.min(h, y0 + len); y++) shift[y] += off;
        }

        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < h; y++) {
            double scan = (y % 3 == 0) ? 0.78 : 1.0;
            double prevR = 0, prevG = 0, prevB = 0;
            for (int x = 0; x < w; x++) {
                int sxr = x + shift[y] + 7, sxg = x + shift[y], sxb = x + shift[y] - 7;
                double r = Gfx.r(get(src, sxr, y)), g = Gfx.g(get(src, sxg, y)), b = Gfx.b(get(src, sxb, y));
                // Color corrido: la crominancia se arrastra hacia la derecha
                prevR = prevR * 0.7 + r * 0.3;
                prevG = prevG * 0.35 + g * 0.65;
                prevB = prevB * 0.7 + b * 0.3;
                double noise = (rnd.nextDouble() - 0.5) * 0.10;
                double vign = 1 - Math.pow(Math.hypot((x - w / 2.0) / w, (y - h / 2.0) / h) * 1.3, 3);
                img.setRGB(x, y, Gfx.rgb(
                        (prevR * 1.05 + noise) * scan * vign,
                        (prevG * 0.95 + noise) * scan * vign,
                        (prevB * 1.10 + noise) * scan * vign));
            }
        }

        // Franja de "tracking" con nieve abajo
        int ty = h - 90 - rnd.nextInt(60);
        for (int y = ty; y < ty + 14; y++)
            for (int x = 0; x < w; x++) {
                double v = rnd.nextDouble();
                if (v > 0.55) img.setRGB(x, y, Gfx.rgb(v, v, v));
            }

        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setFont(new Font(Font.MONOSPACED, Font.BOLD, 54));
        drawOsd(g, "PLAY ▶", 80, 110);
        drawOsd(g, "SP  0:04:20", 80, 175);
        drawOsd(g, "SEP. 25 2026", w - 480, h - 70);
        g.dispose();
        Gfx.save(img, out);
    }

    static void drawOsd(Graphics2D g, String s, int x, int y) {
        g.setColor(new Color(0, 0, 0, 160));
        g.drawString(s, x + 4, y + 4);
        g.setColor(new Color(235, 240, 255));
        g.drawString(s, x, y);
    }

    static int get(BufferedImage img, int x, int y) {
        x = Math.max(0, Math.min(img.getWidth() - 1, x));
        return img.getRGB(x, y);
    }
}
