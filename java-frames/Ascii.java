import java.awt.*;
import java.awt.image.BufferedImage;

/**
 * Convierte una imagen en arte ASCII a color: cada bloque se sustituye por
 * una letra más o menos "gorda" según su brillo, pintada con su color.
 *
 * Uso: java Ascii entrada.png salida.png [anchoCelda]
 */
public class Ascii {
    static final String RAMP = " .'`:-,;~=+*!?ixzcsXYZ#%&$@";

    public static void main(String[] args) throws Exception {
        BufferedImage src = Gfx.load(args[0]);
        String out = args[1];
        int cw = args.length > 2 ? Integer.parseInt(args[2]) : 10;
        int ch = (int) Math.round(cw * 1.8);
        int w = src.getWidth(), h = src.getHeight();

        BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(6, 6, 10));
        g.fillRect(0, 0, w, h);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setFont(new Font(Font.MONOSPACED, Font.BOLD, (int) (ch * 0.95)));
        FontMetrics fm = g.getFontMetrics();

        for (int y = 0; y + ch <= h; y += ch) {
            for (int x = 0; x + cw <= w; x += cw) {
                double r = 0, gg = 0, b = 0;
                int n = 0;
                for (int yy = y; yy < y + ch; yy += 2)
                    for (int xx = x; xx < x + cw; xx += 2) {
                        int c = src.getRGB(xx, yy);
                        r += Gfx.r(c);
                        gg += Gfx.g(c);
                        b += Gfx.b(c);
                        n++;
                    }
                r /= n;
                gg /= n;
                b /= n;
                double l = 0.299 * r + 0.587 * gg + 0.114 * b;
                if (l < 0.06) continue;   // el fondo se queda negro
                double lv = Math.pow(l, 0.7);
                int idx = (int) Math.round(lv * (RAMP.length() - 1));
                char c = RAMP.charAt(Math.max(0, Math.min(RAMP.length() - 1, idx)));
                if (c == ' ') continue;
                // Color más vivo para que las letras brillen sobre el negro
                double k = 1.0 / Math.max(0.25, Math.max(r, Math.max(gg, b)));
                g.setColor(new Color(Gfx.rgb(r * k * (0.4 + lv), gg * k * (0.4 + lv), b * k * (0.4 + lv))));
                int tx = x + (cw - fm.charWidth(c)) / 2;
                g.drawString(String.valueOf(c), tx, y + fm.getAscent() - (fm.getAscent() - ch) / 2 - 2);
            }
        }
        g.dispose();
        Gfx.save(img, out);
    }
}
