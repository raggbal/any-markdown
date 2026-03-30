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
 * 複数パネル対応: 各パネルが独立したfileManager/watcher/disposablesをクロージャで保持
 */
export class NotesEditorProvider {
    constructor(private context: vscode.ExtensionContext) {}

    async openNotesFolder(folderPath: string): Promise<void> {
        // フォルダ存在確認 (N-45)
        if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            vscode.window.showErrorMessage(`Notes folder not found: ${folderPath}`);
            return;
        }

        // --- パネル固有の状態（全てローカル変数） ---
        const fileManager = new NotesFileManager(folderPath);

        // .note構造をロード（自動マイグレーション含む）
        const noteStructure = fileManager.loadStructure();

        // ファイル一覧取得（空フォルダなら default outliner を自動作成）
        let fileList = fileManager.listFiles();
        if (fileList.length === 0) {
            fileManager.createFile('default');
            fileList = fileManager.listFiles();
        }
        let currentFilePath: string | null = null;
        let jsonContent = '{"version":1,"rootIds":[],"nodes":{}}';

        // 構造のツリー順で最初のファイルを開く
        const firstFileId = fileManager.findFirstFileId();
        if (firstFileId) {
            const fp = fileManager.getFilePathById(firstFileId);
            const content = fileManager.openFile(fp);
            if (content !== null) {
                currentFilePath = fp;
                jsonContent = content;
            }
        } else if (fileList.length > 0) {
            const content = fileManager.openFile(fileList[0].filePath);
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
        const panel = vscode.window.createWebviewPanel(
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
        panel.webview.html = getNotesWebviewContent(
            panel.webview,
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
                structure: fileManager.getStructure(),
                panelWidth: fileManager.getPanelWidth(),
                fileChangeId: fileManager.getFileChangeId(),
            }
        );

        // サイドパネル管理
        const sidePanel = new SidePanelManager(
            {
                postMessage: (msg: any) => panel.webview.postMessage(msg),
                asWebviewUri: (uri: vscode.Uri) => panel.webview.asWebviewUri(uri),
            },
            { logPrefix: '[Notes]' }
        );

        // Sender
        const sender: NotesSender = {
            postMessage: (msg: unknown) => {
                panel.webview.postMessage(msg);
            },
        };

        // Platform Actions (全てローカル変数 panel / fileManager / folderPath をキャプチャ)
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
                        panel.webview.postMessage({
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
                const fp = fileManager.getCurrentFilePath();
                if (fp) {
                    vscode.commands.executeCommand('vscode.openWith', vscode.Uri.file(fp), 'default');
                }
            },
            copyFilePath: () => {
                const fp = fileManager.getCurrentFilePath();
                if (fp) {
                    vscode.env.clipboard.writeText(fp);
                }
            },
            requestInsertImage: async (sidePanelFilePath: string) => {
                const pagesDir = fileManager.getPagesDirPath();
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
                    const displayUri = panel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                    panel.webview.postMessage({
                        type: 'insertImageHtml',
                        markdownPath: relPath,
                        displayUri,
                    });
                }
            },
            savePanelCollapsed: (collapsed: boolean) => {
                this.context.globalState.update(
                    `notesPanelCollapsed:${folderPath}`, collapsed
                );
            },
            requestSetPageDir: async () => {
                if (!fileManager.getCurrentFilePath()) return;
                const currentDir = fileManager.getPagesDirPath();
                const outDir = path.dirname(fileManager.getCurrentFilePath()!);
                const relCurrent = path.relative(outDir, currentDir);
                const input = await vscode.window.showInputBox({
                    prompt: 'Enter page directory (relative to .out file or absolute)',
                    value: relCurrent || './pages',
                });
                if (input !== undefined) {
                    try {
                        const content = fs.readFileSync(fileManager.getCurrentFilePath()!, 'utf8');
                        const data = JSON.parse(content);
                        data.pageDir = input || undefined;
                        const jsonStr = JSON.stringify(data, null, 2);
                        fs.writeFileSync(fileManager.getCurrentFilePath()!, jsonStr, 'utf8');
                        panel.webview.postMessage({
                            type: 'pageDirChanged',
                            pageDir: input,
                        });
                    } catch {
                        vscode.window.showErrorMessage('Failed to update page directory setting');
                    }
                }
            },
            saveImageToDir: (dataUrl: string, fileName: string, sidePanelFilePath: string) => {
                const pagesDir = fileManager.getPagesDirPath();
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
                const displayUri = panel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                panel.webview.postMessage({
                    type: 'insertImageHtml',
                    markdownPath: relPath,
                    displayUri,
                    dataUri: dataUrl,
                });
            },
            readAndInsertImage: (filePath: string, sidePanelFilePath: string) => {
                const pagesDir = fileManager.getPagesDirPath();
                const imagesDir = path.join(pagesDir, 'images');
                if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });
                const imgFileName = path.basename(filePath);
                const destPath = path.join(imagesDir, imgFileName);
                try {
                    fs.copyFileSync(filePath, destPath);
                    const spDir = path.dirname(sidePanelFilePath);
                    const relPath = path.relative(spDir, destPath).replace(/\\/g, '/');
                    const displayUri = panel.webview.asWebviewUri(vscode.Uri.file(destPath)).toString();
                    panel.webview.postMessage({
                        type: 'insertImageHtml',
                        markdownPath: relPath,
                        displayUri,
                    });
                } catch (e) {
                    console.error('[Notes] readAndInsertImage error:', e);
                }
            },
            sendSidePanelImageDir: (sidePanelFilePath: string) => {
                const pagesDir = fileManager.getPagesDirPath();
                const imagesDir = path.join(pagesDir, 'images');
                const spDir = path.dirname(sidePanelFilePath);
                const displayPath = path.relative(spDir, imagesDir).replace(/\\/g, '/') || '.';
                panel.webview.postMessage({
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
                this.context.globalState.update(
                    `notesLastFile:${folderPath}`, filePath
                );
            },
            s3Sync: (bucketPath: string) => {
                this.runS3Operation('s3Sync', bucketPath, sender, fileManager, folderPath);
            },
            s3RemoteDeleteAndUpload: (bucketPath: string) => {
                this.runS3Operation('s3RemoteDeleteAndUpload', bucketPath, sender, fileManager, folderPath);
            },
            s3LocalDeleteAndDownload: (bucketPath: string) => {
                this.runS3Operation('s3LocalDeleteAndDownload', bucketPath, sender, fileManager, folderPath);
            },
            s3GetStatus: () => {
                const fractalConfig = vscode.workspace.getConfiguration('fractal');
                const bucketPath = fileManager.getS3BucketPath();
                const hasCredentials = !!(fractalConfig.get<string>('s3AccessKeyId') && fractalConfig.get<string>('s3SecretAccessKey'));
                sender.postMessage({
                    type: 'notesS3Status',
                    bucketPath: bucketPath || '',
                    hasCredentials,
                    region: fractalConfig.get<string>('s3Region', 'us-east-1'),
                });
            },
        };

        // --- パネル固有の disposables ---
        const disposables: vscode.Disposable[] = [];

        // メッセージハンドラ登録
        disposables.push(
            panel.webview.onDidReceiveMessage((message) => {
                handleNotesMessage(message, fileManager, sender, platform);
            })
        );

        // テーマ変更対応 (N-50b)
        disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('fractal.language')) {
                    const langConfig = vscode.workspace.getConfiguration('fractal');
                    initLocale(langConfig.get<string>('language', 'default'), vscode.env.language);
                }
                if (e.affectsConfiguration('fractal.theme') ||
                    e.affectsConfiguration('fractal.fontSize') ||
                    e.affectsConfiguration('fractal.outlinerPageTitle') ||
                    e.affectsConfiguration('fractal.language')) {
                    // refreshPanel inline (ローカル変数を使用)
                    const refreshConfig = vscode.workspace.getConfiguration('fractal');
                    const refreshFileList = fileManager.listFiles();
                    const refreshCurrentFile = fileManager.getCurrentFilePath();
                    let refreshJsonContent = '{"version":1,"rootIds":[],"nodes":{}}';
                    if (refreshCurrentFile) {
                        const refreshContent = fileManager.openFile(refreshCurrentFile);
                        if (refreshContent !== null) refreshJsonContent = refreshContent;
                    }
                    const refreshPanelCollapsed = this.context.globalState.get<boolean>(
                        `notesPanelCollapsed:${folderPath}`, false
                    );
                    panel.webview.html = getNotesWebviewContent(
                        panel.webview,
                        this.context.extensionUri,
                        {
                            theme: refreshConfig.get<string>('theme', 'github'),
                            fontSize: refreshConfig.get<number>('fontSize', 16),
                            webviewMessages: getWebviewMessages() as unknown as Record<string, string>,
                            enableDebugLogging: refreshConfig.get<boolean>('enableDebugLogging', false),
                            outlinerPageTitle: refreshConfig.get<boolean>('outlinerPageTitle', true),
                        },
                        { jsonContent: refreshJsonContent, fileList: refreshFileList, currentFilePath: refreshCurrentFile, panelCollapsed: refreshPanelCollapsed, structure: fileManager.getStructure(), panelWidth: fileManager.getPanelWidth(), fileChangeId: fileManager.getFileChangeId() }
                    );
                }
            })
        );

        // --- パネル固有のフォルダ監視 ---
        const watcherPattern = new vscode.RelativePattern(vscode.Uri.file(folderPath), '*.out');
        const folderWatcher = vscode.workspace.createFileSystemWatcher(watcherPattern);

        const refreshFileListFromWatcher = () => {
            try {
                fileManager.invalidateStructureCache();
                const structure = fileManager.loadStructure();
                const wFileList = fileManager.listFiles();
                const currentFile = fileManager.getCurrentFilePath();
                panel.webview.postMessage({
                    type: 'notesFileListChanged',
                    fileList: wFileList,
                    structure,
                    currentFile,
                });
            } catch {
                // ファイル読み込みエラーは無視
            }
        };

        disposables.push(folderWatcher.onDidCreate(refreshFileListFromWatcher));
        disposables.push(folderWatcher.onDidDelete(refreshFileListFromWatcher));

        // 現在開いている.outファイルの外部変更検知
        disposables.push(folderWatcher.onDidChange((uri) => {
            const currentFile = fileManager.getCurrentFilePath();
            if (!currentFile) return;
            if (uri.fsPath !== currentFile) return;
            if (fileManager.getIsWriting()) return;

            setTimeout(() => {
                try {
                    if (fileManager.getIsWriting()) return;
                    const content = fs.readFileSync(currentFile, 'utf8');
                    if (content === fileManager.getLastKnownContent()) return;
                    const data = JSON.parse(content);
                    panel.webview.postMessage({ type: 'updateData', data });
                    fileManager.updateLastKnownContent(content);
                } catch {
                    // JSONパースエラー or ファイル読み込みエラーは無視
                }
            }, 200);
        }));

        disposables.push(folderWatcher);

        // --- outline.note の外部変更検知 ---
        const noteFileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.file(folderPath), 'outline.note')
        );

        disposables.push(noteFileWatcher.onDidChange(() => {
            if (fileManager.getIsWritingStructure()) return;

            setTimeout(() => {
                try {
                    if (fileManager.getIsWritingStructure()) return;

                    // 内容比較: 同じなら何もしない（isWritingStructureタイミングずれの安全弁）
                    const noteFilePath = path.join(folderPath, 'outline.note');
                    const noteContent = fs.readFileSync(noteFilePath, 'utf8');
                    if (noteContent === fileManager.getLastKnownStructureContent()) return;

                    // 構造を再読み込みしてwebviewに送信
                    fileManager.invalidateStructureCache();
                    const structure = fileManager.loadStructure();
                    const noteFileList = fileManager.listFiles();
                    const currentFile = fileManager.getCurrentFilePath();
                    panel.webview.postMessage({
                        type: 'notesFileListChanged',
                        fileList: noteFileList,
                        structure,
                        currentFile,
                    });
                    fileManager.updateLastKnownStructureContent(noteContent);
                } catch {
                    // 読み込みエラーは無視
                }
            }, 200);
        }));

        disposables.push(noteFileWatcher);

        // パネル破棄時のクリーンアップ
        panel.onDidDispose(() => {
            fileManager.dispose();
            sidePanel.disposeFileWatcher();
            // folderWatcher, noteFileWatcher は disposables に含まれているため
            // disposables.forEach で一括dispose（二重disposeを避ける）
            disposables.forEach(d => d.dispose());
        });
    }

    private getS3Config(bucketPath: string, folderPath: string): S3SyncConfig | null {
        const config = vscode.workspace.getConfiguration('fractal');
        const accessKeyId = config.get<string>('s3AccessKeyId', '');
        const secretAccessKey = config.get<string>('s3SecretAccessKey', '');
        const region = config.get<string>('s3Region', 'us-east-1');
        if (!accessKeyId || !secretAccessKey) {
            vscode.window.showErrorMessage('AWS credentials not configured. Set fractal.s3AccessKeyId and s3SecretAccessKey in settings.');
            return null;
        }
        return { accessKeyId, secretAccessKey, region, bucketPath, localPath: folderPath };
    }

    private async runS3Operation(
        op: 's3Sync' | 's3RemoteDeleteAndUpload' | 's3LocalDeleteAndDownload',
        bucketPath: string,
        sender: NotesSender,
        fileManager: NotesFileManager,
        folderPath: string,
    ): Promise<void> {
        fileManager.flushSave();

        const config = this.getS3Config(bucketPath, folderPath);
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
                sender.postMessage({ type: 'notesS3Progress', phase: 'complete', message: 'Local delete & download complete. Reopening...' });
                await this.openNotesFolder(folderPath);
                return;
            }
        } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            sender.postMessage({ type: 'notesS3Progress', phase: 'error', message });
        }
    }
}
