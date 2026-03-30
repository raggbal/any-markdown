import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { NotesFileManager } from './shared/notes-file-manager';
import { handleNotesMessage, NotesSender, NotesPlatformActions } from './shared/notes-message-handler';
import { getNotesWebviewContent } from './notesWebviewContent';
import { getWebviewMessages, initLocale } from './i18n/messages';
import { SidePanelManager } from './shared/sidePanelManager';
import { s3Sync, s3RemoteDeleteAndUpload, s3LocalDeleteAndDownload, S3SyncConfig } from './notes-s3-sync';

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
            'fractal.notes',
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
        const config = vscode.workspace.getConfiguration('fractal');
        this.panel.webview.html = getNotesWebviewContent(
            this.panel.webview,
            this.context.extensionUri,
            {
                theme: config.get<string>('theme', 'github'),
                fontSize: config.get<number>('fontSize', 16),
                webviewMessages: getWebviewMessages() as unknown as Record<string, string>,
                enableDebugLogging: config.get<boolean>('enableDebugLogging', false),
                outlinerPageTitle: config.get<boolean>('outlinerPageTitle', true),
            },
            {
                jsonContent,
                fileList,
                currentFilePath,
                panelCollapsed,
                structure: this.fileManager.getStructure(),
                panelWidth: this.fileManager.getPanelWidth(),
                fileChangeId: this.fileManager.getFileChangeId(),
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
                vscode.commands.executeCommand('vscode.openWith', uri, 'fractal.editor');
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
            openInTextEditor: () => {
                const fp = this.fileManager?.getCurrentFilePath();
                if (fp) {
                    vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(fp), 'default');
                }
            },
            copyFilePath: () => {
                const fp = this.fileManager?.getCurrentFilePath();
                if (fp) {
                    vscode.env.clipboard.writeText(fp);
                }
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
            handleSidePanelOpenInTextEditor: (sidePanelFilePath: string) => {
                if (sidePanelFilePath) {
                    const spTextUri = vscode.Uri.file(sidePanelFilePath);
                    vscode.commands.executeCommand('vscode.openWith', spTextUri, 'default');
                }
            },
            handleSidePanelClosed: () => {
                sidePanel.handleClose();
            },
            sendToChatFromSidePanel: async (sidePanelFilePath: string, startLine: number, endLine: number, selectedMarkdown: string) => {
                try {
                    await sidePanel.handleSendToChat(sidePanelFilePath, startLine, endLine, selectedMarkdown);
                } catch (err) {
                    console.error('[Notes] sendToChat error:', err);
                }
            },
            saveLastOpenedFile: (filePath: string) => {
                if (this.currentFolderPath) {
                    this.context.globalState.update(
                        `notesLastFile:${this.currentFolderPath}`, filePath
                    );
                }
            },
            s3Sync: (bucketPath: string) => {
                this.runS3Operation('s3Sync', bucketPath, sender);
            },
            s3RemoteDeleteAndUpload: (bucketPath: string) => {
                this.runS3Operation('s3RemoteDeleteAndUpload', bucketPath, sender);
            },
            s3LocalDeleteAndDownload: (bucketPath: string) => {
                this.runS3Operation('s3LocalDeleteAndDownload', bucketPath, sender);
            },
            s3GetStatus: () => {
                if (!this.fileManager) return;
                const config = vscode.workspace.getConfiguration('fractal');
                const bucketPath = this.fileManager.getS3BucketPath();
                const hasCredentials = !!(config.get<string>('s3AccessKeyId') && config.get<string>('s3SecretAccessKey'));
                sender.postMessage({
                    type: 'notesS3Status',
                    bucketPath: bucketPath || '',
                    hasCredentials,
                    region: config.get<string>('s3Region', 'us-east-1'),
                });
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
                if (e.affectsConfiguration('fractal.language')) {
                    const langConfig = vscode.workspace.getConfiguration('fractal');
                    initLocale(langConfig.get<string>('language', 'default'), vscode.env.language);
                }
                if (e.affectsConfiguration('fractal.theme') ||
                    e.affectsConfiguration('fractal.fontSize') ||
                    e.affectsConfiguration('fractal.outlinerPageTitle') ||
                    e.affectsConfiguration('fractal.language')) {
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
        const config = vscode.workspace.getConfiguration('fractal');
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
                outlinerPageTitle: config.get<boolean>('outlinerPageTitle', true),
            },
            { jsonContent, fileList, currentFilePath, panelCollapsed, structure: this.fileManager.getStructure(), panelWidth: this.fileManager.getPanelWidth(), fileChangeId: this.fileManager.getFileChangeId() }
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

    private getS3Config(bucketPath: string): S3SyncConfig | null {
        const config = vscode.workspace.getConfiguration('fractal');
        const accessKeyId = config.get<string>('s3AccessKeyId', '');
        const secretAccessKey = config.get<string>('s3SecretAccessKey', '');
        const region = config.get<string>('s3Region', 'us-east-1');
        if (!accessKeyId || !secretAccessKey) {
            vscode.window.showErrorMessage('AWS credentials not configured. Set fractal.s3AccessKeyId and s3SecretAccessKey in settings.');
            return null;
        }
        if (!this.currentFolderPath) return null;
        return { accessKeyId, secretAccessKey, region, bucketPath, localPath: this.currentFolderPath };
    }

    private async runS3Operation(
        op: 's3Sync' | 's3RemoteDeleteAndUpload' | 's3LocalDeleteAndDownload',
        bucketPath: string,
        sender: NotesSender,
    ): Promise<void> {
        if (!this.fileManager || !this.currentFolderPath) return;
        this.fileManager.flushSave();

        const config = this.getS3Config(bucketPath);
        if (!config) {
            sender.postMessage({ type: 'notesS3Progress', phase: 'error', message: 'AWS credentials not configured.' });
            return;
        }

        const onProgress = (p: { phase: string; message: string; currentFile?: string; filesProcessed?: number }) => {
            sender.postMessage({ type: 'notesS3Progress', ...p });
        };

        try {
            if (op === 's3Sync') {
                await s3Sync(config, onProgress);
            } else if (op === 's3RemoteDeleteAndUpload') {
                await s3RemoteDeleteAndUpload(config, onProgress);
            } else {
                await s3LocalDeleteAndDownload(config, onProgress);
                // ローカルファイルが完全に入れ替わったので、パネルを開き直して完全初期化
                sender.postMessage({ type: 'notesS3Progress', phase: 'complete', message: 'Local delete & download complete. Reopening...' });
                if (this.currentFolderPath) {
                    await this.openNotesFolder(this.currentFolderPath);
                }
                return; // openNotesFolder が全てを再構築するので、後続の complete 送信は不要
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            sender.postMessage({ type: 'notesS3Progress', phase: 'error', message });
        }
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
