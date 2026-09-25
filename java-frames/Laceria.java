import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Alicatado nazarí: teselado de estrellas de ocho puntas y cruces, como en
 * los zócalos de la Alhambra, con cintas blancas entrelazadas por encima,
 * piezas de esmalte que varían un poco de color y un friso de dientes de
 * sierra arriba y abajo.
 *
 * Uso: java Laceria salida.png [semilla]
 */
public class Laceria {
    static final Color[] STAR = {
            Illo.hex("2E7D5B"), Illo.hex("1F4E8C"), Illo.hex("D9A33A"), Illo.hex("1B1B1B"), Illo.hex("8C2F39"), Illo.hex("3AA5A0"),
    };
    static final Color CROSS = Illo.hex("EFEAE0"), STRAP = Illo.hex("F7F3EA"), DARK = Illo.hex("1B1B1B");
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "laceria.png";
        long seed = Gfx.seedArg(args, 1, 1238);
        r = new Random(seed);
        int W = Gfx.W, H = Gfx.H;
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        double s = 150;               // distancia entre estrellas
        double hs = s / (2 * Math.sqrt(2)); // medio lado de cada cuadrado de la estrella

        g.setColor(CROSS);
        g.fillRect(0, 0, W, H);
        // Paleta repetida en diagonal, como hacen los alicatadores
        Color[] pick = {STAR[r.nextInt(STAR.length)], STAR[r.nextInt(STAR.length)], STAR[r.nextInt(STAR.length)]};
        int cols = (int) (W / s) + 2, rows = (int) (H / s) + 2;
        double ox = (W - (cols - 1) * s) / 2, oy = (H - (rows - 1) * s) / 2;

        // Cruces entre estrellas: piezas pequeñas de color
        for (int j = 0; j < rows; j++)
            for (int i = 0; i < cols; i++) {
                double cx = ox + (i + 0.5) * s, cy = oy + (j + 0.5) * s;
                piece(g, cross(cx, cy, s), (i + j) % 2 == 0 ? Illo.hex("1F4E8C") : Illo.hex("D9A33A"));
            }
        for (int j = 0; j < rows; j++)
            for (int i = 0; i < cols; i++) {
                double cx = ox + i * s, cy = oy + j * s;
                Color c = pick[Math.floorMod(i - j, 3)];
                Shape star = star(cx, cy, hs, 0);
                piece(g, star, c);
                // Estrellita interior girada y botón central
                piece(g, star(cx, cy, hs * 0.45, Math.PI / 8), c == DARK ? STAR[2] : CROSS);
                piece(g, new Ellipse2D.Double(cx - hs * 0.16, cy - hs * 0.16, hs * 0.32, hs * 0.32), DARK);
                // Cinta blanca con borde oscuro siguiendo el contorno
                g.setColor(DARK);
                g.setStroke(new BasicStroke((float) (s * 0.075), BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER));
                g.draw(star);
                g.setColor(STRAP);
                g.setStroke(new BasicStroke((float) (s * 0.045), BasicStroke.CAP_BUTT, BasicStroke.JOIN_MITER));
                g.draw(star);
            }

        // Friso de dientes de sierra arriba y abajo
        frieze(g, 0, 70, W);
        frieze(g, H - 70, 70, W);

        g.dispose();
        Illo.grain(img, seed, 0.08);
        Gfx.save(img, out);
    }

    /** Estrella de 8 puntas = cuadrado + cuadrado girado 45°. */
    static Shape star(double cx, double cy, double h, double rot) {
        Path2D.Double p = new Path2D.Double();
        // Puntas a h·√2; los vértices interiores son el cruce de los lados de ambos cuadrados
        double outer = h * Math.sqrt(2), inner = h * Math.sqrt(4 - 2 * Math.sqrt(2));
        for (int k = 0; k < 16; k++) {
            double a = rot + k * Math.PI / 8;
            double rr = k % 2 == 0 ? outer : inner;
            double x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
            if (k == 0) p.moveTo(x, y); else p.lineTo(x, y);
        }
        p.closePath();
        return p;
    }

    /** La cruz que queda entre cuatro estrellas, algo encogida para que se vea la junta. */
    static Shape cross(double cx, double cy, double s) {
        double a = s * 0.09, b = s * 0.36;
        Path2D.Double p = new Path2D.Double();
        double[][] pts = {{-a, -b}, {a, -b}, {a, -a}, {b, -a}, {b, a}, {a, a}, {a, b}, {-a, b}, {-a, a}, {-b, a}, {-b, -a}, {-a, -a}};
        for (int k = 0; k < pts.length; k++) {
            double x = cx + pts[k][0], y = cy + pts[k][1];
            if (k == 0) p.moveTo(x, y); else p.lineTo(x, y);
        }
        p.closePath();
        return p;
    }

    /** Pieza de esmalte: color con variación, brillo y junta. */
    static void piece(Graphics2D g, Shape s, Color c) {
        double k = Illo.range(r, 0.9, 1.06);
        g.setColor(Illo.shade(c, k));
        g.fill(s);
        Rectangle2D b = s.getBounds2D();
        g.setPaint(new GradientPaint((float) b.getX(), (float) b.getY(), new Color(255, 255, 255, 60),
                (float) b.getCenterX(), (float) b.getCenterY(), new Color(255, 255, 255, 0)));
        g.fill(s);
        g.setColor(Illo.alpha(Illo.hex("6E6556"), 150));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(s);
    }

    static void frieze(Graphics2D g, double y, double h, double w) {
        g.setColor(Illo.hex("E9DFC8"));
        g.fill(new Rectangle2D.Double(0, y, w, h));
        double tw = 40;
        for (double x = 0; x < w; x += tw) {
            Path2D.Double t = new Path2D.Double();
            t.moveTo(x, y + h * 0.8);
            t.lineTo(x + tw / 2, y + h * 0.2);
            t.lineTo(x + tw, y + h * 0.8);
            t.closePath();
            piece(g, t, ((int) (x / tw)) % 2 == 0 ? Illo.hex("1F4E8C") : Illo.hex("2E7D5B"));
        }
        g.setColor(DARK);
        g.fill(new Rectangle2D.Double(0, y + h * 0.84, w, h * 0.08));
        g.fill(new Rectangle2D.Double(0, y + h * 0.08, w, h * 0.06));
    }
}
