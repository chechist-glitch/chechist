import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/**
 * Collage dadá: trozos de papel rasgado recortados de las imágenes de la
 * primera galería, pegados con celo sobre papel de periódico, con una frase
 * en letras de anónimo recortadas y garabatos a boli rojo.
 *
 * Uso: java DadaCollage carpetaFotos salida.png [semilla] [frase]
 */
public class DadaCollage {
    static final Color INK = Illo.hex("1A1714");
    static Random r;

    public static void main(String[] args) throws Exception {
        File dir = new File(args[0]);
        String out = args[1];
        long seed = Gfx.seedArg(args, 2, 1916);
        String phrase = args.length > 3 ? args[3] : "LA MÁQUINA SUEÑA";
        r = new Random(seed);
        int W = Gfx.W, H = Gfx.H;

        List<BufferedImage> photos = new ArrayList<>();
        File[] files = dir.listFiles((d, n) -> n.endsWith(".png") && !n.startsWith("00"));
        java.util.Arrays.sort(files);
        for (File f : files) photos.add(Gfx.load(f.getPath()));

        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        newspaper(g, W, H);

        // Trozos de "foto" rasgados
        for (int k = 0; k < 9; k++) {
            BufferedImage src = photos.get(r.nextInt(photos.size()));
            double w = Illo.range(r, 300, 620), h = Illo.range(r, 220, 460);
            double x = Illo.range(r, -60, W - w + 60), y = Illo.range(r, -60, H - h + 60);
            piece(g, src, x, y, w, h, Illo.range(r, -0.25, 0.25), k % 3 == 0);
        }
        // Formas de color planas
        g.setColor(Illo.hex("D7261E"));
        g.fill(Illo.blob(r, W * 0.78, H * 0.22, 130, 130, 0.05, 10));
        g.setColor(Illo.hex("1F4FA0"));
        g.fill(Illo.torn(r, new double[]{120, 520, 380}, new double[]{860, 780, 1040}, 3));

        // Frase en letras de anónimo
        ransom(g, phrase, W / 2.0, H / 2.0);

        // Garabato a boli rojo y círculo alrededor de una zona
        g.setColor(Illo.alpha(Illo.hex("E0281E"), 220));
        g.setStroke(Illo.stroke(5));
        Path2D.Double scrib = new Path2D.Double();
        double sx = 1450, sy = 820;
        scrib.moveTo(sx, sy);
        for (int k = 0; k < 14; k++) {
            sx += Illo.range(r, -40, 60);
            sy += Illo.range(r, -50, 50);
            scrib.quadTo(sx + Illo.range(r, -60, 60), sy + Illo.range(r, -60, 60), sx, sy);
        }
        g.draw(scrib);
        g.draw(Illo.blob(r, 470, 250, 190, 110, 0.08, 9));
        g.draw(Illo.blob(r, 470, 250, 200, 118, 0.08, 9));

        g.dispose();
        Illo.grain(img, seed, 0.12);
        Gfx.save(img, out);
    }

    /** Fondo de papel de periódico con columnas de "texto" gris. */
    static void newspaper(Graphics2D g, int W, int H) {
        g.setColor(Illo.hex("E9E1CE"));
        g.fillRect(0, 0, W, H);
        g.setColor(Illo.alpha(Illo.hex("5A544A"), 110));
        int colW = 250;
        for (int cx = 30; cx < W; cx += colW + 30) {
            for (int y = 30; y < H - 20; y += 13) {
                double x = cx;
                while (x < cx + colW) {
                    double ww = Illo.range(r, 12, 60);
                    if (x + ww > cx + colW) break;
                    g.fill(new Rectangle2D.Double(x, y, ww, 6));
                    x += ww + 6;
                }
            }
        }
        g.setFont(new Font(Font.SERIF, Font.BOLD, 70));
        g.setColor(Illo.alpha(Illo.hex("3A342C"), 120));
        g.drawString("EL DIARIO DE LA MÁQUINA", 40, 80);
    }

    static void piece(Graphics2D g, BufferedImage src, double x, double y, double w, double h, double rot, boolean duotone) {
        AffineTransform old = g.getTransform();
        g.rotate(rot, x + w / 2, y + h / 2);
        double[] xs = {x, x + w, x + w, x}, ys = {y, y, y + h, y + h};
        Path2D.Double edge = Illo.torn(r, xs, ys, 5);
        // Sombra
        g.setColor(Illo.alpha(INK, 70));
        g.fill(AffineTransform.getTranslateInstance(8, 10).createTransformedShape(edge));
        // Borde blanco del papel rasgado
        g.setColor(Illo.hex("F7F3EA"));
        g.fill(edge);
        // La foto, recortada de una zona al azar de la imagen fuente
        Path2D.Double inner = Illo.torn(r, new double[]{x + 8, x + w - 8, x + w - 8, x + 8},
                new double[]{y + 8, y + 8, y + h - 8, y + h - 8}, 3);
        Shape clip = g.getClip();
        g.clip(inner);
        int sx = r.nextInt(Math.max(1, src.getWidth() - (int) w)), sy = r.nextInt(Math.max(1, src.getHeight() - (int) h));
        BufferedImage crop = src.getSubimage(sx, sy, (int) Math.min(w, src.getWidth() - sx), (int) Math.min(h, src.getHeight() - sy));
        if (duotone) crop = duotone(crop, Illo.hex("1B1B3A"), Illo.pick(r, Illo.hex("F2C14E"), Illo.hex("F78FB3"), Illo.hex("7FD1B9")));
        g.drawImage(crop, (int) x, (int) y, (int) w, (int) h, null);
        g.setClip(clip);
        // Celo en una esquina
        g.setColor(Illo.alpha(Illo.hex("F3E7B5"), 150));
        g.fill(new Rectangle2D.Double(x + w * Illo.range(r, 0.3, 0.6), y - 16, 110, 34));
        g.setTransform(old);
    }

    static BufferedImage duotone(BufferedImage src, Color dark, Color light) {
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < src.getHeight(); y++)
            for (int x = 0; x < src.getWidth(); x++) {
                double l = Math.pow(Gfx.lum(src.getRGB(x, y)), 0.8);
                out.setRGB(x, y, Gfx.rgb(
                        (dark.getRed() + (light.getRed() - dark.getRed()) * l) / 255,
                        (dark.getGreen() + (light.getGreen() - dark.getGreen()) * l) / 255,
                        (dark.getBlue() + (light.getBlue() - dark.getBlue()) * l) / 255));
            }
        return out;
    }

    /** Cada letra en su recorte de papel, con fuente, tamaño y giro distintos. */
    static void ransom(Graphics2D g, String text, double cx, double cy) {
        String[] fonts = {Font.SERIF, Font.SANS_SERIF, Font.MONOSPACED, Font.DIALOG};
        Color[][] combos = {
                {Illo.hex("FFFFFF"), INK}, {INK, Illo.hex("FFFFFF")}, {Illo.hex("F2C14E"), INK},
                {Illo.hex("D7261E"), Illo.hex("FFFFFF")}, {Illo.hex("E9E1CE"), Illo.hex("1F4FA0")},
                {Illo.hex("7FD1B9"), INK}, {Illo.hex("F78FB3"), INK},
        };
        // Medimos primero para centrar la frase
        List<Object[]> letters = new ArrayList<>();
        double total = 0;
        for (char c : text.toCharArray()) {
            if (c == ' ') { letters.add(null); total += 50; continue; }
            Font f = new Font(fonts[r.nextInt(fonts.length)], r.nextInt(4), (int) Illo.range(r, 90, 140));
            double cw = g.getFontMetrics(f).charWidth(c) + 26;
            letters.add(new Object[]{c, f, cw});
            total += cw + 6;
        }
        double x = cx - total / 2;
        for (Object[] l : letters) {
            if (l == null) { x += 50; continue; }
            char c = (char) l[0];
            Font f = (Font) l[1];
            double cw = (double) l[2];
            Color[] col = combos[r.nextInt(combos.length)];
            FontMetrics fm = g.getFontMetrics(f);
            double h = fm.getAscent() * 0.9 + 24;
            double y = cy - h / 2 + Illo.range(r, -25, 25);
            AffineTransform old = g.getTransform();
            g.rotate(Math.toRadians(Illo.range(r, -9, 9)), x + cw / 2, y + h / 2);
            Path2D.Double paper = Illo.torn(r, new double[]{x, x + cw, x + cw, x}, new double[]{y, y, y + h, y + h}, 2.5);
            g.setColor(Illo.alpha(INK, 80));
            g.fill(AffineTransform.getTranslateInstance(5, 6).createTransformedShape(paper));
            g.setColor(col[0]);
            g.fill(paper);
            g.setColor(col[1]);
            g.setFont(f);
            g.drawString(String.valueOf(c), (float) (x + 13), (float) (y + h - 14 - fm.getDescent() * 0.3));
            g.setTransform(old);
            x += cw + 6;
        }
    }
}
