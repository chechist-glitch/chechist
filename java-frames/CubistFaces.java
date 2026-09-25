import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Seis retratos cubistas generados al azar: cara partida en dos colores,
 * un ojo de frente y otro de perfil, nariz de lado, labios gordos y planos
 * geométricos cruzando por encima. A lo Picasso, pero hecho con dados.
 *
 * Uso: java CubistFaces salida.png [semilla]
 */
public class CubistFaces {
    static final Color[] PAL = {
            Illo.hex("D9A441"), Illo.hex("C4502F"), Illo.hex("2F5D8C"), Illo.hex("3A8C84"),
            Illo.hex("E8A0A0"), Illo.hex("7A8B3A"), Illo.hex("F2E6CE"), Illo.hex("5B3A6B"),
    };
    static final Color INK = Illo.hex("1E1A18"), CREAM = Illo.hex("F4EBDD"), LIPS = Illo.hex("C7282E");
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "cubist.png";
        long seed = Gfx.seedArg(args, 1, 1907);
        r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        g.setColor(CREAM);
        g.fillRect(0, 0, Gfx.W, Gfx.H);
        int cw = 640, ch = 540;
        for (int j = 0; j < 2; j++)
            for (int i = 0; i < 3; i++) portrait(g, i * cw + 14, j * ch + 14, cw - 28, ch - 28);
        g.dispose();
        Illo.grain(img, seed, 0.12);
        Gfx.save(img, out);
    }

    static Color other(Color... not) {
        while (true) {
            Color c = PAL[r.nextInt(PAL.length)];
            boolean ok = true;
            for (Color n : not) if (c.equals(n)) ok = false;
            if (ok) return c;
        }
    }

    static void portrait(Graphics2D g, double x, double y, double w, double h) {
        Shape oldClip = g.getClip();
        g.setClip(new Rectangle2D.Double(x, y, w, h));
        AffineTransform oldTx = g.getTransform();

        // Fondo partido en planos
        Color bg1 = other(), bg2 = other(bg1);
        g.setColor(bg1);
        g.fill(new Rectangle2D.Double(x, y, w, h));
        g.setColor(bg2);
        Path2D.Double plane = new Path2D.Double();
        plane.moveTo(x + w * Illo.range(r, 0.3, 0.7), y);
        plane.lineTo(x + w, y);
        plane.lineTo(x + w, y + h);
        plane.lineTo(x + w * Illo.range(r, 0.2, 0.8), y + h);
        plane.closePath();
        g.fill(plane);

        double cx = x + w / 2 + Illo.range(r, -20, 20), cy = y + h * 0.46;
        g.rotate(Math.toRadians(Illo.range(r, -8, 8)), cx, cy);

        // Hombros y cuello
        Color cloth = other(bg1, bg2);
        g.setColor(cloth);
        g.fill(new Ellipse2D.Double(cx - 200, cy + 150, 400, 300));
        g.setColor(INK);
        g.setStroke(Illo.stroke(5));
        g.draw(new Ellipse2D.Double(cx - 200, cy + 150, 400, 300));

        Color skinA = other(bg1, bg2, cloth), skinB = other(skinA, bg2);
        g.setColor(skinB);
        g.fill(new Rectangle2D.Double(cx - 38, cy + 90, 76, 90));

        // Pelo por detrás
        Color hair = r.nextBoolean() ? INK : other(skinA, skinB);
        g.setColor(hair);
        g.fill(Illo.blob(r, cx + Illo.range(r, -20, 20), cy - 90, 150, 120, 0.25, 8));

        // Cabeza partida en dos colores
        double hw = Illo.range(r, 105, 130), hh = Illo.range(r, 145, 170);
        Ellipse2D.Double head = new Ellipse2D.Double(cx - hw, cy - hh, 2 * hw, 2 * hh);
        g.setColor(skinA);
        g.fill(head);
        Shape clipHead = g.getClip();
        g.clip(head);
        g.setColor(skinB);
        double split = Illo.range(r, -25, 25);
        Path2D.Double half = new Path2D.Double();
        half.moveTo(cx + split, cy - hh - 10);
        half.lineTo(cx + hw + 10, cy - hh - 10);
        half.lineTo(cx + hw + 10, cy + hh + 10);
        half.lineTo(cx - split * 0.5, cy + hh + 10);
        half.closePath();
        g.fill(half);
        // Plano cubista transparente cruzando la cara
        g.setColor(Illo.alpha(other(skinA, skinB), 110));
        Path2D.Double facet = new Path2D.Double();
        facet.moveTo(cx - hw, cy + Illo.range(r, -40, 40));
        facet.lineTo(cx + Illo.range(r, -20, 40), cy - hh);
        facet.lineTo(cx + Illo.range(r, 0, 60), cy + Illo.range(r, 20, 90));
        facet.closePath();
        g.fill(facet);
        g.setClip(clipHead);
        g.setColor(INK);
        g.setStroke(Illo.stroke(6));
        g.draw(head);

        // Flequillo
        if (r.nextBoolean()) {
            g.setColor(hair);
            Path2D.Double fringe = new Path2D.Double();
            fringe.moveTo(cx - hw * 0.95, cy - hh * 0.35);
            fringe.quadTo(cx - hw * 0.2, cy - hh * 1.35, cx + hw * 0.95, cy - hh * 0.45);
            fringe.quadTo(cx, cy - hh * 0.75, cx - hw * 0.95, cy - hh * 0.35);
            g.fill(fringe);
        }

        // Ojos: uno de frente, el otro distinto
        double ey = cy - hh * 0.22;
        frontEye(g, cx - hw * 0.45, ey + Illo.range(r, -12, 12), Illo.range(r, 0.9, 1.3));
        switch (r.nextInt(3)) {
            case 0: frontEye(g, cx + hw * 0.45, ey - Illo.range(r, 15, 35), Illo.range(r, 0.6, 0.9)); break;
            case 1: profileEye(g, cx + hw * 0.5, ey - 10); break;
            default: roundEye(g, cx + hw * 0.45, ey - 20);
        }
        // Cejas
        g.setColor(INK);
        g.setStroke(Illo.stroke(7));
        g.draw(new Arc2D.Double(cx - hw * 0.75, ey - 55, hw * 0.6, 50, 20, 140, Arc2D.OPEN));
        g.draw(new Line2D.Double(cx + hw * 0.2, ey - 55, cx + hw * 0.75, ey - 70 + Illo.range(r, -15, 15)));

        // Nariz de perfil saliendo hacia un lado
        double dir = r.nextBoolean() ? 1 : -1;
        Path2D.Double nose = new Path2D.Double();
        nose.moveTo(cx, ey - 30);
        nose.curveTo(cx + dir * 20, ey + 10, cx + dir * 55, ey + 50, cx + dir * 45, ey + 75);
        nose.lineTo(cx + dir * 5, ey + 80);
        nose.closePath();
        g.setColor(Illo.shade(skinB, 0.75));
        g.fill(nose);
        g.setColor(INK);
        g.setStroke(Illo.stroke(5));
        g.draw(nose);

        // Boca
        double my = cy + hh * 0.52, mx = cx + Illo.range(r, -15, 25);
        if (r.nextInt(4) == 0) {
            g.setStroke(Illo.stroke(7));
            g.draw(new Line2D.Double(mx - 40, my, mx + 40, my - 8));
        } else {
            Path2D.Double lips = new Path2D.Double();
            lips.moveTo(mx - 48, my);
            lips.curveTo(mx - 30, my - 26, mx - 8, my - 22, mx, my - 10);
            lips.curveTo(mx + 8, my - 22, mx + 30, my - 26, mx + 48, my);
            lips.curveTo(mx + 25, my + 30, mx - 25, my + 30, mx - 48, my);
            g.setColor(LIPS);
            g.fill(lips);
            g.setColor(INK);
            g.setStroke(Illo.stroke(4));
            g.draw(lips);
            g.draw(new Line2D.Double(mx - 44, my, mx + 44, my));
        }
        // Coloretes
        g.setColor(Illo.alpha(LIPS, 90));
        g.fill(new Ellipse2D.Double(cx - hw * 0.8, my - 60, 44, 44));

        // Líneas sueltas de "boceto" encima de todo
        g.setTransform(oldTx);
        g.setColor(Illo.alpha(INK, 170));
        g.setStroke(Illo.stroke(3));
        for (int k = 0; k < 3; k++)
            g.draw(new Line2D.Double(x + r.nextDouble() * w, y + r.nextDouble() * h, x + r.nextDouble() * w, y + r.nextDouble() * h));
        g.setClip(oldClip);
        g.setColor(INK);
        g.setStroke(new BasicStroke(4));
        g.draw(new Rectangle2D.Double(x, y, w, h));
    }

    static void frontEye(Graphics2D g, double x, double y, double s) {
        Path2D.Double almond = new Path2D.Double();
        almond.moveTo(x - 42 * s, y);
        almond.quadTo(x, y - 36 * s, x + 42 * s, y);
        almond.quadTo(x, y + 36 * s, x - 42 * s, y);
        g.setColor(Color.WHITE);
        g.fill(almond);
        g.setColor(other());
        g.fill(new Ellipse2D.Double(x - 15 * s, y - 15 * s, 30 * s, 30 * s));
        g.setColor(INK);
        g.fill(new Ellipse2D.Double(x - 7 * s, y - 7 * s, 14 * s, 14 * s));
        g.setStroke(Illo.stroke(5));
        g.draw(almond);
    }

    static void profileEye(Graphics2D g, double x, double y) {
        Path2D.Double tri = new Path2D.Double();
        tri.moveTo(x - 35, y - 22);
        tri.lineTo(x + 30, y);
        tri.lineTo(x - 35, y + 22);
        g.setColor(Color.WHITE);
        g.fill(tri);
        g.setColor(INK);
        g.fill(new Ellipse2D.Double(x - 30, y - 10, 20, 20));
        g.setStroke(Illo.stroke(5));
        g.draw(tri);
    }

    static void roundEye(Graphics2D g, double x, double y) {
        g.setColor(Color.WHITE);
        g.fill(new Ellipse2D.Double(x - 26, y - 26, 52, 52));
        g.setColor(INK);
        g.setStroke(Illo.stroke(5));
        g.draw(new Ellipse2D.Double(x - 26, y - 26, 52, 52));
        g.fill(new Ellipse2D.Double(x - 8, y - 4, 16, 16));
    }
}
