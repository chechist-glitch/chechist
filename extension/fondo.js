// Menú "Enviar a Centinela" al hacer clic derecho sobre un texto seleccionado.
// Solo actúa cuando la persona lo pulsa: coge la selección, el enlace de la
// pestaña y una captura de lo que se ve, y abre el formulario para revisarlo.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'centinela',
    title: 'Enviar a Centinela',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'centinela' || !tab) return;
  let captura = null;
  let error = null;
  try {
    captura = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  } catch (e) {
    error = String(e);
  }
  await chrome.storage.session.set({
    pendiente: {
      texto: info.selectionText || '',
      url: tab.url || '',
      titulo: tab.title || '',
      captura,
      error,
    },
  });
  chrome.windows.create({ url: 'formulario.html', type: 'popup', width: 560, height: 760 });
});
