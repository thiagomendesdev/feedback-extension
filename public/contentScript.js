// Content script para seleção de área na página
(function() {
  if (window.__feedback_selection_overlay) return; // Evita múltiplas injeções
  window.__feedback_selection_overlay = true;

  let overlay, selectionBox, startX, startY, endX, endY, selecting = false;
  let timerEnabled = false;
  let tooltipDiv = null;
  let dragStarted = false; // Nova variável para detectar se houve arraste

  function createOverlay(opts = {}) {
    timerEnabled = !!opts.timer;
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

    // Tooltip
    tooltipDiv = document.createElement('div');
    tooltipDiv.textContent = 'Arraste para selecionar área ou clique para capturar tela inteira';
    tooltipDiv.style.position = 'fixed';
    tooltipDiv.style.background = 'rgba(34,34,34,0.95)';
    tooltipDiv.style.color = '#fff';
    tooltipDiv.style.fontSize = '14px';
    tooltipDiv.style.padding = '6px 14px';
    tooltipDiv.style.borderRadius = '6px';
    tooltipDiv.style.pointerEvents = 'none';
    tooltipDiv.style.zIndex = 1000001;
    tooltipDiv.style.top = '0px';
    tooltipDiv.style.left = '0px';
    tooltipDiv.style.transform = 'translate(-50%, -120%)';
    document.body.appendChild(tooltipDiv);

    overlay.addEventListener('mousemove', onMouseMoveTooltip);
    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);
    overlay.addEventListener('keydown', onKeyDown);
    overlay.tabIndex = 0;
    overlay.focus();
  }

  function removeOverlay() {
    overlay?.remove();
    tooltipDiv?.remove();
    window.__feedback_selection_overlay = false;
  }

  function onMouseDown(e) {
    selecting = true;
    dragStarted = false; // Reset da flag de arraste
    startX = e.clientX;
    startY = e.clientY;
    selectionBox.style.left = startX + 'px';
    selectionBox.style.top = startY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  }

  function onMouseMove(e) {
    if (!selecting) return;
    
    // Detecta se houve movimento significativo (arraste)
    const deltaX = Math.abs(e.clientX - startX);
    const deltaY = Math.abs(e.clientY - startY);
    if (deltaX > 5 || deltaY > 5) {
      dragStarted = true;
    }
    
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

  function onMouseMoveTooltip(e) {
    if (!tooltipDiv) return;
    tooltipDiv.style.left = e.clientX + 'px';
    tooltipDiv.style.top = e.clientY + 'px';
  }

  function showTimerAndSend(x, y, w, h, areaObj) {
    // Recorte da área selecionada (apenas mask, sem darkOverlay)
    const mask = document.createElement('div');
    mask.style.position = 'fixed';
    mask.style.left = x + 'px';
    mask.style.top = y + 'px';
    mask.style.width = w + 'px';
    mask.style.height = h + 'px';
    mask.style.background = 'transparent';
    mask.style.boxShadow = '0 0 0 9999px rgba(0,0,0,0.38)';
    mask.style.pointerEvents = 'none';
    mask.style.zIndex = 1000001;
    document.body.appendChild(mask);

    // Timer menor, no bottom da viewport
    const timerDiv = document.createElement('div');
    timerDiv.style.position = 'fixed';
    timerDiv.style.left = '50%';
    timerDiv.style.bottom = '32px';
    timerDiv.style.transform = 'translateX(-50%)';
    timerDiv.style.width = '48px';
    timerDiv.style.height = '48px';
    timerDiv.style.background = 'rgba(225,29,72,0.92)';
    timerDiv.style.color = '#fff';
    timerDiv.style.display = 'flex';
    timerDiv.style.alignItems = 'center';
    timerDiv.style.justifyContent = 'center';
    timerDiv.style.fontSize = '1.7rem';
    timerDiv.style.fontWeight = 'bold';
    timerDiv.style.borderRadius = '50%';
    timerDiv.style.zIndex = 1000002;
    timerDiv.style.boxShadow = '0 2px 16px rgba(0,0,0,0.18)';
    document.body.appendChild(timerDiv);
    let count = 3;
    timerDiv.textContent = count;
    const interval = setInterval(() => {
      count--;
      if (count > 0) {
        timerDiv.textContent = count;
      } else {
        clearInterval(interval);
        timerDiv.remove();
        mask.remove();
        chrome.runtime.sendMessage({
          type: 'FEEDBACK_AREA_SELECTED',
          area: areaObj
        });
      }
    }, 1000);
  }

  function onMouseUp(e) {
    selecting = false;
    endX = e.clientX;
    endY = e.clientY;
    
    let x, y, w, h;
    
    // Se não houve arraste significativo, captura a tela inteira
    if (!dragStarted) {
      x = 0;
      y = 0;
      w = window.innerWidth;
      h = window.innerHeight;
    } else {
      // Área selecionada pelo usuário
      x = Math.min(startX, endX);
      y = Math.min(startY, endY);
      w = Math.abs(endX - startX);
      h = Math.abs(endY - startY);
    }
    
    removeOverlay();
    const areaObj = { x, y, w, h, pageW: window.innerWidth, pageH: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY };
    
    if (timerEnabled) {
      showTimerAndSend(x, y, w, h, areaObj);
    } else {
      chrome.runtime.sendMessage({
        type: 'FEEDBACK_AREA_SELECTED',
        area: areaObj
      });
    }
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
      createOverlay(msg);
    }
  });
})(); 