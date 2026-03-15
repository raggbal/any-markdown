import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FileManager } from './file-manager';
import { SettingsManager } from './settings-manager';
import { generateEditorHtml, generateWelcomeHtml, extractToc, writeHtmlToTempFile } from './html-generator';
import { buildMenu } from './menu';
import { setupUpdateChecker, checkForUpdates } from './updater';
import * as chokidar from 'chokidar';

/**
 * Any Markdown — Electron Main Process
 */

const settingsManager = new SettingsManager();
const windows = new Map<BrowserWindow, FileManager>();

// ── Side Panel File Watcher ──
const sidePanelWatchers = new Map<BrowserWindow, { watcher: chokidar.FSWatcher; filePath: string; isOwnWrite: boolean }>();

function setupSidePanelWatcher(win: BrowserWindow, filePath: string): void {
    disposeSidePanelWatcher(win);
    const state = { watcher: null as unknown as chokidar.FSWatcher, filePath, isOwnWrite: false };
    state.watcher = chokidar.watch(filePath, { persistent: true, ignoreInitial: true });
    state.watcher.on('change', () => {
        if (state.isOwnWrite) return;
        try {
            const newContent = fs.readFileSync(filePath, 'utf8');
            const base64 = Buffer.from(newContent, 'utf8').toString('base64');
            win.webContents.send('host-message', {
                type: 'sidePanelMessage',
                data: { type: 'update', content: base64 }
            });
        } catch (e) {
            console.error('[side-panel-watcher] Error reading file:', e);
        }
    });
    sidePanelWatchers.set(win, state);
}

function disposeSidePanelWatcher(win: BrowserWindow): void {
    const state = sidePanelWatchers.get(win);
    if (state) {
        state.watcher.close();
        sidePanelWatchers.delete(win);
    }
}

function generateUniqueFileName(dir: string, extension: string): string {
    const timestamp = Date.now();
    const baseName = `${timestamp}.${extension}`;
    if (!fs.existsSync(path.join(dir, baseName))) return baseName;
    let counter = 1;
    while (true) {
        const name = `${timestamp}-${counter.toString().padStart(4, '0')}.${extension}`;
        if (!fs.existsSync(path.join(dir, name))) return name;
        counter++;
    }
}

/** サイドパネル用の設定を生成 */

/** .md/.markdown ファイルをサイドパネルで開く */
function openInSidePanel(win: BrowserWindow, resolvedPath: string): void {
    try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const fileName = path.basename(resolvedPath);
        const fileDir = path.dirname(resolvedPath);
        const toc = extractToc(content);
        // Send markdown directly — editor.js creates EditorInstance in same webview
        const documentBaseUri = 'file://' + (fileDir.startsWith('/') ? '' : '/') + fileDir.replace(/\\/g, '/') + '/';
        win.webContents.send('host-message', {
            type: 'openSidePanel',
            markdown: content,
            filePath: resolvedPath,
            fileName: fileName,
            toc: toc,
            documentBaseUri: documentBaseUri
        });
        setupSidePanelWatcher(win, resolvedPath);
    } catch (e) {
        console.error('[open-link] Cannot open file:', resolvedPath, e);
    }
}

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
        // Show welcome screen when no file specified
        const settings = settingsManager.getAll();
        const welcomeHtml = generateWelcomeHtml(settings.theme);
        const tempFile = writeHtmlToTempFile(welcomeHtml);
        win.loadFile(tempFile);
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
        disposeSidePanelWatcher(win);
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

ipcMain.on('open-link', (event, href: string) => {
    if (href.startsWith('http://') || href.startsWith('https://')) {
        shell.openExternal(href);
        return;
    }
    if (href.startsWith('#')) {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) {
            win.webContents.send('host-message', {
                type: 'scrollToAnchor', anchor: href.substring(1)
            });
        }
        return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (!fm) return;
    const docDir = fm.getDocumentDir();
    const resolvedPath = href.startsWith('/') ? href : path.resolve(docDir, href);
    const lc = resolvedPath.toLowerCase();
    if (lc.endsWith('.md') || lc.endsWith('.markdown')) {
        openInSidePanel(win, resolvedPath);
    } else {
        shell.openPath(resolvedPath);
    }
});

ipcMain.on('open-link-in-tab', (event, href: string) => {
    if (href.startsWith('http://') || href.startsWith('https://')) {
        shell.openExternal(href);
    } else {
        const win = BrowserWindow.fromWebContents(event.sender);
        const fm = win ? windows.get(win) : null;
        const docDir = fm?.getDocumentDir() || process.cwd();
        const resolved = href.startsWith('/') ? href : path.resolve(docDir, href);
        createWindow(resolved);
    }
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

// ── Side Panel IPC ──

ipcMain.on('save-side-panel-file', (event, filePath: string, content: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const state = sidePanelWatchers.get(win);
    if (state) state.isOwnWrite = true;
    try {
        fs.writeFileSync(filePath, content, 'utf8');
    } catch (e) {
        console.error('[save-side-panel-file] Error:', e);
    }
    if (state) setTimeout(() => { state.isOwnWrite = false; }, 200);
});

ipcMain.on('side-panel-open-link', (event, href: string, sidePanelFilePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (href.startsWith('http://') || href.startsWith('https://')) {
        shell.openExternal(href);
    } else if (href.startsWith('#')) {
        win.webContents.send('host-message', {
            type: 'sidePanelMessage',
            data: { type: 'scrollToAnchor', anchor: href.substring(1) }
        });
    } else {
        const spDir = path.dirname(sidePanelFilePath);
        const resolvedPath = href.startsWith('/') ? href : path.resolve(spDir, href);
        const lc = resolvedPath.toLowerCase();
        if (lc.endsWith('.md') || lc.endsWith('.markdown')) {
            openInSidePanel(win, resolvedPath);
        } else {
            shell.openPath(resolvedPath);
        }
    }
});

ipcMain.on('side-panel-closed', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) disposeSidePanelWatcher(win);
});

// ── Action Panel IPC ──

ipcMain.on('search-files', (event, query: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (!query || query.length < 1) {
        win.webContents.send('host-message', {
            type: 'fileSearchResults', results: [], query: query || ''
        });
        return;
    }
    const fm = windows.get(win);
    const docDir = fm?.getDocumentDir() || process.cwd();
    const results = FileManager.searchMdFiles(docDir, query, 10);
    win.webContents.send('host-message', {
        type: 'fileSearchResults', results, query
    });
});

ipcMain.on('create-page-at-path', (event, relativePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !relativePath) return;
    const fm = windows.get(win);
    const docDir = fm?.getDocumentDir() || process.cwd();
    let targetPath = relativePath;
    if (!targetPath.endsWith('.md')) targetPath += '.md';
    const absPath = path.resolve(docDir, targetPath);
    try {
        const targetDir = path.dirname(absPath);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        if (!fs.existsSync(absPath)) fs.writeFileSync(absPath, '', 'utf8');
        win.webContents.send('host-message', {
            type: 'pageCreatedAtPath',
            relativePath: path.relative(docDir, absPath).replace(/\\/g, '/')
        });
    } catch (e: any) {
        console.error('[create-page-at-path] Error:', e.message);
    }
});

ipcMain.on('create-page-auto', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    const docDir = fm?.getDocumentDir() || process.cwd();
    const pagesDir = path.join(docDir, 'pages');
    if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
    const fileName = generateUniqueFileName(pagesDir, 'md');
    const absPath = path.join(pagesDir, fileName);
    fs.writeFileSync(absPath, '', 'utf8');
    win.webContents.send('host-message', {
        type: 'pageCreatedAtPath',
        relativePath: path.relative(docDir, absPath).replace(/\\/g, '/')
    });
});

ipcMain.on('update-page-h1', (event, relativePath: string, h1Text: string) => {
    if (!relativePath || !h1Text) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    const docDir = fm?.getDocumentDir() || process.cwd();
    const absPath = path.resolve(docDir, relativePath);
    try {
        if (fs.existsSync(absPath)) fs.writeFileSync(absPath, `# ${h1Text}\n`, 'utf8');
    } catch { /* Silent fail */ }
});

// ── Welcome Screen IPC ──

ipcMain.on('welcome-open-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const fp = result.filePaths[0];
    const fm = windows.get(win);
    if (!fm) return;
    const content = await fm.open(fp);
    if (content !== null) {
        settingsManager.addRecentFile(fp);
        const loadContent = (win as any).__loadContent;
        if (loadContent) await loadContent(content);
    }
});

ipcMain.on('welcome-create-file', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showSaveDialog(win, {
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
        defaultPath: 'untitled.md',
    });
    if (result.canceled || !result.filePath) return;
    const fp = result.filePath;
    if (!fs.existsSync(fp)) fs.writeFileSync(fp, '', 'utf8');
    const fm = windows.get(win);
    if (!fm) return;
    const content = await fm.open(fp);
    if (content !== null) {
        settingsManager.addRecentFile(fp);
        const loadContent = (win as any).__loadContent;
        if (loadContent) await loadContent(content);
    }
});

ipcMain.on('welcome-open-recent', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (!fs.existsSync(filePath)) return;
    const fm = windows.get(win);
    if (!fm) return;
    const content = await fm.open(filePath);
    if (content !== null) {
        settingsManager.addRecentFile(filePath);
        const loadContent = (win as any).__loadContent;
        if (loadContent) await loadContent(content);
    }
});

ipcMain.on('welcome-get-recent-files', (event) => {
    event.returnValue = settingsManager.getRecentFiles();
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
