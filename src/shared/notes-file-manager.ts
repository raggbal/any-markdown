import * as fs from 'fs';
import * as path from 'path';

export interface NotesFileEntry {
    filePath: string;
    title: string;
    id: string;
}

// ── .note 構造管理 ──

export interface NoteTreeFile {
    type: 'file';
    id: string;        // .out ファイル名（拡張子なし）
    title: string;     // 表示タイトル（.outのtitleと同期）
}

export interface NoteTreeFolder {
    type: 'folder';
    id: string;        // フォルダ固有ID
    title: string;     // フォルダ名
    childIds: string[]; // 子アイテムID（順序付き）
    collapsed: boolean;
}

export type NoteTreeItem = NoteTreeFile | NoteTreeFolder;

export interface NoteStructure {
    version: number;
    rootIds: string[];                    // トップレベルの順序
    items: Record<string, NoteTreeItem>;  // 全アイテムのマップ
}

/**
 * Notes 共通ファイルマネージャ
 * .outファイルのCRUD、pageDir解決、デバウンス保存を管理
 * .noteファイルによるフォルダ/ツリー構造管理
 * VSCode拡張・Electron の両方で使用可能（純粋 Node.js fs + path のみ）
 */
export class NotesFileManager {
    private mainFolderPath: string;
    private currentFilePath: string | null = null;
    private isDirty = false;
    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private lastJsonString: string | null = null;
    private structure: NoteStructure | null = null;
    private fileChangeId = 0;

    private static SAVE_DEBOUNCE_MS = 1000;

    constructor(mainFolderPath: string) {
        this.mainFolderPath = mainFolderPath;
    }

    getMainFolderPath(): string { return this.mainFolderPath; }
    getCurrentFilePath(): string | null { return this.currentFilePath; }
    isDirtyState(): boolean { return this.isDirty; }
    getFileChangeId(): number { return this.fileChangeId; }

    // ── .note 構造管理 ──

    private getNoteFilePath(): string {
        return path.join(this.mainFolderPath, '.note');
    }

    private static generateItemId(): string {
        return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /**
     * .note ファイルを読み込み、ディスク上の .out と同期する
     * .note が存在しない場合は全 .out からフラット構造を自動生成
     */
    loadStructure(): NoteStructure {
        if (this.structure) return this.structure;

        const noteFilePath = this.getNoteFilePath();
        let structure: NoteStructure;

        if (fs.existsSync(noteFilePath)) {
            try {
                const content = fs.readFileSync(noteFilePath, 'utf8');
                structure = JSON.parse(content);
            } catch {
                structure = { version: 1, rootIds: [], items: {} };
            }
        } else {
            structure = { version: 1, rootIds: [], items: {} };
        }

        // ディスク上の .out と同期
        this.syncStructureWithDisk(structure);
        this.structure = structure;
        this.saveStructure();
        return structure;
    }

    /**
     * .note 構造をディスク上の .out ファイルと同期
     * - 孤児 .out（.noteに未登録）→ rootIds末尾に追加
     * - 欠損 .out（.noteにあるがディスクにない）→ 削除
     */
    private syncStructureWithDisk(structure: NoteStructure): void {
        // ディスク上の .out ファイルをスキャン
        const diskFiles = new Map<string, string>(); // id → title
        try {
            const entries = fs.readdirSync(this.mainFolderPath);
            for (const entry of entries) {
                if (!entry.endsWith('.out')) continue;
                const filePath = path.join(this.mainFolderPath, entry);
                try {
                    if (!fs.statSync(filePath).isFile()) continue;
                } catch { continue; }
                const id = entry.replace(/\.out$/, '');
                let title = 'Untitled';
                try {
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);
                    if (data.title) title = data.title;
                } catch { /* use default */ }
                diskFiles.set(id, title);
            }
        } catch { /* ignore */ }

        // 構造内の全 file アイテムIDを収集
        const structureFileIds = new Set<string>();
        for (const [id, item] of Object.entries(structure.items)) {
            if (item.type === 'file') {
                structureFileIds.add(id);
            }
        }

        // 孤児 .out → rootIds末尾に追加
        for (const [id, title] of diskFiles) {
            if (!structureFileIds.has(id)) {
                structure.items[id] = { type: 'file', id, title };
                structure.rootIds.push(id);
            } else {
                // タイトル同期
                const item = structure.items[id];
                if (item && item.type === 'file') {
                    item.title = title;
                }
            }
        }

        // 欠損 .out → 構造から削除
        const toRemove: string[] = [];
        for (const [id, item] of Object.entries(structure.items)) {
            if (item.type === 'file' && !diskFiles.has(id)) {
                toRemove.push(id);
            }
        }
        for (const id of toRemove) {
            this.removeItemFromStructure(structure, id);
        }

        // rootIds の整合性チェック（存在しないIDを除去）
        structure.rootIds = structure.rootIds.filter(id => id in structure.items);
    }

    /**
     * 構造からアイテムを削除（rootIds・親の childIds から除去）
     */
    private removeItemFromStructure(structure: NoteStructure, itemId: string): void {
        // rootIds から除去
        const rootIdx = structure.rootIds.indexOf(itemId);
        if (rootIdx !== -1) structure.rootIds.splice(rootIdx, 1);

        // 親フォルダの childIds から除去
        for (const item of Object.values(structure.items)) {
            if (item.type === 'folder') {
                const idx = item.childIds.indexOf(itemId);
                if (idx !== -1) item.childIds.splice(idx, 1);
            }
        }

        // フォルダの場合、子を親に移動
        const target = structure.items[itemId];
        if (target && target.type === 'folder') {
            const parentId = this.findParentId(structure, itemId);
            if (parentId) {
                const parent = structure.items[parentId] as NoteTreeFolder;
                const idx = parent.childIds.indexOf(itemId);
                // 子を親の同じ位置に挿入
                parent.childIds.splice(idx, 0, ...target.childIds);
            } else {
                const idx = structure.rootIds.indexOf(itemId);
                const insertAt = idx !== -1 ? idx : structure.rootIds.length;
                structure.rootIds.splice(insertAt, 0, ...target.childIds);
            }
        }

        delete structure.items[itemId];
    }

    /**
     * アイテムの親フォルダIDを探す（ルートなら null）
     */
    private findParentId(structure: NoteStructure, itemId: string): string | null {
        for (const [id, item] of Object.entries(structure.items)) {
            if (item.type === 'folder' && item.childIds.includes(itemId)) {
                return id;
            }
        }
        return null;
    }

    /**
     * .note ファイルに構造を書き込む
     */
    saveStructure(): void {
        if (!this.structure) return;
        try {
            fs.writeFileSync(this.getNoteFilePath(), JSON.stringify(this.structure, null, 2), 'utf8');
        } catch (e) {
            console.error('[NotesFileManager] saveStructure error:', e);
        }
    }

    /**
     * 現在の構造を取得（ロード済みならキャッシュ利用）
     */
    getStructure(): NoteStructure {
        return this.structure || this.loadStructure();
    }

    /**
     * フォルダ作成
     */
    createFolder(title: string, parentId?: string | null): NoteStructure {
        const structure = this.getStructure();
        const id = NotesFileManager.generateItemId();
        structure.items[id] = { type: 'folder', id, title, childIds: [], collapsed: false };

        if (parentId && structure.items[parentId]?.type === 'folder') {
            (structure.items[parentId] as NoteTreeFolder).childIds.push(id);
        } else {
            structure.rootIds.push(id);
        }

        this.saveStructure();
        return structure;
    }

    /**
     * フォルダ削除（中身は親レベルに移動）
     */
    deleteFolder(folderId: string): NoteStructure {
        const structure = this.getStructure();
        const folder = structure.items[folderId];
        if (!folder || folder.type !== 'folder') return structure;

        this.removeItemFromStructure(structure, folderId);
        this.saveStructure();
        return structure;
    }

    /**
     * フォルダ名変更
     */
    renameFolder(folderId: string, newTitle: string): NoteStructure {
        const structure = this.getStructure();
        const folder = structure.items[folderId];
        if (folder && folder.type === 'folder') {
            folder.title = newTitle;
            this.saveStructure();
        }
        return structure;
    }

    /**
     * フォルダの展開/折りたたみ切替
     */
    toggleFolderCollapsed(folderId: string): NoteStructure {
        const structure = this.getStructure();
        const folder = structure.items[folderId];
        if (folder && folder.type === 'folder') {
            folder.collapsed = !folder.collapsed;
            this.saveStructure();
        }
        return structure;
    }

    /**
     * アイテム移動（D&D）
     * @param itemId 移動するアイテム
     * @param targetParentId 移動先の親フォルダID（null=ルート）
     * @param index 挿入位置
     */
    moveItem(itemId: string, targetParentId: string | null, index: number): NoteStructure {
        const structure = this.getStructure();
        if (!structure.items[itemId]) return structure;

        // 循環参照チェック: フォルダを自身の子孫に移動しない
        if (targetParentId && this.isDescendant(structure, itemId, targetParentId)) {
            return structure;
        }

        // 現在の親から除去
        const currentParentId = this.findParentId(structure, itemId);
        if (currentParentId) {
            const parent = structure.items[currentParentId] as NoteTreeFolder;
            const idx = parent.childIds.indexOf(itemId);
            if (idx !== -1) parent.childIds.splice(idx, 1);
        } else {
            const idx = structure.rootIds.indexOf(itemId);
            if (idx !== -1) structure.rootIds.splice(idx, 1);
        }

        // 新しい親に挿入
        if (targetParentId && structure.items[targetParentId]?.type === 'folder') {
            const parent = structure.items[targetParentId] as NoteTreeFolder;
            const safeIndex = Math.min(index, parent.childIds.length);
            parent.childIds.splice(safeIndex, 0, itemId);
        } else {
            const safeIndex = Math.min(index, structure.rootIds.length);
            structure.rootIds.splice(safeIndex, 0, itemId);
        }

        this.saveStructure();
        return structure;
    }

    /**
     * itemId が targetId の子孫かどうか判定（循環参照防止）
     */
    private isDescendant(structure: NoteStructure, ancestorId: string, targetId: string): boolean {
        const item = structure.items[ancestorId];
        if (!item || item.type !== 'folder') return false;

        const stack = [...item.childIds];
        while (stack.length > 0) {
            const id = stack.pop()!;
            if (id === targetId) return true;
            const child = structure.items[id];
            if (child && child.type === 'folder') {
                stack.push(...child.childIds);
            }
        }
        return false;
    }

    // ── 既存ファイル操作（.note同期付き） ──

    /**
     * メインフォルダ内の .out ファイル一覧を返す
     * 各ファイルのJSON内 title を読み取って表示名とする
     */
    listFiles(): NotesFileEntry[] {
        try {
            const entries = fs.readdirSync(this.mainFolderPath);
            const result: NotesFileEntry[] = [];
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
            result.sort((a, b) => a.title.localeCompare(b.title));
            return result;
        } catch (e) {
            console.error('[NotesFileManager] listFiles error:', e);
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
            JSON.parse(content); // validate
            this.currentFilePath = filePath;
            this.isDirty = false;
            this.lastJsonString = content;
            this.fileChangeId++;
            return content;
        } catch (e) {
            console.error('[NotesFileManager] openFile error:', e);
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
        }, NotesFileManager.SAVE_DEBOUNCE_MS);
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
            console.error('[NotesFileManager] write error:', e);
        }
    }

    /**
     * pageDir解決: JSON内のpageDirフィールドを優先、なければデフォルト ./pages
     */
    getPagesDirPath(outJsonData?: Record<string, unknown>): string {
        if (outJsonData && outJsonData.pageDir) {
            const pd = outJsonData.pageDir as string;
            if (path.isAbsolute(pd)) return pd;
            if (this.currentFilePath) {
                return path.resolve(path.dirname(this.currentFilePath), pd);
            }
        }

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
            return path.resolve(path.dirname(this.currentFilePath), 'pages');
        }

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
     * ページフォルダも同時に作成、.note構造にも追加
     */
    createFile(title: string, parentId?: string | null): string {
        const id = NotesFileManager.generateOutlineId();
        const filePath = path.join(this.mainFolderPath, `${id}.out`);
        const pageDir = `./${id}`;
        const pageDirAbs = path.join(this.mainFolderPath, id);

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

        // .note 構造に追加
        const structure = this.getStructure();
        structure.items[id] = { type: 'file', id, title: title || 'Untitled' };
        if (parentId && structure.items[parentId]?.type === 'folder') {
            (structure.items[parentId] as NoteTreeFolder).childIds.unshift(id);
        } else {
            structure.rootIds.unshift(id);
        }
        this.saveStructure();

        return filePath;
    }

    /**
     * .outファイルと対応するページフォルダを削除、.note構造からも除去
     */
    deleteFile(filePath: string): void {
        try {
            const id = path.basename(filePath, '.out');
            const pageDirAbs = path.join(this.mainFolderPath, id);

            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            if (fs.existsSync(pageDirAbs)) {
                fs.rmSync(pageDirAbs, { recursive: true, force: true });
            }

            if (this.currentFilePath === filePath) {
                this.currentFilePath = null;
                this.isDirty = false;
                this.lastJsonString = null;
            }

            // .note 構造から除去
            const structure = this.getStructure();
            this.removeItemFromStructure(structure, id);
            this.saveStructure();
        } catch (e) {
            console.error('[NotesFileManager] deleteFile error:', e);
        }
    }

    /**
     * .outファイルのJSON内 title を変更、.note構造のtitleも同期
     */
    renameTitle(filePath: string, newTitle: string): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(content);
            data.title = newTitle;
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

            // .note 構造のタイトルも同期
            const id = path.basename(filePath, '.out');
            const structure = this.getStructure();
            const item = structure.items[id];
            if (item && item.type === 'file') {
                item.title = newTitle;
                this.saveStructure();
            }
        } catch (e) {
            console.error('[NotesFileManager] renameTitle error:', e);
        }
    }

    /**
     * 構造内で指定IDのファイルパスを返す
     */
    getFilePathById(fileId: string): string {
        return path.join(this.mainFolderPath, `${fileId}.out`);
    }

    /**
     * 構造のツリー順で最初のファイルIDを返す
     */
    findFirstFileId(): string | null {
        const structure = this.getStructure();
        return this._findFirstFileInIds(structure, structure.rootIds);
    }

    private _findFirstFileInIds(structure: NoteStructure, ids: string[]): string | null {
        for (const id of ids) {
            const item = structure.items[id];
            if (!item) continue;
            if (item.type === 'file') return id;
            if (item.type === 'folder') {
                const found = this._findFirstFileInIds(structure, item.childIds);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * クリーンアップ
     */
    dispose(): void {
        if (this.saveTimer) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }
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
        this.structure = null;
    }
}
