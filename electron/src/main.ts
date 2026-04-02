import { app, BrowserWindow, ipcMain, dialog, Menu, shell, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FileManager } from './file-manager';
import { SettingsManager } from './settings-manager';
import { generateEditorHtml, generateOutlinerHtml, generateWelcomeHtml, extractToc, writeHtmlToTempFile } from './html-generator';
import { buildMenu } from './menu';
import { setupUpdateChecker, checkForUpdates } from './updater';
import * as chokidar from 'chokidar';

/**
 * Fractal — Electron Main Process
 */

const settingsManager = new SettingsManager();
const windows = new Map<BrowserWindow, FileManager>();

// ── Shared module loading ──

function getSharedModulePath(relativePath: string): string {
    // Dev: project root / relativePath
    const devPath = path.join(__dirname, '..', '..', relativePath);
    if (fs.existsSync(devPath)) return devPath;
    // Packaged: resourcesPath / relativePath
    const resPath = process.resourcesPath || '';
    const prodPath = path.join(resPath, relativePath);
    if (fs.existsSync(prodPath)) return prodPath;
    console.error(`[main] Shared module NOT FOUND: ${relativePath}`);
    return devPath; // fallback
}

// Load shared NotesFileManager and handleNotesMessage at startup
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { NotesFileManager } = require(getSharedModulePath('out/shared/notes-file-manager.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { handleNotesMessage } = require(getSharedModulePath('out/shared/notes-message-handler.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { s3Sync: s3SyncFn, s3RemoteDeleteAndUpload: s3RemoteDeleteAndUploadFn, s3LocalDeleteAndDownload: s3LocalDeleteAndDownloadFn } = require(getSharedModulePath('out/notes-s3-sync.js'));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { importMdFiles } = require(getSharedModulePath('out/shared/markdown-import.js'));

// NotesFileManager instances per window
const notesManagers = new Map<BrowserWindow, InstanceType<typeof NotesFileManager>>();

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

/** .md/.markdown ファイルをサイドパネルで開く */
function openInSidePanel(win: BrowserWindow, resolvedPath: string): void {
    try {
        const content = fs.readFileSync(resolvedPath, 'utf8');
        const fileName = path.basename(resolvedPath);
        const fileDir = path.dirname(resolvedPath);
        const toc = extractToc(content);
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

    const tryPaths = [
        path.join(__dirname, '..', '..', 'out', 'locales', `${localeKey}.js`),
        path.join(process.resourcesPath || '', 'locales', `${localeKey}.js`),
    ];

    for (const p of tryPaths) {
        if (fs.existsSync(p)) {
            try {
                delete require.cache[require.resolve(p)];
                const mod = require(p);
                if (mod.webviewMessages) {
                    console.log(`[i18n] Loaded ${localeKey} from ${p}`);
                    return mod.webviewMessages;
                }
            } catch (e) {
                console.error(`[i18n] Failed to load ${p}:`, e);
            }
        }
    }

    // Fallback to English if requested locale not found
    if (localeKey !== 'en') {
        console.log(`[i18n] No locale found for ${localeKey}, falling back to English`);
        const enPaths = [
            path.join(__dirname, '..', '..', 'out', 'locales', 'en.js'),
            path.join(process.resourcesPath || '', 'locales', 'en.js'),
        ];
        for (const p of enPaths) {
            if (fs.existsSync(p)) {
                try {
                    delete require.cache[require.resolve(p)];
                    const mod = require(p);
                    if (mod.webviewMessages) {
                        console.log(`[i18n] Loaded English fallback from ${p}`);
                        return mod.webviewMessages;
                    }
                } catch (e) {
                    console.error(`[i18n] Failed to load English fallback ${p}:`, e);
                }
            }
        }
    }

    console.log(`[i18n] No locale found for ${localeKey}, using empty`);
    return {};
}

// ── Notes Platform Actions (Electron implementation) ──

function createNotesSender(win: BrowserWindow): { postMessage: (msg: unknown) => void } {
    return {
        postMessage: (msg: unknown) => {
            if (!win.isDestroyed()) {
                win.webContents.send('host-message', msg);
            }
        }
    };
}

function createNotesPlatformActions(win: BrowserWindow): Record<string, unknown> {
    const sender: S3Sender = {
        postMessage: (message: unknown) => {
            if (!win.isDestroyed()) win.webContents.send('host-message', message);
        }
    };
    return {
        openExternalLink: (href: string) => {
            if (href.startsWith('http://') || href.startsWith('https://')) {
                shell.openExternal(href);
            }
        },
        openFileInEditor: (filePath: string) => {
            createWindow(filePath);
        },
        openPageInSidePanel: (filePath: string, _lineNumber?: number) => {
            if (fs.existsSync(filePath)) {
                openInSidePanel(win, filePath);
            }
        },
        requestInsertImage: async (sidePanelFilePath: string) => {
            const result = await dialog.showOpenDialog(win, {
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }],
                properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0) return;
            const srcFile = result.filePaths[0];
            const spDir = path.dirname(sidePanelFilePath);
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
                console.error('[notes-insert-image] Error:', e);
            }
        },
        savePanelCollapsed: (collapsed: boolean) => {
            settingsManager.set('outlinerPanelCollapsed', collapsed);
        },
        requestSetPageDir: async () => {
            const nfm = notesManagers.get(win);
            if (!nfm || !nfm.getCurrentFilePath()) return;
            const result = await dialog.showOpenDialog(win, {
                properties: ['openDirectory'],
                title: 'Select Page Directory',
            });
            if (result.canceled || result.filePaths.length === 0) return;
            const selectedDir = result.filePaths[0];
            try {
                const content = fs.readFileSync(nfm.getCurrentFilePath()!, 'utf8');
                const data = JSON.parse(content);
                const outDir = path.dirname(nfm.getCurrentFilePath()!);
                const relPath = path.relative(outDir, selectedDir);
                data.pageDir = relPath.startsWith('.') ? relPath : './' + relPath;
                const newJson = JSON.stringify(data, null, 2);
                fs.writeFileSync(nfm.getCurrentFilePath()!, newJson, 'utf8');
                win.webContents.send('host-message', { type: 'pageDirChanged', pageDir: data.pageDir });
            } catch (e) {
                console.error('[notes-set-page-dir] Error:', e);
            }
        },
        saveImageToDir: (dataUrl: string, fileName: string, sidePanelFilePath: string) => {
            const spDir = path.dirname(sidePanelFilePath);
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
                console.error('[notes-save-image] Error:', e);
            }
        },
        readAndInsertImage: (filePath: string, sidePanelFilePath: string) => {
            const spDir = path.dirname(sidePanelFilePath);
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
                console.error('[notes-read-insert-image] Error:', e);
            }
        },
        sendSidePanelImageDir: (sidePanelFilePath: string) => {
            const spDir = path.dirname(sidePanelFilePath);
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
        },
        saveSidePanelFile: async (filePath: string, content: string) => {
            const state = sidePanelWatchers.get(win);
            if (state) state.isOwnWrite = true;
            try {
                fs.writeFileSync(filePath, content, 'utf8');
            } catch (e) {
                console.error('[notes-save-side-panel-file] Error:', e);
            }
            if (state) setTimeout(() => { state.isOwnWrite = false; }, 200);
        },
        handleSidePanelOpenLink: (href: string, sidePanelFilePath: string) => {
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
        },
        handleSidePanelClosed: () => {
            disposeSidePanelWatcher(win);
        },
        openFileExternal: (filePath: string) => {
            shell.openPath(filePath);
        },
        saveLastOpenedFile: (filePath: string) => {
            settingsManager.set('lastOutlinerFile', filePath);
        },
        searchFiles: (query: string) => {
            // Legacy search — not used for Notes search (which uses notesSearch message)
            const fm = windows.get(win);
            const docDir = fm?.getDocumentDir() || process.cwd();
            const results = FileManager.searchMdFiles(docDir, query, 10);
            win.webContents.send('host-message', {
                type: 'fileSearchResults', results, query
            });
        },
        openInTextEditor: () => {
            const nfm = notesManagers.get(win);
            const fp = nfm?.getCurrentFilePath();
            if (fp) shell.openPath(fp);
        },
        copyFilePath: () => {
            const nfm = notesManagers.get(win);
            const fp = nfm?.getCurrentFilePath();
            if (fp) clipboard.writeText(fp);
        },
        copyPagePaths: (paths: string[]) => {
            clipboard.writeText(paths.join('\n'));
        },
        saveOutlinerImage: (nodeId: string, dataUrl: string, fileName: string | null) => {
            const nfm = notesManagers.get(win);
            if (!nfm) return;
            const pagesDir = nfm.getPagesDirPath();
            const imagesDir = path.join(pagesDir, 'images');
            if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
            let imgFileName = fileName;
            if (!imgFileName) {
                const extMatch = dataUrl.match(/^data:image\/(\w+);/);
                const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
                imgFileName = `image_${Date.now()}.${ext}`;
            }
            const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
            const destPath = path.join(imagesDir, imgFileName);
            fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
            const outFilePath = nfm.getCurrentFilePath();
            const outDir = outFilePath ? path.dirname(outFilePath) : nfm.getMainFolderPath();
            const relativePath = path.relative(outDir, destPath).replace(/\\/g, '/');
            const displayUri = fileUri(destPath);
            win.webContents.send('host-message', {
                type: 'outlinerImageSaved',
                nodeId,
                imagePath: relativePath,
                displayUri,
            });
        },
        importMdFilesDialog: async (targetNodeId: string | null, senderRef: { postMessage: (msg: unknown) => void }) => {
            try {
                const nfm = notesManagers.get(win);
                if (!nfm) return;
                const result = await dialog.showOpenDialog(win, {
                    properties: ['openFile', 'multiSelections'],
                    filters: [{ name: 'Markdown', extensions: ['md'] }],
                    title: 'Import .md files',
                });
                if (result.canceled || result.filePaths.length === 0) return;
                const filePaths = result.filePaths.sort();
                const pagesDir = nfm.getPagesDirPath();
                const imageDir = path.join(pagesDir, 'images');
                const results = importMdFiles(filePaths, pagesDir, imageDir);
                senderRef.postMessage({
                    type: 'importMdFilesResult',
                    results,
                    targetNodeId,
                    position: 'after',
                });
            } catch (e) {
                console.error('[importMdFilesDialog] Error:', e);
            }
        },
        // S3 Sync
        s3Sync: (bucketPath: string) => {
            runElectronS3Operation('s3Sync', bucketPath, win, sender);
        },
        s3RemoteDeleteAndUpload: (bucketPath: string) => {
            runElectronS3Operation('s3RemoteDeleteAndUpload', bucketPath, win, sender);
        },
        s3LocalDeleteAndDownload: (bucketPath: string) => {
            runElectronS3Operation('s3LocalDeleteAndDownload', bucketPath, win, sender);
        },
        s3GetStatus: () => {
            const nfm = notesManagers.get(win);
            if (!nfm) return;
            const bucketPath = nfm.getS3BucketPath() || '';
            const accessKey = settingsManager.get('s3AccessKeyId') || '';
            const secretKey = settingsManager.get('s3SecretAccessKey') || '';
            const hasCredentials = !!(accessKey && secretKey);
            sender.postMessage({
                type: 'notesS3Status',
                bucketPath,
                hasCredentials,
                region: settingsManager.get('s3Region') || 'us-east-1',
            });
        },
    };
}

// ── S3 Sync Helper ──

interface S3Sender { postMessage(message: unknown): void; }

async function runElectronS3Operation(
    op: 's3Sync' | 's3RemoteDeleteAndUpload' | 's3LocalDeleteAndDownload',
    bucketPath: string,
    win: BrowserWindow,
    sender: S3Sender,
): Promise<void> {
    const nfm = notesManagers.get(win);
    if (!nfm) return;
    nfm.flushSave();

    const accessKeyId = settingsManager.get('s3AccessKeyId') || '';
    const secretAccessKey = settingsManager.get('s3SecretAccessKey') || '';
    const region = settingsManager.get('s3Region') || 'us-east-1';
    if (!accessKeyId || !secretAccessKey) {
        sender.postMessage({ type: 'notesS3Progress', phase: 'error', message: 'AWS credentials not configured. Set them in Preferences.' });
        return;
    }

    const folderPath = (win as any).__outlinerFolderPath;
    if (!folderPath) return;

    const config = { accessKeyId, secretAccessKey, region, bucketPath, localPath: folderPath };
    const onProgress = (p: { phase: string; message: string; currentFile?: string; filesProcessed?: number }) => {
        sender.postMessage({ type: 'notesS3Progress', ...p });
    };

    try {
        if (op === 's3Sync') {
            await s3SyncFn(config, onProgress);
        } else if (op === 's3RemoteDeleteAndUpload') {
            await s3RemoteDeleteAndUploadFn(config, onProgress);
        } else {
            await s3LocalDeleteAndDownloadFn(config, onProgress);
            sender.postMessage({ type: 'notesS3Progress', phase: 'complete', message: 'Local delete & download complete. Reopening...' });
            await loadOutlinerMode(win, folderPath);
            return;
        }
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        sender.postMessage({ type: 'notesS3Progress', phase: 'error', message });
    }
}

// ── Outliner Mode ──

async function loadOutlinerMode(win: BrowserWindow, folderPath: string, openFilePath?: string, opts?: { folderPanelEnabled?: boolean }): Promise<void> {
    // Dispose previous notes manager if any
    const oldNfm = notesManagers.get(win);
    if (oldNfm) {
        oldNfm.flushSave();
        oldNfm.dispose();
    }

    const nfm = new NotesFileManager(folderPath);
    notesManagers.set(win, nfm);

    // Load structure (creates outline.note if needed)
    const structure = nfm.loadStructure();

    // Determine which file to open
    let filePath = openFilePath;
    if (!filePath) {
        const firstId = nfm.findFirstFileId();
        if (firstId) {
            filePath = nfm.getFilePathById(firstId);
        }
    }

    let outJson = '';
    if (filePath) {
        const content = nfm.openFile(filePath);
        outJson = content || '';
    }

    const fileList = nfm.listFiles();
    const panelWidth = structure.panelWidth || undefined;
    const useFolderPanel = opts?.folderPanelEnabled ?? (win as any).__folderPanelEnabled ?? false;
    const settings = settingsManager.getAll();
    const outDir = filePath ? path.dirname(filePath) : folderPath;
    const docBaseUri = 'file://' + (outDir.startsWith('/') ? '' : '/') + outDir.replace(/\\/g, '/') + '/';
    const html = generateOutlinerHtml(outJson, fileList, nfm.getCurrentFilePath(), {
        theme: settings.theme,
        fontSize: settings.fontSize,
        webviewMessages: getI18nMessages(),
        enableDebugLogging: settings.enableDebugLogging,
        mainFolderPath: folderPath,
        panelCollapsed: settingsManager.get('outlinerPanelCollapsed') || false,
        structure: structure,
        panelWidth: panelWidth,
        fileChangeId: nfm.getFileChangeId(),
        outlinerPageTitle: settings.outlinerPageTitle !== false,
        folderPanelEnabled: useFolderPanel,
        documentBaseUri: docBaseUri,
    });
    const tempFile = writeHtmlToTempFile(html);
    await win.loadFile(tempFile);
    if (!app.isPackaged) {
        win.webContents.openDevTools();
    }

    // Track for restore
    settingsManager.set('lastOutlinerFolder', folderPath);
    settingsManager.set('lastSelectedNoteFolder', folderPath);
    if (filePath) settingsManager.set('lastOutlinerFile', filePath);
    settingsManager.addRecentFile(folderPath);

    // Store reload function & flags
    (win as any).__loadOutlinerMode = (fp?: string) => loadOutlinerMode(win, folderPath, fp, { folderPanelEnabled: useFolderPanel });
    (win as any).__isOutlinerMode = true;
    (win as any).__outlinerFolderPath = folderPath;
    (win as any).__folderPanelEnabled = useFolderPanel;
}

// ── Notes Mode (with Folder Panel) ──

async function loadNotesMode(win: BrowserWindow): Promise<void> {
    const folders: string[] = (settingsManager.get('notesFolders') || []).filter((f: string) => fs.existsSync(f));
    const lastFolder = settingsManager.get('lastSelectedNoteFolder') || settingsManager.get('lastOutlinerFolder') || '';
    let targetFolder: string | null = null;

    if (lastFolder && fs.existsSync(lastFolder)) {
        // Ensure it's in the folder list
        if (!folders.includes(lastFolder)) {
            folders.push(lastFolder);
            settingsManager.set('notesFolders', folders);
        }
        targetFolder = lastFolder;
    } else if (folders.length > 0) {
        targetFolder = folders[0];
    }

    if (targetFolder) {
        await loadOutlinerMode(win, targetFolder, undefined, { folderPanelEnabled: true });
    } else {
        // No folders registered — show empty notes mode with folder panel
        await loadEmptyNotesMode(win);
    }
}

async function loadEmptyNotesMode(win: BrowserWindow): Promise<void> {
    const settings = settingsManager.getAll();
    const emptyJson = '{"version":1,"rootIds":[],"nodes":{}}';
    const html = generateOutlinerHtml(emptyJson, [], null, {
        theme: settings.theme,
        fontSize: settings.fontSize,
        webviewMessages: getI18nMessages(),
        enableDebugLogging: settings.enableDebugLogging,
        mainFolderPath: '',
        panelCollapsed: false,
        structure: null,
        panelWidth: undefined,
        fileChangeId: 0,
        outlinerPageTitle: settings.outlinerPageTitle !== false,
        folderPanelEnabled: true,
        documentBaseUri: '',
    });
    const tempFile = writeHtmlToTempFile(html);
    await win.loadFile(tempFile);
    if (!app.isPackaged) {
        win.webContents.openDevTools();
    }
    (win as any).__isOutlinerMode = true;
    (win as any).__folderPanelEnabled = true;
    (win as any).__loadOutlinerMode = undefined;
}

// ── Folder Panel Helpers ──

function sendFolderUpdate(win: BrowserWindow): void {
    const folders: string[] = (settingsManager.get('notesFolders') || []).filter((f: string) => fs.existsSync(f));
    const mapped = folders.map((f: string) => ({ path: f, name: path.basename(f) }));
    const active = settingsManager.get('lastSelectedNoteFolder') || null;
    win.webContents.send('folder-panel-update', mapped, active);
}

function createWindow(filePath?: string): BrowserWindow {
    const bounds = settingsManager.get('windowBounds');
    const win = new BrowserWindow({
        width: bounds?.width || 900,
        height: bounds?.height || 700,
        x: bounds?.x,
        y: bounds?.y,
        title: 'Fractal',
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
        if (level >= 2) {
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
        const settings = settingsManager.getAll();
        const welcomeHtml = generateWelcomeHtml(settings.theme);
        const tempFile = writeHtmlToTempFile(welcomeHtml);
        win.loadFile(tempFile);
    }

    // Close handling
    win.on('close', async (e) => {
        // Outliner mode: flush save and close
        const nfm = notesManagers.get(win);
        if (nfm) {
            if (nfm.isDirtyState()) {
                e.preventDefault();
                nfm.saveCurrentFileImmediate();
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
        }
    });

    win.on('closed', () => {
        disposeSidePanelWatcher(win);
        // Cleanup notes manager
        const nfm = notesManagers.get(win);
        if (nfm) {
            nfm.dispose();
            notesManagers.delete(win);
        }
        fileManager.dispose();
        windows.delete(win);
    });

    // Store function for reload (settings change)
    (win as any).__loadContent = loadContent;
    (win as any).__fileManager = fileManager;

    return win;
}

// ── IPC Handlers (Editor Mode) ──

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
        const linkOpenMode = settingsManager.get('linkOpenMode') || 'sidePanel';
        if (linkOpenMode === 'tab') {
            createWindow(resolvedPath);
        } else {
            openInSidePanel(win, resolvedPath);
        }
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

ipcMain.on('copy-file-path', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const fm = windows.get(win);
    if (fm) {
        const filePath = fm.getFilePath();
        if (filePath) {
            clipboard.writeText(filePath);
        }
    }
});

// ── Side Panel IPC (Editor Mode) ──

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

ipcMain.on('welcome-open-notes', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    await loadNotesMode(win);
});

// ── Folder Panel IPC ──

ipcMain.on('folder-panel-init', (event) => {
    const folders: string[] = (settingsManager.get('notesFolders') || [])
        .filter((f: string) => fs.existsSync(f));
    const mapped = folders.map((f: string) => ({ path: f, name: path.basename(f) }));
    const activeFolder = settingsManager.get('lastSelectedNoteFolder') || null;
    const collapsed = settingsManager.get('folderPanelCollapsed') || false;
    event.returnValue = { folders: mapped, activeFolder, collapsed };
});

ipcMain.on('folder-panel-add', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        title: 'Select Notes Folder',
    });
    if (result.canceled || result.filePaths.length === 0) return;
    const folderPath = result.filePaths[0];
    const folders: string[] = settingsManager.get('notesFolders') || [];
    if (!folders.includes(folderPath)) {
        folders.push(folderPath);
        settingsManager.set('notesFolders', folders);
    }
    // Auto-select and load the added folder
    await loadOutlinerMode(win, folderPath, undefined, { folderPanelEnabled: true });
    sendFolderUpdate(win);
});

ipcMain.on('folder-panel-remove', (event, folderPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const folders: string[] = settingsManager.get('notesFolders') || [];
    const idx = folders.indexOf(folderPath);
    if (idx >= 0) {
        folders.splice(idx, 1);
        settingsManager.set('notesFolders', folders);
    }
    const active = settingsManager.get('lastSelectedNoteFolder');
    if (active === folderPath) {
        const remaining = folders.filter((f: string) => fs.existsSync(f));
        if (remaining.length > 0) {
            loadOutlinerMode(win, remaining[0], undefined, { folderPanelEnabled: true });
        } else {
            settingsManager.set('lastSelectedNoteFolder', '');
            loadEmptyNotesMode(win);
        }
    }
    sendFolderUpdate(win);
});

ipcMain.on('folder-panel-select', async (event, folderPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    if (!fs.existsSync(folderPath)) return;
    // Flush current before switching
    const oldNfm = notesManagers.get(win);
    if (oldNfm) oldNfm.flushSave();
    await loadOutlinerMode(win, folderPath, undefined, { folderPanelEnabled: true });
    sendFolderUpdate(win);
});

ipcMain.on('folder-panel-state', (_event, collapsed: boolean) => {
    settingsManager.set('folderPanelCollapsed', collapsed);
});

ipcMain.on('editing-state', () => { /* no-op for Electron */ });
ipcMain.on('focus', () => { /* no-op */ });
ipcMain.on('blur', () => { /* no-op */ });

// ── Notes Message Handler (unified IPC for outliner mode) ──

ipcMain.on('notes-message', (event, message: any) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const nfm = notesManagers.get(win);
    if (!nfm) return;

    const sender = createNotesSender(win);
    const platform = createNotesPlatformActions(win);
    handleNotesMessage(message, nfm, sender, platform);
});

// ── File Drop IPC ──

ipcMain.on('file-drop-open', (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    const lc = filePath.toLowerCase();
    if (lc.endsWith('.out')) {
        const folderPath = path.dirname(filePath);
        loadOutlinerMode(win, folderPath, filePath);
    } else if (lc.endsWith('.md') || lc.endsWith('.markdown')) {
        createWindow(filePath);
    }
});

// ── Side panel image dir (for md mode) ──

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
    for (const [win, nfm] of notesManagers) {
        if (win.isDestroyed()) continue;
        try {
            nfm.flushSave();
            const reloadFn = (win as any).__loadOutlinerMode;
            if (reloadFn) {
                await reloadFn(nfm.getCurrentFilePath() || undefined);
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
        openNotes: async () => {
            const w = createWindow();
            await loadNotesMode(w);
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
            const w = createWindow();
            if (!firstWindow) firstWindow = w;
            loadOutlinerMode(w, path.dirname(resolved), resolved);
        });
    }
    if (!firstWindow) {
        // No files specified — restore Notes mode if previously used
        const notesFolders: string[] = settingsManager.get('notesFolders') || [];
        const lastFolder = settingsManager.get('lastSelectedNoteFolder') || settingsManager.get('lastOutlinerFolder') || '';
        if (lastFolder && fs.existsSync(lastFolder)) {
            // Ensure folder is in the list
            if (!notesFolders.includes(lastFolder)) {
                notesFolders.push(lastFolder);
                settingsManager.set('notesFolders', notesFolders);
            }
            firstWindow = createWindow();
            loadNotesMode(firstWindow);
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
