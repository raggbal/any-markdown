"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('settingsBridge', {
    save: (key, value) => electron_1.ipcRenderer.send('settings-save', key, value),
});
//# sourceMappingURL=settings-preload.js.map