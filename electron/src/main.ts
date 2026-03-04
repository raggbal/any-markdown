import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FileManager } from './file-manager';
import { SettingsManager } from './settings-manager';
import { generateEditorHtml, writeHtmlToTempFile } from './html-generator';
import { buildMenu } from './menu';
import { setupUpdateChecker, checkForUpdates } from './updater';

/**
 * Any Markdown — Electron Main Process
 */

const settingsManager = new SettingsManager();
const windows = new Map<BrowserWindow, FileManager>();

function getI18nMessages(): Record<string, string> {
    const settings = settingsManager.getAll();
    const lang = settings.language === 'default' ? app.getLocale() : settings.language;

    const localeMap: Record<string, string> = {
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
            } catch (e) {
                console.error(`[i18n] Failed to load ${p}:`, e);
            }
        }
    }

    console.log(`[i18n] No locale found for ${localeKey}, using empty`);
    return {};
}

function createWindow(filePath?: string): BrowserWindow {
    const bounds = settingsManager.get('windowBounds');
    const win = new BrowserWindow({
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

    const fileManager = new FileManager(win, () => ({
        imageDefaultDir: settingsManager.get('imageDefaultDir') || '',
        forceRelativeImagePath: settingsManager.get('forceRelativeImagePath') || false,
    }));
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
    const loadContent = async (content: string = '') => {
        const settings = settingsManager.getAll();
        const docDir = fileManager.getDocumentDir();
        console.log('[main] resourcesPath:', process.resourcesPath);
        console.log('[main] __dirname:', __dirname);
        console.log('[main] isPackaged:', app.isPackaged);
        const html = generateEditorHtml(content, {
            theme: settings.theme,
            fontSize: settings.fontSize,
            toolbarMode: settings.toolbarMode,
            documentBaseUri: `file://${docDir}/`,
            webviewMessages: getI18nMessages(),
            enableDebugLogging: settings.enableDebugLogging,
        });
        const tempFile = writeHtmlToTempFile(html);
        console.log('[main] Loading tempFile:', tempFile);
        await win.loadFile(tempFile);
        // Open DevTools for debugging (remove after stable)
        if (!app.isPackaged) {
            win.webContents.openDevTools();
        }
    };

    if (filePath) {
        fileManager.open(filePath).then(content => {
            if (content !== null) {
                settingsManager.addRecentFile(filePath!);
                loadContent(content);
            }
        });
    } else {
        loadContent();
    }

    // Close handling
    win.on('close', async (e) => {
        if (fileManager.isDirtyState()) {
            e.preventDefault();
            const { response } = await dialog.showMessageBox(win, {
                type: 'warning',
                buttons: ['Save', "Don't Save", 'Cancel'],
                defaultId: 0,
                message: 'Do you want to save changes?',
            });
            if (response === 0) {
                const md = await win.webContents.executeJavaScript(
                    'typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""'
                );
                await fileManager.save(md);
                win.destroy();
            } else if (response === 1) {
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
    (win as any).__loadContent = loadContent;
    (win as any).__fileManager = fileManager;

    return win;
}

// ── IPC Handlers ──

ipcMain.on('sync-content', (event, markdown: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (fm) fm.markDirty(markdown);
});

ipcMain.on('save', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (!fm) return;
    const md = await win.webContents.executeJavaScript(
        'typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""'
    );
    fm.save(md);
});

ipcMain.on('open-link', (_event, href: string) => {
    shell.openExternal(href);
});

ipcMain.on('insert-link', async (event, text: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    // Simple prompt using dialog (Electron has no built-in input dialog)
    // Use executeJavaScript as a workaround
    const url = await win.webContents.executeJavaScript(
        `window.prompt('Enter URL:', 'https://')`
    );
    if (url) {
        win.webContents.send('host-message', {
            type: 'insertLinkHtml',
            url,
            text: text || url,
        });
    }
});

ipcMain.on('insert-image', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
        properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return;

    const fm = windows.get(win);
    if (!fm) return;
    const imgResult = await fm.readAndInsertImage(result.filePaths[0]);
    if (imgResult) {
        win.webContents.send('host-message', {
            type: 'insertImageHtml',
            markdownPath: imgResult.markdownPath,
            displayUri: imgResult.displayUri,
        });
    }
});

ipcMain.on('save-image', async (event, dataUrl: string, fileName?: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (!fm) return;
    const result = await fm.saveImage(dataUrl, fileName);
    if (result) {
        win.webContents.send('host-message', {
            type: 'insertImageHtml',
            markdownPath: result.markdownPath,
            displayUri: result.displayUri,
        });
    }
});

ipcMain.on('read-insert-image', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (!fm) return;
    const result = await fm.readAndInsertImage(filePath);
    if (result) {
        win.webContents.send('host-message', {
            type: 'insertImageHtml',
            markdownPath: result.markdownPath,
            displayUri: result.displayUri,
        });
    }
});

ipcMain.on('set-image-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Image Directory',
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const fm = windows.get(win);
        if (fm) fm.setImageDir(result.filePaths[0]);
        win.webContents.send('host-message', {
            type: 'setImageDir',
            dirPath: result.filePaths[0],
            forceRelativePath: settingsManager.get('forceRelativeImagePath'),
        });
    }
});

ipcMain.on('open-in-text-editor', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (fm) fm.openInTextEditor();
});

ipcMain.on('editing-state', () => { /* no-op for Electron */ });
ipcMain.on('focus', () => { /* no-op */ });
ipcMain.on('blur', () => { /* no-op */ });

// Settings IPC
ipcMain.on('settings-save', async (_event, key: string, value: unknown) => {
    settingsManager.set(key as any, value as any);
    // Reload all editor windows with new settings, preserving content
    for (const [win] of windows) {
        if (win.isDestroyed()) continue;
        try {
            const md = await win.webContents.executeJavaScript(
                'typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""'
            );
            const loadContent = (win as any).__loadContent;
            if (loadContent) {
                await loadContent(md);
            }
        } catch (e) {
            console.error('[settings-save] Failed to reload window:', e);
        }
    }
});

ipcMain.handle('settings-select-directory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: 'Select Image Directory',
    });
    if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
    }
    return null;
});

// ── App Lifecycle ──

app.whenReady().then(() => {
    // Set up menu
    const menu = buildMenu({
        newFile: () => createWindow(),
        openFile: async () => {
            const result = await dialog.showOpenDialog({
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                properties: ['openFile'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
                createWindow(result.filePaths[0]);
            }
        },
        save: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send('host-message', { type: 'save' });
        },
        saveAs: async () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win) return;
            const fm = windows.get(win);
            if (!fm) return;
            const md = await win.webContents.executeJavaScript(
                'typeof htmlToMarkdown === "function" ? htmlToMarkdown() : ""'
            );
            fm.saveAs(md);
        },
        openPreferences: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) settingsManager.openSettingsWindow(win);
        },
        checkForUpdates: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) checkForUpdates(win, true);
        },
    });
    Menu.setApplicationMenu(menu);

    // Open file from command line args or open empty window
    const filePaths = process.argv.slice(app.isPackaged ? 1 : 2).filter(
        arg => !arg.startsWith('-') && (arg.endsWith('.md') || arg.endsWith('.markdown'))
    );

    let firstWindow: BrowserWindow | undefined;
    if (filePaths.length > 0) {
        filePaths.forEach(fp => {
            const w = createWindow(path.resolve(fp));
            if (!firstWindow) firstWindow = w;
        });
    } else {
        firstWindow = createWindow();
    }

    // Start background update checker
    if (firstWindow) {
        setupUpdateChecker(firstWindow);
    }
});

// Mac: open-file event (double-click .md in Finder, drag onto dock icon)
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) {
        createWindow(filePath);
    } else {
        app.whenReady().then(() => createWindow(filePath));
    }
});

// Mac: re-create window when dock icon clicked
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// Quit when all windows closed (except Mac)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
