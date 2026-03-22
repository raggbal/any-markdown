import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FileManager } from './file-manager';
import { SettingsManager } from './settings-manager';
import { generateEditorHtml, generateOutlinerHtml, generateWelcomeHtml, extractToc, writeHtmlToTempFile } from './html-generator';
import { OutlinerFileManager } from './outliner-file-manager';
import { buildMenu } from './menu';
import { setupUpdateChecker, checkForUpdates } from './updater';
import * as chokidar from 'chokidar';

/**
 * Any Markdown — Electron Main Process
 */

const settingsManager = new SettingsManager();
const windows = new Map<BrowserWindow, FileManager>();
const outlinerManagers = new Map<BrowserWindow, OutlinerFileManager>();

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

function fileUri(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/');
    return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
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

// ── Outliner Mode ──

async function loadOutlinerMode(win: BrowserWindow, folderPath: string, openFilePath?: string): Promise<void> {
    // Dispose previous outliner manager if any
    const oldOfm = outlinerManagers.get(win);
    if (oldOfm) {
        oldOfm.flushSave();
        oldOfm.dispose();
    }

    const ofm = new OutlinerFileManager(win, folderPath);
    outlinerManagers.set(win, ofm);

    // Determine which file to open
    let filePath = openFilePath;
    if (!filePath) {
        const files = ofm.listFiles();
        if (files.length > 0) filePath = files[0].filePath;
    }

    let outJson = '';
    if (filePath) {
        const content = ofm.openFile(filePath);
        outJson = content || '';
    }

    const fileList = ofm.listFiles();
    const settings = settingsManager.getAll();
    const html = generateOutlinerHtml(outJson, fileList, ofm.getCurrentFilePath(), {
        theme: settings.theme,
        fontSize: settings.fontSize,
        webviewMessages: getI18nMessages(),
        enableDebugLogging: settings.enableDebugLogging,
        mainFolderPath: folderPath,
        panelCollapsed: settingsManager.get('outlinerPanelCollapsed') || false,
    });
    const tempFile = writeHtmlToTempFile(html);
    await win.loadFile(tempFile);
    if (!app.isPackaged) {
        win.webContents.openDevTools();
    }

    // Track for restore
    settingsManager.set('lastOutlinerFolder', folderPath);
    if (filePath) settingsManager.set('lastOutlinerFile', filePath);
    settingsManager.addRecentFile(folderPath);

    // Store reload function
    (win as any).__loadOutlinerMode = (fp?: string) => loadOutlinerMode(win, folderPath, fp);
    (win as any).__isOutlinerMode = true;
    (win as any).__outlinerFolderPath = folderPath;
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
        // Outliner mode: flush save and close
        const ofm = outlinerManagers.get(win);
        if (ofm) {
            if (ofm.isDirtyState()) {
                e.preventDefault();
                ofm.saveCurrentFileImmediate();
                win.destroy();
            }
            return;
        }
        // Editor mode: dirty check
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
        // Cleanup outliner manager
        const ofm = outlinerManagers.get(win);
        if (ofm) {
            ofm.dispose();
            outlinerManagers.delete(win);
        }
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

ipcMain.on('welcome-open-outliner-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Open Outliner Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return;
    await loadOutlinerMode(win, result.filePaths[0]);
});

ipcMain.on('welcome-create-outliner-folder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select or Create Outliner Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const folderPath = result.filePaths[0];
    // Create an initial .out file
    const tempOfm = new OutlinerFileManager(win, folderPath);
    const filePath = tempOfm.createFile('default');
    tempOfm.dispose();
    await loadOutlinerMode(win, folderPath, filePath);
});

ipcMain.on('editing-state', () => { /* no-op for Electron */ });
ipcMain.on('focus', () => { /* no-op */ });
ipcMain.on('blur', () => { /* no-op */ });

// ── Outliner IPC: Core Data ──

ipcMain.on('outliner-sync-data', (event, json: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (ofm) ofm.saveCurrentFile(json);
});

ipcMain.on('outliner-save', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (ofm) ofm.flushSave();
});

// ── Outliner IPC: Page Operations ──

ipcMain.on('outliner-make-page', (event, _nodeId: string, pageId: string, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    const pagesDir = ofm.getPagesDirPath();
    if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
    const pagePath = path.join(pagesDir, `${pageId}.md`);
    try {
        fs.writeFileSync(pagePath, `# ${title}\n`, 'utf8');
        win.webContents.send('host-message', { type: 'pageCreated', nodeId: _nodeId, pageId });
    } catch (e) {
        console.error('[outliner-make-page] Error:', e);
    }
});

ipcMain.on('outliner-open-page', (event, _nodeId: string, pageId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    const pagePath = ofm.getPageFilePath(pageId);
    if (fs.existsSync(pagePath)) {
        createWindow(pagePath);
    }
});

ipcMain.on('outliner-remove-page', (event, _nodeId: string, pageId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    const pagePath = ofm.getPageFilePath(pageId);
    if (fs.existsSync(pagePath)) {
        shell.trashItem(pagePath).catch(e => {
            console.error('[outliner-remove-page] Trash error:', e);
            try { fs.unlinkSync(pagePath); } catch { /* ignore */ }
        });
    }
});

ipcMain.on('outliner-set-page-dir', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm || !ofm.getCurrentFilePath()) return;
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Page Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const selectedDir = result.filePaths[0];
    // Update the .out file JSON
    try {
        const content = fs.readFileSync(ofm.getCurrentFilePath()!, 'utf8');
        const data = JSON.parse(content);
        // Store as relative path from .out file location
        const outDir = path.dirname(ofm.getCurrentFilePath()!);
        const relPath = path.relative(outDir, selectedDir);
        data.pageDir = relPath.startsWith('.') ? relPath : './' + relPath;
        const newJson = JSON.stringify(data, null, 2);
        fs.writeFileSync(ofm.getCurrentFilePath()!, newJson, 'utf8');
        win.webContents.send('host-message', { type: 'pageDirChanged', pageDir: data.pageDir });
    } catch (e) {
        console.error('[outliner-set-page-dir] Error:', e);
    }
});

// ── Outliner IPC: Side Panel ──

ipcMain.on('outliner-open-page-in-side-panel', (event, _nodeId: string, pageId: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    const pagePath = ofm.getPageFilePath(pageId);
    if (fs.existsSync(pagePath)) {
        openInSidePanel(win, pagePath);
    }
});

ipcMain.on('outliner-get-side-panel-image-dir', (event, spPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const spDir = path.dirname(spPath);
    const imageDir = path.join(spDir, 'images');
    const docBaseUri = 'file://' + (spDir.startsWith('/') ? '' : '/') + spDir.replace(/\\/g, '/') + '/';
    win.webContents.send('host-message', {
        type: 'sidePanelMessage',
        data: {
            type: 'setImageDir',
            dirPath: imageDir,
            forceRelativePath: true,
            documentBaseUri: docBaseUri,
        }
    });
});

ipcMain.on('outliner-insert-image', async (event, spPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
        properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const srcFile = result.filePaths[0];
    const spDir = path.dirname(spPath);
    const imageDir = path.join(spDir, 'images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
    const fileName = path.basename(srcFile);
    const destPath = path.join(imageDir, fileName);
    try {
        fs.copyFileSync(srcFile, destPath);
        const markdownPath = `images/${fileName}`;
        const displayUri = fileUri(destPath);
        win.webContents.send('host-message', {
            type: 'sidePanelMessage',
            data: { type: 'insertImageHtml', markdownPath, displayUri }
        });
    } catch (e) {
        console.error('[outliner-insert-image] Error:', e);
    }
});

ipcMain.on('outliner-save-image', (event, dataUrl: string, fileName: string, spPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const spDir = path.dirname(spPath);
    const imageDir = path.join(spDir, 'images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
    const name = fileName || generateUniqueFileName(imageDir, 'png');
    const destPath = path.join(imageDir, name);
    try {
        const matches = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
        if (!matches) return;
        fs.writeFileSync(destPath, Buffer.from(matches[1], 'base64'));
        const markdownPath = `images/${name}`;
        const displayUri = fileUri(destPath);
        win.webContents.send('host-message', {
            type: 'sidePanelMessage',
            data: { type: 'insertImageHtml', markdownPath, displayUri }
        });
    } catch (e) {
        console.error('[outliner-save-image] Error:', e);
    }
});

ipcMain.on('outliner-read-insert-image', (event, filePath: string, spPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const spDir = path.dirname(spPath);
    const imageDir = path.join(spDir, 'images');
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
    const fileName = path.basename(filePath);
    const destPath = path.join(imageDir, fileName);
    try {
        fs.copyFileSync(filePath, destPath);
        const markdownPath = `images/${fileName}`;
        const displayUri = fileUri(destPath);
        win.webContents.send('host-message', {
            type: 'sidePanelMessage',
            data: { type: 'insertImageHtml', markdownPath, displayUri }
        });
    } catch (e) {
        console.error('[outliner-read-insert-image] Error:', e);
    }
});

// ── Outliner IPC: Left File Panel ──

ipcMain.on('outliner-list-files', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) { event.returnValue = []; return; }
    const ofm = outlinerManagers.get(win);
    event.returnValue = ofm ? ofm.listFiles() : [];
});

ipcMain.on('outliner-open-file', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    // Flush current file before switching
    ofm.flushSave();
    const content = ofm.openFile(filePath);
    if (content !== null) {
        settingsManager.set('lastOutlinerFile', filePath);
        const data = JSON.parse(content);
        win.webContents.send('outliner-file-list-changed', ofm.listFiles(), filePath);
        win.webContents.send('host-message', { type: 'updateData', data });
    }
});

ipcMain.on('outliner-create-file', (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    ofm.flushSave();
    const filePath = ofm.createFile(title || 'Untitled');
    const content = ofm.openFile(filePath);
    if (content !== null) {
        settingsManager.set('lastOutlinerFile', filePath);
        const data = JSON.parse(content);
        // Notify file list update
        const fileList = ofm.listFiles();
        win.webContents.send('outliner-file-list-changed', fileList, filePath);
        win.webContents.send('host-message', { type: 'updateData', data });
    }
});

ipcMain.on('outliner-delete-file', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    const wasCurrent = ofm.getCurrentFilePath() === filePath;
    ofm.deleteFile(filePath);
    const fileList = ofm.listFiles();
    win.webContents.send('outliner-file-list-changed', fileList);
    if (wasCurrent) {
        if (fileList.length > 0) {
            // Switch to first file
            const content = ofm.openFile(fileList[0].filePath);
            if (content !== null) {
                settingsManager.set('lastOutlinerFile', fileList[0].filePath);
                const data = JSON.parse(content);
                win.webContents.send('outliner-file-list-changed', fileList, fileList[0].filePath);
                win.webContents.send('host-message', { type: 'updateData', data });
            }
        } else {
            // No files left — send empty state
            win.webContents.send('host-message', {
                type: 'updateData',
                data: { title: '', rootIds: [], nodes: {} }
            });
        }
    }
});

ipcMain.on('outliner-rename-title', (event, filePath: string, newTitle: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const ofm = outlinerManagers.get(win);
    if (!ofm) return;
    ofm.renameTitle(filePath, newTitle);
    const fileList = ofm.listFiles();
    win.webContents.send('outliner-file-list-changed', fileList);
});

ipcMain.on('outliner-toggle-panel', (_event, collapsed: boolean) => {
    settingsManager.set('outlinerPanelCollapsed', collapsed);
});

// ── Outliner IPC: File Drop ──

ipcMain.on('file-drop-open', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const lc = filePath.toLowerCase();
    if (lc.endsWith('.out')) {
        const folderPath = path.dirname(filePath);
        loadOutlinerMode(win, folderPath, filePath);
    } else if (lc.endsWith('.md') || lc.endsWith('.markdown')) {
        // Open in new editor window
        createWindow(filePath);
    }
});

// ── Outliner IPC: Side panel image dir (for md mode, reused for insert-image) ──

ipcMain.on('get-side-panel-image-dir', (event, spPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const spDir = path.dirname(spPath);
    const imageDir = path.join(spDir, 'images');
    const docBaseUri = 'file://' + (spDir.startsWith('/') ? '' : '/') + spDir.replace(/\\/g, '/') + '/';
    win.webContents.send('host-message', {
        type: 'sidePanelMessage',
        data: {
            type: 'setImageDir',
            dirPath: imageDir,
            forceRelativePath: settingsManager.get('forceRelativeImagePath'),
            documentBaseUri: docBaseUri,
        }
    });
});

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
    // Reload outliner windows
    for (const [win, ofm] of outlinerManagers) {
        if (win.isDestroyed()) continue;
        try {
            ofm.flushSave();
            const reloadFn = (win as any).__loadOutlinerMode;
            if (reloadFn) {
                await reloadFn(ofm.getCurrentFilePath() || undefined);
            }
        } catch (e) {
            console.error('[settings-save] Failed to reload outliner window:', e);
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
        openOutlinerFolder: async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Open Outliner Folder',
            });
            if (!result.canceled && result.filePaths.length > 0) {
                const w = createWindow();
                loadOutlinerMode(w, result.filePaths[0]);
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
    const mdPaths = process.argv.slice(app.isPackaged ? 1 : 2).filter(
        arg => !arg.startsWith('-') && (arg.endsWith('.md') || arg.endsWith('.markdown'))
    );
    const outPaths = process.argv.slice(app.isPackaged ? 1 : 2).filter(
        arg => !arg.startsWith('-') && arg.endsWith('.out')
    );

    let firstWindow: BrowserWindow | undefined;
    if (mdPaths.length > 0) {
        mdPaths.forEach(fp => {
            const w = createWindow(path.resolve(fp));
            if (!firstWindow) firstWindow = w;
        });
    }
    if (outPaths.length > 0) {
        outPaths.forEach(fp => {
            const resolved = path.resolve(fp);
            const w = createWindow(); // create window first (welcome screen)
            if (!firstWindow) firstWindow = w;
            loadOutlinerMode(w, path.dirname(resolved), resolved);
        });
    }
    if (!firstWindow) {
        // No files specified — check for last outliner folder to restore
        const lastFolder = settingsManager.get('lastOutlinerFolder');
        const lastFile = settingsManager.get('lastOutlinerFile');
        if (lastFolder && fs.existsSync(lastFolder)) {
            firstWindow = createWindow();
            loadOutlinerMode(firstWindow, lastFolder, lastFile && fs.existsSync(lastFile) ? lastFile : undefined);
        } else {
            firstWindow = createWindow();
        }
    }

    // Start background update checker
    if (firstWindow) {
        setupUpdateChecker(firstWindow);
    }
});

// Mac: open-file event (double-click .md/.out in Finder, drag onto dock icon)
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    const openIt = () => {
        if (filePath.endsWith('.out')) {
            const w = createWindow();
            loadOutlinerMode(w, path.dirname(filePath), filePath);
        } else {
            createWindow(filePath);
        }
    };
    if (app.isReady()) {
        openIt();
    } else {
        app.whenReady().then(openIt);
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
