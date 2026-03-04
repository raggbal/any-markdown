"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMenu = buildMenu;
const electron_1 = require("electron");
/**
 * Application menu
 */
function buildMenu(handlers) {
    const isMac = process.platform === 'darwin';
    const template = [
        // App menu (Mac only)
        ...(isMac ? [{
                label: electron_1.app.name,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    {
                        label: 'Preferences...',
                        accelerator: 'Cmd+,',
                        click: handlers.openPreferences,
                    },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' },
                ],
            }] : []),
        // File
        {
            label: 'File',
            submenu: [
                {
                    label: 'New',
                    accelerator: 'CmdOrCtrl+N',
                    click: handlers.newFile,
                },
                {
                    label: 'Open...',
                    accelerator: 'CmdOrCtrl+O',
                    click: handlers.openFile,
                },
                { type: 'separator' },
                {
                    label: 'Save',
                    accelerator: 'CmdOrCtrl+S',
                    click: handlers.save,
                },
                {
                    label: 'Save As...',
                    accelerator: 'CmdOrCtrl+Shift+S',
                    click: handlers.saveAs,
                },
                { type: 'separator' },
                ...(!isMac ? [
                    {
                        label: 'Preferences...',
                        accelerator: 'Ctrl+,',
                        click: handlers.openPreferences,
                    },
                    { type: 'separator' },
                ] : []),
                isMac ? { role: 'close' } : { role: 'quit' },
            ],
        },
        // Edit
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: (_item, win) => {
                        if (win)
                            win.webContents.send('host-message', { type: 'performUndo' });
                    },
                },
                {
                    label: 'Redo',
                    accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
                    click: (_item, win) => {
                        if (win)
                            win.webContents.send('host-message', { type: 'performRedo' });
                    },
                },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ],
        },
        // View
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Source Mode',
                    accelerator: 'CmdOrCtrl+.',
                    click: (_item, win) => {
                        if (win)
                            win.webContents.send('host-message', { type: 'toggleSourceMode' });
                    },
                },
                { type: 'separator' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { role: 'resetZoom' },
                { type: 'separator' },
                { role: 'togglefullscreen' },
            ],
        },
        // Help
        {
            label: 'Help',
            submenu: [
                {
                    label: 'GitHub Repository',
                    click: () => electron_1.shell.openExternal('https://github.com/raggbal/any-markdown'),
                },
            ],
        },
    ];
    return electron_1.Menu.buildFromTemplate(template);
}
//# sourceMappingURL=menu.js.map