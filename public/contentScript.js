// Content script para seleção de área na página
(function() {
  if (window.__feedback_selection_overlay) return; // Evita múltiplas injeções
  window.__feedback_selection_overlay = true;

  let overlay, selectionBox, startX, startY, endX, endY, selecting = false;
  let timerEnabled = false;
  let tooltipDiv = null;
  let dragStarted = false; // Nova variável para detectar se houve arraste
  let controlPanel = null; // Panel with control buttons

  function createControlPanel() {
    controlPanel = document.createElement('div');
    controlPanel.style.position = 'fixed';
    controlPanel.style.top = '16px';
    controlPanel.style.right = '16px';
    controlPanel.style.zIndex = 1000002;
    controlPanel.style.display = 'flex';
    controlPanel.style.gap = '8px';
    controlPanel.style.background = 'rgba(255, 255, 255, 0.98)';
    controlPanel.style.backdropFilter = 'blur(12px)';
    controlPanel.style.borderRadius = '8px';
    controlPanel.style.padding = '8px';
    controlPanel.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
    controlPanel.style.border = '1px solid rgba(0,0,0,0.08)';
    controlPanel.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    controlPanel.style.pointerEvents = 'none'; // Don't interfere with area selection
    
    // Config button
    const configBtn = document.createElement('button');
    configBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    configBtn.style.cssText = `
      background: linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%);
      border: 1px solid rgba(0,0,0,0.1);
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #374151;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      pointer-events: auto;
    `;
    configBtn.title = 'Configurações';
    configBtn.addEventListener('mouseover', () => {
      configBtn.style.background = 'linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%)';
      configBtn.style.transform = 'translateY(-1px)';
      configBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    });
    configBtn.addEventListener('mouseout', () => {
      configBtn.style.background = 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)';
      configBtn.style.transform = 'translateY(0)';
      configBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    });
    configBtn.addEventListener('click', () => {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'OPEN_CONFIG' });
    });
    
    // 3 seconds timer button
    const timerBtn = document.createElement('button');
    timerBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12,6 12,12 16,14"></polyline>
      </svg>
      <span style="margin-left: 3px; font-size: 10px; font-weight: 600;">3s</span>
    `;
    timerBtn.style.cssText = `
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
      border: 1px solid #3b82f6;
      cursor: pointer;
      padding: 8px 10px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #1d4ed8;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(59,130,246,0.2);
      pointer-events: auto;
    `;
    timerBtn.title = 'Capturar com timer de 3 segundos';
    timerBtn.addEventListener('mouseover', () => {
      timerBtn.style.background = 'linear-gradient(135deg, #bfdbfe 0%, #93c5fd 100%)';
      timerBtn.style.transform = 'translateY(-1px)';
      timerBtn.style.boxShadow = '0 2px 8px rgba(59,130,246,0.3)';
    });
    timerBtn.addEventListener('mouseout', () => {
      timerBtn.style.background = 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)';
      timerBtn.style.transform = 'translateY(0)';
      timerBtn.style.boxShadow = '0 1px 3px rgba(59,130,246,0.2)';
    });
    timerBtn.addEventListener('click', () => {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'START_FEEDBACK_SELECTION_WITH_TIMER' });
    });
    
    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeBtn.style.cssText = `
      background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%);
      border: 1px solid #ef4444;
      cursor: pointer;
      padding: 8px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #dc2626;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(239,68,68,0.2);
      pointer-events: auto;
    `;
    closeBtn.title = 'Cancelar seleção (ESC)';
    closeBtn.addEventListener('mouseover', () => {
      closeBtn.style.background = 'linear-gradient(135deg, #fecaca 0%, #fca5a5 100%)';
      closeBtn.style.transform = 'translateY(-1px)';
      closeBtn.style.boxShadow = '0 2px 8px rgba(239,68,68,0.3)';
    });
    closeBtn.addEventListener('mouseout', () => {
      closeBtn.style.background = 'linear-gradient(135deg, #fef2f2 0%, #fecaca 100%)';
      closeBtn.style.transform = 'translateY(0)';
      closeBtn.style.boxShadow = '0 1px 3px rgba(239,68,68,0.2)';
    });
    closeBtn.addEventListener('click', () => {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'FEEDBACK_AREA_CANCEL' });
    });
    
    controlPanel.appendChild(configBtn);
    controlPanel.appendChild(timerBtn);
    controlPanel.appendChild(closeBtn);
    document.body.appendChild(controlPanel);
  }

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

    // Create the control panel
    createControlPanel();
  }

  function removeOverlay() {
    overlay?.remove();
    tooltipDiv?.remove();
    controlPanel?.remove();
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