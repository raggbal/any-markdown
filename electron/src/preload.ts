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
    requestInsertImage: () => ipcRenderer.send('insert-image'),
    requestSetImageDir: () => ipcRenderer.send('set-image-dir'),
    saveImageAndInsert: (dataUrl: string, fileName?: string) =>
        ipcRenderer.send('save-image', dataUrl, fileName),
    readAndInsertImage: (filePath: string) =>
        ipcRenderer.send('read-insert-image', filePath),
    openInTextEditor: () => ipcRenderer.send('open-in-text-editor'),
    sendToChat: () => { /* no-op in Electron */ },
    onMessage: (handler: (message: unknown) => void) => {
        ipcRenderer.on('host-message', (_event, message) => handler(message));
    },
});
