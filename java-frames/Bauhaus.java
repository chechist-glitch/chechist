import java.awt.*;
import java.awt.geom.*;
import java.awt.image.BufferedImage;
import java.util.Random;

/**
 * Rejilla Bauhaus: baldosas de 1x1, 2x2 y 3x3 con cuartos de círculo,
 * medias lunas, triángulos, rayas y dianas, en rojo, azul, amarillo y negro
 * sobre papel crema.
 *
 * Uso: java Bauhaus salida.png [semilla]
 */
public class Bauhaus {
    static final Color CREAM = Illo.hex("EFE6D2"), RED = Illo.hex("D63B2A"), BLUE = Illo.hex("1E4B9B"),
            YELLOW = Illo.hex("F0B323"), BLACK = Illo.hex("1C1B1A");
    static final Color[] ALL = {CREAM, CREAM, RED, BLUE, YELLOW, BLACK};
    static final int T = 120, COLS = 16, ROWS = 9;

    public static void main(String[] args) throws Exception {
        String out = args.length > 0 ? args[0] : "bauhaus.png";
        long seed = Gfx.seedArg(args, 1, 1919);
        Random r = new Random(seed);
        BufferedImage img = Gfx.newImage();
        Graphics2D g = Illo.g2(img);
        boolean[][] used = new boolean[ROWS][COLS];

        // Primero las baldosas grandes, luego se rellena el resto con pequeñas
        place(g, r, used, 3, 2);
        place(g, r, used, 2, 5);
        for (int j = 0; j < ROWS; j++)
            for (int i = 0; i < COLS; i++)
                if (!used[j][i]) tile(g, r, i * T, j * T, T);

        g.dispose();
        Illo.grain(img, seed, 0.10);
        Gfx.save(img, out);
    }

    static void place(Graphics2D g, Random r, boolean[][] used, int size, int count) {
        for (int tries = 0, placed = 0; placed < count && tries < 500; tries++) {
            int i = r.nextInt(COLS - size + 1), j = r.nextInt(ROWS - size + 1);
            boolean free = true;
            for (int y = j; y < j + size && free; y++)
                for (int x = i; x < i + size; x++) if (used[y][x]) { free = false; break; }
            if (!free) continue;
            for (int y = j; y < j + size; y++)
                for (int x = i; x < i + size; x++) used[y][x] = true;
            tile(g, r, i * T, j * T, size * T);
            placed++;
        }
    }

    static void tile(Graphics2D g, Random r, int x, int y, int s) {
        Color bg = Illo.pick(r, ALL), fg, third;
        do fg = Illo.pick(r, ALL); while (fg.equals(bg));
        do third = Illo.pick(r, ALL); while (third.equals(fg));
        Shape old = g.getClip();
        g.setClip(x, y, s, s);
        g.setColor(bg);
        g.fillRect(x, y, s, s);
        g.setColor(fg);
        int rot = r.nextInt(4);
        switch (r.nextInt(9)) {
            case 0: { // cuarto de círculo desde una esquina
                double cx = x + (rot == 1 || rot == 2 ? s : 0), cy = y + (rot >= 2 ? s : 0);
                g.fill(new Ellipse2D.Double(cx - s, cy - s, 2 * s, 2 * s));
                break;
            }
            case 1: { // media luna pegada a un lado
                double cx = x + s / 2.0, cy = y + s / 2.0;
                double[][] mid = {{cx, y}, {x + s, cy}, {cx, y + s}, {x, cy}};
                g.fill(new Ellipse2D.Double(mid[rot][0] - s / 2.0, mid[rot][1] - s / 2.0, s, s));
                break;
            }
            case 2: { // diana
                g.fill(new Ellipse2D.Double(x + s * 0.1, y + s * 0.1, s * 0.8, s * 0.8));
                g.setColor(third);
                g.fill(new Ellipse2D.Double(x + s * 0.3, y + s * 0.3, s * 0.4, s * 0.4));
                break;
            }
            case 3: { // triángulo diagonal
                Path2D.Double p = new Path2D.Double();
                double[][] c = {{x, y}, {x + s, y}, {x + s, y + s}, {x, y + s}};
                p.moveTo(c[rot][0], c[rot][1]);
                p.lineTo(c[(rot + 1) % 4][0], c[(rot + 1) % 4][1]);
                p.lineTo(c[(rot + 2) % 4][0], c[(rot + 2) % 4][1]);
                p.closePath();
                g.fill(p);
                break;
            }
            case 4: { // rayas
                int n = 3 + r.nextInt(3);
                double w = s / (2.0 * n);
                for (int k = 0; k < n; k++) {
                    if (rot % 2 == 0) g.fill(new Rectangle2D.Double(x + k * 2 * w + w / 2, y, w, s));
                    else g.fill(new Rectangle2D.Double(x, y + k * 2 * w + w / 2, s, w));
                }
                break;
            }
            case 5: { // anillo
                g.setStroke(new BasicStroke((float) (s * 0.12)));
                g.draw(new Ellipse2D.Double(x + s * 0.2, y + s * 0.2, s * 0.6, s * 0.6));
                break;
            }
            case 6: { // rombo
                Path2D.Double p = new Path2D.Double();
                p.moveTo(x + s / 2.0, y + s * 0.08);
                p.lineTo(x + s * 0.92, y + s / 2.0);
                p.lineTo(x + s / 2.0, y + s * 0.92);
                p.lineTo(x + s * 0.08, y + s / 2.0);
                p.closePath();
                g.fill(p);
                break;
            }
            case 7: { // lunares 3x3
                double d = s / 6.0;
                for (int a = 0; a < 3; a++)
                    for (int b = 0; b < 3; b++)
                        g.fill(new Ellipse2D.Double(x + d * (2 * a + 0.5), y + d * (2 * b + 0.5), d, d));
                break;
            }
            default: { // dos medios círculos enfrentados
                g.fill(new Arc2D.Double(x - s / 2.0, y, s, s, -90, 180, Arc2D.PIE));
                g.setColor(third);
                g.fill(new Arc2D.Double(x + s / 2.0, y, s, s, 90, 180, Arc2D.PIE));
            }
        }
        g.setClip(old);
    }
}
