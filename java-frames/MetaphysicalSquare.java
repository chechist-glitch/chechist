import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Plaza metafísica a lo De Chirico: arcadas que se pierden en perspectiva,
 * sombras larguísimas, cielo verde de tormenta, una torre, un tren a lo lejos
 * y maniquíes con cabeza de huevo. Hay una mini cámara 3D para que la
 * perspectiva cuadre.
 *
 * Uso: java MetaphysicalSquare salida.png [semilla]
 */
public class MetaphysicalSquare {
    static final double F = 900, CX = 760, HY = 520, CAM_Y = 1.7;
    static final Color INK = Illo.hex("1D1712");

    /** Proyecta un punto del mundo (X derecha, Y arriba, Z al fondo) a la pantalla. */
    static double[] P(double x, double y, double z) {
        return new double[]{CX + F * x / z, HY - F * (y - CAM_Y) / z};
    }

    static Path2D.Double poly(double[][] pts) {
        Path2D.Double p = new Path2D.Double();
        for (int i = 0; i < pts.length; i++) {
            double[] s = P(pts[i][0], pts[i][1], pts[i][2]);
            if (i == 0) p.moveTo(s[0], s[1]); else p.lineTo(s[0], s[1]);
        }
        p.closePath();
        return p;
    }

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "metafisica.png";
        long seed = Gfx.seedArg(args, 1, 1914);
        Random r = new Random(seed);
        int W = Gfx.W, H = Gfx.H;
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);

        // Cielo: verde oscuro arriba, amarillo verdoso en el horizonte
        g.setPaint(new GradientPaint(0, 0, Illo.hex("15302B"), 0, (float) HY, Illo.hex("D9D38C")));
        g.fillRect(0, 0, W, (int) HY + 1);
        // Suelo de la plaza
        g.setPaint(new GradientPaint(0, (float) HY, Illo.hex("D39A4C"), 0, H, Illo.hex("9A5F28")));
        g.fillRect(0, (int) HY, W, H - (int) HY);

        // Muro bajo del horizonte, tren y humo
        g.setColor(Illo.hex("6B4A2E"));
        g.fill(poly(new double[][]{{-60, 0, 90}, {60, 0, 90}, {60, 1.2, 90}, {-60, 1.2, 90}}));
        double[] tr = P(10, 1.2, 90);
        g.setColor(INK);
        g.fill(new Rectangle2D.Double(tr[0], tr[1] - 14, 70, 14));
        g.fill(new Rectangle2D.Double(tr[0] + 8, tr[1] - 24, 8, 10));
        g.setColor(Illo.alpha(Color.WHITE, 200));
        for (int k = 0; k < 6; k++)
            g.fill(new Ellipse2D.Double(tr[0] + 10 - k * 22, tr[1] - 40 - k * 9, 26 + k * 6, 18 + k * 4));

        // Torre al fondo a la derecha
        g.setColor(Illo.hex("B5553A"));
        g.fill(poly(new double[][]{{9, 0, 70}, {12, 0, 70}, {11.6, 16, 70}, {9.4, 16, 70}}));
        g.setColor(Illo.hex("7E3524"));
        g.fill(poly(new double[][]{{11, 0, 70}, {12, 0, 70}, {11.6, 16, 70}, {11.2, 16, 70}}));
        g.setColor(Illo.hex("E6D9B0"));
        g.fill(poly(new double[][]{{9.2, 16, 70}, {11.8, 16, 70}, {11.8, 17, 70}, {9.2, 17, 70}}));
        // Banderitas
        double[] fl = P(10.5, 17, 70);
        g.setColor(INK);
        g.setStroke(Illo.stroke(2));
        g.draw(new Line2D.Double(fl[0], fl[1], fl[0], fl[1] - 40));
        g.setColor(Illo.hex("C0392B"));
        Path2D.Double flag = new Path2D.Double();
        flag.moveTo(fl[0], fl[1] - 40);
        flag.lineTo(fl[0] + 28, fl[1] - 34);
        flag.lineTo(fl[0], fl[1] - 27);
        g.fill(flag);

        // Edificio de la derecha, en sombra, y su sombra enorme sobre la plaza
        g.setColor(Illo.alpha(Illo.hex("4A2A12"), 150));
        g.fill(poly(new double[][]{{7, 0, 9}, {7, 0, 55}, {-1.5, 0, 55}, {2.5, 0, 9}}));
        g.setColor(Illo.hex("3F3A2A"));
        g.fill(poly(new double[][]{{7, 0, 9}, {7, 0, 55}, {7, 9, 55}, {7, 9, 9}}));
        g.setColor(Illo.hex("2A2519"));
        for (double z = 11; z < 52; z += 4) arch(g, 7, z, 2.4, 3.6, false);
        g.setColor(Illo.hex("2F2A1E"));
        g.fill(poly(new double[][]{{7, 0, 9}, {9, 0, 9}, {9, 9, 9}, {7, 9, 9}}));

        // Arcada de la izquierda, iluminada
        g.setColor(Illo.hex("E7B877"));
        g.fill(poly(new double[][]{{-4, 0, 2.5}, {-4, 0, 80}, {-4, 6, 80}, {-4, 6, 2.5}}));
        g.setColor(Illo.hex("F4D9A6"));
        g.fill(poly(new double[][]{{-4, 6, 2.5}, {-4, 6, 80}, {-4, 6.6, 80}, {-4, 6.6, 2.5}}));
        g.setColor(Illo.hex("3B2616"));
        for (double z = 3.2; z < 78; z += 2.6) arch(g, -4, z, 1.7, 3.2, true);
        g.setColor(INK);
        g.setStroke(Illo.stroke(2));
        g.draw(poly(new double[][]{{-4, 6, 2.5}, {-4, 6, 80}}));

        // Maniquí grande con su sombra
        mannequin(g, -0.3, 7.5, 1.0, Illo.hex("E9DCC0"), Illo.hex("9C8A6A"));
        // Figuritas lejanas
        smallFigure(g, 2.2, 30);
        smallFigure(g, 2.9, 31);
        // Pelota roja
        double[] b = P(1.6, 0.4, 6.5);
        double br = F * 0.4 / 6.5;
        g.setColor(Illo.alpha(INK, 110));
        g.fill(new Ellipse2D.Double(b[0], b[1] + br * 0.7, br * 5, br * 0.6));
        g.setPaint(new RadialGradientPaint((float) (b[0] - br * 0.4), (float) (b[1] - br * 0.4), (float) (br * 1.6),
                new float[]{0f, 1f}, new Color[]{Illo.hex("F0634F"), Illo.hex("7A1A12")}));
        g.fill(new Ellipse2D.Double(b[0] - br, b[1] - br, 2 * br, 2 * br));

        g.dispose();
        Illo.grain(img, seed, 0.14);
        Gfx.save(img, out);
    }

    /** Hueco de arco en una fachada del plano X = x, entre z y z + ancho. */
    static void arch(Graphics2D g, double x, double z, double width, double spring, boolean lit) {
        int n = 18;
        double[][] pts = new double[n + 3][];
        pts[0] = new double[]{x, 0, z};
        double rad = width / 2, cz = z + rad;
        for (int k = 0; k <= n; k++) {
            double a = Math.PI - k * Math.PI / n;
            pts[k + 1] = new double[]{x, spring + Math.sin(a) * rad, cz + Math.cos(a) * rad};
        }
        pts[n + 2] = new double[]{x, 0, z + width};
        g.fill(poly(pts));
    }

    static void mannequin(Graphics2D g, double x, double z, double s, Color light, Color dark) {
        double[] foot = P(x, 0, z);
        double k = F / z * s;               // píxeles por metro a esa distancia
        double fx = foot[0], fy = foot[1];
        // Sombra larga hacia la derecha
        g.setColor(Illo.alpha(INK, 120));
        Path2D.Double sh = new Path2D.Double();
        sh.moveTo(fx - 0.25 * k, fy);
        sh.lineTo(fx + 3.6 * k, fy - 0.35 * k);
        sh.lineTo(fx + 3.7 * k, fy - 0.18 * k);
        sh.lineTo(fx + 0.25 * k, fy + 0.05 * k);
        sh.closePath();
        g.fill(sh);
        // Pedestal
        g.setColor(Illo.hex("CFC3A5"));
        g.fill(new Rectangle2D.Double(fx - 0.45 * k, fy - 0.35 * k, 0.9 * k, 0.35 * k));
        g.setColor(Illo.hex("8D8166"));
        g.fill(new Rectangle2D.Double(fx + 0.15 * k, fy - 0.35 * k, 0.3 * k, 0.35 * k));
        double base = fy - 0.35 * k;
        // Cuerpo de maniquí: torso cónico partido en luz y sombra
        Path2D.Double torso = new Path2D.Double();
        torso.moveTo(fx - 0.22 * k, base);
        torso.curveTo(fx - 0.35 * k, base - 0.6 * k, fx - 0.28 * k, base - 1.1 * k, fx - 0.18 * k, base - 1.35 * k);
        torso.lineTo(fx + 0.18 * k, base - 1.35 * k);
        torso.curveTo(fx + 0.28 * k, base - 1.1 * k, fx + 0.35 * k, base - 0.6 * k, fx + 0.22 * k, base);
        torso.closePath();
        g.setColor(light);
        g.fill(torso);
        Shape old = g.getClip();
        g.clip(torso);
        g.setColor(dark);
        g.fill(new Rectangle2D.Double(fx + 0.03 * k, base - 1.5 * k, 0.5 * k, 1.6 * k));
        g.setClip(old);
        g.setColor(INK);
        g.setStroke(Illo.stroke(Math.max(1.5, 0.02 * k)));
        g.draw(torso);
        // Costuras
        g.draw(new Arc2D.Double(fx - 0.28 * k, base - 0.9 * k, 0.56 * k, 0.25 * k, 180, 180, Arc2D.OPEN));
        g.draw(new Line2D.Double(fx, base - 1.35 * k, fx, base - 0.2 * k));
        // Cuello y cabeza de huevo sin cara
        g.setColor(light);
        g.fill(new Rectangle2D.Double(fx - 0.05 * k, base - 1.5 * k, 0.1 * k, 0.18 * k));
        Ellipse2D.Double head = new Ellipse2D.Double(fx - 0.17 * k, base - 1.92 * k, 0.34 * k, 0.45 * k);
        g.fill(head);
        g.clip(head);
        g.setColor(dark);
        g.fill(new Ellipse2D.Double(fx + 0.02 * k, base - 1.95 * k, 0.4 * k, 0.55 * k));
        g.setClip(old);
        g.setColor(INK);
        g.draw(head);
        g.draw(new Line2D.Double(fx - 0.1 * k, base - 1.75 * k, fx + 0.12 * k, base - 1.62 * k));
    }

    static void smallFigure(Graphics2D g, double x, double z) {
        double[] f = P(x, 0, z);
        double k = F / z;
        g.setColor(Illo.alpha(INK, 110));
        Path2D.Double sh = new Path2D.Double();
        sh.moveTo(f[0] - 0.1 * k, f[1]);
        sh.lineTo(f[0] + 3.0 * k, f[1] - 0.25 * k);
        sh.lineTo(f[0] + 3.0 * k, f[1] - 0.1 * k);
        sh.lineTo(f[0] + 0.1 * k, f[1] + 0.02 * k);
        sh.closePath();
        g.fill(sh);
        g.setColor(INK);
        g.fill(new RoundRectangle2D.Double(f[0] - 0.18 * k, f[1] - 1.45 * k, 0.36 * k, 1.45 * k, 0.2 * k, 0.2 * k));
        g.fill(new Ellipse2D.Double(f[0] - 0.12 * k, f[1] - 1.75 * k, 0.24 * k, 0.28 * k));
    }
}
