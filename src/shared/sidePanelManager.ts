/**
 * SidePanelManager — 共通サイドパネル管理
 *
 * editorProvider.ts と outlinerProvider.ts で完全に重複していた
 * ファイル監視・保存・リンク処理・TOC抽出ロジックを共通化。
 *
 * 画像ハンドラは含まない（ディレクトリ解決ロジックがモード間で根本的に異なるため）。
 */

import * as vscode from 'vscode';
import * as path from 'path';

/** Webview への通信インターフェース */
export interface SidePanelHost {
    postMessage(message: any): Thenable<boolean>;
    asWebviewUri(uri: vscode.Uri): vscode.Uri;
}

export interface SidePanelManagerConfig {
    /** ログ出力のプレフィックス (例: '[Fractal]', '[Outliner]') */
    logPrefix: string;
}

export interface TocItem {
    level: number;
    text: string;
    anchor: string;
}

export class SidePanelManager {
    // --- 内部状態 ---
    private _document: vscode.TextDocument | undefined;
    private _fileWatcher: vscode.FileSystemWatcher | undefined;
    private _fileChangeSubscription: vscode.Disposable | undefined;
    private _docChangeSubscription: vscode.Disposable | undefined;
    private _watchedPath: string | undefined;
    private _isApplyingEdit = false;

    private readonly host: SidePanelHost;
    private readonly config: SidePanelManagerConfig;

    constructor(host: SidePanelHost, config: SidePanelManagerConfig) {
        this.host = host;
        this.config = config;
    }

    // --- アクセサ (editorProvider の画像解決ヘルパーで使用) ---

    get watchedPath(): string | undefined {
        return this._watchedPath;
    }

    get document(): vscode.TextDocument | undefined {
        return this._document;
    }

    get isApplyingEdit(): boolean {
        return this._isApplyingEdit;
    }

    // --- ファイル監視 ---

    /**
     * サイドパネルファイルのファイル監視を設定する。
     * TextDocument バッファを開き、FileSystemWatcher + onDidChangeTextDocument で
     * 外部変更を検知してwebviewにリレーする。
     */
    async setupFileWatcher(filePath: string): Promise<void> {
        this.disposeFileWatcher();
        this._watchedPath = filePath;
        const fileUri = vscode.Uri.file(filePath);
        const prefix = this.config.logPrefix;

        // Open as TextDocument — creates an in-memory buffer (does not open a visible tab)
        this._document = await vscode.workspace.openTextDocument(fileUri);

        // Watch for external file changes → sync TextDocument
        this._fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.joinPath(fileUri, '..'), path.basename(filePath))
        );
        this._fileChangeSubscription = this._fileWatcher.onDidChange(async (uri) => {
            if (uri.fsPath !== filePath) return;
            if (this._isApplyingEdit) return;
            setTimeout(async () => {
                try {
                    if (!this._document) return;
                    if (this._document.isClosed) {
                        this._document = await vscode.workspace.openTextDocument(uri);
                    }
                    const fileContent = await vscode.workspace.fs.readFile(uri);
                    const newContent = new TextDecoder().decode(fileContent);
                    const currentContent = this._document.getText();
                    if (newContent !== currentContent) {
                        this._isApplyingEdit = true;
                        const fullRange = new vscode.Range(
                            this._document.positionAt(0),
                            this._document.positionAt(currentContent.length)
                        );
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(this._document.uri, fullRange, newContent);
                        await vscode.workspace.applyEdit(edit);
                        this._isApplyingEdit = false;
                        if (this._document.isClosed) {
                            this._document = await vscode.workspace.openTextDocument(uri);
                        }
                        await this._document.save();
                        this.host.postMessage({
                            type: 'sidePanelMessage',
                            data: { type: 'update', content: newContent }
                        });
                    }
                } catch (error) {
                    this._isApplyingEdit = false;
                    console.error(`${prefix}[SP-FSW] Error:`, error);
                }
            }, 100);
        });

        // Watch TextDocument changes → relay to iframe
        this._docChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (!this._document) return;
            if (e.document.uri.toString() !== this._document.uri.toString()) return;
            if (e.contentChanges.length === 0) return;
            if (this._isApplyingEdit) return;
            const content = e.document.getText();
            this.host.postMessage({
                type: 'sidePanelMessage',
                data: { type: 'update', content: content }
            });
        });
    }

    /**
     * ファイル監視リソースを全て破棄する。
     */
    disposeFileWatcher(): void {
        this._docChangeSubscription?.dispose();
        this._docChangeSubscription = undefined;
        this._fileChangeSubscription?.dispose();
        this._fileChangeSubscription = undefined;
        this._fileWatcher?.dispose();
        this._fileWatcher = undefined;
        this._document = undefined;
        this._watchedPath = undefined;
    }

    // --- メッセージハンドラ ---

    /**
     * 'saveSidePanelFile' メッセージの処理。
     * TextDocument バッファ経由で保存し、直接ファイル書き込みにフォールバック。
     */
    async handleSave(filePath: string, content: string): Promise<void> {
        const prefix = this.config.logPrefix;
        try {
            if (this._document && this._document.uri.fsPath === filePath) {
                if (this._document.isClosed) {
                    this._document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                }
                const normalize = (s: string) => s.replace(/\r\n/g, '\n');
                if (normalize(content) === normalize(this._document.getText())) return;

                this._isApplyingEdit = true;
                const spEdit = new vscode.WorkspaceEdit();
                spEdit.replace(
                    this._document.uri,
                    new vscode.Range(0, 0, this._document.lineCount, 0),
                    content
                );
                await vscode.workspace.applyEdit(spEdit);
                this._isApplyingEdit = false;
                if (this._document.isClosed) {
                    this._document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
                }
                await this._document.save();
            } else {
                const spUri = vscode.Uri.file(filePath);
                const spContent = Buffer.from(content, 'utf8');
                await vscode.workspace.fs.writeFile(spUri, spContent);
            }
        } catch (e) {
            this._isApplyingEdit = false;
            console.error(`${prefix}[SP-Save] Error:`, e);
            vscode.window.showErrorMessage(
                `Failed to save: ${filePath} — ${e instanceof Error ? e.message : String(e)}`
            );
        }
    }

    /**
     * 'sidePanelClosed' メッセージの処理。
     */
    handleClose(): void {
        this.disposeFileWatcher();
    }

    /**
     * サイドパネルでファイルを開く。
     * ファイル読み込み → TOC抽出 → openSidePanel メッセージ送信 → ファイル監視設定。
     */
    async openFile(filePath: string): Promise<void> {
        const fileUri = vscode.Uri.file(filePath);
        try {
            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const text = Buffer.from(fileContent).toString('utf8');
            const fileName = path.basename(filePath);
            const spBaseUri = this.host.asWebviewUri(
                fileUri.with({ path: fileUri.path.replace(/\/[^/]+$/, '/') })
            ).toString();
            this.host.postMessage({
                type: 'openSidePanel',
                markdown: text,
                filePath: filePath,
                fileName: fileName,
                toc: SidePanelManager.extractToc(text),
                documentBaseUri: spBaseUri
            });
            await this.setupFileWatcher(filePath);
        } catch (e) {
            vscode.window.showErrorMessage(`Cannot open file: ${filePath}`);
        }
    }

    /**
     * 'sidePanelOpenLink' メッセージの処理。
     * サイドパネル内のリンククリック → 同じサイドパネル内で遷移。
     */
    async handleOpenLink(href: string, sidePanelFilePath: string): Promise<void> {
        if (href.startsWith('http')) {
            vscode.env.openExternal(vscode.Uri.parse(href));
        } else if (href.startsWith('#')) {
            this.host.postMessage({
                type: 'sidePanelMessage',
                data: { type: 'scrollToAnchor', anchor: href.substring(1) }
            });
        } else {
            const spBaseUri = vscode.Uri.file(sidePanelFilePath);
            const resolvedUri = href.startsWith('/')
                ? vscode.Uri.file(href)
                : vscode.Uri.joinPath(spBaseUri, '..', href);
            const resolvedPath = resolvedUri.fsPath.toLowerCase();
            if (resolvedPath.endsWith('.md') || resolvedPath.endsWith('.markdown')) {
                await this.openFile(resolvedUri.fsPath);
            } else {
                vscode.commands.executeCommand('vscode.open', resolvedUri);
            }
        }
    }

    // --- sendToChat (テキストエディタで開いて行選択) ---

    /**
     * サイドパネルの sendToChat を処理する。
     * 対象ファイルをテキストエディタで開き、該当行を選択状態にし、
     * 選択テキストをクリップボードにコピーする。
     */
    async handleSendToChat(
        sidePanelFilePath: string,
        startLine: number,
        endLine: number,
        selectedMarkdown: string
    ): Promise<void> {
        const uri = vscode.Uri.file(sidePanelFilePath);
        const textDoc = await vscode.workspace.openTextDocument(uri);
        const textEditor = await vscode.window.showTextDocument(textDoc, { preview: false });

        const maxLine = textDoc.lineCount - 1;
        const clampedStart = Math.max(0, Math.min(startLine, maxLine));
        const clampedEnd = Math.max(clampedStart, Math.min(endLine, maxLine));

        const startPos = new vscode.Position(clampedStart, 0);
        const endPos = textDoc.lineAt(clampedEnd).range.end;
        textEditor.selection = new vscode.Selection(startPos, endPos);
        textEditor.revealRange(
            new vscode.Range(startPos, endPos),
            vscode.TextEditorRevealType.InCenter
        );

        if (selectedMarkdown) {
            await vscode.env.clipboard.writeText(selectedMarkdown);
        }
    }

    // --- ユーティリティ ---

    /**
     * Markdown テキストから目次を抽出する (pure function)。
     * H1/H2 を対象にアンカーIDを生成。CJK文字対応。
     */
    static extractToc(markdown: string): TocItem[] {
        const lines = markdown.split('\n');
        const toc: TocItem[] = [];
        let inCodeBlock = false;
        for (const line of lines) {
            if (line.startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
            if (inCodeBlock) continue;
            const match = line.match(/^(#{1,2})\s+(.+)$/);
            if (match) {
                const text = match[2].trim();
                const anchor = text.toLowerCase()
                    .replace(/[^\w\s\u3000-\u9fff\u{20000}-\u{2fa1f}\-]/gu, '')
                    .replace(/\s+/g, '-');
                toc.push({ level: match[1].length, text, anchor });
            }
        }
        return toc;
    }
}
