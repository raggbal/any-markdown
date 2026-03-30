import * as fs from 'fs';
import * as path from 'path';
import { NotesFileManager } from './notes-file-manager';

/**
 * Webview へのメッセージ送信インターフェース
 * VSCode: panel.webview.postMessage()
 * Electron: win.webContents.send('host-message', ...)
 */
export interface NotesSender {
    postMessage(message: unknown): void;
}

/**
 * プラットフォーム固有アクションのインターフェース
 */
export interface NotesPlatformActions {
    /** 外部リンクをブラウザで開く */
    openExternalLink(href: string): void;
    /** .md ファイルをエディタで開く (Electron: createWindow, VSCode: vscode.openWith) */
    openFileInEditor(filePath: string): void;
    /** サイドパネルでページを開く (lineNumber指定時はスクロール) */
    openPageInSidePanel(filePath: string, lineNumber?: number): void;
    /** 画像挿入ダイアログ表示 */
    requestInsertImage(sidePanelFilePath: string): void;
    /** パネル折り畳み状態を永続化 */
    savePanelCollapsed(collapsed: boolean): void;
    /** ページディレクトリ変更ダイアログ */
    requestSetPageDir(): void;
    /** 画像をディレクトリに保存してマークダウン挿入 */
    saveImageToDir(dataUrl: string, fileName: string, sidePanelFilePath: string): void;
    /** ファイルを画像ディレクトリにコピーしてマークダウン挿入 */
    readAndInsertImage(filePath: string, sidePanelFilePath: string): void;
    /** サイドパネルの画像ディレクトリ情報を送信 */
    sendSidePanelImageDir(sidePanelFilePath: string): void;
    /** サイドパネルファイルを保存 */
    saveSidePanelFile(filePath: string, content: string): Promise<void>;
    /** サイドパネルのリンクを処理 */
    handleSidePanelOpenLink(href: string, sidePanelFilePath: string): void;
    /** サイドパネルファイルをテキストエディタで開く */
    handleSidePanelOpenInTextEditor?(sidePanelFilePath: string): void;
    /** サイドパネルが閉じられた */
    handleSidePanelClosed(): void;
    /** サイドパネルの sendToChat を処理（テキストエディタで開いて行選択） */
    sendToChatFromSidePanel?(sidePanelFilePath: string, startLine: number, endLine: number, selectedMarkdown: string): Promise<void>;
    /** .outファイルをテキストエディタで開く */
    openInTextEditor?(): void;
    /** .outファイルパスをクリップボードにコピー */
    copyFilePath?(): void;
    /** 外部エディタでファイルを開く */
    openFileExternal?(filePath: string): void;
    /** 最後に開いたファイルを記録 */
    saveLastOpenedFile?(filePath: string): void;
    /** ファイル検索 */
    searchFiles?(query: string): void;
    /** S3同期（バックアップ） */
    s3Sync?(bucketPath: string): void;
    /** S3リモート全削除＋アップロード */
    s3RemoteDeleteAndUpload?(bucketPath: string): void;
    /** S3ローカル全削除＋ダウンロード */
    s3LocalDeleteAndDownload?(bucketPath: string): void;
    /** S3ステータス取得（認証情報の有無、バケットパス） */
    s3GetStatus?(): void;
}

/**
 * 構造付きファイルリスト更新メッセージを送信するヘルパー
 */
function sendFileListWithStructure(
    fileManager: NotesFileManager,
    sender: NotesSender,
    currentFile?: string | null
): void {
    const fileList = fileManager.listFiles();
    const structure = fileManager.getStructure();
    sender.postMessage({
        type: 'notesFileListChanged',
        fileList,
        structure,
        currentFile: currentFile !== undefined ? currentFile : fileManager.getCurrentFilePath(),
    });
}

/**
 * Notes メッセージハンドラ
 * webview からのメッセージを処理する共通ロジック
 */
export function handleNotesMessage(
    message: any,
    fileManager: NotesFileManager,
    sender: NotesSender,
    platform: NotesPlatformActions
): void {
    switch (message.type) {
        // ── Core Data ──

        case 'syncData':
            // stale sync（ファイル切替前のデータ）を無視
            if (message.fileChangeId !== undefined && message.fileChangeId !== fileManager.getFileChangeId()) {
                break;
            }
            fileManager.saveCurrentFile(message.content);
            break;

        case 'save':
            fileManager.flushSave();
            break;

        case 'openInTextEditor':
            platform.openInTextEditor?.();
            break;

        case 'copyFilePath':
            platform.copyFilePath?.();
            break;

        // ── Page Operations ──

        case 'makePage': {
            const pagesDir = fileManager.getPagesDirPath();
            if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
            const pagePath = path.join(pagesDir, `${message.pageId}.md`);
            try {
                fs.writeFileSync(pagePath, `# ${message.title}\n`, 'utf8');
                sender.postMessage({ type: 'pageCreated', nodeId: message.nodeId, pageId: message.pageId });
            } catch (e) {
                console.error('[Notes] makePage error:', e);
            }
            break;
        }

        case 'openPage': {
            const pagePath = fileManager.getPageFilePath(message.pageId);
            if (fs.existsSync(pagePath)) {
                platform.openFileInEditor(pagePath);
            }
            break;
        }

        case 'removePage': {
            const pagePath = fileManager.getPageFilePath(message.pageId);
            if (fs.existsSync(pagePath)) {
                try { fs.unlinkSync(pagePath); } catch { /* ignore */ }
            }
            break;
        }

        case 'copyPageFile': {
            const pagesDir = fileManager.getPagesDirPath();
            const sourcePath = path.join(pagesDir, `${message.sourcePageId}.md`);
            const destPath = path.join(pagesDir, `${message.newPageId}.md`);
            if (fs.existsSync(sourcePath)) {
                fs.copyFileSync(sourcePath, destPath);
            }
            break;
        }

        case 'setPageDir':
            platform.requestSetPageDir();
            break;

        // ── Side Panel ──

        case 'openPageInSidePanel': {
            const pagePath = fileManager.getPageFilePath(message.pageId);
            if (fs.existsSync(pagePath)) {
                platform.openPageInSidePanel(pagePath);
            }
            break;
        }

        case 'saveSidePanelFile':
            platform.saveSidePanelFile(message.filePath, message.content);
            break;

        case 'sidePanelClosed':
            platform.handleSidePanelClosed();
            break;

        case 'sidePanelOpenLink':
            platform.handleSidePanelOpenLink(message.href, message.sidePanelFilePath);
            break;

        case 'sidePanelOpenInTextEditor':
            platform.handleSidePanelOpenInTextEditor?.(message.sidePanelFilePath);
            break;

        case 'sendToChat':
            if (message.sidePanelFilePath && message.startLine != null && message.endLine != null) {
                platform.sendToChatFromSidePanel?.(
                    message.sidePanelFilePath, message.startLine, message.endLine, message.selectedMarkdown || ''
                );
            }
            break;

        case 'getSidePanelImageDir':
            if (message.sidePanelFilePath) {
                platform.sendSidePanelImageDir(message.sidePanelFilePath);
            }
            break;

        case 'insertImage':
            if (message.sidePanelFilePath) {
                platform.requestInsertImage(message.sidePanelFilePath);
            }
            break;

        case 'saveImageAndInsert':
            if (message.sidePanelFilePath && message.dataUrl) {
                platform.saveImageToDir(message.dataUrl, message.fileName, message.sidePanelFilePath);
            }
            break;

        case 'readAndInsertImage':
            if (message.sidePanelFilePath && message.filePath) {
                platform.readAndInsertImage(message.filePath, message.sidePanelFilePath);
            }
            break;

        // ── Links ──

        case 'openLink':
            if (message.href) {
                platform.openExternalLink(message.href);
            }
            break;

        case 'openLinkInTab':
            if (message.href) {
                platform.openFileInEditor(message.href);
            }
            break;

        // ── Left File Panel Operations ──

        case 'notesOpenFile': {
            fileManager.flushSave();
            const content = fileManager.openFile(message.filePath);
            if (content !== null) {
                if (platform.saveLastOpenedFile) {
                    platform.saveLastOpenedFile(message.filePath);
                }
                const data = JSON.parse(content);
                sendFileListWithStructure(fileManager, sender, message.filePath);
                const isDailyNotes = path.basename(message.filePath) === 'dailynotes.out';
                sender.postMessage({ type: 'updateData', data, fileChangeId: fileManager.getFileChangeId(), isDailyNotes });
            } else {
                // ファイル読み込み失敗: 元のファイルリストを再送信してUI状態を復元
                sendFileListWithStructure(fileManager, sender);
            }
            break;
        }

        case 'notesCreateFile': {
            fileManager.flushSave();
            const filePath = fileManager.createFile(message.title || 'Untitled', message.parentId || null);
            const content = fileManager.openFile(filePath);
            if (content !== null) {
                if (platform.saveLastOpenedFile) {
                    platform.saveLastOpenedFile(filePath);
                }
                const data = JSON.parse(content);
                sendFileListWithStructure(fileManager, sender, filePath);
                sender.postMessage({ type: 'updateData', data, fileChangeId: fileManager.getFileChangeId() });
            }
            break;
        }

        case 'notesDeleteFile': {
            const wasCurrent = fileManager.getCurrentFilePath() === message.filePath;
            fileManager.deleteFile(message.filePath);
            if (wasCurrent) {
                const firstId = fileManager.findFirstFileId();
                if (firstId) {
                    const fp = fileManager.getFilePathById(firstId);
                    const content = fileManager.openFile(fp);
                    if (content !== null) {
                        if (platform.saveLastOpenedFile) {
                            platform.saveLastOpenedFile(fp);
                        }
                        const data = JSON.parse(content);
                        sendFileListWithStructure(fileManager, sender, fp);
                        sender.postMessage({ type: 'updateData', data, fileChangeId: fileManager.getFileChangeId() });
                    }
                } else {
                    sendFileListWithStructure(fileManager, sender);
                    sender.postMessage({ type: 'updateData', data: { title: '', rootIds: [], nodes: {} }, fileChangeId: fileManager.getFileChangeId() });
                }
            } else {
                sendFileListWithStructure(fileManager, sender);
            }
            break;
        }

        case 'notesRenameTitle': {
            fileManager.renameTitle(message.filePath, message.newTitle);
            sendFileListWithStructure(fileManager, sender);
            break;
        }

        case 'notesTogglePanel':
            platform.savePanelCollapsed(message.collapsed);
            break;

        // ── Folder Operations ──

        case 'notesCreateFolder': {
            fileManager.createFolder(message.title || 'New Folder', message.parentId || null);
            sendFileListWithStructure(fileManager, sender);
            break;
        }

        case 'notesDeleteFolder': {
            fileManager.deleteFolder(message.folderId);
            sendFileListWithStructure(fileManager, sender);
            break;
        }

        case 'notesRenameFolder': {
            fileManager.renameFolder(message.folderId, message.newTitle);
            sendFileListWithStructure(fileManager, sender);
            break;
        }

        case 'notesToggleFolder': {
            fileManager.toggleFolderCollapsed(message.folderId);
            sendFileListWithStructure(fileManager, sender);
            break;
        }

        case 'notesMoveItem': {
            fileManager.moveItem(message.itemId, message.targetParentId, message.index);
            sendFileListWithStructure(fileManager, sender);
            break;
        }

        // ── Daily Notes ──

        case 'notesOpenDailyNotes': {
            fileManager.flushSave();
            const dailyFilePath = fileManager.ensureDailyNotesFile();
            const dailyContent = fileManager.openFile(dailyFilePath);
            if (dailyContent === null) break;

            const dailyData = JSON.parse(dailyContent);
            const today = new Date();
            const year = String(today.getFullYear());
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');

            const { dayNodeId, modified } = fileManager.ensureDailyNode(dailyData, year, month, day);
            let dailyDidModify = modified;
            if (dailyDidModify) {
                fileManager.saveCurrentFileImmediate(JSON.stringify(dailyData));
            }

            if (platform.saveLastOpenedFile) {
                platform.saveLastOpenedFile(dailyFilePath);
            }
            sendFileListWithStructure(fileManager, sender, dailyFilePath);
            sender.postMessage({
                type: 'updateData',
                data: dailyData,
                fileChangeId: fileManager.getFileChangeId(),
                scopeToNodeId: dayNodeId,
                isDailyNotes: true,
            });
            break;
        }

        case 'notesNavigateDailyNotes': {
            fileManager.flushSave();
            const navDailyFilePath = fileManager.ensureDailyNotesFile();
            const navContent = fileManager.openFile(navDailyFilePath);
            if (navContent === null) break;

            const navData = JSON.parse(navContent);

            // currentDate が送られてきた場合はそこからの相対、なければ今日から
            let baseDate: Date;
            if (message.currentDate) {
                baseDate = new Date(message.currentDate);
            } else {
                baseDate = new Date();
            }
            baseDate.setDate(baseDate.getDate() + (message.dayOffset || 0));

            const navYear = String(baseDate.getFullYear());
            const navMonth = String(baseDate.getMonth() + 1).padStart(2, '0');
            const navDay = String(baseDate.getDate()).padStart(2, '0');

            const navResult = fileManager.ensureDailyNode(navData, navYear, navMonth, navDay);
            let navDidModify = navResult.modified;
            if (navDidModify) {
                fileManager.saveCurrentFileImmediate(JSON.stringify(navData));
            }

            if (platform.saveLastOpenedFile) {
                platform.saveLastOpenedFile(navDailyFilePath);
            }
            sendFileListWithStructure(fileManager, sender, navDailyFilePath);
            sender.postMessage({
                type: 'updateData',
                data: navData,
                fileChangeId: fileManager.getFileChangeId(),
                scopeToNodeId: navResult.dayNodeId,
                isDailyNotes: true,
            });
            break;
        }

        case 'notesNavigateToDate': {
            fileManager.flushSave();
            const navDateFilePath = fileManager.ensureDailyNotesFile();
            const navDateContent = fileManager.openFile(navDateFilePath);
            if (navDateContent === null) break;

            const navDateData = JSON.parse(navDateContent);
            const targetDate = new Date(message.targetDate);
            const targetYear = String(targetDate.getFullYear());
            const targetMonth = String(targetDate.getMonth() + 1).padStart(2, '0');
            const targetDay = String(targetDate.getDate()).padStart(2, '0');

            const dateResult = fileManager.ensureDailyNode(navDateData, targetYear, targetMonth, targetDay);
            let dateDidModify = dateResult.modified;
            if (dateDidModify) {
                fileManager.saveCurrentFileImmediate(JSON.stringify(navDateData));
            }

            if (platform.saveLastOpenedFile) {
                platform.saveLastOpenedFile(navDateFilePath);
            }
            sendFileListWithStructure(fileManager, sender, navDateFilePath);
            sender.postMessage({
                type: 'updateData',
                data: navDateData,
                fileChangeId: fileManager.getFileChangeId(),
                scopeToNodeId: dateResult.dayNodeId,
                isDailyNotes: true,
            });
            break;
        }

        // ── Panel Width ──

        case 'notesSavePanelWidth': {
            fileManager.savePanelWidth(message.width);
            break;
        }

        // ── S3 Sync ──

        case 'notesS3Sync': {
            if (platform.s3Sync) platform.s3Sync(message.bucketPath);
            break;
        }
        case 'notesS3RemoteDeleteUpload': {
            if (platform.s3RemoteDeleteAndUpload) platform.s3RemoteDeleteAndUpload(message.bucketPath);
            break;
        }
        case 'notesS3LocalDeleteDownload': {
            if (platform.s3LocalDeleteAndDownload) platform.s3LocalDeleteAndDownload(message.bucketPath);
            break;
        }
        case 'notesS3SaveBucketPath': {
            fileManager.saveS3BucketPath(message.bucketPath);
            break;
        }
        case 'notesS3GetStatus': {
            if (platform.s3GetStatus) platform.s3GetStatus();
            break;
        }

        // ── Focus (no-op in shared, platforms handle if needed) ──
        case 'webviewFocus':
        case 'webviewBlur':
            break;

        // ── Notes Search ──

        case 'notesSearch': {
            fileManager.flushSave();
            const searchOpts = {
                caseSensitive: message.caseSensitive || false,
                wholeWord: message.wholeWord || false,
                useRegex: message.useRegex || false,
            };
            const searchId = Date.now();

            sender.postMessage({ type: 'notesSearchStart', searchId, query: message.query });

            fileManager.searchFilesStreaming(message.query, searchOpts, (partialResult) => {
                sender.postMessage({
                    type: 'notesSearchPartial',
                    searchId,
                    result: partialResult,
                });
            });

            sender.postMessage({ type: 'notesSearchEnd', searchId });
            break;
        }

        case 'notesJumpToNode': {
            fileManager.flushSave();
            const jumpFilePath = fileManager.getFilePathById(message.fileId);
            const jumpContent = fileManager.openFile(jumpFilePath);
            if (jumpContent !== null) {
                if (platform.saveLastOpenedFile) {
                    platform.saveLastOpenedFile(jumpFilePath);
                }
                const jumpData = JSON.parse(jumpContent);
                sendFileListWithStructure(fileManager, sender, jumpFilePath);
                sender.postMessage({
                    type: 'updateData',
                    data: jumpData,
                    fileChangeId: fileManager.getFileChangeId(),
                    jumpToNodeId: message.nodeId,
                });
            }
            break;
        }

        case 'notesJumpToMdPage': {
            fileManager.flushSave();
            const mdOutFilePath = fileManager.getFilePathById(message.outFileId);
            const mdOutContent = fileManager.openFile(mdOutFilePath);
            if (mdOutContent === null) break;

            const mdOutData = JSON.parse(mdOutContent);

            // pageIdからnodeIdを逆引き
            let pageNodeId: string | null = null;
            for (const [nodeId, node] of Object.entries(mdOutData.nodes || {})) {
                if ((node as any).pageId === message.pageId) {
                    pageNodeId = nodeId;
                    break;
                }
            }

            if (platform.saveLastOpenedFile) {
                platform.saveLastOpenedFile(mdOutFilePath);
            }
            sendFileListWithStructure(fileManager, sender, mdOutFilePath);

            // .outをアウトライナに表示
            sender.postMessage({
                type: 'updateData',
                data: mdOutData,
                fileChangeId: fileManager.getFileChangeId(),
            });

            // サイドパネルでページを開く（lineNumber付き）
            if (pageNodeId) {
                const pagePath = fileManager.getPageFilePath(message.pageId);
                if (platform.openPageInSidePanel) {
                    platform.openPageInSidePanel(pagePath, message.lineNumber);
                }
            }
            break;
        }

        case 'notesOpenMdExternal': {
            if (platform.openFileExternal) {
                platform.openFileExternal(message.filePath);
            }
            break;
        }

        // ── Search (legacy) ──
        case 'searchFiles':
            if (platform.searchFiles) {
                platform.searchFiles(message.query);
            }
            break;
    }
}
