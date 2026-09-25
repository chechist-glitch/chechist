import java.awt.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Hoja de marcianitos pixel art: cada uno sale de una máscara aleatoria de
 * 6x12 reflejada en espejo, con contorno, sombreado por filas y ojos.
 * Título y marcador con letra pixelada (texto sin suavizar, ampliado a
 * lo bruto) y líneas de monitor viejo por encima.
 *
 * Uso: java PixelInvaders salida.png [semilla]
 */
public class PixelInvaders {
    static final Color BG = Illo.hex("0B0C1F"), OUTLINE = Illo.hex("000000");
    static final int GW = 12, GH = 12, PX = 7, STEP = 120;
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "invasores.png";
        long seed = Gfx.seedArg(args, 1, 1978);
        r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = img.createGraphics();
        g.setColor(BG);
        g.fillRect(0, 0, Gfx.W, Gfx.H);
        // Estrellas
        for (int k = 0; k < 220; k++) {
            g.setColor(new Color(255, 255, 255, 60 + r.nextInt(150)));
            int s = r.nextInt(3) == 0 ? 4 : 2;
            g.fillRect(r.nextInt(Gfx.W), r.nextInt(Gfx.H), s, s);
        }

        pixelText(g, "INVASORES GENERATIVOS", 60, 40, 7, Illo.hex("F9D923"), Illo.hex("E4007C"));
        pixelText(g, "PUNTOS 004200", 1380, 52, 4, Illo.hex("FFFFFF"), Illo.hex("3A3A7A"));
        pixelText(g, "VIDAS 3", 1380, 100, 4, Illo.hex("7CFF6B"), Illo.hex("1E5A1A"));

        int cols = Gfx.W / STEP, rows = 7;
        int x0 = (Gfx.W - cols * STEP) / 2;
        for (int j = 0; j < rows; j++)
            for (int i = 0; i < cols; i++) sprite(g, x0 + i * STEP + (STEP - (GW + 2) * PX) / 2, 190 + j * STEP);

        // Nave del jugador y disparo
        int sx = 930, sy = 1045;
        g.setColor(Illo.hex("7CFF6B"));
        g.fillRect(sx, sy, 70, 21);
        g.fillRect(sx + 7, sy - 7, 56, 7);
        g.fillRect(sx + 28, sy - 21, 14, 14);
        g.fillRect(sx + 32, sy - 90, 6, 30);

        g.dispose();
        scanlines(img);
        Gfx.save(img, out);
    }

    static void sprite(Graphics2D g, int ox, int oy) {
        boolean[][] m;
        int count;
        do {
            m = new boolean[GH][GW];
            count = 0;
            for (int y = 0; y < GH; y++)
                for (int x = 0; x < GW / 2; x++) {
                    double p = 0.55 - (x == 0 ? 0.25 : 0) - (y == 0 || y == GH - 1 ? 0.2 : 0) + (x >= 4 ? 0.2 : 0);
                    boolean on = r.nextDouble() < p;
                    m[y][x] = on;
                    m[y][GW - 1 - x] = on;
                    if (on) count += 2;
                }
        } while (count < 44 || count > 110);

        float hue = r.nextFloat();
        // Contorno: celdas vacías pegadas al cuerpo
        g.setColor(OUTLINE);
        for (int y = -1; y <= GH; y++)
            for (int x = -1; x <= GW; x++) {
                if (on(m, x, y)) continue;
                if (on(m, x - 1, y) || on(m, x + 1, y) || on(m, x, y - 1) || on(m, x, y + 1))
                    g.fillRect(ox + (x + 1) * PX, oy + (y + 1) * PX, PX, PX);
            }
        // Cuerpo: más claro arriba, más oscuro abajo, con brillo en el borde superior
        for (int y = 0; y < GH; y++)
            for (int x = 0; x < GW; x++) {
                if (!m[y][x]) continue;
                float bri = 1.0f - 0.45f * y / GH;
                if (!on(m, x, y - 1)) bri = Math.min(1f, bri + 0.15f);
                g.setColor(Color.getHSBColor(hue, 0.65f, bri));
                g.fillRect(ox + (x + 1) * PX, oy + (y + 1) * PX, PX, PX);
            }
        // Ojos: una pareja simétrica dentro del cuerpo, en la mitad de arriba
        for (int tries = 0; tries < 30; tries++) {
            int ey = 2 + r.nextInt(4), ex = 2 + r.nextInt(3);
            if (m[ey][ex] && m[ey + 1][ex]) {
                for (int s = 0; s < 2; s++) {
                    int xx = s == 0 ? ex : GW - 1 - ex;
                    g.setColor(Color.WHITE);
                    g.fillRect(ox + (xx + 1) * PX, oy + (ey + 1) * PX, PX, PX);
                    g.setColor(OUTLINE);
                    g.fillRect(ox + (xx + 1) * PX, oy + (ey + 2) * PX, PX, PX);
                }
                break;
            }
        }
    }

    static boolean on(boolean[][] m, int x, int y) {
        return x >= 0 && y >= 0 && x < GW && y < GH && m[y][x];
    }

    /** Texto pixelado: se pinta sin suavizado a tamaño enano y se amplía píxel a píxel. */
    static void pixelText(Graphics2D g, String s, int x, int y, int scale, Color c, Color shadow) {
        Font f = new Font(Font.MONOSPACED, Font.BOLD, 12);
        BufferedImage probe = new BufferedImage(1, 1, BufferedImage.TYPE_INT_ARGB);
        FontMetrics fm = probe.getGraphics().getFontMetrics(f);
        int w = fm.stringWidth(s) + 2, h = fm.getHeight() + 2;
        BufferedImage small = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D sg = small.createGraphics();
        sg.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_OFF);
        sg.setFont(f);
        sg.setColor(Color.WHITE);
        sg.drawString(s, 1, fm.getAscent());
        sg.dispose();
        for (int py = 0; py < h; py++)
            for (int px = 0; px < w; px++) {
                if ((small.getRGB(px, py) >>> 24) < 128) continue;
                g.setColor(shadow);
                g.fillRect(x + px * scale + scale, y + py * scale + scale, scale, scale);
            }
        for (int py = 0; py < h; py++)
            for (int px = 0; px < w; px++) {
                if ((small.getRGB(px, py) >>> 24) < 128) continue;
                g.setColor(c);
                g.fillRect(x + px * scale, y + py * scale, scale, scale);
            }
    }

    static void scanlines(BufferedImage img) {
        for (int y = 0; y < img.getHeight(); y += 3)
            for (int x = 0; x < img.getWidth(); x++) {
                int c = img.getRGB(x, y);
                img.setRGB(x, y, Gfx.rgb(Gfx.r(c) * 0.7, Gfx.g(c) * 0.7, Gfx.b(c) * 0.7));
            }
    }
}
