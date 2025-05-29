// Content script para seleção de área na página
(function() {
  if (window.__feedback_selection_overlay) return; // Evita múltiplas injeções
  window.__feedback_selection_overlay = true;

  let overlay, selectionBox, startX, startY, endX, endY, selecting = false;

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = 999999;
    overlay.style.background = 'rgba(0,0,0,0.08)';
    overlay.style.cursor = 'crosshair';
    overlay.style.userSelect = 'none';
    document.body.appendChild(overlay);

    selectionBox = document.createElement('div');
    selectionBox.style.position = 'absolute';
    selectionBox.style.border = '2px dashed #e11d48';
    selectionBox.style.background = 'rgba(225,29,72,0.08)';
    overlay.appendChild(selectionBox);

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    overlay.addEventListener('keydown', onKeyDown);
    overlay.tabIndex = 0;
    overlay.focus();
  }

  function removeOverlay() {
    overlay?.remove();
    window.__feedback_selection_overlay = false;
  }

  function onMouseDown(e) {
    selecting = true;
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  }

  function onMouseMove(e) {
    if (!selecting) return;
    endX = e.clientX;
    endY = e.clientY;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    selectionBox.style.left = x + 'px';
    selectionBox.style.top = y + 'px';
    selectionBox.style.width = w + 'px';
    selectionBox.style.height = h + 'px';
  }

  function onMouseUp(e) {
    selecting = false;
    endX = e.clientX;
    endY = e.clientY;
    const x = Math.min(startX, endX);
    const y = Math.min(startY, endY);
    const w = Math.abs(endX - startX);
    const h = Math.abs(endY - startY);
    removeOverlay();
    chrome.runtime.sendMessage({
      type: 'FEEDBACK_AREA_SELECTED',
      area: { x, y, w, h, pageW: window.innerWidth, pageH: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY }
    });
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'FEEDBACK_AREA_CANCEL' });
    }
  }

  // Ouve mensagem do popup para iniciar seleção
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_FEEDBACK_SELECTION') {
      createOverlay();
    }
  });
})(); 