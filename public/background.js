let lastArea = null;
let shouldOpenConfig = false;

// Handle extension icon click - go directly to area selection
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'START_FEEDBACK_SELECTION', timer: false });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FEEDBACK_AREA_SELECTED') {
    lastArea = msg.area;
    // Capture the full screen and send to content script for processing
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      // Send full screenshot and area data to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            type: 'SHOW_EDIT_OVERLAY', 
            area: lastArea,
            fullScreenshot: dataUrl
          });
        }
      });
    });
  } else if (msg.type === 'FEEDBACK_AREA_CANCEL') {
    lastArea = null;
  } else if (msg.type === 'GET_FEEDBACK_AREA') {
    sendResponse({ area: lastArea });
    lastArea = null;
  } else if (msg.type === 'START_FEEDBACK_SELECTION_WITH_TIMER') {
    // Handle timer option from control panel
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'START_FEEDBACK_SELECTION', timer: true });
      }
    });
  } else if (msg.type === 'OPEN_CONFIG') {
    // Send message to content script to show config overlay
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_CONFIG_OVERLAY' });
      }
    });
  } else if (msg.type === 'CHECK_SHOULD_OPEN_CONFIG') {
    sendResponse({ shouldOpenConfig });
    shouldOpenConfig = false;
  }
}); 