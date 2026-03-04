"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsManager = void 0;
const electron_store_1 = __importDefault(require("electron-store"));
const electron_1 = require("electron");
const path = __importStar(require("path"));
const DEFAULTS = {
    theme: 'github',
    fontSize: 16,
    toolbarMode: 'simple',
    language: 'default',
    imageDefaultDir: '',
    forceRelativeImagePath: false,
    enableDebugLogging: false,
    recentFiles: [],
};
class SettingsManager {
    store;
    settingsWindow = null;
    constructor() {
        this.store = new electron_store_1.default({
            name: 'config',
            defaults: DEFAULTS,
        });
    }
    get(key) {
        return this.store.get(key);
    }
    set(key, value) {
        this.store.set(key, value);
    }
    getAll() {
        return { ...DEFAULTS, ...this.store.store };
    }
    addRecentFile(filePath) {
        const recent = this.get('recentFiles') || [];
        const filtered = recent.filter(f => f !== filePath);
        filtered.unshift(filePath);
        this.set('recentFiles', filtered.slice(0, 10));
    }
    openSettingsWindow(parentWindow) {
        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            this.settingsWindow.focus();
            return;
        }
        this.settingsWindow = new electron_1.BrowserWindow({
            width: 480,
            height: 540,
            parent: parentWindow,
            modal: false,
            resizable: false,
            minimizable: false,
            maximizable: false,
            title: 'Any Markdown — Preferences',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'settings-preload.js'),
            },
        });
        const html = this.generateSettingsHtml();
        this.settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        this.settingsWindow.on('closed', () => {
            this.settingsWindow = null;
        });
    }
    generateSettingsHtml() {
        const settings = this.getAll();
        return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Preferences</title>
<style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; padding: 24px; background: #f5f5f5; color: #333; }
    h2 { font-size: 14px; font-weight: 600; margin: 20px 0 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    h2:first-child { margin-top: 0; }
    .field { display: flex; align-items: center; justify-content: space-between; margin: 8px 0; padding: 8px 12px; background: white; border-radius: 6px; }
    .field label { font-weight: 500; }
    select, input[type="number"] { padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; background: white; }
    select { min-width: 140px; }
    input[type="number"] { width: 70px; text-align: center; }
    input[type="checkbox"] { width: 16px; height: 16px; }
    .field-text input { flex: 1; margin-left: 12px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 16px 0; }
</style>
</head>
<body>
    <h2>Appearance</h2>
    <div class="field">
        <label>Theme</label>
        <select id="theme" onchange="save('theme', this.value)">
            <option value="github" ${settings.theme === 'github' ? 'selected' : ''}>GitHub</option>
            <option value="sepia" ${settings.theme === 'sepia' ? 'selected' : ''}>Sepia</option>
            <option value="night" ${settings.theme === 'night' ? 'selected' : ''}>Night</option>
            <option value="dark" ${settings.theme === 'dark' ? 'selected' : ''}>Dark</option>
            <option value="minimal" ${settings.theme === 'minimal' ? 'selected' : ''}>Minimal</option>
            <option value="perplexity" ${settings.theme === 'perplexity' ? 'selected' : ''}>Perplexity</option>
        </select>
    </div>
    <div class="field">
        <label>Font Size</label>
        <input type="number" id="fontSize" min="10" max="32" value="${settings.fontSize}" onchange="save('fontSize', parseInt(this.value))">
    </div>
    <div class="field">
        <label>Toolbar</label>
        <select id="toolbarMode" onchange="save('toolbarMode', this.value)">
            <option value="simple" ${settings.toolbarMode === 'simple' ? 'selected' : ''}>Simple</option>
            <option value="full" ${settings.toolbarMode === 'full' ? 'selected' : ''}>Full</option>
        </select>
    </div>
    <div class="field">
        <label>Language</label>
        <select id="language" onchange="save('language', this.value)">
            <option value="default" ${settings.language === 'default' ? 'selected' : ''}>Auto</option>
            <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
            <option value="ja" ${settings.language === 'ja' ? 'selected' : ''}>Japanese</option>
            <option value="zh-CN" ${settings.language === 'zh-CN' ? 'selected' : ''}>Chinese (Simplified)</option>
            <option value="zh-TW" ${settings.language === 'zh-TW' ? 'selected' : ''}>Chinese (Traditional)</option>
            <option value="ko" ${settings.language === 'ko' ? 'selected' : ''}>Korean</option>
            <option value="es" ${settings.language === 'es' ? 'selected' : ''}>Spanish</option>
            <option value="fr" ${settings.language === 'fr' ? 'selected' : ''}>French</option>
        </select>
    </div>

    <h2>Images</h2>
    <div class="field">
        <label>Force Relative Path</label>
        <input type="checkbox" id="forceRelativeImagePath" ${settings.forceRelativeImagePath ? 'checked' : ''} onchange="save('forceRelativeImagePath', this.checked)">
    </div>

    <h2>Advanced</h2>
    <div class="field">
        <label>Debug Logging</label>
        <input type="checkbox" id="enableDebugLogging" ${settings.enableDebugLogging ? 'checked' : ''} onchange="save('enableDebugLogging', this.checked)">
    </div>

    <script>
    function save(key, value) {
        window.settingsBridge.save(key, value);
    }
    </script>
</body>
</html>`;
    }
}
exports.SettingsManager = SettingsManager;
//# sourceMappingURL=settings-manager.js.map