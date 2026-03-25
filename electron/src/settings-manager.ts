import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import * as path from 'path';

/**
 * Electron Settings — electron-store ベース
 */

export interface ElectronSettings {
    theme: string;
    fontSize: number;
    toolbarMode: string;
    language: string;
    imageDefaultDir: string;
    forceRelativeImagePath: boolean;
    enableDebugLogging: boolean;
    // Outliner settings
    outlinerPageTitle: boolean;
    linkOpenMode: string;
    // S3 settings
    s3AccessKeyId: string;
    s3SecretAccessKey: string;
    s3Region: string;
    // Folder panel
    notesFolders: string[];
    lastSelectedNoteFolder: string;
    folderPanelCollapsed: boolean;
    // Window state
    windowBounds?: { x: number; y: number; width: number; height: number };
    recentFiles?: string[];
    outlinerPanelCollapsed?: boolean;
    lastOutlinerFolder?: string;
    lastOutlinerFile?: string;
}

const DEFAULTS: ElectronSettings = {
    theme: 'things',
    fontSize: 16,
    toolbarMode: 'simple',
    language: 'default',
    imageDefaultDir: '',
    forceRelativeImagePath: false,
    enableDebugLogging: false,
    outlinerPageTitle: true,
    linkOpenMode: 'sidePanel',
    s3AccessKeyId: '',
    s3SecretAccessKey: '',
    s3Region: 'us-east-1',
    notesFolders: [],
    lastSelectedNoteFolder: '',
    folderPanelCollapsed: false,
    recentFiles: [],
};

export class SettingsManager {
    private store: Store<ElectronSettings>;
    private settingsWindow: BrowserWindow | null = null;

    constructor() {
        this.store = new Store<ElectronSettings>({
            name: 'config',
            defaults: DEFAULTS,
        });
    }

    get<K extends keyof ElectronSettings>(key: K): ElectronSettings[K] {
        return this.store.get(key);
    }

    set<K extends keyof ElectronSettings>(key: K, value: ElectronSettings[K]): void {
        this.store.set(key, value);
    }

    getAll(): ElectronSettings {
        return { ...DEFAULTS, ...this.store.store };
    }

    getRecentFiles(): string[] {
        return this.get('recentFiles') || [];
    }

    addRecentFile(filePath: string): void {
        const recent = this.get('recentFiles') || [];
        const filtered = recent.filter(f => f !== filePath);
        filtered.unshift(filePath);
        this.set('recentFiles', filtered.slice(0, 10));
    }

    openSettingsWindow(parentWindow: BrowserWindow): void {
        if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
            this.settingsWindow.focus();
            return;
        }

        this.settingsWindow = new BrowserWindow({
            width: 480,
            height: 780,
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

    private generateSettingsHtml(): string {
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
    .field-text input[type="text"] { flex: 1; margin-left: 12px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; }
    .field-desc { font-size: 11px; color: #888; margin: -4px 0 8px 12px; }
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
            <option value="things" ${settings.theme === 'things' ? 'selected' : ''}>Things</option>
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
    <div class="field field-text">
        <label>Default Dir</label>
        <input type="text" id="imageDefaultDir" value="${settings.imageDefaultDir}" onchange="save('imageDefaultDir', this.value)" placeholder="(document directory)">
        <button onclick="selectDir()" style="margin-left:4px;padding:2px 8px;cursor:pointer;">...</button>
    </div>
    <div class="field-desc">Absolute path or relative path from document. e.g. <code>./images</code>, <code>/Users/me/pics</code></div>
    <div class="field">
        <label>Force Relative Path</label>
        <input type="checkbox" id="forceRelativeImagePath" ${settings.forceRelativeImagePath ? 'checked' : ''} onchange="save('forceRelativeImagePath', this.checked)">
    </div>
    <div class="field-desc">When enabled, image paths in Markdown are always saved as relative paths, even if Default Dir is absolute.</div>

    <h2>Outliner</h2>
    <div class="field">
        <label>Show Page Title</label>
        <input type="checkbox" id="outlinerPageTitle" ${settings.outlinerPageTitle ? 'checked' : ''} onchange="save('outlinerPageTitle', this.checked)">
    </div>
    <div class="field-desc">Show the page title input field at the top of the outliner.</div>
    <div class="field">
        <label>Link Open Mode</label>
        <select id="linkOpenMode" onchange="save('linkOpenMode', this.value)">
            <option value="sidePanel" ${settings.linkOpenMode === 'sidePanel' ? 'selected' : ''}>Side Panel</option>
            <option value="tab" ${settings.linkOpenMode === 'tab' ? 'selected' : ''}>New Tab</option>
        </select>
    </div>
    <div class="field-desc">How to open linked Markdown files from the editor.</div>

    <h2>S3 Sync</h2>
    <div class="field field-text">
        <label>Access Key ID</label>
        <input type="text" id="s3AccessKeyId" value="${settings.s3AccessKeyId}" onchange="save('s3AccessKeyId', this.value)" placeholder="AKIA...">
    </div>
    <div class="field field-text">
        <label>Secret Access Key</label>
        <input type="password" id="s3SecretAccessKey" value="${settings.s3SecretAccessKey}" onchange="save('s3SecretAccessKey', this.value)" placeholder="(hidden)">
    </div>
    <div class="field field-text">
        <label>Region</label>
        <input type="text" id="s3Region" value="${settings.s3Region}" onchange="save('s3Region', this.value)" placeholder="us-east-1">
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
    async function selectDir() {
        const dir = await window.settingsBridge.selectDirectory();
        if (dir !== null) {
            document.getElementById('imageDefaultDir').value = dir;
            save('imageDefaultDir', dir);
        }
    }
    </script>
</body>
</html>`;
    }
}
