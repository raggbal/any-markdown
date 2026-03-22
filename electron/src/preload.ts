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

// Outliner host bridge (outliner.js expects window.outlinerHostBridge)
contextBridge.exposeInMainWorld('outlinerHostBridge', {
    // Data sync
    syncData: (json: string) => ipcRenderer.send('outliner-sync-data', json),
    save: () => ipcRenderer.send('outliner-save'),

    // Page operations
    makePage: (nodeId: string, pageId: string, title: string) =>
        ipcRenderer.send('outliner-make-page', nodeId, pageId, title),
    openPage: (nodeId: string, pageId: string) =>
        ipcRenderer.send('outliner-open-page', nodeId, pageId),
    removePage: (nodeId: string, pageId: string) =>
        ipcRenderer.send('outliner-remove-page', nodeId, pageId),
    setPageDir: () => ipcRenderer.send('outliner-set-page-dir'),
    openPageInSidePanel: (nodeId: string, pageId: string) =>
        ipcRenderer.send('outliner-open-page-in-side-panel', nodeId, pageId),

    // Side panel (reuse existing IPC channels)
    saveSidePanelFile: (filePath: string, content: string) =>
        ipcRenderer.send('save-side-panel-file', filePath, content),
    notifySidePanelClosed: () => ipcRenderer.send('side-panel-closed'),
    sidePanelOpenLink: (href: string, spPath: string) =>
        ipcRenderer.send('side-panel-open-link', href, spPath),
    openLinkInTab: (href: string) => ipcRenderer.send('open-link-in-tab', href),
    getSidePanelImageDir: (spPath: string) =>
        ipcRenderer.send('outliner-get-side-panel-image-dir', spPath),
    requestInsertImage: (spPath: string) =>
        ipcRenderer.send('outliner-insert-image', spPath),
    requestSetImageDir: (_spPath: string) => { /* no-op in outliner */ },
    saveImageAndInsert: (dataUrl: string, fileName: string, spPath: string) =>
        ipcRenderer.send('outliner-save-image', dataUrl, fileName, spPath),
    readAndInsertImage: (filePath: string, spPath: string) =>
        ipcRenderer.send('outliner-read-insert-image', filePath, spPath),
    searchFiles: (query: string) => ipcRenderer.send('search-files', query),

    // No-ops (called by EditorInstance in side panel but not needed in outliner)
    createPageAtPath: () => {},
    createPageAuto: () => {},
    updatePageH1: () => {},

    // Links & focus
    openLink: (href: string) => ipcRenderer.send('open-link', href),
    reportFocus: () => ipcRenderer.send('focus'),
    reportBlur: () => ipcRenderer.send('blur'),

    // Host message receiver
    onMessage: (handler: (message: unknown) => void) => {
        ipcRenderer.on('host-message', (_event: unknown, message: unknown) => handler(message));
    },
});

// Left file panel bridge (Electron outliner only)
contextBridge.exposeInMainWorld('outlinerFilePanelBridge', {
    listFiles: () => ipcRenderer.sendSync('outliner-list-files'),
    openFile: (filePath: string) => ipcRenderer.send('outliner-open-file', filePath),
    createFile: (title: string) => ipcRenderer.send('outliner-create-file', title),
    deleteFile: (filePath: string) => ipcRenderer.send('outliner-delete-file', filePath),
    renameTitle: (filePath: string, newTitle: string) =>
        ipcRenderer.send('outliner-rename-title', filePath, newTitle),
    togglePanel: (collapsed: boolean) => ipcRenderer.send('outliner-toggle-panel', collapsed),
    onFileListChanged: (handler: (list: unknown, currentFilePath?: string) => void) =>
        ipcRenderer.on('outliner-file-list-changed', (_e: unknown, list: unknown, currentFilePath?: string) => handler(list, currentFilePath)),
});

// File drop bridge (shared by all modes)
contextBridge.exposeInMainWorld('fileDrop', {
    open: (filePath: string) => ipcRenderer.send('file-drop-open', filePath),
});
