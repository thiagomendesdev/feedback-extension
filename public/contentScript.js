// Content script para seleção de área na página
(function() {
  if (window.__feedback_selection_overlay) return; // Evita múltiplas injeções
  window.__feedback_selection_overlay = true;

  let overlay, selectionBox, startX, startY, endX, endY, selecting = false;
  let timerEnabled = false;
  let tooltipDiv = null;
  let dragStarted = false; // Nova variável para detectar se houve arraste
  let controlPanel = null; // Panel with control buttons
  let editOverlay = null; // Edit overlay iframe
  let configOverlay = null; // Config overlay iframe

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
    controlPanel.style.borderRadius = '12px'; // increased radius
    controlPanel.style.padding = '8px';
    controlPanel.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)';
    controlPanel.style.border = '1px solid rgba(0,0,0,0.08)';
    controlPanel.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    controlPanel.style.pointerEvents = 'none'; // Don't interfere with area selection
    
    // Hide tooltip when hovering control panel
    controlPanel.addEventListener('mouseenter', () => {
      if (tooltipDiv) {
        tooltipDiv.style.display = 'none';
      }
    });
    controlPanel.addEventListener('mouseleave', () => {
      if (tooltipDiv) {
        tooltipDiv.style.display = 'block';
      }
    });
    
    // 3 seconds timer button (ActionIcon style, icon only)
    const timerBtn = document.createElement('button');
    timerBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12,6 12,12 16,14"></polyline>
      </svg>
    `;
    timerBtn.style.cssText = `
      background: transparent;
      border: none;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #495057;
      transition: all 0.1s ease;
      pointer-events: auto;
      position: relative;
    `;
    
    // Create Mantine-style tooltip for timer button
    const timerTooltip = document.createElement('div');
    timerTooltip.textContent = 'Capture with 3 second timer';
    timerTooltip.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #212529;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s ease;
      z-index: 1000003;
    `;
    timerBtn.appendChild(timerTooltip);
    
    timerBtn.addEventListener('mouseenter', () => {
      timerBtn.style.background = 'rgba(134, 142, 150, 0.35)'; // subtle variant hover
      timerTooltip.style.opacity = '1';
    });
    timerBtn.addEventListener('mouseleave', () => {
      timerBtn.style.background = 'transparent';
      timerTooltip.style.opacity = '0';
    });
    timerBtn.addEventListener('click', () => {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'START_FEEDBACK_SELECTION_WITH_TIMER' });
    });
    
    // Config button (ActionIcon style)
    const configBtn = document.createElement('button');
    configBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
    `;
    configBtn.style.cssText = `
      background: transparent;
      border: none;
      cursor: pointer;
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #495057;
      transition: all 0.1s ease;
      pointer-events: auto;
      position: relative;
    `;
    
    // Create Mantine-style tooltip for config button
    const configTooltip = document.createElement('div');
    configTooltip.textContent = 'Settings';
    configTooltip.style.cssText = `
      position: absolute;
      top: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: #212529;
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.1s ease;
      z-index: 1000003;
    `;
    configBtn.appendChild(configTooltip);
    
    configBtn.addEventListener('mouseenter', () => {
      configBtn.style.background = 'rgba(134, 142, 150, 0.35)'; // subtle variant hover
      configTooltip.style.opacity = '1';
    });
    configBtn.addEventListener('mouseleave', () => {
      configBtn.style.background = 'transparent';
      configTooltip.style.opacity = '0';
    });
    configBtn.addEventListener('click', () => {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'OPEN_CONFIG' });
    });
    
    controlPanel.appendChild(timerBtn);
    controlPanel.appendChild(configBtn);
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
    tooltipDiv.innerHTML = 'Drag to area.<br>Click to full window.<br>Esc to cancel.';
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
    
    // Hide control panel and tooltip when starting selection
    if (controlPanel) {
      controlPanel.style.display = 'none';
    }
    if (tooltipDiv) {
      tooltipDiv.style.display = 'none';
    }
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
    // Remove overlay first to avoid capturing it
    removeOverlay();
    
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
        // Remove timer and mask before capture
        timerDiv.remove();
        mask.remove();
        
        // Small delay to ensure elements are removed
        setTimeout(() => {
          chrome.runtime.sendMessage({
            type: 'FEEDBACK_AREA_SELECTED',
            area: areaObj
          });
        }, 50);
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
    
    const areaObj = { x, y, w, h, pageW: window.innerWidth, pageH: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY };
    
    if (timerEnabled) {
      showTimerAndSend(x, y, w, h, areaObj);
    } else {
      // Remove overlay and control panel BEFORE sending capture message
      removeOverlay();
      
      // Small delay to ensure overlay is removed before capture
      setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'FEEDBACK_AREA_SELECTED',
          area: areaObj
        });
      }, 100);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      removeOverlay();
      chrome.runtime.sendMessage({ type: 'FEEDBACK_AREA_CANCEL' });
    }
  }

  function createEditOverlay(areaData, fullScreenshot) {
    if (editOverlay) return; // Prevent multiple overlays
    
    // First crop the image
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      const scaleX = img.naturalWidth / areaData.pageW;
      const scaleY = img.naturalHeight / areaData.pageH;
      const sx = Math.round(areaData.x * scaleX);
      const sy = Math.round(areaData.y * scaleY);
      const sw = Math.round(areaData.w * scaleX);
      const sh = Math.round(areaData.h * scaleY);
      
      canvas.width = sw;
      canvas.height = sh;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
      
      const croppedDataUrl = canvas.toDataURL('image/png');
      
      // Create the overlay with lighter background like Mantine Spotlight
      editOverlay = document.createElement('div');
      editOverlay.style.position = 'fixed';
      editOverlay.style.top = '0';
      editOverlay.style.left = '0';
      editOverlay.style.width = '100vw';
      editOverlay.style.height = '100vh';
      editOverlay.style.background = 'rgba(0, 0, 0, 0.4)';
      editOverlay.style.backdropFilter = 'blur(8px)';
      editOverlay.style.WebkitBackdropFilter = 'blur(8px)'; // Safari support
      editOverlay.style.zIndex = 2000000;
      editOverlay.style.display = 'flex';
      editOverlay.style.alignItems = 'center';
      editOverlay.style.justifyContent = 'center';

      const modal = document.createElement('div');
      modal.style.width = '1000px';
      modal.style.height = '700px';
      modal.style.background = '#fff';
      modal.style.borderRadius = '16px'; // increased radius
      modal.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)'; // reduced shadow
      modal.style.position = 'relative';
      modal.style.overflow = 'hidden';

      const closeBtn = document.createElement('button');
      closeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
      closeBtn.style.position = 'absolute';
      closeBtn.style.top = '12px';
      closeBtn.style.right = '12px';
      closeBtn.style.width = '28px';
      closeBtn.style.height = '28px';
      closeBtn.style.border = 'none';
      closeBtn.style.background = 'transparent';
      closeBtn.style.borderRadius = '6px'; // md radius
      closeBtn.style.cursor = 'pointer';
      closeBtn.style.fontSize = '16px';
      closeBtn.style.zIndex = 10;
      closeBtn.style.display = 'flex';
      closeBtn.style.alignItems = 'center';
      closeBtn.style.justifyContent = 'center';
      closeBtn.style.color = '#495057';
      closeBtn.style.transition = 'all 0.15s ease';
      closeBtn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      
      // Hover effects for close button (ActionIcon subtle style)
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = 'rgba(134, 142, 150, 0.35)';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = 'transparent';
      });
      closeBtn.addEventListener('click', removeEditOverlay);

      const iframe = document.createElement('iframe');
      // Pass mode via URL parameter
      const params = new URLSearchParams({
        mode: 'edit'
      });
      iframe.src = chrome.runtime.getURL('index.html') + '?' + params.toString();
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '16px';

      // ESC key functionality
      const handleEscKey = (e) => {
        if (e.key === 'Escape') {
          removeEditOverlay();
        }
      };
      document.addEventListener('keydown', handleEscKey);
      
      // Store the handler for cleanup
      editOverlay._escHandler = handleEscKey;

      // Listen for iframe ready message and send data
      window.addEventListener('message', function(event) {
        if (event.data === 'iframeReady') {
          // Send the image data to iframe
          iframe.contentWindow.postMessage({
            type: 'feedbackData',
            areaData: areaData,
            imageData: croppedDataUrl
          }, '*');
        } else if (event.data === 'closeFeedbackOverlay') {
          removeEditOverlay();
        }
      });

      modal.appendChild(closeBtn);
      modal.appendChild(iframe);
      editOverlay.appendChild(modal);
      document.body.appendChild(editOverlay);

      // Close on background click
      editOverlay.addEventListener('click', (e) => {
        if (e.target === editOverlay) {
          removeEditOverlay();
        }
      });
    };
    
    img.src = fullScreenshot;
  }

  function removeEditOverlay() {
    if (editOverlay) {
      // Remove ESC key listener
      if (editOverlay._escHandler) {
        document.removeEventListener('keydown', editOverlay._escHandler);
      }
      editOverlay.remove();
      editOverlay = null;
    }
  }

  function createConfigOverlay() {
    if (configOverlay) return; // Prevent multiple overlays
    
    // Create overlay with lighter background like Mantine Spotlight
    configOverlay = document.createElement('div');
    configOverlay.style.position = 'fixed';
    configOverlay.style.top = '0';
    configOverlay.style.left = '0';
    configOverlay.style.width = '100vw';
    configOverlay.style.height = '100vh';
    configOverlay.style.background = 'rgba(0, 0, 0, 0.4)';
    configOverlay.style.backdropFilter = 'blur(8px)';
    configOverlay.style.WebkitBackdropFilter = 'blur(8px)'; // Safari support
    configOverlay.style.zIndex = 2000000;
    configOverlay.style.display = 'flex';
    configOverlay.style.alignItems = 'center';
    configOverlay.style.justifyContent = 'center';

    const modal = document.createElement('div');
    modal.style.width = '450px';
    modal.style.height = '600px';
    modal.style.background = '#fff';
    modal.style.borderRadius = '16px'; // increased radius
    modal.style.boxShadow = '0 10px 25px rgba(0, 0, 0, 0.15)'; // reduced shadow
    modal.style.position = 'relative';
    modal.style.overflow = 'hidden';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    `;
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '12px';
    closeBtn.style.right = '12px';
    closeBtn.style.width = '28px';
    closeBtn.style.height = '28px';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.borderRadius = '6px'; // md radius
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.fontSize = '16px';
    closeBtn.style.zIndex = 10;
    closeBtn.style.display = 'flex';
    closeBtn.style.alignItems = 'center';
    closeBtn.style.justifyContent = 'center';
    closeBtn.style.color = '#495057';
    closeBtn.style.transition = 'all 0.15s ease';
    closeBtn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    
    // Hover effects for close button (ActionIcon subtle style)
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(134, 142, 150, 0.35)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'transparent';
    });
    closeBtn.addEventListener('click', removeConfigOverlay);

    const iframe = document.createElement('iframe');
    // Set config mode via URL parameter
    const params = new URLSearchParams({
      mode: 'config'
    });
    iframe.src = chrome.runtime.getURL('index.html') + '?' + params.toString();
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '16px';

    // ESC key functionality
    const handleEscKey = (e) => {
      if (e.key === 'Escape') {
        removeConfigOverlay();
      }
    };
    document.addEventListener('keydown', handleEscKey);
    
    // Store the handler for cleanup
    configOverlay._escHandler = handleEscKey;

    // Set flag for config mode
    window.__feedbackConfigMode = true;

    modal.appendChild(closeBtn);
    modal.appendChild(iframe);
    configOverlay.appendChild(modal);
    document.body.appendChild(configOverlay);

    // Close on background click
    configOverlay.addEventListener('click', (e) => {
      if (e.target === configOverlay) {
        removeConfigOverlay();
      }
    });

    // Listen for close message from iframe
    window.addEventListener('message', function(event) {
      if (event.data === 'closeFeedbackOverlay') {
        removeConfigOverlay();
      }
    });
  }

  function removeConfigOverlay() {
    if (configOverlay) {
      // Remove ESC key listener
      if (configOverlay._escHandler) {
        document.removeEventListener('keydown', configOverlay._escHandler);
      }
      configOverlay.remove();
      configOverlay = null;
      window.__feedbackConfigMode = false;
    }
  }

  // Ouve mensagem do popup para iniciar seleção
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'START_FEEDBACK_SELECTION') {
      createOverlay(msg);
    } else if (msg.type === 'SHOW_EDIT_OVERLAY') {
      createEditOverlay(msg.area, msg.fullScreenshot);
    } else if (msg.type === 'SHOW_CONFIG_OVERLAY') {
      createConfigOverlay();
    }
  });
})(); 