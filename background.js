// Background script for Voice Assistant Extension

// Install event
chrome.runtime.onInstalled.addListener(() => {
  // Set default settings
  chrome.storage.sync.set({
    language: 'ar-SA',
    iconPosition: { x: 50, y: 50 },
    isFirstTime: true
  });

  console.log('Voice Assistant Extension installed');
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-voice-assistant') {
    // Send message to content script to toggle the voice assistant
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleVoiceAssistant' });
      }
    });
  }
});

// Handle extension icon click
chrome.action.onClicked.addListener((tab) => {
  // Send message to content script to handle icon click
  chrome.tabs.sendMessage(tab.id, { action: 'iconClicked' });
});
