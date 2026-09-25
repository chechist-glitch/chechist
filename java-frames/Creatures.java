import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Bestiario: 18 bichos generados al azar, cada uno con su cuerpo de mancha,
 * sus ojos (de uno a cinco), su boca, sus patas, cuernos o antenas, y un
 * nombre inventado con sílabas.
 *
 * Uso: java Creatures salida.png [semilla]
 */
public class Creatures {
    static final Color[] BODY = {
            Illo.hex("FF6B6B"), Illo.hex("FFB84C"), Illo.hex("7BD389"), Illo.hex("4D96FF"),
            Illo.hex("B983FF"), Illo.hex("FF8FB1"), Illo.hex("3EC1D3"), Illo.hex("F9D923"),
    };
    static final Color[] BG = {
            Illo.hex("FFF1E0"), Illo.hex("E8F6EF"), Illo.hex("EAF2FF"), Illo.hex("FBEAFF"), Illo.hex("FFF9D6"),
    };
    static final Color INK = Illo.hex("2A2233");
    static final String[] SYL = {"blo", "zu", "ki", "mo", "fli", "pa", "chu", "gor", "ñe", "lu", "po", "ra",
            "xi", "bu", "te", "fo", "rum", "pi", "gu", "la", "za", "mi", "ton", "que"};
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "creatures.png";
        long seed = Gfx.seedArg(args, 1, 2026);
        r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        int cols = 6, rows = 3, cw = Gfx.W / cols, ch = Gfx.H / rows;
        int n = 0;
        for (int j = 0; j < rows; j++)
            for (int i = 0; i < cols; i++) {
                g.setColor(BG[(i + j * 2) % BG.length]);
                g.fillRect(i * cw, j * ch, cw, ch);
                creature(g, i * cw + cw / 2.0, j * ch + ch * 0.46, ++n);
            }
        g.dispose();
        Illo.grain(img, seed, 0.06);
        Gfx.save(img, out);
    }

    static void creature(Graphics2D g, double cx, double cy, int num) {
        Color body;
        body = BODY[r.nextInt(BODY.length)];
        double rx = Illo.range(r, 60, 95), ry = Illo.range(r, 55, 90);
        double ground = cy + ry + 55;

        // Sombra
        g.setColor(Illo.alpha(INK, 40));
        g.fill(new Ellipse2D.Double(cx - rx, ground - 8, 2 * rx, 18));

        // Patas
        int legs = 2 + r.nextInt(3);
        g.setStroke(Illo.stroke(9));
        for (int k = 0; k < legs; k++) {
            double lx = cx - rx * 0.6 + (legs == 1 ? rx * 0.6 : k * rx * 1.2 / (legs - 1));
            g.setColor(INK);
            g.draw(new QuadCurve2D.Double(lx, cy + ry * 0.5, lx + Illo.range(r, -20, 20), (cy + ground) / 2, lx, ground));
            g.fill(new Ellipse2D.Double(lx - 16, ground - 9, 30, 14));
        }

        // Cuernos / antenas
        int top = r.nextInt(4);
        g.setColor(INK);
        g.setStroke(Illo.stroke(6));
        if (top == 1 || top == 3) {
            for (int s = -1; s <= 1; s += 2) {
                double bx = cx + s * rx * 0.4, by = cy - ry * 0.8;
                double tx = bx + s * Illo.range(r, 10, 40), ty = by - Illo.range(r, 40, 70);
                g.draw(new QuadCurve2D.Double(bx, by, bx + s * 5, (by + ty) / 2, tx, ty));
                g.setColor(BODY[r.nextInt(BODY.length)]);
                g.fill(new Ellipse2D.Double(tx - 10, ty - 10, 20, 20));
                g.setColor(INK);
                g.draw(new Ellipse2D.Double(tx - 10, ty - 10, 20, 20));
            }
        }
        if (top == 2) {
            Color horn = Illo.hex("FFF6E5");
            for (int s = -1; s <= 1; s += 2) {
                Path2D.Double h = new Path2D.Double();
                double bx = cx + s * rx * 0.45, by = cy - ry * 0.7;
                h.moveTo(bx - 14, by);
                h.quadTo(bx + s * 10, by - 50, bx + s * 30, by - 55);
                h.quadTo(bx + s * 5, by - 25, bx + 14, by);
                h.closePath();
                g.setColor(horn);
                g.fill(h);
                g.setColor(INK);
                g.draw(h);
            }
        }

        // Cuerpo
        Path2D.Double shape = Illo.blob(r, cx, cy, rx, ry, Illo.range(r, 0.08, 0.22), 8);
        g.setColor(body);
        g.fill(shape);
        Shape old = g.getClip();
        g.clip(shape);
        // Barriga y manchas
        g.setColor(Illo.alpha(Color.WHITE, 90));
        g.fill(new Ellipse2D.Double(cx - rx * 0.55, cy + ry * 0.05, rx * 1.1, ry * 1.1));
        g.setColor(Illo.shade(body, 0.8));
        int spots = r.nextInt(6);
        for (int k = 0; k < spots; k++) {
            double s = Illo.range(r, 8, 20);
            g.fill(new Ellipse2D.Double(cx + Illo.range(r, -rx, rx), cy + Illo.range(r, -ry, ry), s, s));
        }
        // Brillo
        g.setColor(Illo.alpha(Color.WHITE, 120));
        g.fill(new Ellipse2D.Double(cx - rx * 0.7, cy - ry * 0.75, rx * 0.35, ry * 0.2));
        g.setClip(old);
        g.setColor(INK);
        g.setStroke(Illo.stroke(6));
        g.draw(shape);

        // Bracitos
        if (r.nextBoolean()) {
            g.setStroke(Illo.stroke(8));
            for (int s = -1; s <= 1; s += 2) {
                double ax = cx + s * rx * 0.95, ay = cy + ry * 0.1;
                double wave = r.nextBoolean() ? -1 : 1;
                g.draw(new QuadCurve2D.Double(ax, ay, ax + s * 30, ay + wave * 10, ax + s * 38, ay + wave * 38));
            }
        }

        // Ojos: todos miran al mismo sitio
        int eyes = new int[]{1, 2, 2, 2, 3, 5}[r.nextInt(6)];
        double lookX = Illo.range(r, -1, 1), lookY = Illo.range(r, -0.6, 0.6);
        for (int k = 0; k < eyes; k++) {
            double er = eyes == 1 ? Illo.range(r, 26, 36) : Illo.range(r, 12, 22);
            double ex = eyes == 1 ? cx : cx + (k - (eyes - 1) / 2.0) * rx * 1.1 / Math.max(1, eyes - 1) * (eyes > 3 ? 1.3 : 1);
            double ey = cy - ry * 0.25 + (eyes > 2 ? Illo.range(r, -18, 12) : 0);
            g.setColor(Color.WHITE);
            g.fill(new Ellipse2D.Double(ex - er, ey - er, 2 * er, 2 * er));
            g.setColor(INK);
            g.setStroke(Illo.stroke(4));
            g.draw(new Ellipse2D.Double(ex - er, ey - er, 2 * er, 2 * er));
            double pr = er * 0.5;
            double px = ex + lookX * (er - pr) * 0.8, py = ey + lookY * (er - pr) * 0.8;
            g.fill(new Ellipse2D.Double(px - pr, py - pr, 2 * pr, 2 * pr));
            g.setColor(Color.WHITE);
            g.fill(new Ellipse2D.Double(px - pr * 0.5, py - pr * 0.6, pr * 0.5, pr * 0.5));
            if (r.nextInt(4) == 0) { // párpado de sueño
                g.setColor(body);
                g.fill(new Arc2D.Double(ex - er - 2, ey - er - 2, 2 * er + 4, 2 * er + 4, 0, 180, Arc2D.CHORD));
                g.setColor(INK);
                g.draw(new Line2D.Double(ex - er, ey, ex + er, ey));
            }
        }

        // Boca
        double my = cy + ry * 0.3;
        g.setColor(INK);
        g.setStroke(Illo.stroke(5));
        switch (r.nextInt(4)) {
            case 0:
                g.draw(new Arc2D.Double(cx - 25, my - 20, 50, 30, 200, 140, Arc2D.OPEN));
                break;
            case 1: { // bocaza abierta con lengua
                Arc2D.Double m = new Arc2D.Double(cx - 30, my - 22, 60, 50, 180, 180, Arc2D.CHORD);
                g.fill(m);
                g.setColor(Illo.hex("FF7A9A"));
                g.fill(new Ellipse2D.Double(cx - 14, my + 8, 28, 16));
                break;
            }
            case 2: { // dientes en zigzag
                Path2D.Double m = new Path2D.Double();
                m.moveTo(cx - 34, my);
                m.lineTo(cx + 34, my);
                m.quadTo(cx, my + 40, cx - 34, my);
                g.fill(m);
                g.setColor(Color.WHITE);
                for (int k = 0; k < 4; k++) {
                    Path2D.Double t = new Path2D.Double();
                    double tx = cx - 30 + k * 16;
                    t.moveTo(tx, my + 1);
                    t.lineTo(tx + 14, my + 1);
                    t.lineTo(tx + 7, my + 12);
                    t.closePath();
                    g.fill(t);
                }
                break;
            }
            default:
                g.draw(new Ellipse2D.Double(cx - 9, my - 6, 18, 20));
        }

        // Nombre
        StringBuilder name = new StringBuilder();
        int syl = 2 + r.nextInt(2);
        for (int k = 0; k < syl; k++) name.append(SYL[r.nextInt(SYL.length)]);
        name.setCharAt(0, Character.toUpperCase(name.charAt(0)));
        g.setFont(new Font(Font.SERIF, Font.ITALIC, 24));
        String label = name + "  ·  nº " + String.format("%03d", num);
        FontMetrics fm = g.getFontMetrics();
        g.setColor(INK);
        g.drawString(label, (float) (cx - fm.stringWidth(label) / 2.0), (float) (ground + 42));
    }
}
