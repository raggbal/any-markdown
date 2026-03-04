import { app, Menu, MenuItemConstructorOptions, BrowserWindow, shell } from 'electron';

/**
 * Application menu
 */
export function buildMenu(handlers: {
    newFile: () => void;
    openFile: () => void;
    save: () => void;
    saveAs: () => void;
    openPreferences: () => void;
}): Menu {
    const isMac = process.platform === 'darwin';

    const template: MenuItemConstructorOptions[] = [
        // App menu (Mac only)
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' as const },
                { type: 'separator' as const },
                {
                    label: 'Preferences...',
                    accelerator: 'Cmd+,',
                    click: handlers.openPreferences,
                },
                { type: 'separator' as const },
                { role: 'hide' as const },
                { role: 'hideOthers' as const },
                { role: 'unhide' as const },
                { type: 'separator' as const },
                { role: 'quit' as const },
            ] as MenuItemConstructorOptions[],
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
                    } as MenuItemConstructorOptions,
                    { type: 'separator' as const },
                ] : []),
                isMac ? { role: 'close' as const } : { role: 'quit' as const },
            ] as MenuItemConstructorOptions[],
        },
        // Edit
        {
            label: 'Edit',
            submenu: [
                {
                    label: 'Undo',
                    accelerator: 'CmdOrCtrl+Z',
                    click: (_item, win) => {
                        if (win) (win as BrowserWindow).webContents.send('host-message', { type: 'performUndo' });
                    },
                },
                {
                    label: 'Redo',
                    accelerator: isMac ? 'Cmd+Shift+Z' : 'Ctrl+Y',
                    click: (_item, win) => {
                        if (win) (win as BrowserWindow).webContents.send('host-message', { type: 'performRedo' });
                    },
                },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' },
            ] as MenuItemConstructorOptions[],
        },
        // View
        {
            label: 'View',
            submenu: [
                {
                    label: 'Toggle Source Mode',
                    accelerator: 'CmdOrCtrl+.',
                    click: (_item, win) => {
                        if (win) (win as BrowserWindow).webContents.send('host-message', { type: 'toggleSourceMode' });
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
            ] as MenuItemConstructorOptions[],
        },
        // Help
        {
            label: 'Help',
            submenu: [
                {
                    label: 'GitHub Repository',
                    click: () => shell.openExternal('https://github.com/raggbal/any-markdown'),
                },
            ],
        },
    ];

    return Menu.buildFromTemplate(template);
}
