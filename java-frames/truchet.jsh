// Java en modo script (JShell): baldosas de Truchet con neón encima de un
// fondo generado por la Regla 30 de Wolfram (un autómata celular caótico).
//
// Uso: OUT=gallery/truchet.png jshell -R-Djava.awt.headless=true truchet.jsh

import java.awt.*;
import java.awt.geom.Arc2D;
import java.awt.image.BufferedImage;
import java.util.Random;

int W = 1920, H = 1080, CELL = 6, TILE = 80;
String out = System.getenv().getOrDefault("OUT", "truchet.png");
Random rnd = new Random(30);

BufferedImage img = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
Graphics2D g = img.createGraphics();
g.setColor(new Color(10, 8, 22));
g.fillRect(0, 0, W, H);

// --- Fondo: Regla 30, empezando con una sola celda viva arriba en el centro
int cols = W / CELL, rows = H / CELL;
boolean[] row = new boolean[cols];
row[cols / 2] = true;
for (int y = 0; y < rows; y++) {
    for (int x = 0; x < cols; x++) {
        if (row[x]) {
            float t = (float) y / rows;
            g.setColor(new Color(40 + (int) (60 * t), 25, 70 + (int) (40 * (1 - t))));
            g.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
        }
    }
    boolean[] next = new boolean[cols];
    for (int x = 0; x < cols; x++) {
        boolean l = row[(x - 1 + cols) % cols], c = row[x], r = row[(x + 1) % cols];
        next[x] = l ^ (c || r);   // Regla 30
    }
    row = next;
}

// --- Encima: baldosas de Truchet de cuartos de círculo en neón
g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
Color neon(double t) {
    // Del rosa al cian pasando por violeta
    return Color.getHSBColor((float) (0.92 - 0.45 * t), 0.85f, 1f);
}
int half = TILE / 2;
for (int ty = -1; ty <= H / TILE; ty++) {
    for (int tx = 0; tx <= W / TILE; tx++) {
        int x = tx * TILE, y = ty * TILE + 20;
        boolean flip = rnd.nextBoolean();
        double t = (double) (x + y) / (W + H);
        Color c = neon(t);
        Arc2D[] arcs = flip
                ? new Arc2D[]{new Arc2D.Double(x - half, y - half, TILE, TILE, 270, 90, Arc2D.OPEN),
                              new Arc2D.Double(x + half, y + half, TILE, TILE, 90, 90, Arc2D.OPEN)}
                : new Arc2D[]{new Arc2D.Double(x + half, y - half, TILE, TILE, 180, 90, Arc2D.OPEN),
                              new Arc2D.Double(x - half, y + half, TILE, TILE, 0, 90, Arc2D.OPEN)};
        // Resplandor: trazos anchos y transparentes, luego el núcleo blanco
        for (int k = 5; k >= 1; k--) {
            g.setColor(new Color(c.getRed(), c.getGreen(), c.getBlue(), 22));
            g.setStroke(new BasicStroke(6 + k * 5, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
            for (Arc2D a : arcs) g.draw(a);
        }
        g.setColor(c);
        g.setStroke(new BasicStroke(5, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        for (Arc2D a : arcs) g.draw(a);
        g.setColor(new Color(255, 245, 255, 200));
        g.setStroke(new BasicStroke(1.6f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        for (Arc2D a : arcs) g.draw(a);
    }
}
g.dispose();
new java.io.File(out).getAbsoluteFile().getParentFile().mkdirs();
javax.imageio.ImageIO.write(img, "png", new java.io.File(out));
System.out.println("  -> " + out);
/exit
