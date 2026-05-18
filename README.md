# 🎙️ Smart Voice Assistant - V2

**Smart Voice Assistant** is an advanced, free, and open-source browser extension that allows you to transcribe speech to text instantly and with high accuracy on any website you visit. This extension is built to be cross-browser compatible, supporting **Google Chrome**, **Firefox**, **Brave**, and all Chromium-based browsers.

![Smart Voice Assistant](icons/icon128.png)

---

## ✨ Key Features (Version 2)
- **🚀 Dual AI Engines:**
  - **Cloud Native Engine (Google):** Extremely fast and relies on the browser's built-in Web Speech API.
  - **Local Engine (Whisper AI):** A local AI model that runs entirely within your browser (Offline-first), ensuring 100% privacy with no audio data sent to external servers.
- **🌍 Multi-language Support:** The extension interface is fully bilingual (Arabic and English), and it supports transcription in various languages including Arabic, English, French, German, and Spanish.
- **📝 Live Transcription:** The ability to write transcribed text directly into any text input or document on the web in real-time as you speak.
- **🖱️ Smart Floating UI:** A draggable recording widget that can be placed anywhere on the screen to avoid blocking page content.
- **📌 Seamless Controls:** Features a "Pin" button to keep the widget always visible, an "Edit" button to refine your text before submission, and customizable keyboard shortcuts.

---

## 🛠️ Installation & Setup (For Developers & Users)

Built with modern **Manifest V3** standards and hybrid support, you can easily install the extension on your preferred browser:

### 1️⃣ Installation on Google Chrome, Brave, and Chromium browsers
1. Clone or download this repository to your local machine.
2. Open your browser and navigate to the extensions page: `chrome://extensions/`
3. Enable **Developer mode** in the top right corner.
4. Click on the **Load unpacked** button.
5. Select the extension directory (the folder containing `manifest.json`).
6. The Voice Assistant icon will appear in your browser's toolbar, ready to use!

### 2️⃣ Installation on Mozilla Firefox
1. Open Firefox and navigate to: `about:debugging`
2. From the left sidebar, click on **This Firefox**.
3. Click on the **Load Temporary Add-on...** button.
4. Browse your files and select the `manifest.json` file inside the extension folder.
5. The extension will be loaded temporarily and the icon will appear in the Firefox toolbar.

---

## ⚙️ Tech Stack
- **Manifest V3:** The modern and secure standard for browser extensions.
- **Vanilla JavaScript:** Clean, robust, and fast code without heavy UI frameworks (Content Scripts).
- **Web Speech API:** For lightning-fast, native voice recognition.
- **Transformers.js:** To run the local `Whisper AI` model completely inside the browser via WebAssembly, requiring no backend servers.
- **Shadow DOM:** Ensures the extension's UI is completely isolated, preventing CSS conflicts with the websites you visit.

---

## 🤝 Contributing
Contributions are always welcome! If you have an idea for a new feature, or if you find a bug, please feel free to open an **Issue** or submit a **Pull Request**. Our goal is to make voice dictation on the web better and more accessible for everyone.

---
*Developed with passion as an Open Source extension 🤍*
