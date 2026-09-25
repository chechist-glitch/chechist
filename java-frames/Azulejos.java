import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.function.Consumer;

/**
 * Pared de azulejos sevillanos: un motivo con simetría de 8 ejes (se dibuja
 * un octavo y se refleja/gira), que al juntarse cuatro azulejos forma flores
 * nuevas en las esquinas. Cenefa en medio, zócalo abajo, esmalte con brillo,
 * craquelado y juntas de mortero.
 *
 * Uso: java Azulejos salida.png [semilla]
 */
public class Azulejos {
    static final Color GLAZE = Illo.hex("F3EEDF"), COBALT = Illo.hex("1D3F8F"), OCHRE = Illo.hex("E3A72F"),
            ORANGE = Illo.hex("D9772B"), GREEN = Illo.hex("3E7F4B"), MANGANESE = Illo.hex("2B2240"),
            SKY = Illo.hex("5C8FCF"), GROUT = Illo.hex("9C9384");
    static final Color[] COLORS = {COBALT, OCHRE, ORANGE, GREEN, SKY};
    static final int T = 240;
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "azulejos.png";
        long seed = Gfx.seedArg(args, 1, 1929);
        r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        g.setColor(GROUT);
        g.fillRect(0, 0, Gfx.W, Gfx.H);

        List<Consumer<Graphics2D>> main = motif(), zocalo = motif();
        int x0 = -(8 * T - Gfx.W) / 2 - T / 2;
        for (int j = 0; j < 3; j++)
            for (int i = 0; i <= 8; i++) tile(g, x0 + i * T, j * T, T, T, main, false);
        for (int i = 0; i <= 16; i++) tile(g, x0 + i * T / 2, 3 * T, T / 2, T / 2, null, true);
        for (int i = 0; i <= 8; i++) tile(g, x0 + i * T, 3 * T + T / 2, T, T, zocalo, false);

        g.dispose();
        Illo.grain(img, seed, 0.06);
        Gfx.save(img, out);
    }

    /** Genera un motivo como lista de trazos en coordenadas del azulejo centrado en (0,0). */
    static List<Consumer<Graphics2D>> motif() {
        List<Consumer<Graphics2D>> els = new ArrayList<>();
        double h = T / 2.0;
        Color a = COLORS[r.nextInt(COLORS.length)], b, c;
        do b = COLORS[r.nextInt(COLORS.length)]; while (b == a);
        do c = COLORS[r.nextInt(COLORS.length)]; while (c == a || c == b);
        final Color ca = a, cb = b, cc = c;

        // Cuarto de flor en la esquina (se completa con los 4 azulejos vecinos)
        double cr = Illo.range(r, 0.35, 0.5) * h;
        els.add(g -> fillOut(g, new Ellipse2D.Double(h - cr, h - cr, 2 * cr, 2 * cr), ca));
        double cr2 = cr * 0.5;
        els.add(g -> fillOut(g, new Ellipse2D.Double(h - cr2, h - cr2, 2 * cr2, 2 * cr2), cb));
        // Hojas en diagonal desde el centro hacia la esquina
        double lx = Illo.range(r, 0.35, 0.55) * h, lw = Illo.range(r, 0.12, 0.2) * h;
        els.add(g -> fillOut(g, leaf(lx, lx, lw * 2.4, lw, 45), cc));
        // Medias lunas en los lados
        double er = Illo.range(r, 0.18, 0.3) * h;
        boolean petals = r.nextBoolean();
        els.add(g -> {
            if (petals) fillOut(g, leaf(h - er * 0.6, 0, er * 2.2, er * 0.8, 0), cb);
            else fillOut(g, new Ellipse2D.Double(h - er, -er, 2 * er, 2 * er), cb);
        });
        // Puntitos
        double dr = 0.05 * h, dp = Illo.range(r, 0.55, 0.75) * h;
        els.add(g -> fillOut(g, new Ellipse2D.Double(dp - dr, dp * 0.35 - dr, 2 * dr, 2 * dr), MANGANESE));
        // Roseta central de 8 pétalos + botón
        double pr = Illo.range(r, 0.3, 0.45) * h;
        els.add(g -> fillOut(g, leaf(pr * 0.55, 0, pr * 1.1, pr * 0.42, 0), ca));
        els.add(g -> fillOut(g, leaf(pr * 0.45 * Math.cos(Math.PI / 8), pr * 0.45 * Math.sin(Math.PI / 8), pr * 0.7, pr * 0.25, 22.5), cc));
        double br = pr * 0.3;
        els.add(g -> fillOut(g, new Ellipse2D.Double(-br, -br, 2 * br, 2 * br), OCHRE));
        // Líneas de "cuerda seca" en arco
        double ar = Illo.range(r, 0.6, 0.85) * h;
        els.add(g -> {
            g.setColor(COBALT);
            g.setStroke(Illo.stroke(4));
            g.draw(new Arc2D.Double(-ar, -ar, 2 * ar, 2 * ar, -20, 40, Arc2D.OPEN));
        });
        return els;
    }

    static Shape leaf(double cx, double cy, double len, double wid, double angDeg) {
        Path2D.Double p = new Path2D.Double();
        p.moveTo(-len / 2, 0);
        p.quadTo(0, -wid, len / 2, 0);
        p.quadTo(0, wid, -len / 2, 0);
        AffineTransform t = new AffineTransform();
        t.translate(cx, cy);
        t.rotate(Math.toRadians(angDeg));
        return t.createTransformedShape(p);
    }

    static void fillOut(Graphics2D g, Shape s, Color c) {
        g.setColor(c);
        g.fill(s);
        g.setColor(MANGANESE);
        g.setStroke(Illo.stroke(2.5));
        g.draw(s);
    }

    static void tile(Graphics2D g, double x, double y, double w, double hgt, List<Consumer<Graphics2D>> m, boolean border) {
        double gap = 3;
        Shape oldClip = g.getClip();
        AffineTransform old = g.getTransform();
        Rectangle2D.Double face = new Rectangle2D.Double(x + gap, y + gap, w - 2 * gap, hgt - 2 * gap);
        g.clip(face);
        // Esmalte con leve variación por pieza
        double k = Illo.range(r, 0.95, 1.03);
        g.setColor(new Color(Gfx.rgb(GLAZE.getRed() / 255.0 * k, GLAZE.getGreen() / 255.0 * k, GLAZE.getBlue() / 255.0 * k)));
        g.fill(face);

        if (border) {
            // Cenefa: franja ocre con ondas azules y bolitas
            g.setColor(OCHRE);
            g.fill(new Rectangle2D.Double(x, y + hgt * 0.18, w, hgt * 0.64));
            g.setColor(COBALT);
            g.fill(new Rectangle2D.Double(x, y, w, hgt * 0.12));
            g.fill(new Rectangle2D.Double(x, y + hgt * 0.88, w, hgt * 0.12));
            g.setStroke(Illo.stroke(7));
            Path2D.Double wave = new Path2D.Double();
            wave.moveTo(x, y + hgt / 2);
            wave.curveTo(x + w * 0.25, y + hgt * 0.2, x + w * 0.25, y + hgt * 0.8, x + w * 0.5, y + hgt / 2);
            wave.curveTo(x + w * 0.75, y + hgt * 0.2, x + w * 0.75, y + hgt * 0.8, x + w, y + hgt / 2);
            g.draw(wave);
            g.setColor(GLAZE);
            g.fill(new Ellipse2D.Double(x + w * 0.25 - 7, y + hgt * 0.3 - 7, 14, 14));
            g.fill(new Ellipse2D.Double(x + w * 0.75 - 7, y + hgt * 0.7 - 7, 14, 14));
        } else {
            // Las 8 simetrías del cuadrado: 4 giros x (con / sin reflejo en la diagonal)
            for (int rot = 0; rot < 4; rot++)
                for (int flip = 0; flip < 2; flip++) {
                    g.setTransform(old);
                    g.translate(x + w / 2, y + hgt / 2);
                    g.rotate(rot * Math.PI / 2);
                    if (flip == 1) g.transform(new AffineTransform(0, 1, 1, 0, 0, 0));
                    for (Consumer<Graphics2D> e : m) e.accept(g);
                }
            g.setTransform(old);
        }

        // Craquelado del esmalte
        g.setColor(Illo.alpha(Illo.hex("8A826F"), 70));
        g.setStroke(new BasicStroke(0.8f));
        for (int c = 0; c < 5; c++) {
            double px = x + r.nextDouble() * w, py = y + r.nextDouble() * hgt;
            Path2D.Double crack = new Path2D.Double();
            crack.moveTo(px, py);
            for (int s = 0; s < 6; s++) {
                px += Illo.range(r, -25, 25);
                py += Illo.range(r, -25, 25);
                crack.lineTo(px, py);
            }
            g.draw(crack);
        }
        // Brillo del esmalte
        g.setPaint(new GradientPaint((float) x, (float) y, new Color(255, 255, 255, 70),
                (float) (x + w * 0.6), (float) (y + hgt * 0.6), new Color(255, 255, 255, 0)));
        g.fill(face);
        g.setClip(oldClip);
        // Bisel oscuro del canto
        g.setColor(Illo.alpha(Illo.hex("4A4336"), 90));
        g.setStroke(new BasicStroke(2));
        g.draw(face);
    }
}
