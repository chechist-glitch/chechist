import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.IntStream;

/**
 * Mapa del tesoro: una isla sacada de ruido (con líneas de costa repetidas
 * como en las cartas antiguas), montañas y bosquecillos dibujados a pluma,
 * nombres de sitios muy de aquí, rosa de los vientos, galeón, monstruo
 * marino y el caminito rojo hasta la X. Sobre pergamino con pliegues.
 *
 * Uso: java TreasureMap salida.png [semilla]
 */
public class TreasureMap {
    static final Color PARCH = Illo.hex("E6CF9E"), INK = Illo.hex("3A2A1A"), RED = Illo.hex("B3261E"),
            LAND = Illo.hex("D8B878"), SEA = Illo.hex("C9C6A0");
    static final int W = Gfx.W, H = Gfx.H;
    static final String[] PLACES = {"Cala Pisha", "Punta Malaje", "Monte Quillo", "Bahía de la Guasa", "Cabo Miarma",
            "Roque Chiquillo", "Playa del Arsa", "Peñón del Malafollá", "Ensenada Bastinaso", "Loma Churumbel"};
    static Random r;
    static double[] hf;

    static double h(double x, double y) {
        int ix = (int) Math.max(0, Math.min(W - 1, x)), iy = (int) Math.max(0, Math.min(H - 1, y));
        return hf[iy * W + ix];
    }

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "mapa.png";
        long seed = Gfx.seedArg(args, 1, 1492);
        r = new Random(seed);
        Gfx.Perlin n = new Gfx.Perlin(seed);

        // Altura de la isla: ruido fractal menos una caída elíptica desde el centro
        hf = new double[W * H];
        IntStream.range(0, H).parallel().forEach(y -> {
            for (int x = 0; x < W; x++) {
                double dx = (x - 900) / 620.0, dy = (y - 560) / 360.0;
                double fall = Math.sqrt(dx * dx + dy * dy);
                hf[y * W + x] = n.fbm(x * 0.0028, y * 0.0028, 6) * 0.55 + 0.42 - fall * 0.62;
            }
        });

        // Tierra, mar y líneas de costa (por píxel, usando la pendiente para el grosor)
        BufferedImage img = Gfx.newImage();
        double[] levels = {0, -0.025, -0.05, -0.08, -0.115};
        IntStream.range(0, H).parallel().forEach(y -> {
            for (int x = 1; x < W - 1; x++) {
                double v = hf[y * W + x];
                double gx = (hf[y * W + x + 1] - hf[y * W + x - 1]) / 2;
                double gy = y > 0 && y < H - 1 ? (hf[(y + 1) * W + x] - hf[(y - 1) * W + x]) / 2 : 0;
                double grad = Math.hypot(gx, gy) + 1e-6;
                Color c = v > 0 ? LAND : SEA;
                if (v > 0.18) c = Illo.hex("CDA766");
                for (int k = 0; k < levels.length; k++) {
                    double d = Math.abs(v - levels[k]) / grad;
                    double wLine = k == 0 ? 2.6 : 1.0;
                    if (d < wLine) { c = k == 0 ? INK : Illo.alpha(INK, 255).darker(); break; }
                }
                img.setRGB(x, y, c.getRGB());
            }
        });

        Graphics2D g = Illo.g2(img);
        // Cuadrícula de meridianos y paralelos
        g.setColor(Illo.alpha(INK, 45));
        g.setStroke(new BasicStroke(1.2f));
        for (int x = 0; x < W; x += 160) g.draw(new Line2D.Double(x, 0, x, H));
        for (int y = 0; y < H; y += 160) g.draw(new Line2D.Double(0, y, W, y));

        // Montañas (de atrás hacia delante) y bosques
        List<double[]> peaks = new ArrayList<>(), trees = new ArrayList<>();
        for (int y = 0; y < H; y += 34)
            for (int x = 0; x < W; x += 40) {
                double px = x + Illo.range(r, -12, 12), py = y + Illo.range(r, -10, 10);
                double v = h(px, py);
                if (v > 0.2 && r.nextDouble() < 0.8) peaks.add(new double[]{px, py, v});
                else if (v > 0.06 && v < 0.16 && r.nextDouble() < 0.45) trees.add(new double[]{px, py});
            }
        peaks.sort((a, b) -> Double.compare(a[1], b[1]));
        trees.sort((a, b) -> Double.compare(a[1], b[1]));
        for (double[] t : trees) tree(g, t[0], t[1]);
        for (double[] p : peaks) mountain(g, p[0], p[1], 26 + p[2] * 90);

        // Pueblos con nombre
        g.setFont(new Font(Font.SERIF, Font.ITALIC, 26));
        List<Integer> used = new ArrayList<>();
        int placed = 0;
        for (int tries = 0; tries < 4000 && placed < 6; tries++) {
            double px = Illo.range(r, 150, W - 560), py = Illo.range(r, 150, H - 150);
            double v = h(px, py);
            if (v < 0.01 || v > 0.12) continue;
            if (py < 260 && px < 900) continue;   // debajo del cartel del título no
            boolean far = true;
            for (int k = 0; k < used.size(); k += 2)
                if (Math.hypot(px - used.get(k), py - used.get(k + 1)) < 260) far = false;
            if (!far) continue;
            used.add((int) px);
            used.add((int) py);
            house(g, px, py);
            g.setColor(INK);
            g.drawString(PLACES[placed], (float) px + 22, (float) py + 8);
            placed++;
        }
        // Nombres de mar
        g.setFont(new Font(Font.SERIF, Font.ITALIC, 34));
        g.setColor(Illo.alpha(INK, 190));
        g.drawString("Mar de los Levantes", 1380, 1000);
        g.drawString(PLACES[6 + r.nextInt(4)], 120, 1000);

        // Camino al tesoro desde la costa hasta la X
        double[] start = findCoast(), goal = findLand(0.1, 0.17);
        g.setColor(RED);
        g.setStroke(new BasicStroke(5, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND, 1, new float[]{2, 16}, 0));
        Path2D.Double path = new Path2D.Double();
        path.moveTo(start[0], start[1]);
        double mx = (start[0] + goal[0]) / 2 + Illo.range(r, -150, 150), my = (start[1] + goal[1]) / 2 + Illo.range(r, -120, 120);
        path.curveTo(mx, start[1], goal[0], my, goal[0], goal[1]);
        g.draw(path);
        g.setStroke(Illo.stroke(9));
        g.draw(new Line2D.Double(goal[0] - 26, goal[1] - 26, goal[0] + 26, goal[1] + 26));
        g.draw(new Line2D.Double(goal[0] + 26, goal[1] - 26, goal[0] - 26, goal[1] + 26));

        galleon(g, findSea(true));
        seaMonster(g, findSea(false));
        compass(g, 1700, 190, 120);
        cartouche(g, 230, 110);
        // Escala
        g.setColor(INK);
        g.setStroke(new BasicStroke(3));
        for (int k = 0; k < 4; k++) {
            g.setColor(k % 2 == 0 ? INK : PARCH);
            g.fill(new Rectangle2D.Double(1520 + k * 60, 1030, 60, 12));
        }
        g.setColor(INK);
        g.draw(new Rectangle2D.Double(1520, 1030, 240, 12));
        g.setFont(new Font(Font.SERIF, Font.PLAIN, 18));
        g.drawString("Leguas (o por ahí)", 1560, 1024);
        g.dispose();

        parchment(img, seed);
        Gfx.save(img, out);
    }

    static double[] findLand(double lo, double hi) {
        for (int k = 0; k < 20000; k++) {
            double x = Illo.range(r, 300, W - 300), y = Illo.range(r, 250, H - 250);
            double v = h(x, y);
            if (v > lo && v < hi) return new double[]{x, y};
        }
        return new double[]{W / 2.0, H / 2.0};
    }

    static double[] findCoast() {
        for (int k = 0; k < 20000; k++) {
            double x = Illo.range(r, 200, W - 200), y = Illo.range(r, H * 0.6, H - 150);
            if (Math.abs(h(x, y)) < 0.005) return new double[]{x, y};
        }
        return new double[]{W / 2.0, H - 200};
    }

    /** Un sitio en el mar lejos de la costa: a la izquierda o a la derecha. */
    static double[] findSea(boolean leftSide) {
        for (int k = 0; k < 20000; k++) {
            double x = leftSide ? Illo.range(r, 120, 520) : Illo.range(r, 1380, 1750);
            double y = Illo.range(r, 380, 900);
            boolean clear = true;
            for (int dy = -120; dy <= 120 && clear; dy += 30)
                for (int dx = -170; dx <= 170; dx += 30) if (h(x + dx, y + dy) > -0.13) { clear = false; break; }
            if (clear) return new double[]{x, y};
        }
        return new double[]{leftSide ? 200 : 1650, 800};
    }

    static void mountain(Graphics2D g, double x, double y, double s) {
        Path2D.Double m = new Path2D.Double();
        m.moveTo(x - s * 0.6, y);
        m.lineTo(x - s * 0.05, y - s * 0.75);
        m.lineTo(x + s * 0.6, y);
        g.setColor(Illo.hex("DCC08A"));
        g.fill(m);
        g.setColor(INK);
        g.setStroke(Illo.stroke(2.2));
        g.draw(m);
        // Sombreado a plumilla en la ladera derecha
        g.setStroke(Illo.stroke(1));
        for (int k = 1; k < 5; k++) {
            double t = k / 5.0;
            double tx = x - s * 0.05 + t * s * 0.65 * 0.9, ty = y - s * 0.75 + t * s * 0.75;
            g.draw(new Line2D.Double(tx, ty, tx - s * 0.12, y));
        }
    }

    static void tree(Graphics2D g, double x, double y) {
        g.setColor(INK);
        g.setStroke(Illo.stroke(1.6));
        g.draw(new Line2D.Double(x, y, x, y - 10));
        g.setColor(Illo.hex("9DA86A"));
        g.fill(new Ellipse2D.Double(x - 9, y - 27, 18, 20));
        g.setColor(INK);
        g.draw(new Ellipse2D.Double(x - 9, y - 27, 18, 20));
    }

    static void house(Graphics2D g, double x, double y) {
        g.setColor(Illo.hex("F2E6C8"));
        g.fill(new Rectangle2D.Double(x - 12, y - 12, 24, 16));
        g.setColor(INK);
        g.setStroke(Illo.stroke(2));
        g.draw(new Rectangle2D.Double(x - 12, y - 12, 24, 16));
        Path2D.Double roof = new Path2D.Double();
        roof.moveTo(x - 16, y - 12);
        roof.lineTo(x, y - 26);
        roof.lineTo(x + 16, y - 12);
        roof.closePath();
        g.setColor(RED);
        g.fill(roof);
        g.setColor(INK);
        g.draw(roof);
    }

    static void galleon(Graphics2D g, double[] p) {
        double x = p[0], y = p[1];
        g.setColor(INK);
        g.setStroke(Illo.stroke(2.5));
        Path2D.Double hull = new Path2D.Double();
        hull.moveTo(x - 90, y - 10);
        hull.lineTo(x + 100, y - 20);
        hull.quadTo(x + 80, y + 30, x + 40, y + 32);
        hull.lineTo(x - 60, y + 32);
        hull.quadTo(x - 85, y + 20, x - 90, y - 10);
        g.setColor(Illo.hex("8A5A34"));
        g.fill(hull);
        g.setColor(INK);
        g.draw(hull);
        for (int k = -1; k <= 1; k++) {
            double mx = x + k * 50;
            g.draw(new Line2D.Double(mx, y - 15, mx, y - 150 + Math.abs(k) * 30));
            for (int s = 0; s < 2; s++) {
                double sy = y - 140 + Math.abs(k) * 30 + s * 60, sw = 38 - s * 4;
                Path2D.Double sail = new Path2D.Double();
                sail.moveTo(mx - sw, sy);
                sail.quadTo(mx, sy + 12, mx + sw, sy);
                sail.lineTo(mx + sw, sy + 44);
                sail.quadTo(mx, sy + 58, mx - sw, sy + 44);
                sail.closePath();
                g.setColor(Illo.hex("F2E6C8"));
                g.fill(sail);
                g.setColor(INK);
                g.draw(sail);
            }
        }
        g.setColor(RED);
        g.fill(new Rectangle2D.Double(x, y - 170, 26, 12));
        g.setColor(INK);
        g.setStroke(Illo.stroke(1.5));
        for (int k = 0; k < 3; k++) g.draw(new Arc2D.Double(x - 120 + k * 70, y + 32, 60, 20, 0, 180, Arc2D.OPEN));
    }

    static void seaMonster(Graphics2D g, double[] p) {
        double x = p[0], y = p[1];
        Color body = Illo.hex("5E7F6A");
        // Jorobas saliendo del agua
        for (int k = 0; k < 3; k++) {
            double hx = x - 120 + k * 80, hw = 60 - k * 8;
            Arc2D.Double hump = new Arc2D.Double(hx - hw / 2, y - hw / 2, hw, hw, 0, 180, Arc2D.CHORD);
            g.setColor(body);
            g.fill(hump);
            g.setColor(INK);
            g.setStroke(Illo.stroke(2.5));
            g.draw(hump);
            g.draw(new Line2D.Double(hx - hw / 2 - 10, y + 2, hx + hw / 2 + 10, y + 2));
        }
        // Cola rizada
        g.draw(new CubicCurve2D.Double(x + 68, y, x + 110, y - 60, x + 150, y - 20, x + 130, y - 50));
        // Cabeza y cuello
        Path2D.Double neck = new Path2D.Double();
        neck.moveTo(x - 190, y);
        neck.curveTo(x - 200, y - 90, x - 150, y - 130, x - 110, y - 120);
        neck.lineTo(x - 100, y - 95);
        neck.curveTo(x - 140, y - 100, x - 165, y - 60, x - 160, y);
        neck.closePath();
        g.setColor(body);
        g.fill(neck);
        g.setColor(INK);
        g.draw(neck);
        Ellipse2D.Double head = new Ellipse2D.Double(x - 125, y - 140, 60, 40);
        g.setColor(body);
        g.fill(head);
        g.setColor(INK);
        g.draw(head);
        g.fill(new Ellipse2D.Double(x - 100, y - 130, 8, 8));
        g.setColor(RED);
        g.setStroke(Illo.stroke(2));
        g.draw(new CubicCurve2D.Double(x - 66, y - 118, x - 50, y - 112, x - 48, y - 128, x - 36, y - 122));
        g.setColor(INK);
        g.setFont(new Font(Font.SERIF, Font.ITALIC, 20));
        g.drawString("Aquí hay bichos", (float) x - 120, (float) y + 40);
    }

    static void compass(Graphics2D g, double cx, double cy, double R) {
        g.setColor(Illo.alpha(INK, 160));
        g.setStroke(new BasicStroke(1.5f));
        g.draw(new Ellipse2D.Double(cx - R, cy - R, 2 * R, 2 * R));
        g.draw(new Ellipse2D.Double(cx - R * 0.85, cy - R * 0.85, R * 1.7, R * 1.7));
        for (int k = 0; k < 16; k++) {
            double a = k * Math.PI / 8 - Math.PI / 2;
            double len = k % 4 == 0 ? R : k % 2 == 0 ? R * 0.7 : R * 0.45;
            double wa = a + Math.PI / 2;
            double bw = len * 0.13;
            for (int side = 0; side < 2; side++) {
                Path2D.Double p = new Path2D.Double();
                p.moveTo(cx, cy);
                p.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
                double s = side == 0 ? 1 : -1;
                p.lineTo(cx + Math.cos(wa) * bw * s, cy + Math.sin(wa) * bw * s);
                p.closePath();
                g.setColor(side == 0 ? INK : (k == 0 ? RED : Illo.hex("F2E6C8")));
                g.fill(p);
                g.setColor(INK);
                g.setStroke(new BasicStroke(1));
                g.draw(p);
            }
        }
        g.setFont(new Font(Font.SERIF, Font.BOLD, 34));
        g.drawString("N", (float) cx - 12, (float) (cy - R - 10));
    }

    static void cartouche(Graphics2D g, double x, double y) {
        // Cinta con las puntas dobladas
        double w = 520, hgt = 80;
        Path2D.Double ribbon = new Path2D.Double();
        ribbon.moveTo(x - 60, y + 20);
        ribbon.lineTo(x, y);
        ribbon.quadTo(x + w / 2, y - 22, x + w, y);
        ribbon.lineTo(x + w + 60, y + 20);
        ribbon.lineTo(x + w + 30, y + hgt / 2 + 10);
        ribbon.lineTo(x + w + 60, y + hgt + 10);
        ribbon.lineTo(x + w, y + hgt);
        ribbon.quadTo(x + w / 2, y + hgt - 22, x, y + hgt);
        ribbon.lineTo(x - 60, y + hgt + 10);
        ribbon.lineTo(x - 30, y + hgt / 2 + 10);
        ribbon.closePath();
        g.setColor(Illo.hex("F2E6C8"));
        g.fill(ribbon);
        g.setColor(INK);
        g.setStroke(Illo.stroke(2.5));
        g.draw(ribbon);
        g.setFont(new Font(Font.SERIF, Font.BOLD, 42));
        String t = "ISLA DE LA MÁQUINA";
        g.drawString(t, (float) (x + w / 2 - g.getFontMetrics().stringWidth(t) / 2.0), (float) (y + 55));
    }

    /** Pergamino: manchas, bordes quemados y pliegues. */
    static void parchment(BufferedImage img, long seed) {
        Gfx.Perlin n = new Gfx.Perlin(seed + 9);
        IntStream.range(0, H).parallel().forEach(y -> {
            for (int x = 0; x < W; x++) {
                int c = img.getRGB(x, y);
                double stain = 0.92 + 0.08 * n.fbm(x * 0.003, y * 0.003, 4);
                double ex = Math.min(x, W - 1 - x) / 90.0, ey = Math.min(y, H - 1 - y) / 90.0;
                double edge = Gfx.clamp(Math.min(ex, ey) + 0.25 * n.fbm(x * 0.02, y * 0.02, 3));
                double burn = 0.45 + 0.55 * Gfx.smoothstep(0, 1, edge);
                double fold = 1.0;
                if (Math.abs(x - W / 3) < 3 || Math.abs(x - 2 * W / 3) < 3 || Math.abs(y - H / 2) < 3) fold = 0.9;
                else if (Math.abs(x - W / 3 - 4) < 3 || Math.abs(x - 2 * W / 3 - 4) < 3 || Math.abs(y - H / 2 - 4) < 3) fold = 1.05;
                double k = stain * burn * fold;
                img.setRGB(x, y, Gfx.rgb(Gfx.r(c) * k, Gfx.g(c) * k * 0.98, Gfx.b(c) * k * 0.93));
            }
        });
        Illo.grain(img, seed, 0.08);
    }
}
