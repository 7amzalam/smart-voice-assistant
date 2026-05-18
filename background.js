// Background script for Voice Assistant Extension
import { pipeline, env } from './transformers.js';

// Configure transformers.js for Chrome Extension
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('wasm/');
env.backends.onnx.wasm.numThreads = 1;

let transcriber = null;
let currentLoadedModel = null;
let isTranscriberLoading = false;

// Initialize or get the transcriber
async function getTranscriber(withProgress = false, targetModel = 'Xenova/whisper-tiny') {
  if (transcriber && currentLoadedModel === targetModel) return transcriber;
  if (isTranscriberLoading) {
    while (isTranscriberLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return transcriber;
  }
  
  isTranscriberLoading = true;
  transcriber = null; // Clear old model if loading a new one
  
  try {
    const pipelineOptions = {};
    if (withProgress) {
      pipelineOptions.progress_callback = (data) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'modelProgress', data }).catch(() => {});
        });
      };
    }

    transcriber = await pipeline('automatic-speech-recognition', targetModel, pipelineOptions);
    currentLoadedModel = targetModel;
    
    // Mark as downloaded for this specific model
    chrome.storage.local.get(['downloadedModels'], (result) => {
      const models = result.downloadedModels || {};
      models[targetModel] = true;
      chrome.storage.local.set({ downloadedModels: models });
    });
    
    // Notify model loaded
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'modelLoading', status: 'done' }).catch(() => {});
    });
  } catch (e) {
    console.error("Failed to load Whisper model:", e);
  }
  isTranscriberLoading = false;
  return transcriber;
}
// Install event
chrome.runtime.onInstalled.addListener(() => {
  // Detect browser language
  const uiLang = chrome.i18n.getUILanguage() || '';
  let defaultLang = 'ar-SA';
  if (uiLang.startsWith('en')) defaultLang = 'en-US';
  else if (uiLang.startsWith('fr')) defaultLang = 'fr-FR';
  else if (uiLang.startsWith('es')) defaultLang = 'es-ES';
  else if (uiLang.startsWith('de')) defaultLang = 'de-DE';

  // Set default settings
  chrome.storage.sync.set({
    language: defaultLang,
    modelSize: 'Xenova/whisper-tiny',
    iconPosition: { x: 50, y: 50 },
    isFirstTime: true
  });

  console.log('Voice Assistant Extension installed with default language:', defaultLang);
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

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'transcribe') {
    (async () => {
      try {
        const targetModel = message.modelSize || 'Xenova/whisper-tiny';
        const aiTranscriber = await getTranscriber(false, targetModel);
        if (!aiTranscriber) {
          sendResponse({ error: "فشل تحميل نموذج الذكاء الاصطناعي." });
          return;
        }
        
        // Convert the standard array back to Float32Array
        const audioData = new Float32Array(message.audio);
        
        const result = await aiTranscriber(audioData, {
          language: message.language,
          task: 'transcribe'
        });
        
        sendResponse({ text: result.text });
      } catch (error) {
        console.error("Transcription error:", error);
        sendResponse({ error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (message.action === 'checkModelStatus') {
    chrome.storage.local.get(['downloadedModels'], (result) => {
      const requestedModel = message.modelSize || 'Xenova/whisper-tiny';
      const models = result.downloadedModels || {};
      const isDownloaded = !!models[requestedModel];
      sendResponse({ isDownloaded });
    });
    return true;
  } else if (message.action === 'downloadModel') {
    const targetModel = message.modelSize || 'Xenova/whisper-tiny';
    
    chrome.storage.local.get(['downloadedModels'], async (result) => {
      const models = result.downloadedModels || {};
      const previouslyDownloaded = Object.keys(models);
      
      let needsCacheClear = false;
      for (const model of previouslyDownloaded) {
        if (model !== targetModel) {
          needsCacheClear = true;
          delete models[model];
        }
      }
      
      if (needsCacheClear && 'caches' in globalThis) {
        try {
          await caches.delete('transformers-cache');
        } catch(e) { console.warn(e); }
      }
      
      getTranscriber(true, targetModel).then((t) => {
        if (t) {
          models[targetModel] = true;
          chrome.storage.local.set({ downloadedModels: models });
        }
        sendResponse({ success: !!t });
      });
    });
    return true;
  } else if (message.action === 'deleteModel') {
    // Just unload from memory. Do not clear the cache or storage.
    transcriber = null;
    currentLoadedModel = null;
    sendResponse({ success: true });
    return true;
  }
});
