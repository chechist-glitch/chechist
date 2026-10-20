// Formulario para revisar el caso antes de guardarlo en Centinela.

const SERVIDOR = 'http://127.0.0.1:8770';

const $ = (id) => document.getElementById(id);
let pendiente = null;

function esPublicacionInstagram(url) {
  try {
    const u = new URL(url);
    if (!/(^|\.)instagram\.com$/.test(u.hostname)) return true; // en otras webs no avisamos
    return /\/(p|reel|reels|tv)\//.test(u.pathname);
  } catch {
    return false;
  }
}

async function cargar() {
  ({ pendiente } = await chrome.storage.session.get('pendiente'));
  if (!pendiente) {
    $('estado').textContent = 'No hay nada pendiente. Selecciona un comentario y usa "Enviar a Centinela".';
    $('enviar').disabled = true;
    return;
  }
  $('texto').value = pendiente.texto;
  $('url').value = pendiente.url;
  $('aviso-enlace').hidden = esPublicacionInstagram(pendiente.url);
  if (pendiente.captura) {
    $('captura').src = pendiente.captura;
    $('captura').hidden = false;
  } else {
    $('sin-captura').textContent = 'No se pudo hacer la captura' + (pendiente.error ? `: ${pendiente.error}` : '.');
    $('sin-captura').hidden = false;
  }
  $('cuenta').focus();
}

$('formulario').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  $('enviar').disabled = true;
  $('estado').className = '';
  $('estado').textContent = 'Guardando…';
  try {
    const respuesta = await fetch(`${SERVIDOR}/api/casos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Centinela': '1' },
      body: JSON.stringify({
        url: pendiente.url,
        titulo: pendiente.titulo,
        cuenta: $('cuenta').value,
        texto: $('texto').value,
        captura: pendiente.captura,
      }),
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || `HTTP ${respuesta.status}`);
    await chrome.storage.session.remove('pendiente');
    $('estado').className = 'ok';
    $('estado').textContent = datos.nuevo
      ? `Guardado como caso #${datos.id}.`
      : `Ese comentario ya estaba (caso #${datos.id}); se ha añadido la captura nueva.`;
    setTimeout(() => window.close(), 1500);
  } catch (e) {
    $('estado').className = 'error';
    $('estado').textContent = e instanceof TypeError
      ? 'No llega a Centinela. ¿Está abierta la terminal con "centinela recepcion"?'
      : `No se ha guardado: ${e.message}`;
    $('enviar').disabled = false;
  }
});

cargar();
