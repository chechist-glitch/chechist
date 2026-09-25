import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * A lo Keith Haring: figuras bailando con postura aleatoria (esqueleto de
 * articulaciones), silueta gorda de color con contorno negro, rayitas de
 * movimiento, un bebé radiante y un perro ladrando, todo sobre amarillo.
 *
 * Uso: java HaringDancers salida.png [semilla]
 */
public class HaringDancers {
    static final Color BG = Illo.hex("FFD400"), INK = Illo.hex("111111");
    static final Color[] FIG = {Illo.hex("E4002B"), Illo.hex("0057B8"), Illo.hex("00A651"), Illo.hex("FF6FB5"),
            Illo.hex("FF7A00"), Illo.hex("7B3FBF"), Illo.hex("FFFFFF")};
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "haring.png";
        long seed = Gfx.seedArg(args, 1, 1982);
        r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        g.setColor(BG);
        g.fillRect(0, 0, Gfx.W, Gfx.H);
        // Suelo
        g.setColor(INK);
        g.fill(new Rectangle2D.Double(0, 930, Gfx.W, 22));

        double[] xs = {230, 520, 800, 1090, 1370, 1660};
        for (int i = 0; i < xs.length; i++) dancer(g, xs[i] + Illo.range(r, -30, 30), 930, FIG[i % FIG.length], i);
        // Segundo suelo abajo para el bebé y el perro
        g.setColor(INK);
        g.fill(new Rectangle2D.Double(0, 1058, Gfx.W, 22));
        baby(g, 150, 1052);
        dog(g, 1750, 1054);
        heart(g, 960, 150, 70);

        g.dispose();
        Gfx.save(img, out);
    }

    /** Dibuja un trazo gordo con contorno: primero negro ancho, luego color. */
    static void limb(Graphics2D g, Color c, double w, double... pts) {
        Path2D.Double p = new Path2D.Double();
        p.moveTo(pts[0], pts[1]);
        for (int k = 2; k < pts.length; k += 2) p.lineTo(pts[k], pts[k + 1]);
        g.setColor(INK);
        g.setStroke(Illo.stroke(w + 14));
        g.draw(p);
        g.setColor(c);
        g.setStroke(Illo.stroke(w));
        g.draw(p);
    }

    static double[] from(double x, double y, double ang, double len) {
        return new double[]{x + Math.cos(ang) * len, y + Math.sin(ang) * len};
    }

    static void dancer(Graphics2D g, double x, double ground, Color c, int idx) {
        double thigh = 110, shin = 110, torso = 170, upper = 95, lower = 90, w = 44;
        double jump = r.nextInt(3) == 0 ? Illo.range(r, 40, 110) : 0;
        double lean = Math.toRadians(Illo.range(r, -25, 25));
        // Piernas: ángulos medidos desde "hacia abajo"
        double down = Math.PI / 2;
        double lt = down + Math.toRadians(Illo.range(r, 10, 55)), rt = down - Math.toRadians(Illo.range(r, 10, 55));
        double lk = lt + Math.toRadians(Illo.range(r, -60, 20)), rk = rt + Math.toRadians(Illo.range(r, -20, 60));
        double hipY = ground - jump - (thigh + shin) * 0.9 - w / 2;
        double[] hip = {x, hipY};
        double[] kneeL = from(hip[0], hip[1], lt, thigh), footL = from(kneeL[0], kneeL[1], lk, shin);
        double[] kneeR = from(hip[0], hip[1], rt, thigh), footR = from(kneeR[0], kneeR[1], rk, shin);
        double[] neck = from(hip[0], hip[1], -Math.PI / 2 + lean, torso);
        // Brazos: a menudo hacia arriba, que es fiesta
        double la = -Math.PI / 2 - Math.toRadians(Illo.range(r, 20, 140)), ra = -Math.PI / 2 + Math.toRadians(Illo.range(r, 20, 140));
        double[] elbowL = from(neck[0], neck[1] + 15, la, upper), handL = from(elbowL[0], elbowL[1], la + Math.toRadians(Illo.range(r, -70, 70)), lower);
        double[] elbowR = from(neck[0], neck[1] + 15, ra, upper), handR = from(elbowR[0], elbowR[1], ra + Math.toRadians(Illo.range(r, -70, 70)), lower);
        double[] head = from(neck[0], neck[1], -Math.PI / 2 + lean * 1.5, 55);

        // Contornos negros de todo primero, para que la silueta quede unida
        g.setColor(INK);
        g.setStroke(Illo.stroke(w + 14));
        drawSkeleton(g, hip, kneeL, footL, kneeR, footR, neck, elbowL, handL, elbowR, handR);
        Line2D.Double body = new Line2D.Double(hip[0], hip[1] - 20, neck[0], neck[1] + 20);
        g.setStroke(Illo.stroke(w + 36));
        g.draw(body);
        g.fill(new Ellipse2D.Double(head[0] - 52, head[1] - 52, 104, 104));
        g.setColor(c);
        g.setStroke(Illo.stroke(w));
        drawSkeleton(g, hip, kneeL, footL, kneeR, footR, neck, elbowL, handL, elbowR, handR);
        // Torso más gordo
        g.setStroke(Illo.stroke(w + 22));
        g.draw(body);
        g.fill(new Ellipse2D.Double(head[0] - 45, head[1] - 45, 90, 90));

        // Rayitas de movimiento alrededor de la cabeza y las manos
        g.setColor(INK);
        g.setStroke(Illo.stroke(8));
        marks(g, head[0], head[1], 70, 3);
        marks(g, handL[0], handL[1], 40, 2);
        marks(g, handR[0], handR[1], 40, 2);
        if (jump > 0) {
            for (int k = -1; k <= 1; k++)
                g.draw(new Line2D.Double(x + k * 45, ground - 20, x + k * 60, ground - 45));
        }
    }

    static void drawSkeleton(Graphics2D g, double[] hip, double[] kneeL, double[] footL, double[] kneeR, double[] footR,
                             double[] neck, double[] elbowL, double[] handL, double[] elbowR, double[] handR) {
        Path2D.Double p = new Path2D.Double();
        p.moveTo(footL[0], footL[1]);
        p.lineTo(kneeL[0], kneeL[1]);
        p.lineTo(hip[0], hip[1]);
        p.lineTo(kneeR[0], kneeR[1]);
        p.lineTo(footR[0], footR[1]);
        p.moveTo(hip[0], hip[1]);
        p.lineTo(neck[0], neck[1]);
        p.moveTo(handL[0], handL[1]);
        p.lineTo(elbowL[0], elbowL[1]);
        p.lineTo(neck[0], neck[1] + 15);
        p.lineTo(elbowR[0], elbowR[1]);
        p.lineTo(handR[0], handR[1]);
        g.draw(p);
    }

    /** Tres rayitas cortas saliendo de un punto, como las de Haring. */
    static void marks(Graphics2D g, double x, double y, double dist, int n) {
        double base = r.nextDouble() * Math.PI * 2;
        for (int k = 0; k < n; k++) {
            double a = base + k * (Math.PI * 2 / n) + Illo.range(r, -0.3, 0.3);
            double[] p1 = from(x, y, a, dist), p2 = from(x, y, a, dist + 32);
            g.draw(new Line2D.Double(p1[0], p1[1], p2[0], p2[1]));
        }
    }

    static void baby(Graphics2D g, double x, double y) {
        // Bebé gateando con rayos alrededor
        Color c = INK;
        g.setColor(c);
        g.setStroke(Illo.stroke(26));
        g.draw(new Line2D.Double(x - 50, y - 50, x + 40, y - 55));
        g.draw(new Line2D.Double(x - 50, y - 50, x - 60, y));
        g.draw(new Line2D.Double(x + 40, y - 55, x + 55, y));
        g.fill(new Ellipse2D.Double(x + 35, y - 110, 56, 56));
        g.setStroke(Illo.stroke(7));
        for (int k = 0; k < 9; k++) {
            double a = -Math.PI + k * Math.PI / 8;
            double[] p1 = from(x, y - 50, a, 105), p2 = from(x, y - 50, a, 135);
            g.draw(new Line2D.Double(p1[0], p1[1], p2[0], p2[1]));
        }
    }

    static void dog(Graphics2D g, double x, double y) {
        Color c = Illo.hex("E4002B");
        limb(g, c, 34, x - 80, y - 60, x + 40, y - 60);
        limb(g, c, 20, x - 70, y - 60, x - 80, y - 5);
        limb(g, c, 20, x + 30, y - 60, x + 40, y - 5);
        limb(g, c, 14, x - 90, y - 70, x - 120, y - 110);
        // Cabeza con boca abierta ladrando
        Path2D.Double head = new Path2D.Double();
        head.moveTo(x + 30, y - 110);
        head.lineTo(x + 110, y - 110);
        head.lineTo(x + 80, y - 85);
        head.lineTo(x + 115, y - 70);
        head.lineTo(x + 30, y - 60);
        head.closePath();
        g.setColor(INK);
        g.setStroke(Illo.stroke(14));
        g.draw(head);
        g.setColor(c);
        g.fill(head);
        g.setColor(INK);
        g.setStroke(Illo.stroke(6));
        for (int k = -1; k <= 1; k++) g.draw(new Line2D.Double(x + 130, y - 90 + k * 22, x + 160, y - 95 + k * 34));
    }

    static void heart(Graphics2D g, double x, double y, double s) {
        Path2D.Double h = new Path2D.Double();
        h.moveTo(x, y + s * 0.9);
        h.curveTo(x - s * 1.6, y - s * 0.1, x - s * 0.6, y - s * 1.2, x, y - s * 0.35);
        h.curveTo(x + s * 0.6, y - s * 1.2, x + s * 1.6, y - s * 0.1, x, y + s * 0.9);
        h.closePath();
        g.setColor(INK);
        g.setStroke(Illo.stroke(14));
        g.draw(h);
        g.setColor(Illo.hex("E4002B"));
        g.fill(h);
        g.setColor(INK);
        g.setStroke(Illo.stroke(8));
        for (int k = 0; k < 8; k++) {
            double a = k * Math.PI / 4;
            double[] p1 = from(x, y, a, s * 1.35), p2 = from(x, y, a, s * 1.75);
            g.draw(new Line2D.Double(p1[0], p1[1], p2[0], p2[1]));
        }
    }
}
