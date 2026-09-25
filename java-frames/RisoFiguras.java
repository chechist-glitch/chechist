import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Risografía surrealista: gente rara de brazos largos bajo un sol enorme,
 * impresa en tres tintas (rosa flúor, azul y amarillo) que se solapan y se
 * desalinean como en una imprenta de verdad.
 *
 * Uso: java RisoFiguras salida.png [semilla]
 */
public class RisoFiguras {
    static final int PINK = 0, BLUE = 1, YELLOW = 2;
    static Illo.Riso riso;
    static Random r;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "riso.png";
        long seed = Gfx.seedArg(args, 1, 314);
        r = new Random(seed);
        int W = Gfx.W, H = Gfx.H;
        riso = new Illo.Riso(W, H, seed, Illo.hex("FF48B0"), Illo.hex("0078BF"), Illo.hex("FFE800"));

        Graphics2D y = riso.layer(YELLOW), b = riso.layer(BLUE), p = riso.layer(PINK);

        // Sol gigante con anillos
        y.setColor(Illo.Riso.ink(0.95));
        y.fill(new Ellipse2D.Double(1080, 90, 620, 620));
        p.setColor(Illo.Riso.ink(0.35));
        for (int k = 0; k < 5; k++) p.fill(new Rectangle2D.Double(1080, 430 + k * 44, 620, 18));
        // Suelo y colinas
        b.setColor(Illo.Riso.ink(0.45));
        b.fill(new Rectangle2D.Double(0, 860, W, H - 860));
        b.setColor(Illo.Riso.ink(0.25));
        b.fill(Illo.blob(r, 300, 900, 520, 150, 0.15, 9));
        y.setColor(Illo.Riso.ink(0.5));
        y.fill(Illo.blob(r, 1600, 930, 600, 120, 0.12, 9));
        // Nubecitas y ojos flotando en el cielo
        for (int k = 0; k < 4; k++) {
            b.setColor(Illo.Riso.ink(0.22));
            b.fill(Illo.blob(r, Illo.range(r, 100, 1800), Illo.range(r, 80, 400), Illo.range(r, 70, 150), Illo.range(r, 30, 55), 0.25, 8));
        }
        for (int k = 0; k < 3; k++) floatingEye(Illo.range(r, 150, 1000), Illo.range(r, 90, 380), Illo.range(r, 0.6, 1.2));
        // Estrellitas
        for (int k = 0; k < 40; k++) {
            Graphics2D g = k % 2 == 0 ? p : b;
            g.setColor(Illo.Riso.ink(0.9));
            double sx = r.nextDouble() * W, sy = r.nextDouble() * 520, s = Illo.range(r, 4, 10);
            g.fill(new Ellipse2D.Double(sx, sy, s, s));
        }

        // La gente
        double[] xs = {180, 470, 760, 1030, 1320, 1600, 1810};
        for (double x : xs) figure(x + Illo.range(r, -40, 40), 900 + Illo.range(r, -15, 30), Illo.range(r, 0.75, 1.25));

        // Pie de imprenta
        b.setColor(Illo.Riso.ink(1));
        b.setFont(new Font(Font.MONOSPACED, Font.BOLD, 22));
        b.drawString("LA GENTE RARA  ·  RISO / JAVA 21  ·  2026", 60, 1045);

        Gfx.save(riso.print(Illo.hex("F4EFE4"), seed), out);
    }

    static void figure(double x, double base, double s) {
        double h = 560 * s;
        double legL = 0.40 * h, bodyH = 0.30 * h;
        double hip = base - legL, shoulder = hip - bodyH;
        int bodyInk = r.nextBoolean() ? PINK : BLUE;
        int limbInk = bodyInk == PINK ? BLUE : PINK;
        Graphics2D limb = riso.layer(limbInk), body = riso.layer(bodyInk);

        // Piernas largas con zancada
        limb.setColor(Illo.Riso.ink(0.95));
        limb.setStroke(Illo.stroke(15 * s));
        double stride = Illo.range(r, -40, 40) * s;
        limb.draw(new QuadCurve2D.Double(x - 14 * s, hip, x - 20 * s + stride, hip + legL * 0.5, x - 30 * s + stride, base));
        limb.draw(new QuadCurve2D.Double(x + 14 * s, hip, x + 20 * s - stride, hip + legL * 0.5, x + 30 * s - stride, base));
        limb.fill(new Ellipse2D.Double(x - 58 * s + stride, base - 12 * s, 40 * s, 20 * s));
        limb.fill(new Ellipse2D.Double(x + 18 * s - stride, base - 12 * s, 40 * s, 20 * s));

        // Cuerpo: vestido, abrigo triangular o barriga redonda
        body.setColor(Illo.Riso.ink(0.9));
        Shape torso;
        int kind = r.nextInt(3);
        double sw = 55 * s, hw = 55 * s;
        if (kind == 0) {
            Path2D.Double d = new Path2D.Double();
            d.moveTo(x - sw * 0.6, shoulder);
            d.lineTo(x + sw * 0.6, shoulder);
            d.lineTo(x + hw * 1.6, hip + 20 * s);
            d.lineTo(x - hw * 1.6, hip + 20 * s);
            d.closePath();
            torso = d;
        } else if (kind == 1) {
            Path2D.Double d = new Path2D.Double();
            d.moveTo(x - sw * 1.4, shoulder);
            d.lineTo(x + sw * 1.4, shoulder);
            d.lineTo(x, hip + 40 * s);
            d.closePath();
            torso = d;
        } else {
            torso = new Ellipse2D.Double(x - sw * 1.2, shoulder - 10 * s, sw * 2.4, bodyH + 30 * s);
        }
        body.fill(torso);
        // Estampado del cuerpo en amarillo
        Graphics2D pat = riso.layer(YELLOW);
        pat.setClip(torso);
        pat.setColor(Illo.Riso.ink(0.85));
        if (r.nextBoolean()) {
            for (double yy = shoulder; yy < hip + 40 * s; yy += 26 * s)
                pat.fill(new Rectangle2D.Double(x - 200 * s, yy, 400 * s, 10 * s));
        } else {
            for (double yy = shoulder; yy < hip + 40 * s; yy += 30 * s)
                for (double xx = x - 150 * s; xx < x + 150 * s; xx += 30 * s)
                    pat.fill(new Ellipse2D.Double(xx, yy, 11 * s, 11 * s));
        }
        pat.setClip(null);

        // Brazos de fideo: uno colgando, el otro sujetando algo al cielo
        limb.setStroke(Illo.stroke(12 * s));
        double side = r.nextBoolean() ? 1 : -1;
        limb.draw(new CubicCurve2D.Double(x - side * sw, shoulder + 10 * s, x - side * 130 * s, shoulder + 80 * s,
                x - side * 60 * s, hip + 20 * s, x - side * 110 * s, hip + 60 * s));
        double hx = x + side * Illo.range(r, 90, 170) * s, hy = shoulder - Illo.range(r, 150, 260) * s;
        limb.draw(new CubicCurve2D.Double(x + side * sw, shoulder + 10 * s, x + side * 160 * s, shoulder,
                hx - side * 60 * s, hy + 90 * s, hx, hy));
        held(hx, hy, s);

        // Cabeza (a veces enorme, a veces cuadrada)
        double hr = 0.085 * h * Illo.range(r, 0.8, 1.8);
        double hcx = x + Illo.range(r, -10, 10) * s, hcy = shoulder - hr * 0.9;
        int headInk = r.nextInt(3) == 0 ? YELLOW : (bodyInk == PINK ? BLUE : PINK);
        Graphics2D head = riso.layer(headInk);
        head.setColor(Illo.Riso.ink(headInk == YELLOW ? 1.0 : 0.6));
        int headKind = r.nextInt(4);
        if (headKind == 0) head.fill(new RoundRectangle2D.Double(hcx - hr, hcy - hr, 2 * hr, 2 * hr, hr * 0.4, hr * 0.4));
        else if (headKind == 1) head.fill(new Ellipse2D.Double(hcx - hr * 0.75, hcy - hr * 1.3, hr * 1.5, hr * 2.3));
        else head.fill(new Ellipse2D.Double(hcx - hr, hcy - hr, 2 * hr, 2 * hr));

        // Cara: dos ojos o un solo ojo grande
        Graphics2D face = riso.layer(BLUE);
        face.setColor(Illo.Riso.ink(1));
        if (r.nextInt(3) == 0) {
            face.fill(new Ellipse2D.Double(hcx - hr * 0.35, hcy - hr * 0.35, hr * 0.7, hr * 0.7));
            Graphics2D pupil = riso.layer(PINK);
            pupil.setColor(Illo.Riso.ink(1));
            pupil.fill(new Ellipse2D.Double(hcx - hr * 0.12, hcy - hr * 0.12, hr * 0.24, hr * 0.24));
        } else {
            double e = hr * 0.16;
            face.fill(new Ellipse2D.Double(hcx - hr * 0.42 - e, hcy - hr * 0.15 - e, 2 * e, 2 * e));
            face.fill(new Ellipse2D.Double(hcx + hr * 0.42 - e, hcy - hr * 0.15 - e, 2 * e, 2 * e));
            face.setStroke(Illo.stroke(4 * s));
            face.draw(new Arc2D.Double(hcx - hr * 0.3, hcy + hr * 0.05, hr * 0.6, hr * 0.4, 200, 140, Arc2D.OPEN));
        }
        // Sombrero de cono de vez en cuando
        if (r.nextInt(3) == 0) {
            Graphics2D hat = riso.layer(PINK);
            hat.setColor(Illo.Riso.ink(0.85));
            Path2D.Double c = new Path2D.Double();
            c.moveTo(hcx - hr * 0.8, hcy - hr * 0.85);
            c.lineTo(hcx + hr * 0.8, hcy - hr * 0.85);
            c.lineTo(hcx + Illo.range(r, -30, 30) * s, hcy - hr * 2.6);
            c.closePath();
            hat.fill(c);
        }
    }

    /** Lo que cada personaje sujeta en alto: una luna, un globo, una estrella o una flor. */
    static void held(double x, double y, double s) {
        switch (r.nextInt(4)) {
            case 0: {
                Graphics2D g = riso.layer(YELLOW);
                g.setColor(Illo.Riso.ink(1));
                g.fill(new Ellipse2D.Double(x - 45 * s, y - 70 * s, 90 * s, 90 * s));
                Graphics2D c = riso.layer(BLUE);
                c.setColor(Illo.Riso.ink(0.5));
                c.fill(new Ellipse2D.Double(x - 20 * s, y - 80 * s, 80 * s, 80 * s));
                break;
            }
            case 1: {
                Graphics2D g = riso.layer(PINK);
                g.setColor(Illo.Riso.ink(0.9));
                g.fill(new Ellipse2D.Double(x - 40 * s, y - 120 * s, 80 * s, 100 * s));
                g.setStroke(Illo.stroke(3 * s));
                g.draw(new Line2D.Double(x, y - 20 * s, x, y));
                break;
            }
            case 2: {
                Graphics2D g = riso.layer(YELLOW);
                g.setColor(Illo.Riso.ink(1));
                Path2D.Double st = new Path2D.Double();
                for (int k = 0; k < 10; k++) {
                    double a = -Math.PI / 2 + k * Math.PI / 5, rr = (k % 2 == 0 ? 60 : 25) * s;
                    double px = x + Math.cos(a) * rr, py = y - 50 * s + Math.sin(a) * rr;
                    if (k == 0) st.moveTo(px, py); else st.lineTo(px, py);
                }
                st.closePath();
                g.fill(st);
                break;
            }
            default: {
                Graphics2D g = riso.layer(PINK);
                g.setColor(Illo.Riso.ink(0.9));
                for (int k = 0; k < 6; k++) {
                    double a = k * Math.PI / 3;
                    g.fill(new Ellipse2D.Double(x + Math.cos(a) * 26 * s - 18 * s, y - 50 * s + Math.sin(a) * 26 * s - 18 * s, 36 * s, 36 * s));
                }
                Graphics2D c = riso.layer(YELLOW);
                c.setColor(Illo.Riso.ink(1));
                c.fill(new Ellipse2D.Double(x - 18 * s, y - 68 * s, 36 * s, 36 * s));
            }
        }
    }

    static void floatingEye(double x, double y, double s) {
        Graphics2D g = riso.layer(PINK);
        g.setColor(Illo.Riso.ink(0.95));
        g.setStroke(Illo.stroke(6 * s));
        Path2D.Double almond = new Path2D.Double();
        almond.moveTo(x - 70 * s, y);
        almond.quadTo(x, y - 60 * s, x + 70 * s, y);
        almond.quadTo(x, y + 60 * s, x - 70 * s, y);
        g.draw(almond);
        Graphics2D b = riso.layer(BLUE);
        b.setColor(Illo.Riso.ink(1));
        b.fill(new Ellipse2D.Double(x - 20 * s, y - 20 * s, 40 * s, 40 * s));
        // Pestañas
        for (int k = -2; k <= 2; k++) {
            double a = -Math.PI / 2 + k * 0.35;
            g.draw(new Line2D.Double(x + Math.cos(a) * 42 * s, y - 20 * s + Math.sin(a) * 18 * s,
                    x + Math.cos(a) * 62 * s, y - 34 * s + Math.sin(a) * 30 * s));
        }
    }
}
