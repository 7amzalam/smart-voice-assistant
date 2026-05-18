// Content script for Voice Assistant Extension

// Create and inject the floating icon
let floatingIcon = null;
let isIconVisible = false;
let isDragging = false;
let didMove = false; // <-- أضف هذا السطر
let dragStartPos = { x: 0, y: 0 };
let iconPosition = { x: 50, y: 50 };
let voiceRecognition = null;
let isRecording = false;
let status = 'idle'; // idle, recording, sleeping, disabled
let transcript = '';
let lastTranscript = '';
let activeInput = null;
let showEditButton = false;
let editButtonTimeout = null;
let sleepingTimeout = null;
let settingsPanel = null;
let editDialog = null;
let language = 'ar-SA';
let mediaRecorder = null;
let audioChunks = [];
let useAIFallback = false;
let audioContext = null;
let modelSize = 'Xenova/whisper-tiny';
let liveTranscriptionEnabled = true;
let liveTranscriptionInterval = null;
let isTranscribing = false;
let liveAudioBuffer = [];
let lastProcessedLength = 0;
let mediaStreamSource = null;
let scriptProcessor = null;
let gainNode = null;
let stream = null;
let currentVolume = 0;
let visualizerAnimationFrame = null;
let isPinned = false;

// Shadow DOM variables
let shadowContainer = null;
let shadowRoot = null;

function getShadowRoot() {
  if (!shadowContainer) {
    shadowContainer = document.createElement('div');
    shadowContainer.id = 'voice-assistant-shadow-host';
    shadowContainer.style.position = 'absolute';
    shadowContainer.style.top = '0';
    shadowContainer.style.left = '0';
    shadowContainer.style.width = '100%';
    shadowContainer.style.height = '0';
    shadowContainer.style.zIndex = '2147483647';
    shadowContainer.style.pointerEvents = 'none';
    
    shadowRoot = shadowContainer.attachShadow({ mode: 'closed' });
    
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; pointer-events: auto; }
      :host {
        color: #1f2937;
        font-family: system-ui, -apple-system, sans-serif;
      }
      #voice-assistant-shadow-host {
        color: #1f2937; /* Force dark text to fix white-on-white issues */
        font-family: system-ui, -apple-system, sans-serif;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: .5; }
      }
      .animate-pulse {
        animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
      }
      .visualizer-container {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .visualizer-ring {
        position: absolute;
        width: 100%; height: 100%;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.5);
        transform: scale(0.8);
        opacity: 0;
        transition: transform 0.1s, opacity 0.1s;
      }
    `;
    shadowRoot.appendChild(style);
    document.body.appendChild(shadowContainer);
  }
  return shadowRoot;
}

// Translations dictionary
const translations = {
  'ar-SA': {
    sleepingMessage: 'لا يوجد صوت حاليًا',
    editText: 'تعديل النص',
    editDialogTitle: 'تعديل النص (Edit Text)',
    transcriptLabel: 'النص المكتوب',
    cancelBtn: 'إلغاء',
    saveBtn: 'حفظ التغييرات',
    settingsTitle: 'إعدادات المساعد الصوتي',
    settingsDesc: 'قم بتكوين تفضيلاتك للمساعد الصوتي الذكي.',
    langLabel: 'لغة التحدث (Language)',
    aiEngineTitle: 'المحرك المحلي للذكاء الاصطناعي',
    aiEngineStatusNotLoaded: '<span style="color:#ef4444;font-weight:bold;">●</span> المحرك غير محمل',
    aiEngineStatusLoaded: '<span style="color:#10b981;font-weight:bold;">●</span> المحرك محمل وجاهز للعمل',
    downloadBtn: 'تحميل المحرك (حوالي 75MB)',
    downloadingText: 'جاري التحميل...',
    downloadError: 'حدث خطأ في التحميل.',
    shortcutTitle: 'اختصار لوحة المفاتيح',
    shortcutDesc: 'لتغيير اختصار لوحة المفاتيح، انتقل إلى إعدادات المتصفح الخاص بك على:<br><code style="font-size: 12px; font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px;">chrome://extensions/shortcuts</code>',
    closeBtn: 'إغلاق',
    notSupportedTitle: 'غير مدعوم',
    notSupportedMsg: 'واجهة برمجة تطبيقات الكلام على الويب غير مدعومة في هذا المتصفح.',
    switchEngineTitle: 'تبديل المحرك',
    switchEngineMsg: 'المحرك الأساسي غير مدعوم أو محظور، جاري التبديل للمحرك المحلي المدمج...',
    errorTitle: 'خطأ',
    errorMicTitle: 'خطأ في الميكروفون',
    errorMicMsg: 'يرجى السماح بالوصول إلى الميكروفون.',
    copiedTitle: 'تم النسخ بنجاح!',
    copiedMsg: 'النص جاهز في الحافظة. قم بلصقه الآن (Ctrl+V).',
    copyErrorMsg: 'خطأ في نسخ النص',
    processingTitle: 'جاري المعالجة',
    processingMsg: 'جاري تحويل الصوت إلى نص محلياً...',
    processingErrorMsg: 'فشل معالجة المقطع الصوتي للذكاء الاصطناعي.',
    aiNotReadyTitle: 'المحرك المحلي غير متوفر',
    aiNotReadyMsg: 'يرجى فتح الإعدادات (النقر على الأيقونة) وتحميل نموذج الذكاء الاصطناعي أولاً.',
    downloadDoneTitle: 'تمت العملية',
    downloadDoneMsg: 'تم تحميل المحرك المحلي بنجاح! يمكنك الآن استخدام المساعد الصوتي.',
    downloadingDoneText: 'اكتمل التحميل، جاري التجهيز...',
    readyText: 'جاهز للعمل',
    modelSizeLabel: 'دقة المحرك (Model Size)',
    modelSizeTiny: 'سريع وخفيف (Tiny - 75MB)',
    modelSizeBase: 'أساسي (Base - 150MB)',
    modelSizeSmall: 'دقيق (Small - 400MB)',
    modelChangeWarning: 'تنبيه: تغيير النموذج يتطلب إعادة تحميله من جديد.',
    liveTranscriptionLabel: 'ميزة الكتابة المباشرة (Live)',
    liveTranscriptionOn: 'مفعلة',
    liveTranscriptionOff: 'معطلة'
  },
  'en-US': {
    sleepingMessage: 'No audio currently',
    editText: 'Edit Text',
    editDialogTitle: 'Edit Text',
    transcriptLabel: 'Transcribed Text',
    cancelBtn: 'Cancel',
    saveBtn: 'Save Changes',
    settingsTitle: 'Voice Assistant Settings',
    settingsDesc: 'Configure your smart voice assistant preferences.',
    langLabel: 'Spoken Language',
    aiEngineTitle: 'Local AI Engine',
    aiEngineStatusNotLoaded: '<span style="color:#ef4444;font-weight:bold;">●</span> Engine not loaded',
    aiEngineStatusLoaded: '<span style="color:#10b981;font-weight:bold;">●</span> Engine loaded and ready',
    downloadBtn: 'Download Engine (~75MB)',
    downloadingText: 'Downloading...',
    downloadError: 'Download error occurred.',
    shortcutTitle: 'Keyboard Shortcut',
    shortcutDesc: 'To change the keyboard shortcut, go to your browser settings at:<br><code style="font-size: 12px; font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px;">chrome://extensions/shortcuts</code>',
    closeBtn: 'Close',
    notSupportedTitle: 'Not Supported',
    notSupportedMsg: 'Web Speech API is not supported in this browser.',
    switchEngineTitle: 'Switching Engine',
    switchEngineMsg: 'Primary engine not supported or blocked, switching to local engine...',
    errorTitle: 'Error',
    errorMicTitle: 'Microphone Error',
    errorMicMsg: 'Please allow microphone access.',
    copiedTitle: 'Copied Successfully!',
    copiedMsg: 'Text is ready in clipboard. Paste it now (Ctrl+V).',
    copyErrorMsg: 'Error copying text',
    processingTitle: 'Processing',
    processingMsg: 'Converting audio to text locally...',
    processingErrorMsg: 'Failed to process audio with AI.',
    aiNotReadyTitle: 'Local Engine Not Ready',
    aiNotReadyMsg: 'Please open settings (click icon) and download the AI model first.',
    downloadDoneTitle: 'Success',
    downloadDoneMsg: 'Local engine downloaded successfully! You can now use the voice assistant.',
    downloadingDoneText: 'Download complete, preparing...',
    readyText: 'Ready',
    modelSizeLabel: 'Engine Accuracy (Model Size)',
    modelSizeTiny: 'Fast & Light (Tiny - 75MB)',
    modelSizeBase: 'Standard (Base - 150MB)',
    modelSizeSmall: 'Accurate (Small - 400MB)',
    modelChangeWarning: 'Note: Changing the model requires downloading it again.',
    liveTranscriptionLabel: 'Live Transcription',
    liveTranscriptionOn: 'Enabled',
    liveTranscriptionOff: 'Disabled'
  },
  'fr-FR': {
    sleepingMessage: 'Aucun audio pour le moment',
    editText: 'Modifier le texte',
    editDialogTitle: 'Modifier le texte',
    transcriptLabel: 'Texte transcrit',
    cancelBtn: 'Annuler',
    saveBtn: 'Enregistrer',
    settingsTitle: 'Paramètres de l\'assistant',
    settingsDesc: 'Configurez vos préférences pour l\'assistant vocal.',
    langLabel: 'Langue parlée',
    aiEngineTitle: 'Moteur IA Local',
    aiEngineStatusNotLoaded: '<span style="color:#ef4444;font-weight:bold;">●</span> Moteur non chargé',
    aiEngineStatusLoaded: '<span style="color:#10b981;font-weight:bold;">●</span> Moteur chargé et prêt',
    downloadBtn: 'Télécharger le moteur (~75MB)',
    downloadingText: 'Téléchargement...',
    downloadError: 'Erreur de téléchargement.',
    shortcutTitle: 'Raccourci clavier',
    shortcutDesc: 'Pour modifier le raccourci, accédez à :<br><code style="font-size: 12px; font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px;">chrome://extensions/shortcuts</code>',
    closeBtn: 'Fermer',
    notSupportedTitle: 'Non supporté',
    notSupportedMsg: 'L\'API Web Speech n\'est pas supportée.',
    switchEngineTitle: 'Changement de moteur',
    switchEngineMsg: 'Moteur principal non supporté, passage au moteur local...',
    errorTitle: 'Erreur',
    errorMicTitle: 'Erreur Micro',
    errorMicMsg: 'Veuillez autoriser l\'accès au microphone.',
    copiedTitle: 'Copié avec succès !',
    copiedMsg: 'Texte prêt dans le presse-papiers (Ctrl+V).',
    copyErrorMsg: 'Erreur lors de la copie',
    processingTitle: 'Traitement',
    processingMsg: 'Conversion audio en texte...',
    processingErrorMsg: 'Échec du traitement audio.',
    aiNotReadyTitle: 'Moteur local non prêt',
    aiNotReadyMsg: 'Veuillez ouvrir les paramètres et télécharger le modèle IA en premier.',
    downloadDoneTitle: 'Succès',
    downloadDoneMsg: 'Moteur local téléchargé ! Vous pouvez l\'utiliser.',
    downloadingDoneText: 'Téléchargement terminé, préparation...',
    readyText: 'Prêt',
    modelSizeLabel: 'Précision du moteur (Model Size)',
    modelSizeTiny: 'Rapide & Léger (Tiny - 75MB)',
    modelSizeBase: 'Standard (Base - 150MB)',
    modelSizeSmall: 'Précis (Small - 400MB)',
    modelChangeWarning: 'Note : Changer de modèle nécessite un nouveau téléchargement.',
    liveTranscriptionLabel: 'Transcription en direct',
    liveTranscriptionOn: 'Activé',
    liveTranscriptionOff: 'Désactivé'
  },
  'es-ES': {
    sleepingMessage: 'Sin audio actualmente',
    editText: 'Editar texto',
    editDialogTitle: 'Editar texto',
    transcriptLabel: 'Texto transcrito',
    cancelBtn: 'Cancelar',
    saveBtn: 'Guardar cambios',
    settingsTitle: 'Ajustes del asistente',
    settingsDesc: 'Configura las preferencias de tu asistente de voz.',
    langLabel: 'Idioma hablado',
    aiEngineTitle: 'Motor de IA local',
    aiEngineStatusNotLoaded: '<span style="color:#ef4444;font-weight:bold;">●</span> Motor no cargado',
    aiEngineStatusLoaded: '<span style="color:#10b981;font-weight:bold;">●</span> Motor cargado y listo',
    downloadBtn: 'Descargar motor (~75MB)',
    downloadingText: 'Descargando...',
    downloadError: 'Error de descarga.',
    shortcutTitle: 'Atajo de teclado',
    shortcutDesc: 'Para cambiar el atajo, ve a:<br><code style="font-size: 12px; font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px;">chrome://extensions/shortcuts</code>',
    closeBtn: 'Cerrar',
    notSupportedTitle: 'No soportado',
    notSupportedMsg: 'La API de Web Speech no es compatible.',
    switchEngineTitle: 'Cambiando motor',
    switchEngineMsg: 'Motor principal no compatible, cambiando al motor local...',
    errorTitle: 'Error',
    errorMicTitle: 'Error de micrófono',
    errorMicMsg: 'Por favor, permite el acceso al micrófono.',
    copiedTitle: '¡Copiado con éxito!',
    copiedMsg: 'Texto listo en el portapapeles (Ctrl+V).',
    copyErrorMsg: 'Error al copiar',
    processingTitle: 'Procesando',
    processingMsg: 'Convirtiendo audio a texto...',
    processingErrorMsg: 'Fallo al procesar audio.',
    aiNotReadyTitle: 'Motor local no listo',
    aiNotReadyMsg: 'Por favor, abre los ajustes y descarga el modelo de IA primero.',
    downloadDoneTitle: 'Éxito',
    downloadDoneMsg: '¡Motor local descargado! Ya puedes usarlo.',
    downloadingDoneText: 'Descarga completa, preparando...',
    readyText: 'Listo',
    modelSizeLabel: 'Precisión del motor (Model Size)',
    modelSizeTiny: 'Rápido y Ligero (Tiny - 75MB)',
    modelSizeBase: 'Estándar (Base - 150MB)',
    modelSizeSmall: 'Preciso (Small - 400MB)',
    modelChangeWarning: 'Nota: Cambiar de modelo requiere descargarlo de nuevo.',
    liveTranscriptionLabel: 'Transcripción en vivo',
    liveTranscriptionOn: 'Activado',
    liveTranscriptionOff: 'Desactivado'
  },
  'de-DE': {
    sleepingMessage: 'Derzeit kein Audio',
    editText: 'Text bearbeiten',
    editDialogTitle: 'Text bearbeiten',
    transcriptLabel: 'Transkribierter Text',
    cancelBtn: 'Abbrechen',
    saveBtn: 'Speichern',
    settingsTitle: 'Assistenten-Einstellungen',
    settingsDesc: 'Konfigurieren Sie Ihren Sprachassistenten.',
    langLabel: 'Gesprochene Sprache',
    aiEngineTitle: 'Lokale KI-Engine',
    aiEngineStatusNotLoaded: '<span style="color:#ef4444;font-weight:bold;">●</span> Engine nicht geladen',
    aiEngineStatusLoaded: '<span style="color:#10b981;font-weight:bold;">●</span> Engine geladen und bereit',
    downloadBtn: 'Engine herunterladen (~75MB)',
    downloadingText: 'Wird heruntergeladen...',
    downloadError: 'Download-Fehler aufgetreten.',
    shortcutTitle: 'Tastaturkürzel',
    shortcutDesc: 'Um das Kürzel zu ändern, gehen Sie zu:<br><code style="font-size: 12px; font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px;">chrome://extensions/shortcuts</code>',
    closeBtn: 'Schließen',
    notSupportedTitle: 'Nicht unterstützt',
    notSupportedMsg: 'Web Speech API wird nicht unterstützt.',
    switchEngineTitle: 'Engine wechseln',
    switchEngineMsg: 'Haupt-Engine nicht unterstützt, wechsle zur lokalen Engine...',
    errorTitle: 'Fehler',
    errorMicTitle: 'Mikrofonfehler',
    errorMicMsg: 'Bitte erlauben Sie den Mikrofonzugriff.',
    copiedTitle: 'Erfolgreich kopiert!',
    copiedMsg: 'Text ist in der Zwischenablage bereit (Strg+V).',
    copyErrorMsg: 'Fehler beim Kopieren',
    processingTitle: 'Verarbeitung',
    processingMsg: 'Konvertiere Audio zu Text...',
    processingErrorMsg: 'Audioverarbeitung fehlgeschlagen.',
    aiNotReadyTitle: 'Lokale Engine nicht bereit',
    aiNotReadyMsg: 'Bitte öffnen Sie die Einstellungen und laden Sie zuerst das KI-Modell herunter.',
    downloadDoneTitle: 'Erfolg',
    downloadDoneMsg: 'Lokale Engine heruntergeladen! Sie können sie jetzt verwenden.',
    downloadingDoneText: 'Download abgeschlossen, Vorbereitung...',
    readyText: 'Bereit',
    modelSizeLabel: 'Engine-Genauigkeit (Model Size)',
    modelSizeTiny: 'Schnell & Leicht (Tiny - 75MB)',
    modelSizeBase: 'Standard (Base - 150MB)',
    modelSizeSmall: 'Präzise (Small - 400MB)',
    modelChangeWarning: 'Hinweis: Das Ändern des Modells erfordert einen erneuten Download.',
    liveTranscriptionLabel: 'Live-Transkription',
    liveTranscriptionOn: 'Aktiviert',
    liveTranscriptionOff: 'Deaktiviert'
  }
};

// Helper function to get text
function getText(key) {
  const currentLang = translations[language] || translations['en-US'];
  return currentLang[key] || translations['ar-SA'][key] || key;
}

// Helper to get value from input or contenteditable
function getActiveInputValue(el) {
  if (!el) return '';
  if (el.isContentEditable) {
    return el.innerText || el.textContent || '';
  }
  return el.value || '';
}

// Helper to set value safely for React/Vue/Angular and contenteditable
function setActiveInputValue(el, value) {
  if (!el) return;
  
  if (el.isContentEditable) {
    el.innerText = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  
  if (el instanceof HTMLTextAreaElement && nativeTextareaValueSetter) {
    nativeTextareaValueSetter.call(el, value);
  } else if (el instanceof HTMLInputElement && nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }
  
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// Load saved settings
chrome.storage.sync.get(['language', 'iconPosition', 'isFirstTime', 'modelSize', 'liveTranscriptionEnabled', 'isPinned', 'useAIFallback'], (result) => {
  if (result.language) {
    language = result.language;
  }
  if (result.modelSize) {
    modelSize = result.modelSize;
  }
  if (result.liveTranscriptionEnabled !== undefined) {
    liveTranscriptionEnabled = result.liveTranscriptionEnabled;
  }
  if (result.isPinned !== undefined) {
    isPinned = result.isPinned;
  }
  if (result.useAIFallback !== undefined) {
    useAIFallback = result.useAIFallback;
  }
  
  if (isPinned) {
    if (document.body) showFloatingIcon();
    else document.addEventListener('DOMContentLoaded', showFloatingIcon);
  }
  if (result.iconPosition) {
    iconPosition = result.iconPosition;
  }

  // Check if it's the first time using the extension
  if (result.isFirstTime) {
    // Open options page for first-time setup
    chrome.runtime.openOptionsPage();
    // Update the flag
    chrome.storage.sync.set({ isFirstTime: false });
  }
});

// Initialize speech recognition
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    useAIFallback = true;
    chrome.storage.sync.set({ useAIFallback: true });
    console.log("SpeechRecognition not supported. Using AI Fallback.");
    return;
  }

  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = language;
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;

  voiceRecognition.onstart = () => {
    status = 'recording';
    updateIconAppearance();
  };

  voiceRecognition.onspeechend = () => {
    if (status === 'recording') {
      status = 'sleeping';
      updateIconAppearance();
    }
  };

  voiceRecognition.onresult = (event) => {
    if (status === 'sleeping') {
      status = 'recording';
      updateIconAppearance();
    }

    let sessionTranscript = "";
    for (let i = 0; i < event.results.length; i++) {
        sessionTranscript += event.results[i][0].transcript;
    }

    transcript = sessionTranscript;

    if (activeInput) {
      setActiveInputValue(activeInput, (textBeforeRecording + " " + transcript).trim());
    }
  };
  
  voiceRecognition.onend = () => {
    status = 'idle';
    updateIconAppearance();
  };

  voiceRecognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.error("Speech recognition error", event.error);
      if (event.error === 'network' || event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        useAIFallback = true;
        chrome.storage.sync.set({ useAIFallback: true });
        chrome.storage.local.get(['fallbackNotified'], (res) => {
          if (!res.fallbackNotified) {
            showNotification(getText('switchEngineTitle'), getText('switchEngineMsg'));
            chrome.storage.local.set({ fallbackNotified: true });
          }
        });
      } else {
        showNotification(getText('errorTitle'), event.error);
      }
      status = 'idle';
      updateIconAppearance();
    }
  };
}

// Create floating icon
function createFloatingIcon() {
  floatingIcon = document.createElement('div');
  floatingIcon.id = 'voice-assistant-icon';
  floatingIcon.className = 'voice-assistant-icon';
  floatingIcon.style.position = 'fixed';
  floatingIcon.style.top = `${iconPosition.y}px`;
  floatingIcon.style.left = `${iconPosition.x}px`;
  floatingIcon.style.zIndex = '2147483647';
  floatingIcon.style.display = 'flex';
  floatingIcon.style.alignItems = 'center';
  floatingIcon.style.gap = '8px';

  const iconContainer = document.createElement('div');
  iconContainer.className = 'voice-assistant-icon-container';
  iconContainer.style.position = 'relative';
  iconContainer.style.display = 'flex';
  iconContainer.style.width = '64px';
  iconContainer.style.height = '64px';
  iconContainer.style.alignItems = 'center';
  iconContainer.style.justifyContent = 'center';
  iconContainer.style.borderRadius = '50%';
  iconContainer.style.cursor = 'pointer';
  iconContainer.style.transition = 'all 0.3s ease';
  iconContainer.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
  iconContainer.style.margin = '0 35px'; // Prevents overlap with pin/close buttons and edit button

  // Add Close (X) button
  const closeIconButton = document.createElement('div');
  closeIconButton.innerHTML = '&times;';
  closeIconButton.style.position = 'absolute';
  closeIconButton.style.top = '0px';
  closeIconButton.style.right = '-32px';
  closeIconButton.style.width = '24px';
  closeIconButton.style.height = '24px';
  closeIconButton.style.backgroundColor = '#ef4444'; // red-500
  closeIconButton.style.color = 'white';
  closeIconButton.style.borderRadius = '50%';
  closeIconButton.style.display = 'flex';
  closeIconButton.style.alignItems = 'center';
  closeIconButton.style.justifyContent = 'center';
  closeIconButton.style.fontSize = '16px';
  closeIconButton.style.fontWeight = 'bold';
  closeIconButton.style.cursor = 'pointer';
  closeIconButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  closeIconButton.style.zIndex = '2147483647';
  
  // Stop all pointer events from bubbling to prevent recording or dragging triggers!
  closeIconButton.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });
  closeIconButton.addEventListener('mouseup', (e) => {
    e.stopPropagation();
  });
  closeIconButton.addEventListener('click', (e) => {
    e.stopPropagation();
    hideFloatingIcon();
  });
  
  // Add Pin button
  const pinIconButton = document.createElement('div');
  pinIconButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.68V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.68a2 2 0 0 1-1.11 1.87l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>`;
  pinIconButton.style.position = 'absolute';
  pinIconButton.style.top = '32px';
  pinIconButton.style.right = '-32px';
  pinIconButton.style.width = '24px';
  pinIconButton.style.height = '24px';
  pinIconButton.style.backgroundColor = isPinned ? '#3b82f6' : '#9ca3af';
  pinIconButton.style.color = 'white';
  pinIconButton.style.borderRadius = '50%';
  pinIconButton.style.display = 'flex';
  pinIconButton.style.alignItems = 'center';
  pinIconButton.style.justifyContent = 'center';
  pinIconButton.style.cursor = 'pointer';
  pinIconButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
  pinIconButton.style.zIndex = '2147483647';
  pinIconButton.style.transition = 'background-color 0.2s';
  
  pinIconButton.addEventListener('mousedown', (e) => e.stopPropagation());
  pinIconButton.addEventListener('mouseup', (e) => e.stopPropagation());
  pinIconButton.addEventListener('click', (e) => {
    e.stopPropagation();
    isPinned = !isPinned;
    pinIconButton.style.backgroundColor = isPinned ? '#3b82f6' : '#9ca3af';
    chrome.storage.sync.set({ isPinned });
  });

  iconContainer.appendChild(closeIconButton);
  iconContainer.appendChild(pinIconButton);

  const icon = document.createElement('div');
  icon.className = 'voice-assistant-icon-inner';
  icon.style.width = '32px';
  icon.style.height = '32px';
  icon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
      <line x1="12" y1="19" x2="12" y2="23"></line>
      <line x1="8" y1="23" x2="16" y2="23"></line>
    </svg>
  `;

  const sleepingMessage = document.createElement('div');
  sleepingMessage.className = 'voice-assistant-sleeping-message';
  sleepingMessage.textContent = getText('sleepingMessage');
  sleepingMessage.style.position = 'absolute';
  sleepingMessage.style.top = '-32px';
  sleepingMessage.style.fontSize = '12px';
  sleepingMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
  sleepingMessage.style.color = 'white';
  sleepingMessage.style.padding = '2px 8px';
  sleepingMessage.style.borderRadius = '4px';
  sleepingMessage.style.whiteSpace = 'nowrap';
  sleepingMessage.style.display = 'none';

  const visualizerContainer = document.createElement('div');
  visualizerContainer.className = 'visualizer-container';
  visualizerContainer.id = 'voice-assistant-visualizer';
  visualizerContainer.innerHTML = '<div class="visualizer-ring" id="voice-assistant-ring"></div>';
  
  iconContainer.appendChild(visualizerContainer);
  iconContainer.appendChild(icon);
  iconContainer.appendChild(sleepingMessage);
  floatingIcon.appendChild(iconContainer);

  // Add event listeners
  iconContainer.addEventListener('mousedown', handleMouseDown);

  getShadowRoot().appendChild(floatingIcon);
  isIconVisible = true;

  // Update icon appearance based on status
  updateIconAppearance();
}

// Update icon appearance based on status
function updateIconAppearance() {
  if (!floatingIcon) return;

  const iconContainer = getShadowRoot().querySelector('.voice-assistant-icon-container') || floatingIcon.querySelector('.voice-assistant-icon-container');
  const sleepingMessage = getShadowRoot().querySelector('.voice-assistant-sleeping-message') || floatingIcon.querySelector('.voice-assistant-sleeping-message');
  const visualizerRing = getShadowRoot().querySelector('.visualizer-ring') || floatingIcon.querySelector('.visualizer-ring');

  // Reset classes
  iconContainer.className = 'voice-assistant-icon-container';
  
  if (visualizerAnimationFrame) {
    cancelAnimationFrame(visualizerAnimationFrame);
    visualizerAnimationFrame = null;
  }
  if (visualizerRing) {
    visualizerRing.style.opacity = '0';
    visualizerRing.style.transform = 'scale(0.8)';
  }

  const animateVisualizer = () => {
    if (status !== 'recording') return;
    if (visualizerRing) {
      let vol = currentVolume;
      if (!useAIFallback) {
        // Fake volume for native mode since it doesn't expose volume data
        vol = 0.05 + (Math.sin(Date.now() / 150) + 1) / 2 * 0.15;
      }
      // Volume is typically between 0 and 1, we map it to scale 1.0 to 1.5
      const scale = 1 + (vol * 5); 
      visualizerRing.style.transform = `scale(${Math.min(scale, 1.8)})`;
      visualizerRing.style.opacity = vol > 0.01 ? '1' : '0.5';
    }
    visualizerAnimationFrame = requestAnimationFrame(animateVisualizer);
  };

  switch (status) {
    case 'recording':
      iconContainer.style.backgroundColor = '#ef4444'; // red-500
      iconContainer.style.color = 'white';
      iconContainer.classList.add('animate-pulse');
      iconContainer.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
      sleepingMessage.style.display = 'none';
      if (useAIFallback || voiceRecognition) {
         animateVisualizer();
      }
      break;
    case 'sleeping':
      iconContainer.style.backgroundColor = '#9ca3af'; // gray-400
      iconContainer.style.color = 'white';
      iconContainer.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      sleepingMessage.style.display = 'block';
      break;
    case 'disabled':
      iconContainer.style.backgroundColor = '#f97316'; // orange-500
      iconContainer.style.color = 'white';
      iconContainer.style.cursor = 'not-allowed';
      iconContainer.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      sleepingMessage.style.display = 'none';
      break;
    case 'idle':
    default:
      iconContainer.style.backgroundColor = '#3b82f6'; // blue-500
      iconContainer.style.color = 'white';
      iconContainer.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
      sleepingMessage.style.display = 'none';
      break;
  }
}

// handleMouseDown (الكود المُعدَّل)
function handleMouseDown(e) {
  isDragging = true;
  didMove = false; // إعادة تعيين حالة الحركة مع كل ضغطة جديدة
  dragStartPos = {
    x: e.clientX - iconPosition.x,
    y: e.clientY - iconPosition.y
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  e.preventDefault();
}

// handleMouseMove (الكود المُعدَّل)
function handleMouseMove(e) {
  if (!isDragging) return;
  didMove = true; // إذا تحرك الماوس، نقوم بتسجيل ذلك

  let newX = e.clientX - dragStartPos.x;
  let newY = e.clientY - dragStartPos.y;

  // Keep within screen boundaries
  const maxX = window.innerWidth - 64;
  const maxY = window.innerHeight - 64;
  newX = Math.max(0, Math.min(newX, maxX));
  newY = Math.max(0, Math.min(newY, maxY));

  const newPos = { x: newX, y: newY };

  iconPosition = newPos;
  floatingIcon.style.top = `${newPos.y}px`;
  floatingIcon.style.left = `${newPos.x}px`;
}

// handleMouseUp (الكود المُعدَّل - يحتوي الآن على منطق النقر)
function handleMouseUp() {
  isDragging = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);

  // الآن نتحقق: هل كانت العملية سحبًا أم نقرًا؟
  if (didMove) {
    // إذا تحرك الماوس، فهذا سحب. قم بحفظ الموضع فقط.
    chrome.storage.sync.set({ iconPosition });
  } else {
    // إذا لم يتحرك الماوس، فهذه نقرة. قم بتشغيل أو إيقاف التسجيل.
    if (status === 'recording' || status === 'sleeping') {
      stopRecording();
    } else if (status === 'idle') {
      startRecording();
    }
  }
}



// متغير جديد لحفظ النص الأصلي
let textBeforeRecording = '';

// استبدل دالة startRecording بالكامل بهذا:
function startRecording() {
  if (status !== 'idle') return;

  hideEditButton();
  if (editButtonTimeout) {
    clearTimeout(editButtonTimeout);
  }

  if (activeInput) {
    textBeforeRecording = getActiveInputValue(activeInput);
  } else {
    textBeforeRecording = '';
  }
  transcript = '';
  lastTranscript = '';

  if (useAIFallback) {
    startAIRecording();
    return;
  }

  if (!voiceRecognition) {
    initSpeechRecognition();
    if (useAIFallback) {
      startAIRecording();
      return;
    }
  }

  try {
    voiceRecognition.start();
  } catch (e) {
    console.error("فشل بدء التسجيل:", e);
    useAIFallback = true;
    startAIRecording();
  }
}

// Function to stop recording
function stopRecording() {
  status = 'idle';
  updateIconAppearance();

  if (useAIFallback) {
    if (visualizerAnimationFrame) {
      cancelAnimationFrame(visualizerAnimationFrame);
      visualizerAnimationFrame = null;
    }
    
    if (liveTranscriptionInterval) {
      clearInterval(liveTranscriptionInterval);
      liveTranscriptionInterval = null;
    }
    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor = null;
    }
    if (mediaStreamSource) {
      mediaStreamSource.disconnect();
      mediaStreamSource = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (audioContext) {
      audioContext.close().catch(e => console.warn(e));
      audioContext = null;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    
    if (!liveTranscriptionEnabled && liveAudioBuffer.length > 0) {
      showNotification(getText('processingTitle'), getText('processingMsg'));
      let totalLength = 0;
      for (let i = 0; i < liveAudioBuffer.length; i++) totalLength += liveAudioBuffer[i].length;
      
      const mergedArray = new Float32Array(totalLength);
      let offset = 0;
      for (let i = 0; i < liveAudioBuffer.length; i++) {
        mergedArray.set(liveAudioBuffer[i], offset);
        offset += liveAudioBuffer[i].length;
      }
      
      const langMap = { 'ar-SA': 'arabic', 'en-US': 'english', 'fr-FR': 'french', 'es-ES': 'spanish', 'de-DE': 'german' };
      const whisperLang = langMap[language] || 'arabic';
      
      chrome.runtime.sendMessage({
        action: 'transcribe',
        audio: Array.from(mergedArray),
        language: whisperLang,
        modelSize: modelSize
      }, response => {
         if (response && response.text) {
           transcript = response.text;
           if (activeInput) {
             setActiveInputValue(activeInput, (textBeforeRecording + " " + transcript).trim());
           }
           finalizeTranscription();
         } else if (response && response.error) {
           showNotification(getText('errorTitle'), response.error);
         }
      });
    } else {
      finalizeTranscription();
    }
    
    liveAudioBuffer = [];
    lastProcessedLength = 0;
    
    return;
  }

  if (!voiceRecognition) return;

  status = 'idle'; 
  updateIconAppearance();

  try {
    voiceRecognition.stop();
  } catch(e) {
    console.warn("Recognition might have already stopped, which is fine.");
  }
  
  finalizeTranscription();
}

function finalizeTranscription() {
  const finalTranscript = transcript.trim();
  lastTranscript = finalTranscript;

  if (finalTranscript) {
    navigator.clipboard.writeText(finalTranscript).then(() => {
        showNotification(getText('copiedTitle'), getText('copiedMsg'));
    }).catch(err => {
        console.error(getText('copyErrorMsg') + ': ', err);
    });

    createEditButton();
    if (editButtonTimeout) clearTimeout(editButtonTimeout);
    editButtonTimeout = setTimeout(hideEditButton, 5000);
  }
}

// Downsample audio buffer to 16000Hz to support Firefox hardware sample rates
function downsampleBuffer(buffer, sampleRate, outSampleRate) {
  if (outSampleRate === sampleRate) return new Float32Array(buffer);
  const sampleRateRatio = sampleRate / outSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

// AI Recording logic using Transformers.js via background
async function startAIRecording() {
  try {
    // 1. Grab stream first to avoid "lost user gesture" error in Chrome
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 2. Check model status asynchronously
    chrome.runtime.sendMessage({ action: 'checkModelStatus', modelSize: modelSize }, async (response) => {
      if (!response || !response.isDownloaded) {
        if (!useAIFallback) showNotification(getText('aiNotReadyTitle'), getText('aiNotReadyMsg'));
        status = 'idle';
        updateIconAppearance();
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
        }
        return;
      }

      if (!audioContext) audioContext = new AudioContext(); // Uses default hardware sample rate
      const inputSampleRate = audioContext.sampleRate;
      
      mediaStreamSource = audioContext.createMediaStreamSource(stream);
      scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      gainNode = audioContext.createGain();
      gainNode.gain.value = 0; // Prevent echo
      
      liveAudioBuffer = [];
      lastProcessedLength = 0;
      
      scriptProcessor.onaudioprocess = (e) => {
        if (status !== 'recording') return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Downsample to 16000Hz for Whisper compatibility across all browsers
        const resampledData = downsampleBuffer(inputData, inputSampleRate, 16000);
        liveAudioBuffer.push(resampledData);
        
        // Calculate volume for visualizer
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        let rms = Math.sqrt(sum / inputData.length);
        currentVolume = Math.max(rms, currentVolume * 0.8);
      };
      
      mediaStreamSource.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      status = 'recording';
      updateIconAppearance();
      
      if (liveTranscriptionEnabled) {
        // Live processing interval
        liveTranscriptionInterval = setInterval(() => {
          if (status !== 'recording' || isTranscribing) return;
          
          let totalLength = 0;
          for (let i = 0; i < liveAudioBuffer.length; i++) totalLength += liveAudioBuffer[i].length;
          
          // Only process if we have new audio data
          if (totalLength === 0 || totalLength === lastProcessedLength) return;
          
          lastProcessedLength = totalLength;
          const mergedArray = new Float32Array(totalLength);
          let offset = 0;
          for (let i = 0; i < liveAudioBuffer.length; i++) {
            mergedArray.set(liveAudioBuffer[i], offset);
            offset += liveAudioBuffer[i].length;
          }
          
          const langMap = {
            'ar-SA': 'arabic',
            'en-US': 'english',
            'fr-FR': 'french',
            'es-ES': 'spanish',
            'de-DE': 'german'
          };
          const whisperLang = langMap[language] || 'arabic';
          
          isTranscribing = true;
          try {
            chrome.runtime.sendMessage({
              action: 'transcribe',
              audio: Array.from(mergedArray),
              language: whisperLang,
              modelSize: modelSize
            }, response => {
              isTranscribing = false;
              if (chrome.runtime.lastError) {
                console.warn("Live transcription error:", chrome.runtime.lastError);
                return;
              }
              if (response && response.text && status === 'recording') {
                transcript = response.text;
                if (activeInput) {
                  setActiveInputValue(activeInput, (textBeforeRecording + " " + transcript).trim());
                }
              }
            });
          } catch (e) {
            isTranscribing = false;
            console.error("Error sending transcribe message:", e);
          }
          
          // Prevent buffer from growing infinitely (flush every 15 seconds)
          if (totalLength > 16000 * 15) {
            textBeforeRecording = activeInput ? getActiveInputValue(activeInput) : textBeforeRecording;
            liveAudioBuffer = [];
            lastProcessedLength = 0;
            transcript = '';
          }
          
        }, 3000); // Send chunk every 3 seconds
      }
      
    });
  } catch (e) {
    console.error("Microphone access denied or error:", e);
    showNotification(getText('errorMicTitle'), getText('errorMicMsg'));
    status = 'idle';
    updateIconAppearance();
  }
}


// Create edit button
function createEditButton() {
  // Remove existing edit button if any
  const existingButton = getShadowRoot().querySelector('#voice-assistant-edit-button') || document.getElementById('voice-assistant-edit-button');
  if (existingButton) {
    existingButton.remove();
  }

  const editButton = document.createElement('button');
  editButton.id = 'voice-assistant-edit-button';
  editButton.className = 'voice-assistant-edit-button';
  editButton.textContent = getText('editText');
  editButton.style.backgroundColor = '#f1f5f9'; // slate-100
  editButton.style.color = '#0f172a'; // slate-900
  editButton.style.padding = '6px 12px';
  editButton.style.borderRadius = '6px';
  editButton.style.fontSize = '14px';
  editButton.style.fontWeight = '500';
  editButton.style.border = 'none';
  editButton.style.cursor = 'pointer';
  editButton.style.display = 'flex';
  editButton.style.alignItems = 'center';
  editButton.style.gap = '6px';
  editButton.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)';

  // Add pencil icon
  const pencilIcon = document.createElement('span');
  pencilIcon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
    </svg>
  `;
  editButton.appendChild(pencilIcon);

  editButton.addEventListener('click', () => {
    showEditDialog();
  });

  floatingIcon.appendChild(editButton);
}

// Hide edit button
function hideEditButton() {
  const editButton = document.getElementById('voice-assistant-edit-button');
  if (editButton) {
    editButton.remove();
  }
  showEditButton = false;
}

// Show edit dialog
function showEditDialog() {
  if (editDialog) {
    editDialog.remove();
  }

  editDialog = document.createElement('div');
  editDialog.id = 'voice-assistant-edit-dialog';
  editDialog.className = 'voice-assistant-edit-dialog';
  editDialog.style.position = 'fixed';
  editDialog.style.top = '0';
  editDialog.style.left = '0';
  editDialog.style.width = '100%';
  editDialog.style.height = '100%';
  editDialog.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  editDialog.style.display = 'flex';
  editDialog.style.alignItems = 'center';
  editDialog.style.justifyContent = 'center';
  editDialog.style.zIndex = '2147483647';

  const dialogContent = document.createElement('div');
  dialogContent.style.backgroundColor = 'white';
  dialogContent.style.borderRadius = '8px';
  dialogContent.style.padding = '24px';
  dialogContent.style.width = '90%';
  dialogContent.style.maxWidth = '500px';
  dialogContent.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.1)';

  const dialogHeader = document.createElement('div');
  dialogHeader.style.marginBottom = '16px';

  const dialogTitle = document.createElement('h3');
  dialogTitle.textContent = getText('editDialogTitle');
  dialogTitle.style.fontSize = '18px';
  dialogTitle.style.fontWeight = '600';
  dialogTitle.style.margin = '0';

  dialogHeader.appendChild(dialogTitle);

  const dialogBody = document.createElement('div');
  dialogBody.style.marginBottom = '24px';

  const textareaLabel = document.createElement('label');
  textareaLabel.textContent = getText('transcriptLabel');
  textareaLabel.style.display = 'block';
  textareaLabel.style.marginBottom = '8px';
  textareaLabel.style.fontWeight = '500';

  const textarea = document.createElement('textarea');
  textarea.id = 'voice-assistant-edit-textarea';
  textarea.value = lastTranscript;
  textarea.style.width = '100%';
  textarea.style.minHeight = '120px';
  textarea.style.padding = '8px 12px';
  textarea.style.borderRadius = '6px';
  textarea.style.border = '1px solid #d1d5db'; // gray-300
  textarea.style.fontSize = '14px';
  textarea.style.direction = 'rtl';

  dialogBody.appendChild(textareaLabel);
  dialogBody.appendChild(textarea);

  const dialogFooter = document.createElement('div');
  dialogFooter.style.display = 'flex';
  dialogFooter.style.justifyContent = 'flex-end';
  dialogFooter.style.gap = '12px';

  const cancelButton = document.createElement('button');
  cancelButton.textContent = getText('cancelBtn');
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.borderRadius = '6px';
  cancelButton.style.fontSize = '14px';
  cancelButton.style.fontWeight = '500';
  cancelButton.style.border = 'none';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.backgroundColor = '#f3f4f6'; // gray-100

  const saveButton = document.createElement('button');
  saveButton.textContent = getText('saveBtn');
  saveButton.style.padding = '8px 16px';
  saveButton.style.borderRadius = '6px';
  saveButton.style.fontSize = '14px';
  saveButton.style.fontWeight = '500';
  saveButton.style.border = 'none';
  saveButton.style.cursor = 'pointer';
  saveButton.style.backgroundColor = '#3b82f6'; // blue-500
  saveButton.style.color = 'white';

  cancelButton.addEventListener('click', () => {
    editDialog.remove();
    editDialog = null;
    if (editButtonTimeout) {
      clearTimeout(editButtonTimeout);
    }
    injectText(lastTranscript);
    transcript = '';
    hideEditButton();
  });

  saveButton.addEventListener('click', () => {
    const editedText = textarea.value;
    if (editButtonTimeout) {
      clearTimeout(editButtonTimeout);
    }
    injectText(editedText);
    lastTranscript = editedText;
    transcript = '';
    editDialog.remove();
    editDialog = null;
    hideEditButton();
  });

  dialogFooter.appendChild(cancelButton);
  dialogFooter.appendChild(saveButton);

  dialogContent.appendChild(dialogHeader);
  dialogContent.appendChild(dialogBody);
  dialogContent.appendChild(dialogFooter);

  editDialog.appendChild(dialogContent);
  getShadowRoot().appendChild(editDialog);

  // Focus on textarea
  textarea.focus();
}

// Inject text into active input
function injectText(textToInject) {
  if (activeInput && textToInject) {
    if (activeInput.isContentEditable) {
      const currentValue = getActiveInputValue(activeInput);
      const newValue = currentValue + (currentValue ? " " : "") + textToInject.trim();
      setActiveInputValue(activeInput, newValue);
    } else {
      const start = activeInput.selectionStart || 0;
      const end = activeInput.selectionEnd || 0;
      const currentValue = getActiveInputValue(activeInput);
      const newValue = currentValue.substring(0, start) + textToInject.trim() + " " + currentValue.substring(end);
      setActiveInputValue(activeInput, newValue);
    }
    activeInput.focus();
  }
}

// Show notification
function showNotification(title, message) {
  // Create notification element
  const notification = document.createElement('div');
  notification.id = 'voice-assistant-notification';
  notification.className = 'voice-assistant-notification';
  notification.style.position = 'fixed';
  notification.style.bottom = '20px';
  notification.style.right = '20px';
  notification.style.backgroundColor = 'white';
  notification.style.borderRadius = '8px';
  notification.style.padding = '16px';
  notification.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
  notification.style.maxWidth = '350px';
  notification.style.zIndex = '2147483647';
  notification.style.display = 'flex';
  notification.style.flexDirection = 'column';
  notification.style.gap = '8px';

  const notificationTitle = document.createElement('div');
  notificationTitle.textContent = title;
  notificationTitle.style.fontWeight = '600';
  notificationTitle.style.fontSize = '16px';

  const notificationMessage = document.createElement('div');
  notificationMessage.textContent = message;
  notificationMessage.style.fontSize = '14px';
  notificationMessage.style.color = '#4b5563'; // gray-600

  notification.appendChild(notificationTitle);
  notification.appendChild(notificationMessage);

  getShadowRoot().appendChild(notification);

  // Auto remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Create settings panel
function createSettingsPanel() {
  if (settingsPanel) {
    settingsPanel.remove();
  }

  settingsPanel = document.createElement('div');
  settingsPanel.id = 'voice-assistant-settings';
  settingsPanel.className = 'voice-assistant-settings';
  settingsPanel.style.position = 'fixed';
  settingsPanel.style.top = '0';
  settingsPanel.style.right = '0';
  settingsPanel.style.width = '350px';
  settingsPanel.style.height = '100%';
  settingsPanel.style.backgroundColor = 'white';
  settingsPanel.style.boxShadow = '-4px 0 6px -1px rgba(0, 0, 0, 0.1)';
  settingsPanel.style.zIndex = '2147483647';
  settingsPanel.style.transform = 'translateX(100%)';
  settingsPanel.style.transition = 'transform 0.3s ease';

  const settingsHeader = document.createElement('div');
  settingsHeader.style.padding = '16px';
  settingsHeader.style.borderBottom = '1px solid #e5e7eb'; // gray-200

  const settingsTitle = document.createElement('h3');
  settingsTitle.textContent = getText('settingsTitle');
  settingsTitle.style.fontSize = '18px';
  settingsTitle.style.fontWeight = '600';
  settingsTitle.style.margin = '0';

  const settingsDescription = document.createElement('p');
  settingsDescription.textContent = getText('settingsDesc');
  settingsDescription.style.fontSize = '14px';
  settingsDescription.style.color = '#6b7280'; // gray-500
  settingsDescription.style.margin = '8px 0 0 0';

  settingsHeader.appendChild(settingsTitle);
  settingsHeader.appendChild(settingsDescription);

  const settingsContent = document.createElement('div');
  settingsContent.style.padding = '16px';
  settingsContent.style.display = 'flex';
  settingsContent.style.flexDirection = 'column';
  settingsContent.style.gap = '24px';

  // Language selection
  const languageSection = document.createElement('div');
  languageSection.style.display = 'flex';
  languageSection.style.flexDirection = 'column';
  languageSection.style.gap = '8px';

  const languageLabel = document.createElement('label');
  languageLabel.textContent = getText('langLabel');
  languageLabel.style.fontWeight = '500';
  languageLabel.style.fontSize = '14px';

  const languageSelect = document.createElement('select');
  languageSelect.style.width = '100%';
  languageSelect.style.padding = '8px 12px';
  languageSelect.style.borderRadius = '6px';
  languageSelect.style.border = '1px solid #d1d5db'; // gray-300
  languageSelect.style.fontSize = '14px';

  const languages = [
    { value: 'ar-SA', label: 'العربية (Arabic)' },
    { value: 'en-US', label: 'English (US)' },
    { value: 'fr-FR', label: 'Français (French)' },
    { value: 'es-ES', label: 'Español (Spanish)' },
    { value: 'de-DE', label: 'Deutsch (German)' }
  ];

  languages.forEach(lang => {
    const option = document.createElement('option');
    option.value = lang.value;
    option.textContent = lang.label;
    if (lang.value === language) {
      option.selected = true;
    }
    languageSelect.appendChild(option);
  });

  languageSelect.addEventListener('change', (e) => {
    language = e.target.value;
    chrome.storage.sync.set({ language });

    // If recognition is active, stop it
    if (status === 'recording' || status === 'sleeping') {
      stopRecording();
    }

    // Reinitialize recognition with new language
    if (voiceRecognition) {
      voiceRecognition.stop();
      voiceRecognition = null;
    }

    initSpeechRecognition();
    
    // Re-render settings panel to update language immediately
    createSettingsPanel();
  });

  languageSection.appendChild(languageLabel);
  languageSection.appendChild(languageSelect);

  // Keyboard shortcut info
  const shortcutSection = document.createElement('div');
  shortcutSection.style.padding = '16px';
  shortcutSection.style.borderRadius = '8px';
  shortcutSection.style.border = '1px solid #e5e7eb'; // gray-200
  shortcutSection.style.backgroundColor = '#f9fafb'; // gray-50

  const shortcutTitle = document.createElement('h4');
  shortcutTitle.textContent = getText('shortcutTitle');
  shortcutTitle.style.fontWeight = '600';
  shortcutTitle.style.fontSize = '16px';
  shortcutTitle.style.margin = '0 0 8px 0';

  const shortcutDescription = document.createElement('p');
  shortcutDescription.innerHTML = getText('shortcutDesc');
  shortcutDescription.style.fontSize = '14px';
  shortcutDescription.style.color = '#4b5563'; // gray-600
  shortcutDescription.style.margin = '0';

  shortcutSection.appendChild(shortcutTitle);
  shortcutSection.appendChild(shortcutDescription);

  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = getText('closeBtn');
  closeButton.style.marginTop = 'auto';
  closeButton.style.padding = '8px 16px';
  closeButton.style.borderRadius = '6px';
  closeButton.style.fontSize = '14px';
  closeButton.style.fontWeight = '500';
  closeButton.style.border = 'none';
  closeButton.style.cursor = 'pointer';
  closeButton.style.backgroundColor = '#3b82f6'; // blue-500
  closeButton.style.color = 'white';
  closeButton.style.alignSelf = 'flex-start';

  closeButton.addEventListener('click', () => {
    settingsPanel.style.transform = 'translateX(100%)';
    setTimeout(() => {
      settingsPanel.remove();
      settingsPanel = null;
    }, 300);
  });

  // AI Engine section
  const aiEngineSection = document.createElement('div');
  aiEngineSection.style.padding = '16px';
  aiEngineSection.style.borderRadius = '8px';
  aiEngineSection.style.border = '1px solid #e5e7eb';
  aiEngineSection.style.backgroundColor = '#f9fafb';

  const aiEngineTitle = document.createElement('h4');
  aiEngineTitle.textContent = getText('aiEngineTitle');
  aiEngineTitle.style.fontWeight = '600';
  aiEngineTitle.style.fontSize = '16px';
  aiEngineTitle.style.margin = '0 0 12px 0';

  // Engine Type Toggle
  const engineTypeLabel = document.createElement('label');
  engineTypeLabel.textContent = language === 'ar-SA' ? 'المحرك المفضل (Preferred Engine)' : 'Preferred Engine';
  engineTypeLabel.style.fontWeight = '500';
  engineTypeLabel.style.fontSize = '14px';
  engineTypeLabel.style.display = 'block';
  engineTypeLabel.style.marginBottom = '4px';

  const engineTypeSelect = document.createElement('select');
  engineTypeSelect.style.width = '100%';
  engineTypeSelect.style.padding = '8px 12px';
  engineTypeSelect.style.borderRadius = '6px';
  engineTypeSelect.style.border = '1px solid #d1d5db';
  engineTypeSelect.style.fontSize = '14px';
  engineTypeSelect.style.marginBottom = '16px';

  const engineOptions = [
    { value: 'native', label: language === 'ar-SA' ? 'نموذج جوجل السحابي (أساسي)' : 'Google Cloud Engine (Default)' },
    { value: 'whisper', label: language === 'ar-SA' ? 'نموذج Whisper AI (محلي)' : 'Whisper AI Engine (Local)' }
  ];

  engineOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if ((opt.value === 'whisper' && useAIFallback) || (opt.value === 'native' && !useAIFallback)) {
      option.selected = true;
    }
    engineTypeSelect.appendChild(option);
  });

  engineTypeSelect.addEventListener('change', (e) => {
    useAIFallback = (e.target.value === 'whisper');
    chrome.storage.sync.set({ useAIFallback });
  });

  // Model size selection
  const modelSizeLabel = document.createElement('label');
  modelSizeLabel.textContent = getText('modelSizeLabel');
  modelSizeLabel.style.fontWeight = '500';
  modelSizeLabel.style.fontSize = '14px';
  modelSizeLabel.style.display = 'block';
  modelSizeLabel.style.marginBottom = '4px';

  const modelSizeSelect = document.createElement('select');
  modelSizeSelect.style.width = '100%';
  modelSizeSelect.style.padding = '8px 12px';
  modelSizeSelect.style.borderRadius = '6px';
  modelSizeSelect.style.border = '1px solid #d1d5db';
  modelSizeSelect.style.fontSize = '14px';
  modelSizeSelect.style.marginBottom = '12px';

  const models = [
    { value: 'Xenova/whisper-tiny', label: getText('modelSizeTiny') },
    { value: 'Xenova/whisper-base', label: getText('modelSizeBase') },
    { value: 'Xenova/whisper-small', label: getText('modelSizeSmall') }
  ];

  models.forEach(m => {
    const option = document.createElement('option');
    option.value = m.value;
    option.textContent = m.label;
    if (m.value === modelSize) {
      option.selected = true;
    }
    modelSizeSelect.appendChild(option);
  });

  const aiEngineStatus = document.createElement('p');
  aiEngineStatus.style.fontSize = '14px';
  aiEngineStatus.style.margin = '0 0 12px 0';

  const downloadBtn = document.createElement('button');
  downloadBtn.textContent = getText('downloadBtn');
  downloadBtn.style.padding = '8px 12px';
  downloadBtn.style.borderRadius = '6px';
  downloadBtn.style.fontSize = '14px';
  downloadBtn.style.fontWeight = '500';
  downloadBtn.style.border = 'none';
  downloadBtn.style.cursor = 'pointer';
  downloadBtn.style.backgroundColor = '#10b981'; // emerald-500
  downloadBtn.style.color = 'white';
  downloadBtn.style.width = '100%';
  downloadBtn.style.display = 'none';

  const progressBarContainer = document.createElement('div');
  progressBarContainer.style.width = '100%';
  progressBarContainer.style.height = '8px';
  progressBarContainer.style.backgroundColor = '#e5e7eb';
  progressBarContainer.style.borderRadius = '4px';
  progressBarContainer.style.marginTop = '12px';
  progressBarContainer.style.overflow = 'hidden';
  progressBarContainer.style.display = 'none';

  const progressBar = document.createElement('div');
  progressBar.style.width = '0%';
  progressBar.style.height = '100%';
  progressBar.style.backgroundColor = '#3b82f6';
  progressBar.style.transition = 'width 0.3s ease';
  progressBarContainer.appendChild(progressBar);

  const progressText = document.createElement('div');
  progressText.style.fontSize = '12px';
  progressText.style.color = '#6b7280';
  progressText.style.textAlign = 'center';
  progressText.style.marginTop = '4px';
  progressText.style.display = 'none';

  const checkAndUpdateStatus = () => {
    chrome.runtime.sendMessage({ action: 'checkModelStatus', modelSize: modelSize }, (response) => {
      if (chrome.runtime.lastError) console.warn(chrome.runtime.lastError);
      if (response && response.isDownloaded) {
        aiEngineStatus.innerHTML = getText('aiEngineStatusLoaded');
        downloadBtn.style.display = 'none';
      } else {
        aiEngineStatus.innerHTML = getText('aiEngineStatusNotLoaded');
        downloadBtn.style.display = 'block';
        
        let sizeStr = '75MB';
        if (modelSize === 'Xenova/whisper-base') sizeStr = '150MB';
        else if (modelSize === 'Xenova/whisper-small') sizeStr = '400MB';
        
        let baseText = getText('downloadBtn');
        baseText = baseText.replace('75MB', sizeStr);
        downloadBtn.textContent = baseText;
      }
    });
  };

  modelSizeSelect.addEventListener('change', (e) => {
    modelSize = e.target.value;
    chrome.storage.sync.set({ modelSize });
    
    // Clear current model state in background
    chrome.runtime.sendMessage({ action: 'deleteModel' }, () => {
      checkAndUpdateStatus();
      showNotification('تنبيه', getText('modelChangeWarning'));
    });
  });

  checkAndUpdateStatus();

  downloadBtn.addEventListener('click', () => {
    downloadBtn.disabled = true;
    downloadBtn.style.backgroundColor = '#9ca3af';
    progressBarContainer.style.display = 'block';
    progressText.style.display = 'block';
    progressText.textContent = getText('downloadingText');
    
    chrome.runtime.sendMessage({ action: 'downloadModel', modelSize: modelSize }, (response) => {
      if (response && response.success) {
        aiEngineStatus.innerHTML = getText('aiEngineStatusLoaded');
        downloadBtn.style.display = 'none';
        progressBarContainer.style.display = 'none';
        progressText.style.display = 'none';
        showNotification(getText('downloadDoneTitle'), getText('downloadDoneMsg'));
      } else {
        progressText.textContent = getText('downloadError');
        downloadBtn.disabled = false;
        downloadBtn.style.backgroundColor = '#10b981';
      }
    });
  });

  // Live Transcription Toggle
  const liveToggleContainer = document.createElement('div');
  liveToggleContainer.style.display = 'flex';
  liveToggleContainer.style.alignItems = 'center';
  liveToggleContainer.style.justifyContent = 'space-between';
  liveToggleContainer.style.marginTop = '16px';
  liveToggleContainer.style.paddingTop = '12px';
  liveToggleContainer.style.borderTop = '1px solid #e5e7eb';
  
  const liveToggleLabel = document.createElement('label');
  liveToggleLabel.textContent = getText('liveTranscriptionLabel');
  liveToggleLabel.style.fontWeight = '500';
  liveToggleLabel.style.fontSize = '14px';
  
  const switchLabel = document.createElement('label');
  switchLabel.style.position = 'relative';
  switchLabel.style.display = 'inline-block';
  switchLabel.style.width = '44px';
  switchLabel.style.height = '24px';
  
  const liveToggleInput = document.createElement('input');
  liveToggleInput.type = 'checkbox';
  liveToggleInput.checked = liveTranscriptionEnabled;
  liveToggleInput.style.opacity = '0';
  liveToggleInput.style.width = '0';
  liveToggleInput.style.height = '0';
  
  const slider = document.createElement('span');
  slider.style.position = 'absolute';
  slider.style.cursor = 'pointer';
  slider.style.top = '0';
  slider.style.left = '0';
  slider.style.right = '0';
  slider.style.bottom = '0';
  slider.style.backgroundColor = liveTranscriptionEnabled ? '#10b981' : '#ccc';
  slider.style.transition = '.4s';
  slider.style.borderRadius = '24px';
  
  const sliderKnob = document.createElement('span');
  sliderKnob.style.position = 'absolute';
  sliderKnob.style.content = '""';
  sliderKnob.style.height = '18px';
  sliderKnob.style.width = '18px';
  sliderKnob.style.left = liveTranscriptionEnabled ? '22px' : '3px';
  sliderKnob.style.bottom = '3px';
  sliderKnob.style.backgroundColor = 'white';
  sliderKnob.style.transition = '.4s';
  sliderKnob.style.borderRadius = '50%';
  
  slider.appendChild(sliderKnob);
  switchLabel.appendChild(liveToggleInput);
  switchLabel.appendChild(slider);
  
  liveToggleInput.addEventListener('change', (e) => {
    liveTranscriptionEnabled = e.target.checked;
    chrome.storage.sync.set({ liveTranscriptionEnabled });
    slider.style.backgroundColor = liveTranscriptionEnabled ? '#10b981' : '#ccc';
    sliderKnob.style.left = liveTranscriptionEnabled ? '22px' : '3px';
  });
  
  liveToggleContainer.appendChild(liveToggleLabel);
  liveToggleContainer.appendChild(switchLabel);

  aiEngineSection.appendChild(aiEngineTitle);
  aiEngineSection.appendChild(engineTypeLabel);
  aiEngineSection.appendChild(engineTypeSelect);
  aiEngineSection.appendChild(modelSizeLabel);
  aiEngineSection.appendChild(modelSizeSelect);
  aiEngineSection.appendChild(aiEngineStatus);
  aiEngineSection.appendChild(downloadBtn);
  aiEngineSection.appendChild(progressBarContainer);
  aiEngineSection.appendChild(progressText);
  aiEngineSection.appendChild(liveToggleContainer);

  // Add global references so the listener can update them
  window.aiProgressBar = progressBar;
  window.aiProgressText = progressText;

  // GitHub Profile Link
  const githubSection = document.createElement('div');
  githubSection.style.display = 'flex';
  githubSection.style.alignItems = 'center';
  githubSection.style.justifyContent = 'center';
  githubSection.style.marginTop = '16px';
  
  const githubLink = document.createElement('a');
  githubLink.href = 'https://github.com/7amzalam/smart-voice-assistant';
  githubLink.target = '_blank';
  githubLink.style.display = 'flex';
  githubLink.style.alignItems = 'center';
  githubLink.style.gap = '8px';
  githubLink.style.color = '#374151';
  githubLink.style.textDecoration = 'none';
  githubLink.style.fontSize = '14px';
  githubLink.style.fontWeight = '500';
  githubLink.style.padding = '8px 12px';
  githubLink.style.borderRadius = '6px';
  githubLink.style.backgroundColor = '#f3f4f6'; // gray-100
  githubLink.style.transition = 'background-color 0.2s';
  githubLink.style.width = '100%';
  githubLink.style.justifyContent = 'center';
  
  // GitHub Icon SVG
  githubLink.innerHTML = `
    <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
    </svg>
    <span>${language === 'ar-SA' ? 'المساهمة أو عرض الأكواد (GitHub)' : 'Contribute on GitHub'}</span>
  `;
  
  githubLink.addEventListener('mouseover', () => githubLink.style.backgroundColor = '#e5e7eb');
  githubLink.addEventListener('mouseout', () => githubLink.style.backgroundColor = '#f3f4f6');
  
  githubSection.appendChild(githubLink);

  settingsContent.appendChild(languageSection);
  settingsContent.appendChild(aiEngineSection);
  settingsContent.appendChild(shortcutSection);
  settingsContent.appendChild(githubSection);
  settingsContent.appendChild(closeButton);

  settingsPanel.appendChild(settingsHeader);
  settingsPanel.appendChild(settingsContent);

  getShadowRoot().appendChild(settingsPanel);

  // Animate in
  setTimeout(() => {
    settingsPanel.style.transform = 'translateX(0)';
  }, 10);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleVoiceAssistant') {
    if (isIconVisible) {
      hideFloatingIcon();
    } else {
      showFloatingIcon();
    }
  } else if (message.action === 'iconClicked') {
    if (isIconVisible) {
      createSettingsPanel();
    } else {
      showFloatingIcon();
    }
  } else if (message.action === 'modelProgress') {
    if (window.aiProgressBar && window.aiProgressText) {
      if (message.data && message.data.status === 'progress' && message.data.progress) {
        window.aiProgressBar.style.width = `${message.data.progress}%`;
        
        let dlText = getText('downloadingText').replace('...', '');
        window.aiProgressText.textContent = `${dlText} ${Math.round(message.data.progress)}%`;
      } else if (message.data && message.data.status === 'done') {
        window.aiProgressBar.style.width = `100%`;
        window.aiProgressText.textContent = getText('downloadingDoneText');
      } else if (message.data && message.data.status === 'ready') {
        window.aiProgressBar.style.width = `100%`;
        window.aiProgressText.textContent = getText('readyText');
      }
    }
  } else if (message.action === 'modelLoading') {
    // Only show notification if we are not in settings UI (no progress text shown)
    if (!window.aiProgressText || window.aiProgressText.style.display === 'none') {
      if (message.status === 'start') {
        // no auto download notification unless user specifically triggered it from outside settings
      } else if (message.status === 'done') {
        showNotification(getText('downloadDoneTitle'), getText('downloadDoneMsg'));
      }
    }
  }
});

// Show floating icon
function showFloatingIcon() {
  if (!floatingIcon) {
    createFloatingIcon();
  } else {
    floatingIcon.style.display = 'flex';
    isIconVisible = true;
  }
}

// Hide floating icon
function hideFloatingIcon() {
  if (floatingIcon) {
    floatingIcon.style.display = 'none';
    isIconVisible = false;
    stopRecording(); // ALWAYS force stop recording when UI is closed
  }
}

// Track active input fields
document.addEventListener('focusin', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
    activeInput = e.target;
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize speech recognition
  initSpeechRecognition();
});
