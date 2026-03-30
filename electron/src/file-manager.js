"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const electron_1 = require("electron");
const chokidar = __importStar(require("chokidar"));
/**
 * Electron 用ファイル管理
 * editorProvider.ts のファイルI/O機能を Electron 向けに移植
 */
class FileManager {
    win;
    filePath = null;
    watcher = null;
    lastContent = '';
    isDirty = false;
    isExternalUpdate = false;
    constructor(win) {
        this.win = win;
    }
    getFilePath() {
        return this.filePath;
    }
    isDirtyState() {
        return this.isDirty;
    }
    getDocumentDir() {
        if (this.filePath)
            return path.dirname(this.filePath);
        return process.cwd();
    }
    async open(filePath) {
        if (!filePath) {
            const result = await electron_1.dialog.showOpenDialog(this.win, {
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0)
                return null;
            filePath = result.filePaths[0];
        }
        const content = fs.readFileSync(filePath, 'utf8');
        this.filePath = filePath;
        this.lastContent = content;
        this.isDirty = false;
        this.updateTitle();
        this.startWatching();
        return content;
    }
    async save(content) {
        if (!this.filePath) {
            return this.saveAs(content);
        }
        this.isExternalUpdate = true;
        fs.writeFileSync(this.filePath, content, 'utf8');
        this.lastContent = content;
        this.isDirty = false;
        this.updateTitle();
        setTimeout(() => { this.isExternalUpdate = false; }, 200);
        return true;
    }
    async saveAs(content) {
        const result = await electron_1.dialog.showSaveDialog(this.win, {
            filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
            defaultPath: this.filePath || 'untitled.md',
        });
        if (result.canceled || !result.filePath)
            return false;
        this.filePath = result.filePath;
        this.isExternalUpdate = true;
        fs.writeFileSync(this.filePath, content, 'utf8');
        this.lastContent = content;
        this.isDirty = false;
        this.updateTitle();
        this.startWatching();
        setTimeout(() => { this.isExternalUpdate = false; }, 200);
        return true;
    }
    markDirty(content) {
        this.lastContent = content;
        if (!this.isDirty) {
            this.isDirty = true;
            this.updateTitle();
        }
    }
    async saveImage(dataUrl, fileName) {
        const docDir = this.getDocumentDir();
        const timestamp = Date.now();
        const name = fileName || `image-${timestamp}.png`;
        // Extract base64 data
        const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match)
            return null;
        const ext = match[1];
        const data = Buffer.from(match[2], 'base64');
        const finalName = name.endsWith(`.${ext}`) ? name : `${path.parse(name).name}-${timestamp}.${ext}`;
        const imagePath = path.join(docDir, finalName);
        fs.writeFileSync(imagePath, data);
        const relativePath = path.relative(docDir, imagePath).replace(/\\/g, '/');
        return {
            markdownPath: relativePath,
            displayUri: `file://${imagePath}`,
        };
    }
    async readAndInsertImage(srcPath) {
        const docDir = this.getDocumentDir();
        const name = path.basename(srcPath);
        let destPath = path.join(docDir, name);
        // Unique name if exists
        if (fs.existsSync(destPath)) {
            const ext = path.extname(name);
            const base = path.basename(name, ext);
            destPath = path.join(docDir, `${base}-${Date.now()}${ext}`);
        }
        fs.copyFileSync(srcPath, destPath);
        const relativePath = path.relative(docDir, destPath).replace(/\\/g, '/');
        return {
            markdownPath: relativePath,
            displayUri: `file://${destPath}`,
        };
    }
    openInTextEditor() {
        if (this.filePath) {
            electron_1.shell.openPath(this.filePath);
        }
    }
    openLink(href) {
        electron_1.shell.openExternal(href);
    }
    startWatching() {
        this.stopWatching();
        if (!this.filePath)
            return;
        this.watcher = chokidar.watch(this.filePath, {
            persistent: true,
            ignoreInitial: true,
        });
        this.watcher.on('change', () => {
            if (this.isExternalUpdate)
                return;
            const newContent = fs.readFileSync(this.filePath, 'utf8');
            if (newContent !== this.lastContent) {
                this.win.webContents.send('host-message', {
                    type: 'externalChangeDetected',
                    message: 'File has been changed externally. Reload?',
                });
            }
        });
    }
    stopWatching() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
    updateTitle() {
        const name = this.filePath ? path.basename(this.filePath) : 'Untitled';
        const dirty = this.isDirty ? ' - Edited' : '';
        this.win.setTitle(`${name}${dirty} — Fractal`);
    }
    dispose() {
        this.stopWatching();
    }
}
exports.FileManager = FileManager;
//# sourceMappingURL=file-manager.js.map