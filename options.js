// Options page script for Voice Assistant Extension

document.addEventListener('DOMContentLoaded', () => {
  // Load saved language
  chrome.storage.sync.get(['language'], (result) => {
    if (result.language) {
      document.getElementById('language-select').value = result.language;
    }
  });

  // Save settings when button is clicked
  document.getElementById('save-settings').addEventListener('click', () => {
    const selectedLanguage = document.getElementById('language-select').value;

    // Save to storage
    chrome.storage.sync.set({
      language: selectedLanguage
    }, () => {
      // Show success message
      const statusMessage = document.getElementById('status-message');
      statusMessage.classList.add('success');

      // Hide message after 3 seconds
      setTimeout(() => {
        statusMessage.classList.remove('success');
      }, 3000);
    });
  });
});
