let lastArea = null;
let shouldOpenConfig = false;

// Handle extension icon click - go directly to area selection
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'START_FEEDBACK_SELECTION', timer: false });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FEEDBACK_AREA_SELECTED') {
    lastArea = msg.area;
    chrome.runtime.sendMessage({ type: 'FEEDBACK_AREA_READY', area: lastArea });
    // Open popup window after area is selected
    chrome.windows.create({
      url: 'index.html',
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
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
    // Open config popup window
    shouldOpenConfig = true;
    chrome.windows.create({
      url: 'index.html',
      type: 'popup',
      width: 400,
      height: 600,
      focused: true
    }).then(() => {
      // Send message to the popup to open config
      setTimeout(() => {
        chrome.runtime.sendMessage({ type: 'OPEN_CONFIG' });
        shouldOpenConfig = false;
      }, 500);
    }).catch(() => {
      shouldOpenConfig = false;
    });
  } else if (msg.type === 'CHECK_SHOULD_OPEN_CONFIG') {
    sendResponse({ shouldOpenConfig });
    shouldOpenConfig = false;
  }
}); 