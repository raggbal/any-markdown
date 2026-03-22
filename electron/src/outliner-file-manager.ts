import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';

export interface OutlinerFileEntry {
    filePath: string;
    title: string;
    id: string;
}

/**
 * Electron版 Outliner用ファイルマネージャ
 * .outファイルのCRUD、pageDir解決、デバウンス保存を管理
 */
export class OutlinerFileManager {
    private mainFolderPath: string;
    private currentFilePath: string | null = null;
    private isDirty = false;
    private saveTimer: NodeJS.Timeout | null = null;
    private lastJsonString: string | null = null;

    private static SAVE_DEBOUNCE_MS = 1000;

    constructor(private win: BrowserWindow, mainFolderPath: string) {
        this.mainFolderPath = mainFolderPath;
    }

    getMainFolderPath(): string { return this.mainFolderPath; }
    getCurrentFilePath(): string | null { return this.currentFilePath; }
    isDirtyState(): boolean { return this.isDirty; }

    /**
     * メインフォルダ内の .out ファイル一覧を返す
     * 各ファイルのJSON内 title を読み取って表示名とする
     */
    listFiles(): OutlinerFileEntry[] {
        try {
            const entries = fs.readdirSync(this.mainFolderPath);
            const result: OutlinerFileEntry[] = [];
            for (const entry of entries) {
                if (!entry.endsWith('.out')) continue;
                const filePath = path.join(this.mainFolderPath, entry);
                const stat = fs.statSync(filePath);
                if (!stat.isFile()) continue;
                const id = entry.replace(/\.out$/, '');
                let title = 'Untitled';
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    if (data.title) title = data.title;
                } catch {
                    // JSON parse failure — use default title
                }
                result.push({ filePath, title, id });
            }
            // Sort by title
            result.sort((a, b) => a.title.localeCompare(b.title));
            return result;
        } catch (e) {
            console.error('[OutlinerFileManager] listFiles error:', e);
            return [];
        }
    }

    /**
     * .outファイルを開いてJSON文字列を返す
     * currentFilePathを更新する
     */
    openFile(filePath: string): string | null {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Validate JSON
            JSON.parse(content);
            this.currentFilePath = filePath;
            this.isDirty = false;
            this.lastJsonString = content;
            return content;
        } catch (e) {
            console.error('[OutlinerFileManager] openFile error:', e);
            return null;
        }
    }

    /**
     * デバウンス付き保存 (1秒後に書き込み)
     */
    saveCurrentFile(jsonString: string): void {
        this.lastJsonString = jsonString;
        this.isDirty = true;

        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
        }
        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this._writeFile(jsonString);
        }, OutlinerFileManager.SAVE_DEBOUNCE_MS);
    }

    /**
     * 即座に保存 (ウィンドウ閉じ時等)
     */
    saveCurrentFileImmediate(jsonString?: string): void {
        const toSave = jsonString || this.lastJsonString;
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        if (toSave) {
            this._writeFile(toSave);
        }
    }

    /**
     * デバウンスタイマーをフラッシュ (保存待ちがあれば即実行)
     */
    flushSave(): void {
        if (this.saveTimer && this.lastJsonString) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
            this._writeFile(this.lastJsonString);
        }
    }

    private _writeFile(jsonString: string): void {
        if (!this.currentFilePath) return;
        try {
            fs.writeFileSync(this.currentFilePath, jsonString, 'utf8');
            this.isDirty = false;
        } catch (e) {
            console.error('[OutlinerFileManager] write error:', e);
        }
    }

    /**
     * pageDir解決: JSON内のpageDirフィールドを優先、なければデフォルト ./pages
     */
    getPagesDirPath(outJsonData?: Record<string, unknown>): string {
        // 引数で渡された場合
        if (outJsonData && outJsonData.pageDir) {
            const pd = outJsonData.pageDir as string;
            if (path.isAbsolute(pd)) return pd;
            if (this.currentFilePath) {
                return path.resolve(path.dirname(this.currentFilePath), pd);
            }
        }

        // currentFilePathからJSONを読んで解決
        if (this.currentFilePath) {
            try {
                const content = fs.readFileSync(this.currentFilePath, 'utf8');
                const data = JSON.parse(content);
                if (data.pageDir) {
                    if (path.isAbsolute(data.pageDir)) return data.pageDir;
                    return path.resolve(path.dirname(this.currentFilePath), data.pageDir);
                }
            } catch {
                // fallthrough
            }
            // デフォルト: ./pages
            return path.resolve(path.dirname(this.currentFilePath), 'pages');
        }

        // フォールバック
        return path.join(this.mainFolderPath, 'pages');
    }

    /**
     * ページファイルのフルパスを返す
     */
    getPageFilePath(pageId: string, outJsonData?: Record<string, unknown>): string {
        return path.join(this.getPagesDirPath(outJsonData), `${pageId}.md`);
    }

    /**
     * 一意のアウトラインIDを生成
     */
    static generateOutlineId(): string {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /**
     * 新規 .out ファイルを作成しファイルパスを返す
     * ページフォルダも同時に作成
     */
    createFile(title: string): string {
        const id = OutlinerFileManager.generateOutlineId();
        const filePath = path.join(this.mainFolderPath, `${id}.out`);
        const pageDir = `./${id}`;
        const pageDirAbs = path.join(this.mainFolderPath, id);

        // 初期ノードを1つ作成（outliner.js init()と同じ挙動）
        const firstNodeId = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const data = {
            title: title || 'Untitled',
            pageDir: pageDir,
            rootIds: [firstNodeId],
            nodes: {
                [firstNodeId]: {
                    id: firstNodeId,
                    text: '',
                    childIds: [],
                    collapsed: false,
                },
            } as Record<string, unknown>,
        };

        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        fs.mkdirSync(pageDirAbs, { recursive: true });

        return filePath;
    }

    /**
     * .outファイルと対応するページフォルダを削除
     */
    deleteFile(filePath: string): void {
        try {
            // ページフォルダを特定
            const id = path.basename(filePath, '.out');
            const pageDirAbs = path.join(this.mainFolderPath, id);

            // .out ファイル削除
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }

            // ページフォルダ削除 (再帰)
            if (fs.existsSync(pageDirAbs)) {
                fs.rmSync(pageDirAbs, { recursive: true, force: true });
            }

            // 現在のファイルが削除された場合リセット
            if (this.currentFilePath === filePath) {
                this.currentFilePath = null;
                this.isDirty = false;
                this.lastJsonString = null;
            }
        } catch (e) {
            console.error('[OutlinerFileManager] deleteFile error:', e);
        }
    }

    /**
     * .outファイルのJSON内 title を変更
     */
    renameTitle(filePath: string, newTitle: string): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            data.title = newTitle;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (e) {
            console.error('[OutlinerFileManager] renameTitle error:', e);
        }
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
        // Flush pending save before dispose
        if (this.isDirty && this.lastJsonString && this.currentFilePath) {
            try {
                fs.writeFileSync(this.currentFilePath, this.lastJsonString, 'utf8');
            } catch {
                // ignore on dispose
            }
        }
        this.currentFilePath = null;
        this.isDirty = false;
        this.lastJsonString = null;
    }
}
