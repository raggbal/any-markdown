import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NotesFileManager } from './shared/notes-file-manager';
import { handleNotesMessage, NotesSender, NotesPlatformActions } from './shared/notes-message-handler';
import { getNotesWebviewContent } from './notesWebviewContent';
import { getWebviewMessages } from './i18n/messages';
import { SidePanelManager } from './shared/sidePanelManager';

/**
 * NotesEditorProvider — WebviewPanel で Notes エディタを開く
 * 同時に開けるパネルは1つのみ (N-50a)
 */
export class NotesEditorProvider {
    private panel: vscode.WebviewPanel | undefined;
    private fileManager: NotesFileManager | undefined;
    private currentFolderPath: string | undefined;
    private disposables: vscode.Disposable[] = [];
    private folderWatcher: vscode.FileSystemWatcher | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    async openNotesFolder(folderPath: string): Promise<void> {
        // 既にパネルがある場合は閉じる (N-50a)
        if (this.panel) {
            this.disposePanel();
        }

        // フォルダ存在確認 (N-45)
        if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            vscode.window.showErrorMessage(`Notes folder not found: ${folderPath}`);
            return;
        }

        this.currentFolderPath = folderPath;
        this.fileManager = new NotesFileManager(folderPath);

        // .note構造をロード（自動マイグレーション含む）
        const noteStructure = this.fileManager.loadStructure();

        // ファイル一覧取得（空フォルダなら default outliner を自動作成）
        let fileList = this.fileManager.listFiles();
        if (fileList.length === 0) {
            this.fileManager.createFile('default');
            fileList = this.fileManager.listFiles();
        }
        let currentFilePath: string | null = null;
        let jsonContent = '{"version":1,"rootIds":[],"nodes":{}}';

        // 構造のツリー順で最初のファイルを開く
        const firstFileId = this.fileManager.findFirstFileId();
        if (firstFileId) {
            const fp = this.fileManager.getFilePathById(firstFileId);
            const content = this.fileManager.openFile(fp);
            if (content !== null) {
                currentFilePath = fp;
                jsonContent = content;
            }
        } else if (fileList.length > 0) {
            const content = this.fileManager.openFile(fileList[0].filePath);
            if (content !== null) {
                currentFilePath = fileList[0].filePath;
                jsonContent = content;
            }
        }

        // パネル折り畳み状態を復元
        const panelCollapsed = this.context.globalState.get<boolean>(
            `notesPanelCollapsed:${folderPath}`, false
        );

        // WebviewPanel 作成
        this.panel = vscode.window.createWebviewPanel(
            'any-markdown.notes',
            `Notes: ${path.basename(folderPath)}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'media'),
                    vscode.Uri.joinPath(this.context.extensionUri, 'vendor'),
                    vscode.Uri.file(folderPath),
                ],
            }
        );

        // HTML 生成
        const config = vscode.workspace.getConfiguration('any-markdown');
        this.panel.webview.html = getNotesWebviewContent(
            this.panel.webview,
            this.context.extensionUri,
            {
                theme: config.get<string>('theme', 'github'),
                fontSize: config.get<number>('fontSize', 16),
                webviewMessages: getWebviewMessages() as unknown as Record<string, string>,
                enableDebugLogging: config.get<boolean>('enableDebugLogging', false),
            },
            {
                jsonContent,
                fileList,
                currentFilePath,
                panelCollapsed,
                structure: this.fileManager.getStructure(),
                panelWidth: this.fileManager.getPanelWidth(),
            }
        );

        // サイドパネル管理
        const sidePanel = new SidePanelManager(
            {
                postMessage: (msg: any) => this.panel ? this.panel.webview.postMessage(msg) : Promise.resolve(false),
                asWebviewUri: (uri: vscode.Uri) => this.panel!.webview.asWebviewUri(uri),
            },
            { logPrefix: '[Notes]' }
        );

        // Sender
        const sender: NotesSender = {
            postMessage: (msg: unknown) => {
                this.panel?.webview.postMessage(msg);
            },
        };

        // Platform Actions
        const platform: NotesPlatformActions = {
            openExternalLink: (href: string) => {
                vscode.env.openExternal(vscode.Uri.parse(href));
            },
            openFileInEditor: (filePath: string) => {
                const uri = vscode.Uri.file(filePath);
                vscode.commands.executeCommand('vscode.openWith', uri, 'any-markdown.editor');
            },
            openPageInSidePanel: async (filePath: string, lineNumber?: number) => {
                if (!fs.existsSync(filePath)) {
                    vscode.window.showWarningMessage(`Page file not found: ${filePath}`);
                    return;
                }
                await sidePanel.openFile(filePath);
                if (lineNumber !== undefined) {
                    setTimeout(() => {
                        this.panel?.webview.postMessage({
                            type: 'scrollToLine',
                            lineNumber: lineNumber,
                        });
                    }, 500);
                }
            },
            openFileExternal: async (filePath: string) => {
                const uri = vscode.Uri.file(filePath);
                await vscode.commands.executeCommand('vscode.open', uri);
            },
            requestInsertImage: async (sidePanelFilePath: string) => {
                if (!this.fileManager) return;
                const pagesDir = this.fileManager.getPagesDirPath();
                const imagesDir = path.join(pagesDir, 'images');
                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    filters: { 'Images': ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] },
                };
                const fileUris = await vscode.window.showOpenDialog(options);
                if (fileUris && fileUris[0]) {
                    const srcPath = fileUris[0].fsPath;
                    const imgFileName = path.basename(srcPath);
                    const destPath = path.join(imagesDir, imgFileName);
                    fs.copyFileSync(srcPath, destPath);
                    const spDir = path.dirname(sidePanelFilePath);
                    const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                    const displayUri = this.panel!.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                    this.panel?.webview.postMessage({
                        type: 'insertImageHtml',
                        markdownPath: relPath,
                        displayUri,
                    });
                }
            },
            savePanelCollapsed: (collapsed: boolean) => {
                if (this.currentFolderPath) {
                    this.context.globalState.update(
                        `notesPanelCollapsed:${this.currentFolderPath}`, collapsed
                    );
                }
            },
            requestSetPageDir: async () => {
                if (!this.fileManager || !this.fileManager.getCurrentFilePath()) return;
                const currentDir = this.fileManager.getPagesDirPath();
                const outDir = path.dirname(this.fileManager.getCurrentFilePath()!);
                const relCurrent = path.relative(outDir, currentDir);
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter page directory (relative to .out file or absolute)',
                    value: relCurrent || './pages',
                });
                if (input !== undefined) {
                    try {
                        const content = fs.readFileSync(this.fileManager.getCurrentFilePath()!, 'utf8');
                        const data = JSON.parse(content);
                        data.pageDir = input || undefined;
                        const jsonStr = JSON.stringify(data, null, 2);
                        fs.writeFileSync(this.fileManager.getCurrentFilePath()!, jsonStr, 'utf8');
                        this.panel?.webview.postMessage({
                            type: 'pageDirChanged',
                            pageDir: input,
                        });
                    } catch {
                        vscode.window.showErrorMessage('Failed to update page directory setting');
                    }
                }
            },
            saveImageToDir: (dataUrl: string, fileName: string, sidePanelFilePath: string) => {
                if (!this.fileManager) return;
                const pagesDir = this.fileManager.getPagesDirPath();
                const imagesDir = path.join(pagesDir, 'images');
                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
                let imgFileName = fileName;
                if (!imgFileName) {
                    const extMatch = dataUrl.match(/^data:image\/(\w+);/);
                    const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg') : 'png';
                    imgFileName = `image_${Date.now()}.${ext}`;
                }
                const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
                const destPath = path.join(imagesDir, imgFileName);
                fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
                const spDir = path.dirname(sidePanelFilePath);
                const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                const displayUri = this.panel!.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                this.panel?.webview.postMessage({
                    type: 'insertImageHtml',
                    markdownPath: relPath,
                    displayUri,
                    dataUri: dataUrl,
                });
            },
            readAndInsertImage: (filePath: string, sidePanelFilePath: string) => {
                if (!this.fileManager) return;
                const pagesDir = this.fileManager.getPagesDirPath();
                const imagesDir = path.join(pagesDir, 'images');
                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
                const imgFileName = path.basename(filePath);
                const destPath = path.join(imagesDir, imgFileName);
                try {
                    fs.copyFileSync(filePath, destPath);
                    const spDir = path.dirname(sidePanelFilePath);
                    const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                    const displayUri = this.panel!.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                    this.panel?.webview.postMessage({
                        type: 'insertImageHtml',
                        markdownPath: relPath,
                        displayUri,
                    });
                } catch (e) {
                    console.error('[Notes] readAndInsertImage error:', e);
                }
            },
            sendSidePanelImageDir: (sidePanelFilePath: string) => {
                if (!this.fileManager) return;
                const pagesDir = this.fileManager.getPagesDirPath();
                const imagesDir = path.join(pagesDir, 'images');
                const spDir = path.dirname(sidePanelFilePath);
                const displayPath = path.relative(spDir, imagesDir).replace(/\\/g, '/') || '.';
                this.panel?.webview.postMessage({
                    type: 'sidePanelImageDirStatus',
                    displayPath,
                    source: 'default',
                });
            },
            saveSidePanelFile: async (filePath: string, content: string) => {
                await sidePanel.handleSave(filePath, content);
            },
            handleSidePanelOpenLink: (href: string, sidePanelFilePath: string) => {
                sidePanel.handleOpenLink(href, sidePanelFilePath);
            },
            handleSidePanelClosed: () => {
                sidePanel.handleClose();
            },
            saveLastOpenedFile: (filePath: string) => {
                if (this.currentFolderPath) {
                    this.context.globalState.update(
                        `notesLastFile:${this.currentFolderPath}`, filePath
                    );
                }
            },
        };

        // メッセージハンドラ登録
        this.disposables.push(
            this.panel.webview.onDidReceiveMessage((message) => {
                if (!this.fileManager) return;
                handleNotesMessage(message, this.fileManager, sender, platform);
            })
        );

        // テーマ変更対応 (N-50b)
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('any-markdown.theme') ||
                    e.affectsConfiguration('any-markdown.fontSize')) {
                    this.refreshPanel();
                }
            })
        );

        // フォルダ監視 (N-44)
        this.setupFolderWatcher(folderPath);

        // パネル破棄時のクリーンアップ
        this.panel.onDidDispose(() => {
            this.disposePanel();
        });
    }

    private refreshPanel(): void {
        if (!this.panel || !this.fileManager || !this.currentFolderPath) return;
        const config = vscode.workspace.getConfiguration('any-markdown');
        const fileList = this.fileManager.listFiles();
        const currentFilePath = this.fileManager.getCurrentFilePath();
        let jsonContent = '{"version":1,"rootIds":[],"nodes":{}}';
        if (currentFilePath) {
            const content = this.fileManager.openFile(currentFilePath);
            if (content !== null) jsonContent = content;
        }
        const panelCollapsed = this.context.globalState.get<boolean>(
            `notesPanelCollapsed:${this.currentFolderPath}`, false
        );

        this.panel.webview.html = getNotesWebviewContent(
            this.panel.webview,
            this.context.extensionUri,
            {
                theme: config.get<string>('theme', 'github'),
                fontSize: config.get<number>('fontSize', 16),
                webviewMessages: getWebviewMessages() as unknown as Record<string, string>,
                enableDebugLogging: config.get<boolean>('enableDebugLogging', false),
            },
            { jsonContent, fileList, currentFilePath, panelCollapsed, structure: this.fileManager.getStructure(), panelWidth: this.fileManager.getPanelWidth() }
        );
    }

    private setupFolderWatcher(folderPath: string): void {
        this.folderWatcher?.dispose();
        const pattern = new vscode.RelativePattern(vscode.Uri.file(folderPath), '*.out');
        this.folderWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        const refreshFileList = () => {
            if (!this.fileManager || !this.panel) return;
            // ディスク変更を検知したら構造を再同期
            (this.fileManager as any).structure = null; // キャッシュ無効化
            const structure = this.fileManager.loadStructure();
            const fileList = this.fileManager.listFiles();
            const currentFile = this.fileManager.getCurrentFilePath();
            this.panel.webview.postMessage({
                type: 'notesFileListChanged',
                fileList,
                structure,
                currentFile,
            });
        };

        this.disposables.push(this.folderWatcher.onDidCreate(refreshFileList));
        this.disposables.push(this.folderWatcher.onDidDelete(refreshFileList));
        this.disposables.push(this.folderWatcher);
    }

    private disposePanel(): void {
        this.fileManager?.dispose();
        this.fileManager = undefined;
        this.folderWatcher?.dispose();
        this.folderWatcher = undefined;
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
        this.panel = undefined;
        this.currentFolderPath = undefined;
    }
}
