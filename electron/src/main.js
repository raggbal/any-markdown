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
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const file_manager_1 = require("./file-manager");
const settings_manager_1 = require("./settings-manager");
const html_generator_1 = require("./html-generator");
const menu_1 = require("./menu");
/**
 * Any Markdown — Electron Main Process
 */
const settingsManager = new settings_manager_1.SettingsManager();
const windows = new Map();
function getI18nMessages() {
    const settings = settingsManager.getAll();
    const lang = settings.language === 'default' ? electron_1.app.getLocale() : settings.language;
    const localeMap = {
        'ja': 'ja', 'en': 'en', 'zh-CN': 'zh-cn', 'zh-TW': 'zh-tw',
        'ko': 'ko', 'es': 'es', 'fr': 'fr',
    };
    const localeKey = localeMap[lang] || lang.split('-')[0];
    // Try multiple paths for compiled locale .js files
    const tryPaths = [
        // Dev: root project out/locales/
        path.join(__dirname, '..', '..', 'out', 'locales', `${localeKey}.js`),
        // Packaged: extraResources/locales/
        path.join(process.resourcesPath || '', 'locales', `${localeKey}.js`),
    ];
    for (const p of tryPaths) {
        if (fs.existsSync(p)) {
            try {
                delete require.cache[require.resolve(p)];
                const mod = require(p);
                // Locale files export: { messages, webviewMessages }
                if (mod.webviewMessages) {
                    console.log(`[i18n] Loaded ${localeKey} from ${p}`);
                    return mod.webviewMessages;
                }
            }
            catch (e) {
                console.error(`[i18n] Failed to load ${p}:`, e);
            }
        }
    }
    console.log(`[i18n] No locale found for ${localeKey}, using empty`);
    return {};
}
function createWindow(filePath) {
    const bounds = settingsManager.get('windowBounds');
    const win = new electron_1.BrowserWindow({
        width: bounds?.width || 900,
        height: bounds?.height || 700,
        x: bounds?.x,
        y: bounds?.y,
        title: 'Any Markdown',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const fileManager = new file_manager_1.FileManager(win);
    windows.set(win, fileManager);
    // Save window bounds on resize/move
    const saveBounds = () => {
        if (!win.isMaximized() && !win.isMinimized()) {
            settingsManager.set('windowBounds', win.getBounds());
        }
    };
    win.on('resize', saveBounds);
    win.on('move', saveBounds);
    // Capture renderer errors in main process console
    win.webContents.on('console-message', (_event, level, message) => {
        if (level >= 2) { // warning and error
            console.error(`[renderer] ${message}`);
        }
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
        console.error(`[did-fail-load] ${errorCode}: ${errorDescription}`);
    });
    // Load content
    const loadContent = async (content = '') => {
        const settings = settingsManager.getAll();
        const docDir = fileManager.getDocumentDir();
        console.log('[main] resourcesPath:', process.resourcesPath);
        console.log('[main] __dirname:', __dirname);
        console.log('[main] isPackaged:', electron_1.app.isPackaged);
        const html = (0, html_generator_1.generateEditorHtml)(content, {
            theme: settings.theme,
            fontSize: settings.fontSize,
            toolbarMode: settings.toolbarMode,
            documentBaseUri: `file://${docDir}/`,
            webviewMessages: getI18nMessages(),
            enableDebugLogging: settings.enableDebugLogging,
        });
        const tempFile = (0, html_generator_1.writeHtmlToTempFile)(html);
        console.log('[main] Loading tempFile:', tempFile);
        await win.loadFile(tempFile);
        // Open DevTools for debugging (remove after stable)
        if (!electron_1.app.isPackaged) {
            win.webContents.openDevTools();
        }
    };
    if (filePath) {
        fileManager.open(filePath).then(content => {
            if (content !== null) {
                settingsManager.addRecentFile(filePath);
                loadContent(content);
            }
        });
    }
    else {
        loadContent();
    }
    // Close handling
    win.on('close', async (e) => {
        if (fileManager.isDirtyState()) {
            e.preventDefault();
            const { response } = await electron_1.dialog.showMessageBox(win, {
                type: 'warning',
                buttons: ['Save', "Don't Save", 'Cancel'],
                defaultId: 0,
                message: 'Do you want to save changes?',
            });
            if (response === 0) {
                const md = await win.webContents.executeJavaScript('typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""');
                await fileManager.save(md);
                win.destroy();
            }
            else if (response === 1) {
                win.destroy();
            }
            // response === 2 → Cancel, do nothing
        }
    });
    win.on('closed', () => {
        fileManager.dispose();
        windows.delete(win);
    });
    // Store function for reload (settings change)
    win.__loadContent = loadContent;
    win.__fileManager = fileManager;
    return win;
}
// ── IPC Handlers ──
electron_1.ipcMain.on('sync-content', (event, markdown) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const fm = windows.get(win);
    if (fm)
        fm.markDirty(markdown);
});
electron_1.ipcMain.on('save', async (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const fm = windows.get(win);
    if (!fm)
        return;
    const md = await win.webContents.executeJavaScript('typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""');
    fm.save(md);
});
electron_1.ipcMain.on('open-link', (_event, href) => {
    electron_1.shell.openExternal(href);
});
electron_1.ipcMain.on('insert-link', async (event, text) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    // Simple prompt using dialog (Electron has no built-in input dialog)
    // Use executeJavaScript as a workaround
    const url = await win.webContents.executeJavaScript(`window.prompt('Enter URL:', 'https://')`);
    if (url) {
        win.webContents.send('host-message', {
            type: 'insertLinkHtml',
            url,
            text: text || url,
        });
    }
});
electron_1.ipcMain.on('insert-image', async (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const result = await electron_1.dialog.showOpenDialog(win, {
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
        properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0)
        return;
    const fm = windows.get(win);
    if (!fm)
        return;
    const imgResult = await fm.readAndInsertImage(result.filePaths[0]);
    if (imgResult) {
        win.webContents.send('host-message', {
            type: 'insertImageHtml',
            markdownPath: imgResult.markdownPath,
            displayUri: imgResult.displayUri,
        });
    }
});
electron_1.ipcMain.on('save-image', async (event, dataUrl, fileName) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const fm = windows.get(win);
    if (!fm)
        return;
    const result = await fm.saveImage(dataUrl, fileName);
    if (result) {
        win.webContents.send('host-message', {
            type: 'insertImageHtml',
            markdownPath: result.markdownPath,
            displayUri: result.displayUri,
        });
    }
});
electron_1.ipcMain.on('read-insert-image', async (event, filePath) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const fm = windows.get(win);
    if (!fm)
        return;
    const result = await fm.readAndInsertImage(filePath);
    if (result) {
        win.webContents.send('host-message', {
            type: 'insertImageHtml',
            markdownPath: result.markdownPath,
            displayUri: result.displayUri,
        });
    }
});
electron_1.ipcMain.on('set-image-dir', async (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const result = await electron_1.dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Image Directory',
    });
    if (!result.canceled && result.filePaths.length > 0) {
        win.webContents.send('host-message', {
            type: 'setImageDir',
            dirPath: result.filePaths[0],
            forceRelativePath: settingsManager.get('forceRelativeImagePath'),
        });
    }
});
electron_1.ipcMain.on('open-in-text-editor', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const fm = windows.get(win);
    if (fm)
        fm.openInTextEditor();
});
electron_1.ipcMain.on('copy-file-path', (event) => {
    const win = electron_1.BrowserWindow.fromWebContents(event.sender);
    if (!win)
        return;
    const fm = windows.get(win);
    if (fm) {
        const filePath = fm.getFilePath();
        if (filePath) {
            electron_1.clipboard.writeText(filePath);
        }
    }
});
electron_1.ipcMain.on('editing-state', () => { });
electron_1.ipcMain.on('focus', () => { });
electron_1.ipcMain.on('blur', () => { });
// Settings IPC
electron_1.ipcMain.on('settings-save', async (_event, key, value) => {
    settingsManager.set(key, value);
    // Reload all editor windows with new settings, preserving content
    for (const [win] of windows) {
        if (win.isDestroyed())
            continue;
        try {
            const md = await win.webContents.executeJavaScript('typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""');
            const loadContent = win.__loadContent;
            if (loadContent) {
                await loadContent(md);
            }
        }
        catch (e) {
            console.error('[settings-save] Failed to reload window:', e);
        }
    }
});
// ── App Lifecycle ──
electron_1.app.whenReady().then(() => {
    // Set up menu
    const menu = (0, menu_1.buildMenu)({
        newFile: () => createWindow(),
        openFile: async () => {
            const result = await electron_1.dialog.showOpenDialog({
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
                createWindow(result.filePaths[0]);
            }
        },
        save: () => {
            const win = electron_1.BrowserWindow.getFocusedWindow();
            if (win)
                win.webContents.send('host-message', { type: 'save' });
        },
        saveAs: async () => {
            const win = electron_1.BrowserWindow.getFocusedWindow();
            if (!win)
                return;
            const fm = windows.get(win);
            if (!fm)
                return;
            const md = await win.webContents.executeJavaScript('typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""');
            fm.saveAs(md);
        },
        openPreferences: () => {
            const win = electron_1.BrowserWindow.getFocusedWindow();
            if (win)
                settingsManager.openSettingsWindow(win);
        },
    });
    electron_1.Menu.setApplicationMenu(menu);
    // Open file from command line args or open empty window
    const filePaths = process.argv.slice(electron_1.app.isPackaged ? 1 : 2).filter(arg => !arg.startsWith('-') && (arg.endsWith('.md') || arg.endsWith('.markdown')));
    if (filePaths.length > 0) {
        filePaths.forEach(fp => createWindow(path.resolve(fp)));
    }
    else {
        createWindow();
    }
});
// Mac: open-file event (double-click .md in Finder, drag onto dock icon)
electron_1.app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (electron_1.app.isReady()) {
        createWindow(filePath);
    }
    else {
        electron_1.app.whenReady().then(() => createWindow(filePath));
    }
});
// Mac: re-create window when dock icon clicked
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
// Quit when all windows closed (except Mac)
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
//# sourceMappingURL=main.js.map