import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Ciudad isométrica de colores pastel: bloques de alturas sacadas de ruido,
 * agua, parques con árboles, ventanitas y personitas paseando por los tejados.
 *
 * Uso: java IsoCity salida.png [semilla]
 */
public class IsoCity {
    static final int N = 15;
    static final double TW = 104, TH = 52, ZH = 34, OX = 960, OY = 230;
    static final Color[][] BLOCK = {
            {Illo.hex("FFC4B2"), Illo.hex("E8907E"), Illo.hex("B8615A")},
            {Illo.hex("FFE3A3"), Illo.hex("F2B84B"), Illo.hex("C1843A")},
            {Illo.hex("C9E4FF"), Illo.hex("8DB7E8"), Illo.hex("5A7FB8")},
            {Illo.hex("E2CCFF"), Illo.hex("B395E8"), Illo.hex("7E64B8")},
            {Illo.hex("F7F1E8"), Illo.hex("D9CFC0"), Illo.hex("A89C8A")},
    };
    static final Color WATER = Illo.hex("7FD3E0"), GRASS = Illo.hex("9ED9A0"), INK = Illo.hex("3B3350");
    static Random r;

    static double[] iso(double i, double j, double z) {
        return new double[]{OX + (i - j) * TW / 2, OY + (i + j) * TH / 2 - z * ZH};
    }

    static Path2D.Double quad(double[]... p) {
        Path2D.Double path = new Path2D.Double();
        path.moveTo(p[0][0], p[0][1]);
        for (int k = 1; k < p.length; k++) path.lineTo(p[k][0], p[k][1]);
        path.closePath();
        return path;
    }

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "isocity.png";
        long seed = Gfx.seedArg(args, 1, 88);
        r = new Random(seed);
        Gfx.Perlin n = new Gfx.Perlin(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        g.setPaint(new GradientPaint(0, 0, Illo.hex("F6D6E8"), 0, Gfx.H, Illo.hex("CBD8F7")));
        g.fillRect(0, 0, Gfx.W, Gfx.H);
        // Nubes
        g.setColor(Illo.alpha(Color.WHITE, 170));
        for (int k = 0; k < 6; k++)
            g.fill(Illo.blob(r, Illo.range(r, 0, Gfx.W), Illo.range(r, 60, 1000), Illo.range(r, 90, 180), Illo.range(r, 25, 45), 0.2, 8));

        int[][] h = new int[N][N];
        int[][] kind = new int[N][N]; // 0 = edificio, 1 = agua, 2 = parque
        for (int i = 0; i < N; i++)
            for (int j = 0; j < N; j++) {
                double v = n.fbm(i * 0.18, j * 0.18, 3);
                if (v < -0.25) kind[i][j] = 1;
                else if (v < -0.08) kind[i][j] = 2;
                else h[i][j] = 1 + (int) Math.round(Gfx.clamp(v + 0.2) * 7 * r.nextDouble());
            }

        // Placa base
        double[] a = iso(0, 0, 0), b = iso(N, 0, 0), c = iso(N, N, 0), d = iso(0, N, 0);
        double[] b2 = iso(N, 0, -1), c2 = iso(N, N, -1), d2 = iso(0, N, -1);
        g.setColor(Illo.hex("B9A7C9"));
        g.fill(quad(b, c, c2, b2));
        g.setColor(Illo.hex("8E7BA3"));
        g.fill(quad(c, d, d2, c2));
        g.setColor(Illo.hex("EDE6F2"));
        g.fill(quad(a, b, c, d));

        // Pintamos de atrás hacia delante
        for (int s = 0; s <= 2 * (N - 1); s++)
            for (int i = 0; i < N; i++) {
                int j = s - i;
                if (j < 0 || j >= N) continue;
                if (kind[i][j] == 1) water(g, i, j);
                else if (kind[i][j] == 2) park(g, i, j);
                else block(g, i, j, h[i][j], BLOCK[(i * 7 + j * 3 + h[i][j]) % BLOCK.length]);
            }

        g.dispose();
        Illo.grain(img, seed, 0.05);
        Gfx.save(img, out);
    }

    static void block(Graphics2D g, int i, int j, int hh, Color[] c) {
        double m = 0.08; // pequeño margen para que se vean calles
        double[] t0 = iso(i + m, j + m, hh), t1 = iso(i + 1 - m, j + m, hh), t2 = iso(i + 1 - m, j + 1 - m, hh), t3 = iso(i + m, j + 1 - m, hh);
        double[] b1 = iso(i + 1 - m, j + m, 0), b2 = iso(i + 1 - m, j + 1 - m, 0), b3 = iso(i + m, j + 1 - m, 0);
        g.setColor(c[1]);
        g.fill(quad(t1, t2, b2, b1));
        g.setColor(c[2]);
        g.fill(quad(t2, t3, b3, b2));
        g.setColor(c[0]);
        g.fill(quad(t0, t1, t2, t3));
        g.setColor(Illo.alpha(INK, 120));
        g.setStroke(Illo.stroke(1.5));
        g.draw(quad(t0, t1, t2, t3));

        // Ventanas en las dos caras
        g.setColor(Illo.alpha(Illo.hex("FFF8D6"), 230));
        for (int z = 0; z < hh; z++)
            for (int k = 0; k < 2; k++) {
                double u = i + 1 - m, v0 = j + 0.22 + k * 0.36;
                g.fill(quad(iso(u, v0, z + 0.3), iso(u, v0 + 0.2, z + 0.3), iso(u, v0 + 0.2, z + 0.75), iso(u, v0, z + 0.75)));
                double w = j + 1 - m, u0 = i + 0.22 + k * 0.36;
                Color win = r.nextInt(5) == 0 ? Illo.hex("FFD86B") : Illo.alpha(Illo.hex("3B3350"), 90);
                g.setColor(win);
                g.fill(quad(iso(u0, w, z + 0.3), iso(u0 + 0.2, w, z + 0.3), iso(u0 + 0.2, w, z + 0.75), iso(u0, w, z + 0.75)));
                g.setColor(Illo.alpha(Illo.hex("FFF8D6"), 230));
            }

        // Cosas en el tejado: cúpula, depósito o una personita
        double[] top = iso(i + 0.5, j + 0.5, hh);
        int deco = r.nextInt(6);
        if (deco == 0) {
            g.setColor(c[0]);
            g.fill(new Arc2D.Double(top[0] - 22, top[1] - 26, 44, 44, 0, 180, Arc2D.CHORD));
            g.setColor(Illo.alpha(INK, 120));
            g.draw(new Arc2D.Double(top[0] - 22, top[1] - 26, 44, 44, 0, 180, Arc2D.CHORD));
        } else if (deco == 1) {
            g.setColor(Illo.hex("C1843A"));
            g.fill(new Rectangle2D.Double(top[0] - 10, top[1] - 40, 20, 26));
            g.setColor(Illo.hex("F2B84B"));
            g.fill(new Ellipse2D.Double(top[0] - 10, top[1] - 46, 20, 10));
        } else if (deco == 2) {
            person(g, top[0] + Illo.range(r, -15, 15), top[1] + Illo.range(r, -5, 5));
        }
    }

    static void water(Graphics2D g, int i, int j) {
        double[] a = iso(i, j, 0), b = iso(i + 1, j, 0), c = iso(i + 1, j + 1, 0), d = iso(i, j + 1, 0);
        g.setColor(WATER);
        g.fill(quad(a, b, c, d));
        g.setColor(Illo.alpha(Color.WHITE, 160));
        g.setStroke(Illo.stroke(2));
        double[] m = iso(i + 0.5, j + 0.5, 0);
        g.draw(new Arc2D.Double(m[0] - 14, m[1] - 4, 14, 8, 0, 180, Arc2D.OPEN));
        g.draw(new Arc2D.Double(m[0], m[1] - 4, 14, 8, 0, 180, Arc2D.OPEN));
        if (r.nextInt(6) == 0) { // barquito
            g.setColor(Illo.hex("E8907E"));
            g.fill(new Arc2D.Double(m[0] - 16, m[1] - 18, 32, 20, 180, 180, Arc2D.CHORD));
            g.setColor(Color.WHITE);
            Path2D.Double sail = new Path2D.Double();
            sail.moveTo(m[0], m[1] - 10);
            sail.lineTo(m[0], m[1] - 40);
            sail.lineTo(m[0] + 18, m[1] - 12);
            sail.closePath();
            g.fill(sail);
        }
    }

    static void park(Graphics2D g, int i, int j) {
        double[] a = iso(i, j, 0.05), b = iso(i + 1, j, 0.05), c = iso(i + 1, j + 1, 0.05), d = iso(i, j + 1, 0.05);
        g.setColor(GRASS);
        g.fill(quad(a, b, c, d));
        int trees = 1 + r.nextInt(3);
        for (int k = 0; k < trees; k++) {
            double[] p = iso(i + Illo.range(r, 0.25, 0.75), j + Illo.range(r, 0.25, 0.75), 0.05);
            g.setColor(Illo.hex("8A6A4A"));
            g.fill(new Rectangle2D.Double(p[0] - 3, p[1] - 18, 6, 18));
            g.setColor(r.nextBoolean() ? Illo.hex("5DBB75") : Illo.hex("F29CB7"));
            g.fill(new Ellipse2D.Double(p[0] - 16, p[1] - 46, 32, 34));
            g.setColor(Illo.alpha(Color.WHITE, 90));
            g.fill(new Ellipse2D.Double(p[0] - 9, p[1] - 42, 10, 8));
        }
        if (r.nextBoolean()) {
            double[] p = iso(i + 0.5, j + 0.5, 0.05);
            person(g, p[0] + 20, p[1] + 5);
        }
    }

    static void person(Graphics2D g, double x, double y) {
        g.setColor(Illo.alpha(INK, 60));
        g.fill(new Ellipse2D.Double(x - 7, y - 3, 14, 6));
        g.setColor(Illo.pick(r, Illo.hex("E8505B"), Illo.hex("3B6FD9"), Illo.hex("F2B84B"), INK));
        g.fill(new RoundRectangle2D.Double(x - 4, y - 18, 8, 16, 4, 4));
        g.setColor(Illo.hex("F6D2B8"));
        g.fill(new Ellipse2D.Double(x - 4, y - 25, 8, 8));
    }
}
