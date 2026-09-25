import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Arrays;

/**
 * Hoja de contactos: junta todas las PNG de una carpeta en una cuadrícula
 * con su nombre debajo, para verlas todas de un vistazo.
 *
 * Uso: java ContactSheet carpeta salida.png [columnas]
 */
public class ContactSheet {
    public static void main(String[] args) throws Exception {
        File dir = new File(args[0]);
        String out = args[1];
        int cols = args.length > 2 ? Integer.parseInt(args[2]) : 4;
        String outName = new File(out).getName();
        File[] files = dir.listFiles((d, n) -> n.endsWith(".png") && !n.equals(outName));
        Arrays.sort(files);

        int tw = 480, th = 270, pad = 16, label = 34;
        int rows = (files.length + cols - 1) / cols;
        int w = cols * tw + (cols + 1) * pad, h = rows * (th + label) + (rows + 1) * pad;
        BufferedImage sheet = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = sheet.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setColor(new Color(18, 18, 22));
        g.fillRect(0, 0, w, h);
        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 18));

        for (int i = 0; i < files.length; i++) {
            int x = pad + (i % cols) * (tw + pad);
            int y = pad + (i / cols) * (th + label + pad);
            g.drawImage(Gfx.load(files[i].getPath()), x, y, tw, th, null);
            g.setColor(new Color(200, 200, 210));
            g.drawString(files[i].getName().replace(".png", ""), x + 2, y + th + 24);
        }
        g.dispose();
        Gfx.save(sheet, out);
    }
}
