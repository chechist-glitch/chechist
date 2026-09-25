import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;
import java.util.stream.IntStream;

/**
 * Grabado en linóleo a dos tintas: sol bermellón, cielo rayado, sierras
 * talladas con líneas que siguen la cresta, mar de olas rizadas, una barca
 * con su pescador y pájaros. Al final, textura de tinta gastada.
 *
 * Uso: java Linocut salida.png [semilla]
 */
public class Linocut {
    static final Color PAPER = Illo.hex("EFE8D8"), BLACK = Illo.hex("161412"), RED = Illo.hex("D2452B");
    static final int W = Gfx.W, H = Gfx.H;
    static final double SUN_X = 1180, SUN_Y = 330, SUN_R = 150, SEA_Y = 760;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "linograbado.png";
        long seed = Gfx.seedArg(args, 1, 1956);
        Random r = new Random(seed);
        Gfx.Perlin n = new Gfx.Perlin(seed);

        // Perfiles de tres sierras, de la más lejana a la más cercana
        double[][] ridge = new double[3][W];
        double[] base = {560, 640, 710};
        for (int k = 0; k < 3; k++)
            for (int x = 0; x < W; x++)
                ridge[k][x] = base[k] - 180 * (0.55 + 0.45 * n.fbm(x * 0.0022 + k * 7.3, k * 3.1, 4)) + k * 30;

        BufferedImage img = Gfx.newImage();
        IntStream.range(0, H).parallel().forEach(y -> {
            for (int x = 0; x < W; x++) img.setRGB(x, y, pixel(x, y, ridge).getRGB());
        });

        Graphics2D g = Illo.g2(img);
        sea(g, r);
        boat(g, 700, SEA_Y + 90);
        g.setColor(BLACK);
        g.setStroke(Illo.stroke(5));
        for (int k = 0; k < 7; k++) {
            double bx = Illo.range(r, 200, 1000), by = Illo.range(r, 120, 360), s = Illo.range(r, 14, 28);
            Path2D.Double bird = new Path2D.Double();
            bird.moveTo(bx - s, by - s * 0.4);
            bird.quadTo(bx - s * 0.4, by - s * 0.6, bx, by);
            bird.quadTo(bx + s * 0.4, by - s * 0.6, bx + s, by - s * 0.4);
            g.draw(bird);
        }
        // Marco de la plancha
        g.setStroke(new BasicStroke(14));
        g.draw(new Rectangle2D.Double(40, 40, W - 80, H - 80));
        g.setColor(PAPER);
        g.fill(new Rectangle2D.Double(0, 0, W, 33));
        g.fill(new Rectangle2D.Double(0, H - 33, W, 33));
        g.fill(new Rectangle2D.Double(0, 0, 33, H));
        g.fill(new Rectangle2D.Double(W - 33, 0, 33, H));
        g.dispose();

        wornInk(img, seed);
        Gfx.save(img, out);
    }

    static Color pixel(int x, int y, double[][] ridge) {
        // Sierras: de delante hacia atrás, la primera que tape el píxel manda
        for (int k = 2; k >= 0; k--) {
            double d = y - ridge[k][x];
            if (d >= 0 && y < SEA_Y) {
                double spacing = 11 + k * 3;
                double thick = Math.max(1.2, 5.5 - d * 0.03 - k);
                double m = d % spacing;
                // Cerca de la cresta se talla una línea blanca, luego se va cerrando a negro
                boolean carved = d < 6 + k * 2 ? false : m < thick && d < 190 - k * 20;
                return carved ? PAPER : BLACK;
            }
        }
        if (y >= SEA_Y) return BLACK;
        // Sol bermellón con anillos tallados
        double ds = Math.hypot(x - SUN_X, y - SUN_Y);
        if (ds < SUN_R) return (ds > SUN_R * 0.55 && (int) (ds / 9) % 2 == 0) ? PAPER : RED;
        // Rayos del sol: cuñas alternas
        double ang = Math.atan2(y - SUN_Y, x - SUN_X);
        if (ds < SUN_R + 230 && ds > SUN_R + 22 && Math.sin(ang * 18) > 0.55) return RED;
        // Cielo: rayas horizontales más gordas arriba
        double t = 1 - y / 520.0;
        double lineW = 1 + 7 * t * t;
        return (y % 16) < lineW ? BLACK : PAPER;
    }

    static void sea(Graphics2D g, Random r) {
        g.setColor(PAPER);
        for (int row = 0; row < 7; row++) {
            double y = SEA_Y + 30 + row * 42;
            double period = 110 + row * 14;
            double off = (row % 2) * period / 2;
            g.setStroke(Illo.stroke(3 + row * 0.6));
            for (double x = -period + off; x < W + period; x += period) {
                // Ola: arco con un rizo en la punta
                Path2D.Double wave = new Path2D.Double();
                wave.moveTo(x, y);
                wave.quadTo(x + period * 0.35, y - 26, x + period * 0.62, y - 10);
                wave.quadTo(x + period * 0.72, y - 2, x + period * 0.64, y + 6);
                wave.quadTo(x + period * 0.56, y + 10, x + period * 0.55, y);
                g.draw(wave);
                g.draw(new Line2D.Double(x + period * 0.1, y + 14, x + period * 0.4, y + 14));
            }
        }
        // Reflejo del sol en el agua
        g.setColor(RED);
        for (int k = 0; k < 8; k++) {
            double w = 160 - k * 16;
            g.fill(new Rectangle2D.Double(SUN_X - w / 2, SEA_Y + 12 + k * 22, w, 7));
        }
    }

    static void boat(Graphics2D g, double x, double y) {
        // Casco en blanco (tallado) con líneas negras
        Path2D.Double hull = new Path2D.Double();
        hull.moveTo(x - 150, y - 40);
        hull.lineTo(x + 160, y - 40);
        hull.quadTo(x + 120, y + 20, x + 60, y + 25);
        hull.lineTo(x - 90, y + 25);
        hull.quadTo(x - 130, y + 15, x - 150, y - 40);
        g.setColor(PAPER);
        g.fill(hull);
        g.setColor(BLACK);
        g.setStroke(Illo.stroke(4));
        for (int k = 0; k < 4; k++) g.draw(new Line2D.Double(x - 120 + k * 8, y - 25 + k * 12, x + 130 - k * 16, y - 25 + k * 12));
        // Mástil y vela
        g.setStroke(Illo.stroke(7));
        g.draw(new Line2D.Double(x + 10, y - 40, x + 10, y - 300));
        Path2D.Double sail = new Path2D.Double();
        sail.moveTo(x + 22, y - 290);
        sail.quadTo(x + 150, y - 190, x + 140, y - 60);
        sail.lineTo(x + 22, y - 60);
        sail.closePath();
        g.setColor(RED);
        g.fill(sail);
        g.setColor(BLACK);
        g.setStroke(Illo.stroke(4));
        g.draw(sail);
        for (int k = 1; k < 5; k++) g.draw(new Line2D.Double(x + 22, y - 60 - k * 45, x + 22 + 110 * Math.sin(k * 0.55), y - 60 - k * 45));
        // Pescador: sombrero, cuerpo, caña
        g.setColor(PAPER);
        g.fill(new RoundRectangle2D.Double(x - 90, y - 110, 44, 72, 18, 18));
        g.fill(new Ellipse2D.Double(x - 86, y - 142, 36, 36));
        g.setColor(BLACK);
        g.setStroke(Illo.stroke(4));
        g.draw(new RoundRectangle2D.Double(x - 90, y - 110, 44, 72, 18, 18));
        g.draw(new Ellipse2D.Double(x - 86, y - 142, 36, 36));
        Path2D.Double hat = new Path2D.Double();
        hat.moveTo(x - 104, y - 132);
        hat.lineTo(x - 68, y - 168);
        hat.lineTo(x - 32, y - 132);
        hat.closePath();
        g.setColor(PAPER);
        g.fill(hat);
        g.setColor(BLACK);
        g.draw(hat);
        // Caña tallada en blanco para que se vea sobre la sierra negra
        g.setColor(PAPER);
        g.setStroke(Illo.stroke(4));
        g.draw(new QuadCurve2D.Double(x - 60, y - 90, x - 170, y - 230, x - 260, y - 180));
        g.setStroke(Illo.stroke(2));
        g.draw(new Line2D.Double(x - 260, y - 180, x - 262, y + 10));
    }

    /** Tinta gastada: motitas blancas en lo negro y zonas con menos carga. */
    static void wornInk(BufferedImage img, long seed) {
        Gfx.Perlin n = new Gfx.Perlin(seed + 1);
        IntStream.range(0, H).parallel().forEach(y -> {
            Random r = new Random(seed * 131 + y);
            for (int x = 0; x < W; x++) {
                int c = img.getRGB(x, y);
                double l = Gfx.lum(c);
                if (l < 0.5 || Gfx.r(c) - Gfx.b(c) > 0.3) {
                    double wear = n.fbm(x * 0.01, y * 0.01, 3);
                    if (r.nextDouble() < 0.025 + Math.max(0, wear) * 0.12) img.setRGB(x, y, PAPER.getRGB());
                }
            }
        });
        Illo.grain(img, seed, 0.08);
    }
}
