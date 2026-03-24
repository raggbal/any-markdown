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
    panelWidth?: number;                  // 左パネル幅 (px)
}

// ── 検索関連 ──

export interface SearchResult {
    fileId: string;
    fileTitle: string;
    fileType: 'out' | 'md';
    matches: SearchMatch[];
    parentOutFileId?: string;  // pages .md の場合、親.outのfileId
    pageId?: string;           // pages .md の場合、pageId
    mdFilePath?: string;       // ルート直下.mdのフルパス
}

export interface SearchMatch {
    nodeId?: string;
    field: 'text' | 'subtext' | 'content';
    lineText: string;
    matchStart: number;
    matchEnd: number;
    lineNumber?: number;  // .mdファイルの行番号 (0-based)
}

export interface SearchOptions {
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
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

    // ── outline.note 構造管理 ──

    private getNoteFilePath(): string {
        return path.join(this.mainFolderPath, 'outline.note');
    }

    private static generateItemId(): string {
        return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /**
     * outline.note ファイルを読み込み、ディスク上の .out と同期する
     * outline.note が存在しない場合は全 .out からフラット構造を自動生成
     * 旧 .note が存在する場合は自動マイグレーション
     */
    loadStructure(): NoteStructure {
        if (this.structure) return this.structure;

        const noteFilePath = this.getNoteFilePath();

        // マイグレーション: 旧 .note → outline.note
        if (!fs.existsSync(noteFilePath)) {
            const legacyPath = path.join(this.mainFolderPath, '.note');
            if (fs.existsSync(legacyPath)) {
                try {
                    fs.renameSync(legacyPath, noteFilePath);
                    console.log('[NotesFileManager] Migrated .note → outline.note');
                } catch (e) {
                    console.error('[NotesFileManager] Migration .note → outline.note failed:', e);
                }
            }
        }

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
     * outline.note ファイルに構造を書き込む
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
     * 左パネル幅を outline.note に保存
     */
    savePanelWidth(width: number): void {
        const structure = this.getStructure();
        structure.panelWidth = width;
        this.saveStructure();
    }

    /**
     * 左パネル幅を取得
     */
    getPanelWidth(): number | undefined {
        return this.getStructure().panelWidth;
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

    // ── 検索 ──

    /**
     * ファイル単位でストリーミング検索
     * コールバックでファイルごとの結果を返す
     */
    searchFilesStreaming(
        query: string,
        options: SearchOptions,
        onResult: (result: SearchResult) => void
    ): void {
        let regex: RegExp;
        try {
            regex = this.buildSearchRegex(query, options);
        } catch {
            return; // invalid regex
        }

        // 1. .out ファイルを検索
        let outFiles: string[];
        try {
            outFiles = fs.readdirSync(this.mainFolderPath).filter(f => f.endsWith('.out'));
        } catch {
            outFiles = [];
        }

        for (const outFile of outFiles) {
            const filePath = path.join(this.mainFolderPath, outFile);
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(content);
                const fileId = outFile.replace(/\.out$/, '');
                const matches: SearchMatch[] = [];

                for (const [nodeId, node] of Object.entries(data.nodes || {})) {
                    const n = node as any;
                    if (n.text) {
                        this.findMatches(n.text, regex, 'text', nodeId, matches);
                    }
                    if (n.subtext) {
                        this.findMatches(n.subtext.substring(0, 500), regex, 'subtext', nodeId, matches);
                    }
                }

                if (matches.length > 0) {
                    onResult({
                        fileId,
                        fileTitle: data.title || fileId,
                        fileType: 'out',
                        matches,
                    });
                }
            } catch { /* skip corrupted */ }
        }

        // 2. フォルダ直下の .md
        try {
            const mdFiles = fs.readdirSync(this.mainFolderPath).filter(f => f.endsWith('.md'));
            for (const mdFile of mdFiles) {
                this.searchMdFile(
                    path.join(this.mainFolderPath, mdFile),
                    mdFile, mdFile, regex, onResult,
                    undefined, undefined
                );
            }
        } catch { /* skip */ }

        // 3. 各 .out の pages ディレクトリ内 .md
        for (const outFile of outFiles) {
            try {
                const outPath = path.join(this.mainFolderPath, outFile);
                const outData = JSON.parse(fs.readFileSync(outPath, 'utf8'));
                const pDir = outData.pageDir
                    ? path.resolve(path.dirname(outPath), outData.pageDir)
                    : path.join(this.mainFolderPath, 'pages');
                if (!fs.existsSync(pDir)) continue;
                const pageMds = fs.readdirSync(pDir).filter(f => f.endsWith('.md'));
                for (const pm of pageMds) {
                    const pageId = pm.replace(/\.md$/, '');
                    this.searchMdFile(
                        path.join(pDir, pm),
                        pm, `${outData.title || outFile}/${pm}`,
                        regex, onResult,
                        outFile.replace(/\.out$/, ''),
                        pageId,
                    );
                }
            } catch { /* skip */ }
        }
    }

    private searchMdFile(
        filePath: string,
        fileId: string,
        fileTitle: string,
        regex: RegExp,
        onResult: (result: SearchResult) => void,
        parentOutFileId?: string,
        pageId?: string,
    ): void {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            const matches: SearchMatch[] = [];
            for (let i = 0; i < lines.length; i++) {
                const lineMatches: SearchMatch[] = [];
                this.findMatches(lines[i].substring(0, 200), regex, 'content', undefined, lineMatches);
                for (const m of lineMatches) {
                    m.lineNumber = i;
                    matches.push(m);
                }
            }
            if (matches.length > 0) {
                onResult({
                    fileId, fileTitle, fileType: 'md', matches,
                    parentOutFileId,
                    pageId,
                    mdFilePath: parentOutFileId ? undefined : filePath,
                });
            }
        } catch { /* skip */ }
    }

    private findMatches(
        text: string,
        regex: RegExp,
        field: 'text' | 'subtext' | 'content',
        nodeId: string | undefined,
        matches: SearchMatch[]
    ): void {
        regex.lastIndex = 0;
        const m = regex.exec(text);
        if (m) {
            matches.push({
                nodeId,
                field,
                lineText: text.substring(0, 200),
                matchStart: m.index,
                matchEnd: m.index + m[0].length,
            });
            regex.lastIndex = 0;
        }
    }

    private buildSearchRegex(query: string, options: SearchOptions): RegExp {
        let pattern: string;
        if (options.useRegex) {
            pattern = query;
        } else {
            pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        if (options.wholeWord) {
            pattern = `\\b${pattern}\\b`;
        }
        const flags = options.caseSensitive ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    // ── Daily Notes ──

    /**
     * dailynotes.out が存在しなければ作成し、outline.note にも登録
     * @returns dailynotes.out のフルパス
     */
    ensureDailyNotesFile(): string {
        const filePath = path.join(this.mainFolderPath, 'dailynotes.out');

        if (!fs.existsSync(filePath)) {
            const initialData = {
                version: 1,
                title: 'Daily Notes',
                rootIds: [] as string[],
                nodes: {} as Record<string, unknown>,
            };
            fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2), 'utf8');

            // outline.note に登録
            const structure = this.getStructure();
            if (!structure.items['dailynotes']) {
                structure.items['dailynotes'] = {
                    type: 'file' as const,
                    id: 'dailynotes',
                    title: 'Daily Notes',
                };
                // rootIds の先頭に追加
                structure.rootIds.unshift('dailynotes');
                this.saveStructure();
            }
        }

        return filePath;
    }

    /**
     * 年→月→日の階層ノードを作成/確認
     * 既存ノードがあれば再利用、なければ新規作成
     * @returns { dayNodeId: string, modified: boolean }
     */
    ensureDailyNode(
        data: any,
        year: string,
        month: string,
        day: string
    ): { dayNodeId: string; modified: boolean } {
        let modified = false;

        // 年ノード検索/作成
        let yearNodeId = this.findChildByText(data, null, year);
        if (!yearNodeId) {
            yearNodeId = this.addNodeToData(data, null, year, 'first');
            modified = true;
        }

        // 月ノード検索/作成
        let monthNodeId = this.findChildByText(data, yearNodeId, month);
        if (!monthNodeId) {
            monthNodeId = this.addNodeToData(data, yearNodeId, month, 'first');
            modified = true;
        }

        // 日ノード検索/作成
        let dayNodeId = this.findChildByText(data, monthNodeId, day);
        if (!dayNodeId) {
            dayNodeId = this.addNodeToData(data, monthNodeId, day, 'first');
            modified = true;
        }

        return { dayNodeId, modified };
    }

    /**
     * 指定親の直接子ノードから text が一致するものを検索
     */
    private findChildByText(data: any, parentId: string | null, text: string): string | null {
        const childIds = parentId ? (data.nodes[parentId]?.children || []) : data.rootIds;
        for (const childId of childIds) {
            if (data.nodes[childId]?.text === text) {
                return childId;
            }
        }
        return null;
    }

    /**
     * data JSON にノードを追加（outliner-model.js と同等のロジックをホスト側で実行）
     */
    addNodeToData(data: any, parentId: string | null, text: string, position: 'first' | 'last'): string {
        const nodeId = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

        const node: Record<string, unknown> = {
            id: nodeId,
            parentId: parentId,
            children: [],
            text: text,
            tags: [],
            isPage: false,
            pageId: null,
            collapsed: false,
            checked: null,
            subtext: '',
        };

        data.nodes[nodeId] = node;

        if (parentId) {
            if (!data.nodes[parentId].children) {
                data.nodes[parentId].children = [];
            }
            if (position === 'first') {
                data.nodes[parentId].children.unshift(nodeId);
            } else {
                data.nodes[parentId].children.push(nodeId);
            }
        } else {
            if (position === 'first') {
                data.rootIds.unshift(nodeId);
            } else {
                data.rootIds.push(nodeId);
            }
        }

        return nodeId;
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
