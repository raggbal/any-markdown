import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getOutlinerWebviewContent } from './outlinerWebviewContent';
import { getWebviewMessages } from './i18n/messages';

/**
 * OutlinerProvider — .mmd ファイル用 Custom Text Editor Provider
 *
 * JSON ベースのアウトライナデータを管理し、
 * ページ機能（pages/{pageId}.md）とサイドパネル連携を提供する。
 */
export class OutlinerProvider implements vscode.CustomTextEditorProvider {
    private readonly context: vscode.ExtensionContext;

    // アクティブな webview パネルを追跡（undo/redo forwarding用）
    private activeWebviewPanel: vscode.WebviewPanel | undefined;

    // outlinerから開いたページファイルの追跡 (key: ファイルパス, value: ページディレクトリパス)
    static outlinerPagePaths: Map<string, string> = new Map();


    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // Clear cached webview state
        webviewPanel.webview.html = '';

        const documentDir = vscode.Uri.joinPath(document.uri, '..');

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                documentDir
            ]
        };

        this.activeWebviewPanel = webviewPanel;

        // --- updateWebview ---
        const updateWebview = () => {
            try {
                const config = vscode.workspace.getConfiguration('any-markdown');
                const content = document.getText();
                webviewPanel.webview.html = getOutlinerWebviewContent(
                    webviewPanel.webview,
                    this.context.extensionUri,
                    content,
                    {
                        theme: config.get<string>('theme', 'github'),
                        fontSize: config.get<number>('fontSize', 16),
                        webviewMessages: getWebviewMessages() as unknown as Record<string, string>,
                        enableDebugLogging: config.get<boolean>('enableDebugLogging', false)
                    }
                );
            } catch (error) {
                console.error('[Outliner] Error updating webview:', error);
                webviewPanel.webview.html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Error</title></head>
<body style="padding:20px;font-family:sans-serif;">
<h2>Failed to load outliner</h2>
<p>Please try closing and reopening this file.</p>
<details><summary>Error details</summary><pre>${String(error)}</pre></details>
</body></html>`;
            }
        };

        // Initial content
        updateWebview();

        // --- 自己編集フラグ (editorProvider.tsと同じパターン) ---
        let isApplyingOwnEdit = false;

        // --- サイドパネル用変数 (editorProvider.tsと同じパターン) ---
        let sidePanelDocument: vscode.TextDocument | undefined;
        let sidePanelFileWatcher: vscode.FileSystemWatcher | undefined;
        let sidePanelFileChangeSubscription: vscode.Disposable | undefined;
        let sidePanelDocChangeSubscription: vscode.Disposable | undefined;
        let sidePanelWatchedPath: string | undefined;
        let isApplyingSidePanelEdit = false;

        const setupSidePanelFileWatcher = async (filePath: string) => {
            disposeSidePanelFileWatcher();
            sidePanelWatchedPath = filePath;
            const fileUri = vscode.Uri.file(filePath);

            sidePanelDocument = await vscode.workspace.openTextDocument(fileUri);

            sidePanelFileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.joinPath(fileUri, '..'), path.basename(filePath))
            );
            sidePanelFileChangeSubscription = sidePanelFileWatcher.onDidChange(async (uri) => {
                if (uri.fsPath !== filePath) return;
                if (isApplyingSidePanelEdit) return;
                setTimeout(async () => {
                    try {
                        if (!sidePanelDocument) return;
                        if (sidePanelDocument.isClosed) {
                            sidePanelDocument = await vscode.workspace.openTextDocument(uri);
                        }
                        const fileContent = await vscode.workspace.fs.readFile(uri);
                        const newContent = new TextDecoder().decode(fileContent);
                        const currentContent = sidePanelDocument.getText();
                        if (newContent !== currentContent) {
                            isApplyingSidePanelEdit = true;
                            const fullRange = new vscode.Range(
                                sidePanelDocument.positionAt(0),
                                sidePanelDocument.positionAt(currentContent.length)
                            );
                            const edit = new vscode.WorkspaceEdit();
                            edit.replace(sidePanelDocument.uri, fullRange, newContent);
                            await vscode.workspace.applyEdit(edit);
                            isApplyingSidePanelEdit = false;
                            if (sidePanelDocument.isClosed) {
                                sidePanelDocument = await vscode.workspace.openTextDocument(uri);
                            }
                            await sidePanelDocument.save();
                            webviewPanel.webview.postMessage({
                                type: 'sidePanelMessage',
                                data: { type: 'update', content: newContent }
                            });
                        }
                    } catch (error) {
                        isApplyingSidePanelEdit = false;
                        console.error('[Outliner][SP-FSW] Error:', error);
                    }
                }, 100);
            });

            sidePanelDocChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
                if (!sidePanelDocument) return;
                if (e.document.uri.toString() !== sidePanelDocument.uri.toString()) return;
                if (e.contentChanges.length === 0) return;
                if (isApplyingSidePanelEdit) return;
                const content = e.document.getText();
                webviewPanel.webview.postMessage({
                    type: 'sidePanelMessage',
                    data: { type: 'update', content: content }
                });
            });
        };

        const disposeSidePanelFileWatcher = () => {
            sidePanelDocChangeSubscription?.dispose();
            sidePanelDocChangeSubscription = undefined;
            sidePanelFileChangeSubscription?.dispose();
            sidePanelFileChangeSubscription = undefined;
            sidePanelFileWatcher?.dispose();
            sidePanelFileWatcher = undefined;
            sidePanelDocument = undefined;
            sidePanelWatchedPath = undefined;
        };

        // サイドパネルの画像ディレクトリ状態を送信
        const sendSidePanelImageDirStatus = (spFilePath: string) => {
            // outlinerページの画像ディレクトリは {pageDir}/images/ に固定 (要件PC-1)
            const pagesDir = this.getPagesDirPath(document);
            const imagesDir = path.join(pagesDir, 'images');
            const spDir = path.dirname(spFilePath);
            const displayPath = path.relative(spDir, imagesDir).replace(/\\/g, '/') || '.';

            webviewPanel.webview.postMessage({
                type: 'sidePanelImageDirStatus',
                displayPath,
                source: 'default'
            });
        };

        // サイドパネルでファイルを開く
        const openFileInSidePanel = async (filePath: string) => {
            const fileUri = vscode.Uri.file(filePath);
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                const text = Buffer.from(fileContent).toString('utf8');
                const fileName = path.basename(filePath);
                const spBaseUri = webviewPanel.webview.asWebviewUri(
                    fileUri.with({ path: fileUri.path.replace(/\/[^/]+$/, '/') })
                ).toString();
                webviewPanel.webview.postMessage({
                    type: 'openSidePanel',
                    markdown: text,
                    filePath: filePath,
                    fileName: fileName,
                    toc: this.extractToc(text),
                    documentBaseUri: spBaseUri
                });
                await setupSidePanelFileWatcher(filePath);
            } catch (e) {
                vscode.window.showErrorMessage(`Cannot open file: ${filePath}`);
            }
        };

        // --- メッセージハンドラ ---
        const disposables: vscode.Disposable[] = [];

        disposables.push(
            webviewPanel.webview.onDidReceiveMessage(async (message) => {
                switch (message.type) {
                    case 'syncData':
                        try {
                            isApplyingOwnEdit = true;
                            await this.applyEdit(document, message.content);
                        } finally {
                            isApplyingOwnEdit = false;
                        }
                        break;

                    case 'save':
                        await document.save();
                        break;

                    case 'makePage':
                        await this.handleMakePage(document, webviewPanel, message);
                        break;

                    case 'openPage':
                        await this.handleOpenPage(document, webviewPanel, message);
                        break;

                    case 'openLink':
                        if (message.href) {
                            vscode.env.openExternal(vscode.Uri.parse(message.href));
                        }
                        break;

                    case 'setPageDir': {
                        const currentDir = this.getPagesDirPath(document);
                        const relCurrent = path.relative(path.dirname(document.uri.fsPath), currentDir);
                        const input = await vscode.window.showInputBox({
                            prompt: 'Enter page directory (relative to .mmd file or absolute)',
                            value: relCurrent || './pages'
                        });
                        if (input !== undefined) {
                            try {
                                const data = JSON.parse(document.getText());
                                data.pageDir = input || undefined;
                                const jsonStr = JSON.stringify(data, null, 2);
                                isApplyingOwnEdit = true;
                                await this.applyEdit(document, jsonStr);
                                isApplyingOwnEdit = false;
                                webviewPanel.webview.postMessage({
                                    type: 'pageDirChanged',
                                    pageDir: input
                                });
                            } catch {
                                vscode.window.showErrorMessage('Failed to update page directory setting');
                            }
                        }
                        break;
                    }

                    // --- サイドパネル関連メッセージ ---

                    case 'openPageInSidePanel': {
                        const filePath = this.getPageFilePath(document, message.pageId);
                        if (!fs.existsSync(filePath)) {
                            vscode.window.showWarningMessage(`Page file not found: ${filePath}`);
                            break;
                        }
                        await openFileInSidePanel(filePath);
                        break;
                    }

                    case 'saveSidePanelFile':
                        try {
                            if (sidePanelDocument && sidePanelDocument.uri.fsPath === message.filePath) {
                                if (sidePanelDocument.isClosed) {
                                    sidePanelDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
                                }
                                const normalize = (s: string) => s.replace(/\r\n/g, '\n');
                                const msgNorm = normalize(message.content);
                                const docNorm = normalize(sidePanelDocument.getText());
                                if (msgNorm === docNorm) break;
                                isApplyingSidePanelEdit = true;
                                const spEdit = new vscode.WorkspaceEdit();
                                spEdit.replace(
                                    sidePanelDocument.uri,
                                    new vscode.Range(0, 0, sidePanelDocument.lineCount, 0),
                                    message.content
                                );
                                await vscode.workspace.applyEdit(spEdit);
                                isApplyingSidePanelEdit = false;
                                if (sidePanelDocument.isClosed) {
                                    sidePanelDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(message.filePath));
                                }
                                await sidePanelDocument.save();
                            } else {
                                const spUri = vscode.Uri.file(message.filePath);
                                const spContent = Buffer.from(message.content, 'utf8');
                                await vscode.workspace.fs.writeFile(spUri, spContent);
                            }
                        } catch (e) {
                            isApplyingSidePanelEdit = false;
                            console.error('[Outliner][SP-Save] Error:', e);
                            vscode.window.showErrorMessage(`Failed to save: ${message.filePath}`);
                        }
                        break;

                    case 'sidePanelClosed':
                        disposeSidePanelFileWatcher();
                        break;

                    case 'sidePanelOpenLink': {
                        const spLinkHref: string = message.href;
                        const spFilePath: string = message.sidePanelFilePath;
                        if (spLinkHref.startsWith('http')) {
                            vscode.env.openExternal(vscode.Uri.parse(spLinkHref));
                        } else if (spLinkHref.startsWith('#')) {
                            webviewPanel.webview.postMessage({
                                type: 'sidePanelMessage',
                                data: { type: 'scrollToAnchor', anchor: spLinkHref.substring(1) }
                            });
                        } else {
                            const spBaseUri = vscode.Uri.file(spFilePath);
                            const spResolvedUri = spLinkHref.startsWith('/')
                                ? vscode.Uri.file(spLinkHref)
                                : vscode.Uri.joinPath(spBaseUri, '..', spLinkHref);
                            const spResolvedPath = spResolvedUri.fsPath.toLowerCase();
                            if (spResolvedPath.endsWith('.md') || spResolvedPath.endsWith('.markdown')) {
                                await openFileInSidePanel(spResolvedUri.fsPath);
                            } else {
                                vscode.commands.executeCommand('vscode.open', spResolvedUri);
                            }
                        }
                        break;
                    }

                    case 'openLinkInTab': {
                        const uri = vscode.Uri.file(message.href);
                        vscode.commands.executeCommand('vscode.openWith', uri, 'any-markdown.editor');
                        break;
                    }

                    case 'getSidePanelImageDir':
                        if (message.sidePanelFilePath) {
                            sendSidePanelImageDirStatus(message.sidePanelFilePath);
                        }
                        break;

                    case 'insertImage': {
                        // 画像挿入 (サイドパネル用)
                        if (message.sidePanelFilePath) {
                            const pagesDir = this.getPagesDirPath(document);
                            const imagesDir = path.join(pagesDir, 'images');
                            if (!fs.existsSync(imagesDir)) {
                                fs.mkdirSync(imagesDir, { recursive: true });
                            }
                            const options: vscode.OpenDialogOptions = {
                                canSelectMany: false,
                                filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }
                            };
                            const fileUris = await vscode.window.showOpenDialog(options);
                            if (fileUris && fileUris[0]) {
                                const srcPath = fileUris[0].fsPath;
                                const imgFileName = path.basename(srcPath);
                                const destPath = path.join(imagesDir, imgFileName);
                                fs.copyFileSync(srcPath, destPath);
                                const spDir = path.dirname(message.sidePanelFilePath);
                                const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                                const displayUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                                webviewPanel.webview.postMessage({
                                    type: 'insertImageHtml',
                                    markdownPath: relPath,
                                    displayUri: displayUri
                                });
                            }
                        }
                        break;
                    }

                    case 'saveImageAndInsert': {
                        // ペースト/ドロップ画像の保存 (サイドパネル用)
                        if (message.sidePanelFilePath && message.dataUrl) {
                            const pagesDir = this.getPagesDirPath(document);
                            const imagesDir = path.join(pagesDir, 'images');
                            if (!fs.existsSync(imagesDir)) {
                                fs.mkdirSync(imagesDir, { recursive: true });
                            }
                            // Generate filename: use provided name or auto-generate from dataUrl
                            let imgFileName = message.fileName;
                            if (!imgFileName) {
                                const extMatch = message.dataUrl.match(/^data:image\/(\w+);/);
                                const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
                                imgFileName = `image_${Date.now()}.${ext}`;
                            }
                            const base64Data = message.dataUrl.replace(/^data:image\/\w+;base64,/, '');
                            const destPath = path.join(imagesDir, imgFileName);
                            fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
                            const spDir = path.dirname(message.sidePanelFilePath);
                            const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                            const displayUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                            webviewPanel.webview.postMessage({
                                type: 'insertImageHtml',
                                markdownPath: relPath,
                                displayUri: displayUri,
                                dataUri: message.dataUrl
                            });
                        }
                        break;
                    }

                    case 'readAndInsertImage': {
                        // ドロップされたローカルファイル画像の読み取り+挿入
                        if (message.sidePanelFilePath && message.filePath) {
                            const pagesDir = this.getPagesDirPath(document);
                            const imagesDir = path.join(pagesDir, 'images');
                            if (!fs.existsSync(imagesDir)) {
                                fs.mkdirSync(imagesDir, { recursive: true });
                            }
                            const srcPath = message.filePath;
                            const imgFileName = path.basename(srcPath);
                            const destPath = path.join(imagesDir, imgFileName);
                            try {
                                fs.copyFileSync(srcPath, destPath);
                                const spDir = path.dirname(message.sidePanelFilePath);
                                const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                                const displayUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                                webviewPanel.webview.postMessage({
                                    type: 'insertImageHtml',
                                    markdownPath: relPath,
                                    displayUri: displayUri
                                });
                            } catch (e) {
                                console.error('[Outliner] readAndInsertImage error:', e);
                            }
                        }
                        break;
                    }

                    case 'setImageDir':
                        // outlinerページでは画像ディレクトリ変更不可 (要件PC-2)
                        break;
                }
            })
        );

        // --- 外部変更検知 ---
        disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                if (e.document.uri.toString() === document.uri.toString()) {
                    if (e.contentChanges.length === 0) return;
                    // 自己編集はスキップ (webviewに既に反映済み)
                    if (isApplyingOwnEdit) return;
                    // 外部変更時にwebviewを更新
                    if (e.contentChanges.length > 0) {
                        try {
                            const data = JSON.parse(document.getText());
                            webviewPanel.webview.postMessage({
                                type: 'updateData',
                                data: data
                            });
                        } catch {
                            // JSON パースエラーは無視
                        }
                    }
                }
            })
        );

        // --- 設定変更 ---
        disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('any-markdown.theme') ||
                    e.affectsConfiguration('any-markdown.fontSize')) {
                    updateWebview();
                }
            })
        );

        // --- Cleanup ---
        webviewPanel.onDidDispose(() => {
            if (this.activeWebviewPanel === webviewPanel) {
                this.activeWebviewPanel = undefined;
            }
            disposeSidePanelFileWatcher();
            disposables.forEach(d => d.dispose());
        });

        // Track active panel
        webviewPanel.onDidChangeViewState(() => {
            if (webviewPanel.active) {
                this.activeWebviewPanel = webviewPanel;
            }
        });
    }

    // --- Edit 適用 ---

    private async applyEdit(document: vscode.TextDocument, jsonString: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            jsonString
        );
        await vscode.workspace.applyEdit(edit);
    }

    // --- TOC抽出 (editorProvider.tsと同じロジック) ---

    private extractToc(markdown: string): Array<{level: number, text: string, anchor: string}> {
        const lines = markdown.split('\n');
        const toc: Array<{level: number, text: string, anchor: string}> = [];
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

    // --- ページ管理 ---

    private getPagesDirPath(document: vscode.TextDocument): string {
        // 1. mmd JSON内のpageDirフィールドを優先
        try {
            const data = JSON.parse(document.getText());
            if (data.pageDir) {
                if (path.isAbsolute(data.pageDir)) {
                    return data.pageDir;
                }
                return path.resolve(path.dirname(document.uri.fsPath), data.pageDir);
            }
        } catch { /* ignore parse errors */ }

        // 2. VSCode設定
        const config = vscode.workspace.getConfiguration('any-markdown');
        const configDir = config.get<string>('outlinerPageDir', './pages');
        if (path.isAbsolute(configDir)) {
            return configDir;
        }
        return path.resolve(path.dirname(document.uri.fsPath), configDir);
    }

    private getPageFilePath(document: vscode.TextDocument, pageId: string): string {
        return path.join(this.getPagesDirPath(document), `${pageId}.md`);
    }

    private async ensurePagesDir(document: vscode.TextDocument): Promise<void> {
        const pagesDir = this.getPagesDirPath(document);
        if (!fs.existsSync(pagesDir)) {
            fs.mkdirSync(pagesDir, { recursive: true });
        }
    }

    private async handleMakePage(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        message: { nodeId: string; pageId: string; title: string }
    ): Promise<void> {
        await this.ensurePagesDir(document);

        const filePath = this.getPageFilePath(document, message.pageId);
        const title = message.title || 'Untitled';
        const initialContent = `# ${title}\n\n`;

        fs.writeFileSync(filePath, initialContent, 'utf-8');

        webviewPanel.webview.postMessage({
            type: 'pageCreated',
            nodeId: message.nodeId,
            pageId: message.pageId
        });
    }

    private async handleOpenPage(
        document: vscode.TextDocument,
        _webviewPanel: vscode.WebviewPanel,
        message: { nodeId: string; pageId: string }
    ): Promise<void> {
        const filePath = this.getPageFilePath(document, message.pageId);

        if (!fs.existsSync(filePath)) {
            vscode.window.showWarningMessage(`Page file not found: ${filePath}`);
            return;
        }

        // outlinerページとして登録 (editorProviderで制約適用のため)
        const pagesDir = this.getPagesDirPath(document);
        OutlinerProvider.outlinerPagePaths.set(filePath, pagesDir);

        // any-markdown エディタでサイドに開く
        const fileUri = vscode.Uri.file(filePath);
        await vscode.commands.executeCommand(
            'vscode.openWith',
            fileUri,
            'any-markdown.editor',
            vscode.ViewColumn.Beside
        );
    }

}
