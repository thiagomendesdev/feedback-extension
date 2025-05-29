let lastArea = null;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'FEEDBACK_AREA_SELECTED') {
    lastArea = msg.area;
    chrome.runtime.sendMessage({ type: 'FEEDBACK_AREA_READY', area: lastArea });
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup();
    }
  } else if (msg.type === 'FEEDBACK_AREA_CANCEL') {
    lastArea = null;
  } else if (msg.type === 'GET_FEEDBACK_AREA') {
    sendResponse({ area: lastArea });
    lastArea = null;
  }
}); 