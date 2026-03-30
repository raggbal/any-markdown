import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow, dialog, shell } from 'electron';
import * as chokidar from 'chokidar';

/**
 * Electron 用ファイル管理
 * editorProvider.ts のファイルI/O機能を Electron 向けに移植
 */

export class FileManager {
    private filePath: string | null = null;
    private watcher: chokidar.FSWatcher | null = null;
    private lastContent: string = '';
    private isDirty = false;
    private isExternalUpdate = false;
    private imageDir: string | null = null; // ファイル単位のIMAGE_DIR (ツールバーから設定)

    constructor(
        private win: BrowserWindow,
        private getSettings?: () => { imageDefaultDir: string; forceRelativeImagePath: boolean },
    ) {}

    getFilePath(): string | null {
        return this.filePath;
    }

    isDirtyState(): boolean {
        return this.isDirty;
    }

    getDocumentDir(): string {
        if (this.filePath) return path.dirname(this.filePath);
        return process.cwd();
    }

    setImageDir(dir: string | null): void {
        this.imageDir = dir;
    }

    /**
     * 画像保存ディレクトリを取得
     * 優先順位: 1. ファイル単位のIMAGE_DIR, 2. 設定のimageDefaultDir, 3. ドキュメントと同じディレクトリ
     */
    private resolveImageDir(): { imageDir: string; useAbsolute: boolean } {
        const docDir = this.getDocumentDir();

        // 1. ファイル単位のIMAGE_DIR
        if (this.imageDir) {
            const isAbs = path.isAbsolute(this.imageDir);
            const resolved = isAbs ? this.imageDir : path.resolve(docDir, this.imageDir);
            return { imageDir: resolved, useAbsolute: isAbs };
        }

        // 2. 設定のimageDefaultDir
        const settings = this.getSettings?.();
        const defaultDir = settings?.imageDefaultDir || '';
        if (defaultDir) {
            const isAbs = path.isAbsolute(defaultDir);
            const resolved = isAbs ? defaultDir : path.resolve(docDir, defaultDir);
            return { imageDir: resolved, useAbsolute: isAbs };
        }

        // 3. ドキュメントと同じディレクトリ
        return { imageDir: docDir, useAbsolute: false };
    }

    private toMarkdownPath(imagePath: string, useAbsolute: boolean): string {
        const forceRelative = this.getSettings?.()?.forceRelativeImagePath ?? false;
        if (forceRelative || !useAbsolute) {
            const docDir = this.getDocumentDir();
            return path.relative(docDir, imagePath).replace(/\\/g, '/');
        }
        return imagePath.replace(/\\/g, '/');
    }

    async open(filePath?: string): Promise<string | null> {
        if (!filePath) {
            const result = await dialog.showOpenDialog(this.win, {
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                properties: ['openFile'],
            });
            if (result.canceled || result.filePaths.length === 0) return null;
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

    async save(content: string): Promise<boolean> {
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

    async saveAs(content: string): Promise<boolean> {
        const result = await dialog.showSaveDialog(this.win, {
            filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
            defaultPath: this.filePath || 'untitled.md',
        });
        if (result.canceled || !result.filePath) return false;

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

    markDirty(content: string): void {
        this.lastContent = content;
        if (!this.isDirty) {
            this.isDirty = true;
            this.updateTitle();
        }
    }

    async saveImage(dataUrl: string, fileName?: string): Promise<{ markdownPath: string; displayUri: string } | null> {
        const { imageDir, useAbsolute } = this.resolveImageDir();
        const timestamp = Date.now();

        // Extract base64 data
        const match = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        if (!match) return null;

        const ext = match[1];
        const data = Buffer.from(match[2], 'base64');
        const name = fileName
            ? (fileName.endsWith(`.${ext}`) ? fileName : `${path.parse(fileName).name}-${timestamp}.${ext}`)
            : `${timestamp}.${ext}`;

        // Ensure directory exists
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }

        // Generate unique name if exists
        let imagePath = path.join(imageDir, name);
        if (fs.existsSync(imagePath)) {
            const base = path.parse(name).name;
            imagePath = path.join(imageDir, `${base}-${Date.now()}.${ext}`);
        }

        fs.writeFileSync(imagePath, data);
        return {
            markdownPath: this.toMarkdownPath(imagePath, useAbsolute),
            displayUri: `file://${imagePath}`,
        };
    }

    async readAndInsertImage(srcPath: string): Promise<{ markdownPath: string; displayUri: string } | null> {
        const { imageDir, useAbsolute } = this.resolveImageDir();
        const name = path.basename(srcPath);

        // Ensure directory exists
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }

        let destPath = path.join(imageDir, name);

        // Unique name if exists
        if (fs.existsSync(destPath)) {
            const ext = path.extname(name);
            const base = path.basename(name, ext);
            destPath = path.join(imageDir, `${base}-${Date.now()}${ext}`);
        }

        fs.copyFileSync(srcPath, destPath);
        return {
            markdownPath: this.toMarkdownPath(destPath, useAbsolute),
            displayUri: `file://${destPath}`,
        };
    }

    openInTextEditor(): void {
        if (this.filePath) {
            shell.openPath(this.filePath);
        }
    }

    openLink(href: string): void {
        shell.openExternal(href);
    }

    private startWatching(): void {
        this.stopWatching();
        if (!this.filePath) return;

        this.watcher = chokidar.watch(this.filePath, {
            persistent: true,
            ignoreInitial: true,
        });

        this.watcher.on('change', () => {
            if (this.isExternalUpdate) return;
            const newContent = fs.readFileSync(this.filePath!, 'utf8');
            if (newContent !== this.lastContent) {
                this.win.webContents.send('host-message', {
                    type: 'externalChangeDetected',
                    message: 'File has been changed externally. Reload?',
                });
            }
        });
    }

    private stopWatching(): void {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }

    private updateTitle(): void {
        const name = this.filePath ? path.basename(this.filePath) : 'Untitled';
        const dirty = this.isDirty ? ' - Edited' : '';
        this.win.setTitle(`${name}${dirty} — Fractal`);
    }

    dispose(): void {
        this.stopWatching();
    }

    /**
     * ベースディレクトリから .md ファイルを再帰検索し、クエリでフィルタする。
     */
    static searchMdFiles(baseDir: string, query: string, limit: number = 10): string[] {
        const results: string[] = [];
        function walk(dir: string): void {
            let entries: fs.Dirent[];
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
            catch { return; }
            for (const entry of entries) {
                if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    walk(full);
                } else if (entry.isFile() && (entry.name.endsWith('.md') || entry.name.endsWith('.markdown'))) {
                    results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
                }
            }
        }
        walk(baseDir);
        if (!query) return results.slice(0, limit);
        const lowerQuery = query.toLowerCase();
        return results
            .filter(p => p.toLowerCase().includes(lowerQuery))
            .sort((a, b) => a.length - b.length)
            .slice(0, limit);
    }
}
