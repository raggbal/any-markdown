import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getOutlinerWebviewContent } from './outlinerWebviewContent';

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
                        fontSize: config.get<number>('fontSize', 16)
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
        return path.join(path.dirname(document.uri.fsPath), 'pages');
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
