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
});
