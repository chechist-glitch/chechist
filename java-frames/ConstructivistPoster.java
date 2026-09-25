import java.awt.*;
import java.awt.geom.*;

/**
 * Cartel constructivista (homenaje a "Golpead a los blancos con la cuña roja"
 * de El Lissitzky): cuña roja clavándose en un círculo, barras en diagonal,
 * trama de puntos y tipografía torcida. Impreso en risografía a dos tintas,
 * rojo y negro, sobre papel kraft.
 *
 * Uso: java ConstructivistPoster salida.png [semilla]
 */
public class ConstructivistPoster {
    static final int RED = 0, BLACK = 1;
    static final double ANG = Math.toRadians(-18);

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "cartel.png";
        long seed = Gfx.seedArg(args, 1, 1920);
        int W = Gfx.W, H = Gfx.H;
        Illo.Riso riso = new Illo.Riso(W, H, seed, Illo.hex("E23B2E"), Illo.hex("1C1A1A"));
        Graphics2D red = riso.layer(RED), black = riso.layer(BLACK);
        Color full = Illo.Riso.ink(1), none = Illo.Riso.ink(0);

        // Mitad izquierda en negro, mitad derecha papel
        black.setColor(full);
        Path2D.Double left = new Path2D.Double();
        left.moveTo(0, 0);
        left.lineTo(W * 0.52, 0);
        left.lineTo(W * 0.40, H);
        left.lineTo(0, H);
        left.closePath();
        black.fill(left);

        // En riso el blanco es "no tinta": el círculo claro es un hueco en el negro
        black.setColor(none);
        black.fill(new Ellipse2D.Double(W * 0.14, H * 0.16, 520, 520));
        // Círculo negro pequeño arriba a la derecha
        black.setColor(full);
        black.fill(new Ellipse2D.Double(1640, 40, 190, 190));

        // La cuña roja atravesando hacia el círculo claro
        red.setColor(full);
        Path2D.Double wedge = new Path2D.Double();
        wedge.moveTo(W * 0.78, H * 0.18);
        wedge.lineTo(W * 0.80, H * 0.42);
        wedge.lineTo(W * 0.25, H * 0.40);
        wedge.closePath();
        red.fill(wedge);

        // Rejilla de barritas
        black.setColor(full);
        for (int k = 0; k < 6; k++) rotRect(black, 1700 + k * 24, 420, 11, 130);

        // Trama de puntos roja con degradado
        red.setColor(full);
        for (double y = H * 0.62; y < H; y += 16)
            for (double x = W * 0.62; x < W; x += 16) {
                double t = (x - W * 0.62) / (W * 0.38);
                double d = 13 * t * (0.6 + 0.4 * (y - H * 0.62) / (H * 0.38));
                red.fill(new Ellipse2D.Double(x - d / 2, y - d / 2, d, d));
            }

        // Tipografía y barras en diagonal
        black.setColor(full);
        rotText(black, "EL CÓDIGO", new Font(Font.SANS_SERIF, Font.BOLD, 128), 960, 740);
        red.setColor(full);
        rotText(red, "TAMBIÉN PINTA", new Font(Font.SANS_SERIF, Font.BOLD, 84), 1040, 860);
        black.setColor(full);
        rotRect(black, 1090, 930, 660, 26);
        red.setColor(full);
        rotRect(red, 1160, 985, 480, 14);

        // Bloque rojo puro sobre lo negro: primero se abre hueco en la tinta negra
        black.setColor(none);
        rotRect(black, 70, 1010, 430, 60);
        red.setColor(full);
        rotRect(red, 70, 1010, 430, 60);
        // Texto claro sobre negro: también es hueco
        black.setColor(none);
        rotText(black, "JAVA 21", new Font(Font.SANS_SERIF, Font.BOLD, 70), 90, 930);

        black.setColor(full);
        black.setFont(new Font(Font.MONOSPACED, Font.BOLD, 24));
        black.drawString("Nº 20  ·  TALLER DE IMÁGENES RARAS  ·  2026", 1200, 1058);

        Gfx.save(riso.print(Illo.hex("E6D5B3"), seed), out);
    }

    /** Rectángulo girado ANG alrededor de su esquina inferior izquierda (x, y). */
    static void rotRect(Graphics2D g, double x, double y, double w, double h) {
        AffineTransform old = g.getTransform();
        g.rotate(ANG, x, y);
        g.fill(new Rectangle2D.Double(x, y - h, w, h));
        g.setTransform(old);
    }

    /** Texto girado ANG con la línea base empezando en (x, y). */
    static void rotText(Graphics2D g, String s, Font f, double x, double y) {
        AffineTransform old = g.getTransform();
        g.rotate(ANG, x, y);
        g.setFont(f);
        g.drawString(s, (float) x, (float) y);
        g.setTransform(old);
    }
}
