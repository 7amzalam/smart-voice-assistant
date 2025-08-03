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

// Load saved settings
chrome.storage.sync.get(['language', 'iconPosition', 'isFirstTime'], (result) => {
  if (result.language) {
    language = result.language;
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
    status = 'disabled';
    if(floatingIcon) updateIconAppearance();
    showNotification('غير مدعوم', 'واجهة برمجة تطبيقات الكلام على الويب غير مدعومة في هذا المتصفح.');
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
    // *** هذا هو التعديل الجديد ***
    // "إيقاظ" الأيقونة من وضع السكون فقط إذا كانت نائمة بالفعل
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
      activeInput.value = (textBeforeRecording + " " + transcript).trim();
      const inputEvent = new Event('input', { bubbles: true });
      activeInput.dispatchEvent(inputEvent);
    }
  };
  
  voiceRecognition.onend = () => {
    status = 'idle';
    updateIconAppearance();
  };

  voiceRecognition.onerror = (event) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.error("Speech recognition error", event.error);
      showNotification('خطأ في التعرف على الكلام', event.error);
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
  floatingIcon.style.zIndex = '9999';
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
  sleepingMessage.textContent = 'لا يوجد صوت حاليًا';
  sleepingMessage.style.position = 'absolute';
  sleepingMessage.style.top = '-32px';
  sleepingMessage.style.fontSize = '12px';
  sleepingMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
  sleepingMessage.style.color = 'white';
  sleepingMessage.style.padding = '2px 8px';
  sleepingMessage.style.borderRadius = '4px';
  sleepingMessage.style.whiteSpace = 'nowrap';
  sleepingMessage.style.display = 'none';

  iconContainer.appendChild(icon);
  iconContainer.appendChild(sleepingMessage);
  floatingIcon.appendChild(iconContainer);

  // Add event listeners
  iconContainer.addEventListener('mousedown', handleMouseDown);

  document.body.appendChild(floatingIcon);
  isIconVisible = true;

  // Update icon appearance based on status
  updateIconAppearance();
}

// Update icon appearance based on status
function updateIconAppearance() {
  if (!floatingIcon) return;

  const iconContainer = floatingIcon.querySelector('.voice-assistant-icon-container');
  const sleepingMessage = floatingIcon.querySelector('.voice-assistant-sleeping-message');

  // Reset classes
  iconContainer.className = 'voice-assistant-icon-container';

  switch (status) {
    case 'recording':
      iconContainer.style.backgroundColor = '#ef4444'; // red-500
      iconContainer.style.color = 'white';
      iconContainer.classList.add('animate-pulse');
      iconContainer.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
      sleepingMessage.style.display = 'none';
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

  const newPos = {
    x: e.clientX - dragStartPos.x,
    y: e.clientY - dragStartPos.y
  };

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
    textBeforeRecording = activeInput.value;
  } else {
    textBeforeRecording = '';
  }
  transcript = '';
  lastTranscript = '';

  if (!voiceRecognition) {
    initSpeechRecognition();
  }

  try {
    voiceRecognition.start();
  } catch (e) {
    console.error("فشل بدء التسجيل:", e);
  }
}

// استبدل دالة stopRecording بالكامل بهذا:
// Function to stop recording
function stopRecording() {
  // تحقق إذا كان التسجيل متوقفًا بالفعل لتجنب أي أوامر متضاربة
  if (status === 'idle' || !voiceRecognition) return;

  // *** هذا هو الإصلاح الأهم ***
  // قم بتعيين الحالة إلى "خامل" أولاً وقبل أي شيء آخر.
  // هذا يرسل إشارة فورية إلى onend بأن التوقف كان مقصودًا ولا يجب إعادة التشغيل.
  status = 'idle'; 
  updateIconAppearance();

  // الآن، قم بإيقاف محرك التعرف على الصوت
  try {
    voiceRecognition.stop();
  } catch(e) {
    // تجاهل الخطأ إذا كان المحرك قد توقف بالفعل
    console.warn("Recognition might have already stopped, which is fine.");
  }
  
  // بقية الكود يبقى كما هو لمعالجة النص المكتوب
  const finalTranscript = transcript.trim();
  lastTranscript = finalTranscript;

  if (finalTranscript) {
    navigator.clipboard.writeText(finalTranscript).then(() => {
        showNotification('تم النسخ بنجاح!', 'النص جاهز في الحافظة. قم بلصقه الآن (Ctrl+V).');
    }).catch(err => {
        console.error('خطأ في نسخ النص: ', err);
    });

    createEditButton();
    if (editButtonTimeout) clearTimeout(editButtonTimeout);
    editButtonTimeout = setTimeout(hideEditButton, 5000);
  }
}

// Create edit button
function createEditButton() {
  // Remove existing edit button if any
  const existingButton = document.getElementById('voice-assistant-edit-button');
  if (existingButton) {
    existingButton.remove();
  }

  const editButton = document.createElement('button');
  editButton.id = 'voice-assistant-edit-button';
  editButton.className = 'voice-assistant-edit-button';
  editButton.textContent = 'تعديل النص';
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
  editDialog.style.zIndex = '10000';

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
  dialogTitle.textContent = 'تعديل النص (Edit Text)';
  dialogTitle.style.fontSize = '18px';
  dialogTitle.style.fontWeight = '600';
  dialogTitle.style.margin = '0';

  dialogHeader.appendChild(dialogTitle);

  const dialogBody = document.createElement('div');
  dialogBody.style.marginBottom = '24px';

  const textareaLabel = document.createElement('label');
  textareaLabel.textContent = 'النص المكتوب';
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
  cancelButton.textContent = 'إلغاء';
  cancelButton.style.padding = '8px 16px';
  cancelButton.style.borderRadius = '6px';
  cancelButton.style.fontSize = '14px';
  cancelButton.style.fontWeight = '500';
  cancelButton.style.border = 'none';
  cancelButton.style.cursor = 'pointer';
  cancelButton.style.backgroundColor = '#f3f4f6'; // gray-100

  const saveButton = document.createElement('button');
  saveButton.textContent = 'حفظ التغييرات';
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
  document.body.appendChild(editDialog);

  // Focus on textarea
  textarea.focus();
}

// Inject text into active input
function injectText(textToInject) {
  if (activeInput && textToInject) {
    const start = activeInput.selectionStart || 0;
    const end = activeInput.selectionEnd || 0;
    const currentValue = activeInput.value;
    const newValue = currentValue.substring(0, start) + textToInject.trim() + " " + currentValue.substring(end);
    activeInput.value = newValue;

    // Trigger input event
    const event = new Event('input', { bubbles: true });
    activeInput.dispatchEvent(event);
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
  notification.style.zIndex = '10000';
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

  document.body.appendChild(notification);

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
  settingsPanel.style.zIndex = '10000';
  settingsPanel.style.transform = 'translateX(100%)';
  settingsPanel.style.transition = 'transform 0.3s ease';

  const settingsHeader = document.createElement('div');
  settingsHeader.style.padding = '16px';
  settingsHeader.style.borderBottom = '1px solid #e5e7eb'; // gray-200

  const settingsTitle = document.createElement('h3');
  settingsTitle.textContent = 'إعدادات المساعد الصوتي';
  settingsTitle.style.fontSize = '18px';
  settingsTitle.style.fontWeight = '600';
  settingsTitle.style.margin = '0';

  const settingsDescription = document.createElement('p');
  settingsDescription.textContent = 'قم بتكوين تفضيلاتك للمساعد الصوتي الذكي.';
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
  languageLabel.textContent = 'لغة التحدث (Language)';
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
  shortcutTitle.textContent = 'اختصار لوحة المفاتيح';
  shortcutTitle.style.fontWeight = '600';
  shortcutTitle.style.fontSize = '16px';
  shortcutTitle.style.margin = '0 0 8px 0';

  const shortcutDescription = document.createElement('p');
  shortcutDescription.innerHTML = `
    لتغيير اختصار لوحة المفاتيح، انتقل إلى إعدادات المتصفح الخاص بك على:<br>
    <code style="font-size: 12px; font-family: monospace; background-color: #f3f4f6; padding: 2px 4px; border-radius: 4px;">chrome://extensions/shortcuts</code>
  `;
  shortcutDescription.style.fontSize = '14px';
  shortcutDescription.style.color = '#4b5563'; // gray-600
  shortcutDescription.style.margin = '0';

  shortcutSection.appendChild(shortcutTitle);
  shortcutSection.appendChild(shortcutDescription);

  // Close button
  const closeButton = document.createElement('button');
  closeButton.textContent = 'إغلاق';
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

  settingsContent.appendChild(languageSection);
  settingsContent.appendChild(shortcutSection);
  settingsContent.appendChild(closeButton);

  settingsPanel.appendChild(settingsHeader);
  settingsPanel.appendChild(settingsContent);

  document.body.appendChild(settingsPanel);

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
  }
}

// Track active input fields
document.addEventListener('focusin', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
    activeInput = e.target;
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Initialize speech recognition
  initSpeechRecognition();

  // Create floating icon
  createFloatingIcon();
});
