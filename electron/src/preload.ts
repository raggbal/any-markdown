import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script: contextBridge で window.hostBridge を公開
 * editor.js が期待する HostBridge インターフェースをそのまま提供
 */
contextBridge.exposeInMainWorld('hostBridge', {
    syncContent: (markdown: string) => ipcRenderer.send('sync-content', markdown),
    save: () => ipcRenderer.send('save'),
    reportEditingState: (editing: boolean) => ipcRenderer.send('editing-state', editing),
    reportFocus: () => ipcRenderer.send('focus'),
    reportBlur: () => ipcRenderer.send('blur'),
    openLink: (href: string) => ipcRenderer.send('open-link', href),
    requestInsertLink: (text: string) => ipcRenderer.send('insert-link', text),
    requestInsertImage: (sidePanelFilePath?: string) => ipcRenderer.send('insert-image', sidePanelFilePath),
    requestSetImageDir: (sidePanelFilePath?: string) => ipcRenderer.send('set-image-dir', sidePanelFilePath),
    saveImageAndInsert: (dataUrl: string, fileName?: string, sidePanelFilePath?: string) =>
        ipcRenderer.send('save-image', dataUrl, fileName, sidePanelFilePath),
    readAndInsertImage: (filePath: string, sidePanelFilePath?: string) =>
        ipcRenderer.send('read-insert-image', filePath, sidePanelFilePath),
    openInTextEditor: () => ipcRenderer.send('open-in-text-editor'),
    sendToChat: () => { /* no-op in Electron */ },

    // Side Panel
    openLinkInTab: (href: string) => ipcRenderer.send('open-link-in-tab', href),
    saveSidePanelFile: (filePath: string, content: string) =>
        ipcRenderer.send('save-side-panel-file', filePath, content),
    sidePanelOpenLink: (href: string, sidePanelFilePath: string) =>
        ipcRenderer.send('side-panel-open-link', href, sidePanelFilePath),
    notifySidePanelClosed: () => ipcRenderer.send('side-panel-closed'),
    getSidePanelImageDir: (sidePanelFilePath: string) =>
        ipcRenderer.send('get-side-panel-image-dir', sidePanelFilePath),

    // Action Panel
    searchFiles: (query: string) => ipcRenderer.send('search-files', query),
    createPageAtPath: (relativePath: string) => ipcRenderer.send('create-page-at-path', relativePath),
    createPageAuto: () => ipcRenderer.send('create-page-auto'),
    updatePageH1: (relativePath: string, h1Text: string) =>
        ipcRenderer.send('update-page-h1', relativePath, h1Text),

    onMessage: (handler: (message: unknown) => void) => {
        ipcRenderer.on('host-message', (_event, message) => handler(message));
    },
});

// Welcome screen bridge (separate from hostBridge)
contextBridge.exposeInMainWorld('welcomeBridge', {
    openFile: () => ipcRenderer.send('welcome-open-file'),
    createFile: () => ipcRenderer.send('welcome-create-file'),
    openRecent: (filePath: string) => ipcRenderer.send('welcome-open-recent', filePath),
    getRecentFiles: () => ipcRenderer.sendSync('welcome-get-recent-files'),
    openOutlinerFolder: () => ipcRenderer.send('welcome-open-outliner-folder'),
    createOutlinerFolder: () => ipcRenderer.send('welcome-create-outliner-folder'),
});

// ── fileChangeId tracking (for stale syncData prevention) ──
let currentFileChangeId = 0;
ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
    const msg = message as Record<string, unknown>;
    if (msg && msg.type === 'updateData' && msg.fileChangeId !== undefined) {
        currentFileChangeId = msg.fileChangeId as number;
    }
});

// ── Outliner flush helper ──
// notes-host-bridge.js calls Outliner.flushSync() before file switches.
// In Electron preload, we can't call into the renderer's Outliner object directly,
// but the notes-message handler on the main process calls fileManager.flushSave()
// before file switches, so this is handled server-side.

/**
 * Outliner host bridge (outliner.js expects window.outlinerHostBridge)
 * Sends messages through 'notes-message' IPC channel to be handled
 * by handleNotesMessage() in main process.
 */
contextBridge.exposeInMainWorld('outlinerHostBridge', {
    // Data sync
    syncData: (json: string) => ipcRenderer.send('notes-message', {
        type: 'syncData', content: json, fileChangeId: currentFileChangeId
    }),
    save: () => ipcRenderer.send('notes-message', { type: 'save' }),

    // Page operations
    makePage: (nodeId: string, pageId: string, title: string) =>
        ipcRenderer.send('notes-message', { type: 'makePage', nodeId, pageId, title }),
    openPage: (_nodeId: string, pageId: string) =>
        ipcRenderer.send('notes-message', { type: 'openPage', pageId }),
    removePage: (_nodeId: string, pageId: string) =>
        ipcRenderer.send('notes-message', { type: 'removePage', pageId }),
    setPageDir: () => ipcRenderer.send('notes-message', { type: 'setPageDir' }),
    openPageInSidePanel: (_nodeId: string, pageId: string) =>
        ipcRenderer.send('notes-message', { type: 'openPageInSidePanel', pageId }),

    // Side panel
    saveSidePanelFile: (filePath: string, content: string) =>
        ipcRenderer.send('notes-message', { type: 'saveSidePanelFile', filePath, content }),
    notifySidePanelClosed: () =>
        ipcRenderer.send('notes-message', { type: 'sidePanelClosed' }),
    sidePanelOpenLink: (href: string, spPath: string) =>
        ipcRenderer.send('notes-message', { type: 'sidePanelOpenLink', href, sidePanelFilePath: spPath }),
    openLinkInTab: (href: string) =>
        ipcRenderer.send('notes-message', { type: 'openLinkInTab', href }),
    getSidePanelImageDir: (spPath: string) =>
        ipcRenderer.send('notes-message', { type: 'getSidePanelImageDir', sidePanelFilePath: spPath }),
    requestInsertImage: (spPath: string) =>
        ipcRenderer.send('notes-message', { type: 'insertImage', sidePanelFilePath: spPath }),
    requestSetImageDir: (_spPath: string) => { /* no-op in outliner */ },
    saveImageAndInsert: (dataUrl: string, fileName: string, spPath: string) =>
        ipcRenderer.send('notes-message', { type: 'saveImageAndInsert', dataUrl, fileName, sidePanelFilePath: spPath }),
    readAndInsertImage: (filePath: string, spPath: string) =>
        ipcRenderer.send('notes-message', { type: 'readAndInsertImage', filePath, sidePanelFilePath: spPath }),
    searchFiles: (query: string) => ipcRenderer.send('search-files', query),

    // No-ops (called by EditorInstance in side panel but not needed in outliner)
    createPageAtPath: () => {},
    createPageAuto: () => {},
    updatePageH1: () => {},

    // Daily Notes navigation (called by outliner.js)
    postDailyNotes: (type: string, dayOffset: unknown, currentDate?: string) => {
        // Flush outliner sync before navigation
        ipcRenderer.send('notes-message', { type: 'save' });
        if (type === 'notesNavigateToDate') {
            ipcRenderer.send('notes-message', { type: 'notesNavigateToDate', targetDate: dayOffset });
        } else {
            ipcRenderer.send('notes-message', { type, dayOffset: dayOffset || 0, currentDate: currentDate || null });
        }
    },

    // Links & focus
    openLink: (href: string) => ipcRenderer.send('notes-message', { type: 'openLink', href }),
    reportFocus: () => ipcRenderer.send('notes-message', { type: 'webviewFocus' }),
    reportBlur: () => ipcRenderer.send('notes-message', { type: 'webviewBlur' }),

    // Host message receiver
    onMessage: (handler: (message: unknown) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => handler(message));
    },
});

/**
 * Notes file panel bridge (notes-file-panel.js expects window.notesHostBridge)
 * Mirrors the interface defined in notes-host-bridge.js but uses Electron IPC.
 */
contextBridge.exposeInMainWorld('notesHostBridge', {
    // File operations
    openFile: (filePath: string) => {
        // Flush outliner sync before file switch
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesOpenFile', filePath });
    },
    createFile: (title: string, parentId?: string) =>
        ipcRenderer.send('notes-message', { type: 'notesCreateFile', title, parentId: parentId || null }),
    deleteFile: (filePath: string) =>
        ipcRenderer.send('notes-message', { type: 'notesDeleteFile', filePath }),
    renameTitle: (filePath: string, newTitle: string) =>
        ipcRenderer.send('notes-message', { type: 'notesRenameTitle', filePath, newTitle }),
    togglePanel: (collapsed: boolean) =>
        ipcRenderer.send('notes-message', { type: 'notesTogglePanel', collapsed }),

    // Folder operations
    createFolder: (title: string, parentId?: string) =>
        ipcRenderer.send('notes-message', { type: 'notesCreateFolder', title, parentId: parentId || null }),
    deleteFolder: (folderId: string) =>
        ipcRenderer.send('notes-message', { type: 'notesDeleteFolder', folderId }),
    renameFolder: (folderId: string, newTitle: string) =>
        ipcRenderer.send('notes-message', { type: 'notesRenameFolder', folderId, newTitle }),
    toggleFolder: (folderId: string) =>
        ipcRenderer.send('notes-message', { type: 'notesToggleFolder', folderId }),

    // D&D move
    moveItem: (itemId: string, targetParentId: string | null, index: number) =>
        ipcRenderer.send('notes-message', { type: 'notesMoveItem', itemId, targetParentId, index }),

    // Daily Notes
    openDailyNotes: () => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesOpenDailyNotes' });
    },
    navigateDailyNotes: (dayOffset: number, currentDate?: string) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesNavigateDailyNotes', dayOffset, currentDate: currentDate || null });
    },

    // Panel width
    savePanelWidth: (width: number) =>
        ipcRenderer.send('notes-message', { type: 'notesSavePanelWidth', width }),

    // Search
    search: (query: string, options: { caseSensitive: boolean; wholeWord: boolean; useRegex: boolean }) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', {
            type: 'notesSearch', query,
            caseSensitive: options.caseSensitive,
            wholeWord: options.wholeWord,
            useRegex: options.useRegex,
        });
    },
    jumpToNode: (fileId: string, nodeId: string) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesJumpToNode', fileId, nodeId });
    },
    jumpToMdPage: (outFileId: string, pageId: string, lineNumber?: number) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesJumpToMdPage', outFileId, pageId, lineNumber });
    },
    openMdFileExternal: (filePath: string) =>
        ipcRenderer.send('notes-message', { type: 'notesOpenMdExternal', filePath }),

    // Search event listeners
    onSearchStart: (handler: (searchId: number, query: string) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
            const msg = message as Record<string, unknown>;
            if (msg && msg.type === 'notesSearchStart') {
                handler(msg.searchId as number, msg.query as string);
            }
        });
    },
    onSearchPartial: (handler: (searchId: number, result: unknown) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
            const msg = message as Record<string, unknown>;
            if (msg && msg.type === 'notesSearchPartial') {
                handler(msg.searchId as number, msg.result);
            }
        });
    },
    onSearchEnd: (handler: (searchId: number) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
            const msg = message as Record<string, unknown>;
            if (msg && msg.type === 'notesSearchEnd') {
                handler(msg.searchId as number);
            }
        });
    },

    // File list changed listener
    onFileListChanged: (handler: (fileList: unknown, currentFile: unknown, structure: unknown) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
            const msg = message as Record<string, unknown>;
            if (msg && msg.type === 'notesFileListChanged') {
                handler(msg.fileList, msg.currentFile, msg.structure);
            }
        });
    },

    // S3 Sync
    s3Sync: (bucketPath: string) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesS3Sync', bucketPath });
    },
    s3RemoteDeleteAndUpload: (bucketPath: string) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesS3RemoteDeleteUpload', bucketPath });
    },
    s3LocalDeleteAndDownload: (bucketPath: string) => {
        ipcRenderer.send('notes-message', { type: 'save' });
        ipcRenderer.send('notes-message', { type: 'notesS3LocalDeleteDownload', bucketPath });
    },
    s3SaveBucketPath: (bucketPath: string) =>
        ipcRenderer.send('notes-message', { type: 'notesS3SaveBucketPath', bucketPath }),
    s3GetStatus: () =>
        ipcRenderer.send('notes-message', { type: 'notesS3GetStatus' }),
    onS3Progress: (handler: (data: unknown) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
            const msg = message as Record<string, unknown>;
            if (msg && msg.type === 'notesS3Progress') {
                handler(msg);
            }
        });
    },
    onS3Status: (handler: (data: unknown) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => {
            const msg = message as Record<string, unknown>;
            if (msg && msg.type === 'notesS3Status') {
                handler(msg);
            }
        });
    },
});

// File drop bridge (shared by all modes)
contextBridge.exposeInMainWorld('fileDrop', {
    open: (filePath: string) => ipcRenderer.send('file-drop-open', filePath),
});
