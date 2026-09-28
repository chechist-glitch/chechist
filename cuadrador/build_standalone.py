"""Genera cuadrador.html: la herramienta en un solo archivo (motor e
interfaz incrustados) para abrirla con doble clic o pasarla por WhatsApp.

Uso: python3 build_standalone.py
"""
from pathlib import Path

here = Path(__file__).resolve().parent
page = (here / 'index.html').read_text(encoding='utf-8')
engine = (here / 'engine.js').read_text(encoding='utf-8')
app = (here / 'app.js').read_text(encoding='utf-8')

for code in (engine, app):
    assert '</script' not in code.lower(), 'el código no puede contener </script>'

page = page.replace('<script src="engine.js"></script>', '<script id="engine-src">\n' + engine + '</script>')
page = page.replace('<script src="app.js"></script>', '<script>\n' + app + '</script>')
assert 'src="engine.js"' not in page and 'src="app.js"' not in page

(here / 'cuadrador.html').write_text(page, encoding='utf-8')
print('cuadrador.html:', len(page.encode('utf-8')) // 1024, 'KB')
