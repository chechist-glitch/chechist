import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Random;

/**
 * Lámina de herbario: cuatro plantas que crecen con L-systems (reglas de
 * reescritura + tortuga), dibujadas a tinta y coloreadas a la acuarela, con
 * nombres en latín macarrónico y rótulos de lámina antigua.
 *
 * Uso: java Herbarium salida.png [semilla]
 */
public class Herbarium {
    static final Color PAPER = Illo.hex("F1E9D6"), INK = Illo.hex("2B241C");
    static final String[][] PLANTS = {
            // axioma, regla X, regla F, ángulo, iteraciones
            {"X", "F+[[X]-X]-F[-FX]+X", "FF", "25", "5"},
            {"X", "F[+X]F[-X]+X", "FF", "20", "6"},
            {"F", "", "FF-[-F+F+F]+[+F-F-F]", "22.5", "4"},
            {"X", "F[+X][-X]FX", "FF", "25.7", "6"},
    };
    static final String[] NAMES = {"Codex javanicus", "Bitflora hispalensis", "Algorithmus ramosus", "Pixelia gaditana"};
    static final String[] COMMON = {"hierba del programador", "flor de bucle", "arbusto recursivo", "yerba de la marisma"};
    static Random r;

    record Seg(double x1, double y1, double x2, double y2, int depth) {}
    record Tip(double x, double y, double ang, int depth) {}

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "herbario.png";
        long seed = Gfx.seedArg(args, 1, 1753);
        r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        g.setColor(PAPER);
        g.fillRect(0, 0, Gfx.W, Gfx.H);
        // Manchas de papel viejo
        for (int k = 0; k < 12; k++) {
            g.setColor(Illo.alpha(Illo.hex("C9A86A"), 22));
            g.fill(Illo.blob(r, Illo.range(r, 0, Gfx.W), Illo.range(r, 0, Gfx.H), Illo.range(r, 40, 160), Illo.range(r, 40, 160), 0.3, 9));
        }
        // Doble filete del marco
        g.setColor(INK);
        g.setStroke(new BasicStroke(3));
        g.draw(new Rectangle2D.Double(36, 36, Gfx.W - 72, Gfx.H - 72));
        g.setStroke(new BasicStroke(1));
        g.draw(new Rectangle2D.Double(46, 46, Gfx.W - 92, Gfx.H - 92));
        g.setFont(new Font(Font.SERIF, Font.PLAIN, 34));
        center(g, "HERBARIO  DE  LA  MÁQUINA", Gfx.W / 2.0, 100);
        g.setFont(new Font(Font.SERIF, Font.ITALIC, 22));
        center(g, "Lámina III  ·  Plantas que crecen por reglas", Gfx.W / 2.0, 134);

        Color[][] washes = {
                {Illo.hex("6E9B5A"), Illo.hex("D86A7A")}, {Illo.hex("5E8C6A"), Illo.hex("E3B13E")},
                {Illo.hex("7FA35B"), Illo.hex("7A8FD0")}, {Illo.hex("4F7F5E"), Illo.hex("E07A3F")},
        };
        double colW = (Gfx.W - 160) / 4.0;
        for (int i = 0; i < 4; i++) {
            double cx = 80 + colW * (i + 0.5);
            plant(g, PLANTS[i], cx, 865, colW * 0.85, 680, washes[i]);
            g.setColor(INK);
            g.setFont(new Font(Font.SERIF, Font.BOLD, 20));
            center(g, "Fig. " + (i + 1), cx, 945);
            g.setFont(new Font(Font.SERIF, Font.ITALIC, 28));
            center(g, NAMES[i], cx, 985);
            g.setFont(new Font(Font.SERIF, Font.PLAIN, 19));
            center(g, "vulg. " + COMMON[i], cx, 1015);
        }
        g.dispose();
        Illo.grain(img, seed, 0.07);
        Gfx.save(img, out);
    }

    static void center(Graphics2D g, String s, double cx, double y) {
        g.drawString(s, (float) (cx - g.getFontMetrics().stringWidth(s) / 2.0), (float) y);
    }

    static String expand(String[] rule) {
        String s = rule[0];
        for (int it = 0; it < Integer.parseInt(rule[4]); it++) {
            StringBuilder sb = new StringBuilder();
            for (char c : s.toCharArray()) {
                if (c == 'X' && !rule[1].isEmpty()) sb.append(rule[1]);
                else if (c == 'F') sb.append(rule[2]);
                else sb.append(c);
            }
            s = sb.toString();
        }
        return s;
    }

    static void plant(Graphics2D g, String[] rule, double cx, double baseY, double maxW, double maxH, Color[] wash) {
        String s = expand(rule);
        double turn = Math.toRadians(Double.parseDouble(rule[3]));
        List<Seg> segs = new ArrayList<>();
        List<Tip> tips = new ArrayList<>();
        Deque<double[]> stack = new ArrayDeque<>();
        double x = 0, y = 0, a = -Math.PI / 2;
        int depth = 0;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case 'F': {
                    double len = 1 * (0.85 + 0.3 * r.nextDouble());
                    double nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
                    segs.add(new Seg(x, y, nx, ny, depth));
                    x = nx;
                    y = ny;
                    break;
                }
                case '+': a += turn * (0.8 + 0.4 * r.nextDouble()); break;
                case '-': a -= turn * (0.8 + 0.4 * r.nextDouble()); break;
                case '[': stack.push(new double[]{x, y, a, depth}); depth++; break;
                case ']': {
                    tips.add(new Tip(x, y, a, depth));
                    double[] st = stack.pop();
                    x = st[0]; y = st[1]; a = st[2]; depth = (int) st[3];
                    break;
                }
                default:
            }
        }
        // Encajar la planta en su hueco
        double minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
        for (Seg sg : segs) {
            minX = Math.min(minX, Math.min(sg.x1, sg.x2)); maxX = Math.max(maxX, Math.max(sg.x1, sg.x2));
            minY = Math.min(minY, Math.min(sg.y1, sg.y2)); maxY = Math.max(maxY, Math.max(sg.y1, sg.y2));
        }
        double sc = Math.min(maxW / (maxX - minX), maxH / (maxY - minY));
        double ox = cx - (minX + maxX) / 2 * sc, oy = baseY - maxY * sc;

        // Raíces
        g.setColor(Illo.alpha(INK, 200));
        g.setStroke(Illo.stroke(1.4));
        for (int k = 0; k < 9; k++) {
            double rx = cx, ry = baseY;
            Path2D.Double root = new Path2D.Double();
            root.moveTo(rx, ry);
            for (int st = 0; st < 5; st++) {
                rx += Illo.range(r, -14, 14);
                ry += Illo.range(r, 3, 7);
                root.lineTo(rx, ry);
            }
            g.draw(root);
        }
        // Tallos a tinta: más gruesos cerca de la base
        for (Seg sg : segs) {
            g.setColor(INK);
            g.setStroke(Illo.stroke(Math.max(0.8, 4.2 - sg.depth * 0.7)));
            g.draw(new Line2D.Double(ox + sg.x1 * sc, oy + sg.y1 * sc, ox + sg.x2 * sc, oy + sg.y2 * sc));
        }
        // Hojas en las puntas (acuarela desplazada + contorno) y alguna flor
        int flowers = 0;
        for (Tip t : tips) {
            double tx = ox + t.x * sc, ty = oy + t.y * sc;
            if (r.nextInt(9) == 0 && flowers < 7) {
                flower(g, tx, ty, wash[1]);
                flowers++;
                continue;
            }
            if (r.nextInt(3) != 0) continue;
            double len = Illo.range(r, 12, 22), wid = len * 0.38;
            Path2D.Double leaf = new Path2D.Double();
            leaf.moveTo(0, 0);
            leaf.quadTo(len * 0.5, -wid, len, 0);
            leaf.quadTo(len * 0.5, wid, 0, 0);
            AffineTransform tf = new AffineTransform();
            tf.translate(tx, ty);
            tf.rotate(t.ang + Illo.range(r, -0.6, 0.6));
            Shape s1 = tf.createTransformedShape(leaf);
            g.setColor(Illo.alpha(wash[0], 140));
            g.fill(AffineTransform.getTranslateInstance(Illo.range(r, -3, 3), Illo.range(r, -3, 3)).createTransformedShape(s1));
            g.setColor(INK);
            g.setStroke(Illo.stroke(1));
            g.draw(s1);
        }
    }

    static void flower(Graphics2D g, double x, double y, Color c) {
        double pr = Illo.range(r, 8, 13);
        for (int k = 0; k < 5; k++) {
            double a = k * 2 * Math.PI / 5;
            Ellipse2D.Double p = new Ellipse2D.Double(x + Math.cos(a) * pr - pr * 0.7, y + Math.sin(a) * pr - pr * 0.7, pr * 1.4, pr * 1.4);
            g.setColor(Illo.alpha(c, 170));
            g.fill(p);
            g.setColor(INK);
            g.setStroke(Illo.stroke(1));
            g.draw(p);
        }
        g.setColor(Illo.hex("E8C547"));
        g.fill(new Ellipse2D.Double(x - pr * 0.45, y - pr * 0.45, pr * 0.9, pr * 0.9));
        g.setColor(INK);
        g.draw(new Ellipse2D.Double(x - pr * 0.45, y - pr * 0.45, pr * 0.9, pr * 0.9));
    }
}
