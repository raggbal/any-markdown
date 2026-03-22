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
    /** サイドパネルでページを開く */
    openPageInSidePanel(filePath: string): void;
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
    /** サイドパネルが閉じられた */
    handleSidePanelClosed(): void;
    /** 最後に開いたファイルを記録 */
    saveLastOpenedFile?(filePath: string): void;
    /** ファイル検索 */
    searchFiles?(query: string): void;
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
            fileManager.saveCurrentFile(message.content);
            break;

        case 'save':
            fileManager.flushSave();
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
                const fileList = fileManager.listFiles();
                sender.postMessage({ type: 'notesFileListChanged', fileList, currentFile: message.filePath });
                sender.postMessage({ type: 'updateData', data });
            }
            break;
        }

        case 'notesCreateFile': {
            fileManager.flushSave();
            const filePath = fileManager.createFile(message.title || 'Untitled');
            const content = fileManager.openFile(filePath);
            if (content !== null) {
                if (platform.saveLastOpenedFile) {
                    platform.saveLastOpenedFile(filePath);
                }
                const data = JSON.parse(content);
                const fileList = fileManager.listFiles();
                sender.postMessage({ type: 'notesFileListChanged', fileList, currentFile: filePath });
                sender.postMessage({ type: 'updateData', data });
            }
            break;
        }

        case 'notesDeleteFile': {
            const wasCurrent = fileManager.getCurrentFilePath() === message.filePath;
            fileManager.deleteFile(message.filePath);
            const fileList = fileManager.listFiles();
            sender.postMessage({ type: 'notesFileListChanged', fileList });
            if (wasCurrent) {
                if (fileList.length > 0) {
                    const content = fileManager.openFile(fileList[0].filePath);
                    if (content !== null) {
                        if (platform.saveLastOpenedFile) {
                            platform.saveLastOpenedFile(fileList[0].filePath);
                        }
                        const data = JSON.parse(content);
                        sender.postMessage({ type: 'notesFileListChanged', fileList, currentFile: fileList[0].filePath });
                        sender.postMessage({ type: 'updateData', data });
                    }
                } else {
                    sender.postMessage({ type: 'updateData', data: { title: '', rootIds: [], nodes: {} } });
                }
            }
            break;
        }

        case 'notesRenameTitle': {
            fileManager.renameTitle(message.filePath, message.newTitle);
            const fileList = fileManager.listFiles();
            sender.postMessage({ type: 'notesFileListChanged', fileList });
            break;
        }

        case 'notesTogglePanel':
            platform.savePanelCollapsed(message.collapsed);
            break;

        // ── Focus (no-op in shared, platforms handle if needed) ──
        case 'webviewFocus':
        case 'webviewBlur':
            break;

        // ── Search ──
        case 'searchFiles':
            if (platform.searchFiles) {
                platform.searchFiles(message.query);
            }
            break;
    }
}
