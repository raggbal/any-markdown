import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getOutlinerWebviewContent } from './outlinerWebviewContent';
import { getWebviewMessages } from './i18n/messages';
import { SidePanelManager } from './shared/sidePanelManager';

/**
 * OutlinerProvider — .out ファイル用 Custom Text Editor Provider
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

    public sendScopeIn(): void {
        this.activeWebviewPanel?.webview.postMessage({ type: 'scopeIn' });
    }

    public sendScopeOut(): void {
        this.activeWebviewPanel?.webview.postMessage({ type: 'scopeOut' });
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
                        enableDebugLogging: config.get<boolean>('enableDebugLogging', false),
                        outlinerPageTitle: config.get<boolean>('outlinerPageTitle', true)
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

        // --- サイドパネル管理 (SidePanelManager で共通化) ---
        const sidePanel = new SidePanelManager(
            {
                postMessage: (msg: any) => webviewPanel.webview.postMessage(msg),
                asWebviewUri: (uri: vscode.Uri) => webviewPanel.webview.asWebviewUri(uri)
            },
            { logPrefix: '[Outliner]' }
        );

        // 画像ディレクトリ状態送信 (outliner固有: {pageDir}/images/ に固定, 要件PC-1)
        const sendSidePanelImageDirStatus = (spFilePath: string) => {
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

                    case 'openInTextEditor':
                        await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
                        break;

                    case 'copyFilePath':
                        await vscode.env.clipboard.writeText(document.uri.fsPath);
                        break;

                    case 'makePage':
                        await this.handleMakePage(document, webviewPanel, message);
                        break;

                    case 'removePage':
                        await this.handleRemovePage(document, sidePanel, message);
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
                            prompt: 'Enter page directory (relative to .out file or absolute)',
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
                        await sidePanel.openFile(filePath);
                        break;
                    }

                    case 'saveSidePanelFile':
                        await sidePanel.handleSave(message.filePath, message.content);
                        break;

                    case 'sidePanelClosed':
                        sidePanel.handleClose();
                        break;

                    case 'sidePanelOpenLink':
                        await sidePanel.handleOpenLink(message.href, message.sidePanelFilePath);
                        break;

                    case 'sidePanelOpenInTextEditor':
                        if (message.sidePanelFilePath) {
                            const spTextUri = vscode.Uri.file(message.sidePanelFilePath);
                            await vscode.commands.executeCommand('vscode.openWith', spTextUri, 'default');
                        }
                        break;

                    case 'sendToChat': {
                        const spFilePath = message.sidePanelFilePath as string;
                        if (spFilePath && message.startLine != null && message.endLine != null) {
                            try {
                                await sidePanel.handleSendToChat(
                                    spFilePath, message.startLine, message.endLine, message.selectedMarkdown || ''
                                );
                            } catch (err) {
                                console.error('[Outliner] sendToChat error:', err);
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
                    e.affectsConfiguration('any-markdown.fontSize') ||
                    e.affectsConfiguration('any-markdown.outlinerPageTitle')) {
                    updateWebview();
                }
            })
        );

        // --- Cleanup ---
        webviewPanel.onDidDispose(() => {
            if (this.activeWebviewPanel === webviewPanel) {
                this.activeWebviewPanel = undefined;
            }
            sidePanel.disposeFileWatcher();
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

    // --- ページ管理 ---

    private getPagesDirPath(document: vscode.TextDocument): string {
        // 1. out JSON内のpageDirフィールドを優先
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

    private async handleRemovePage(
        document: vscode.TextDocument,
        sidePanel: SidePanelManager,
        message: { nodeId: string; pageId: string }
    ): Promise<void> {
        if (!message.pageId) { return; }
        const filePath = this.getPageFilePath(document, message.pageId);
        if (!fs.existsSync(filePath)) { return; }

        // サイドパネルで開いている場合は先に閉じる
        if (sidePanel.watchedPath === filePath) {
            sidePanel.handleClose();
        }

        try {
            await vscode.workspace.fs.delete(
                vscode.Uri.file(filePath),
                { useTrash: true }
            );
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to move page file to trash: ${filePath}`);
        }
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
