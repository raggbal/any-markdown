import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('settingsBridge', {
    save: (key: string, value: unknown) => ipcRenderer.send('settings-save', key, value),
    selectDirectory: (): Promise<string | null> => ipcRenderer.invoke('settings-select-directory'),
});
