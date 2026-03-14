import * as vscode from 'vscode';
import { getWebviewContent, getSidePanelHtml, getNonce } from './webviewContent';
import { t, getWebviewMessages, initLocale } from './i18n/messages';

// ============================================
// DocumentParser: IMAGE_DIR ディレクティブの解析
// ============================================

/**
 * ドキュメントからIMAGE_DIRディレクティブを抽出
 * フォーマット: ドキュメント末尾に
 * ---
 * IMAGE_DIR: <dir_path>
 * FORCE_RELATIVE_PATH: <true|false>
 * 
 * 単独でも、他のディレクティブと組み合わせても動作
 */
function extractImageDir(content: string): string | null {
    // Pattern: matches IMAGE_DIR in a directive block (may have other directives before/after)
    const pattern = /\n---\n(?:[\s\S]*?\n)?IMAGE_DIR:\s*([^\n]+)/;
    const match = content.match(pattern);
    if (match) {
        return match[1].trim();
    }
    return null;
}

/**
 * IMAGE_DIRディレクティブを挿入または更新
 * 既存のディレクティブブロックがあれば更新、なければ新規作成
 * FORCE_RELATIVE_PATHと同じブロックにまとめる
 */
function insertOrUpdateImageDir(content: string, dirPath: string): string {
    const existingImageDir = extractImageDir(content);
    const existingForceRelative = extractForceRelativePath(content);
    
    // Remove all existing directive blocks
    let cleanContent = removeAllDirectives(content);
    
    // Build new directive block
    let directives = `IMAGE_DIR: ${dirPath}`;
    if (existingForceRelative !== null) {
        directives += `\nFORCE_RELATIVE_PATH: ${existingForceRelative}`;
    }
    
    return cleanContent.trimEnd() + `\n---\n${directives}`;
}

/**
 * IMAGE_DIRディレクティブが存在するか確認
 */
function hasImageDir(content: string): boolean {
    return extractImageDir(content) !== null;
}

/**
 * ドキュメントからFORCE_RELATIVE_PATHディレクティブを抽出
 * フォーマット: ドキュメント末尾に
 * ---
 * FORCE_RELATIVE_PATH: true/false
 * 
 * 単独でも、他のディレクティブと組み合わせても動作
 */
function extractForceRelativePath(content: string): boolean | null {
    const pattern = /\n---\n(?:[\s\S]*?\n)?FORCE_RELATIVE_PATH:\s*(true|false)/i;
    const match = content.match(pattern);
    if (match) {
        return match[1].toLowerCase() === 'true';
    }
    return null;
}

/**
 * すべてのディレクティブブロックを削除
 */
function removeAllDirectives(content: string): string {
    // Remove standalone directive blocks
    let result = content.replace(/\n---\nIMAGE_DIR:\s*[^\n]+\s*$/g, '');
    result = result.replace(/\n---\nFORCE_RELATIVE_PATH:\s*(true|false)\s*$/gi, '');
    
    // Remove combined directive block at end of file
    result = result.replace(/\n---\n(?:(?:IMAGE_DIR:\s*[^\n]+|FORCE_RELATIVE_PATH:\s*(?:true|false))\n?)+\s*$/gi, '');
    
    return result;
}

// ============================================
// PathResolver: パス解決ロジック
// ============================================

const path = require('path');
const fs = require('fs');

/**
 * 設定パスを絶対パスに解決
 * @param configPath 設定されたパス（絶対または相対）
 * @param documentPath ドキュメントの絶対パス
 * @returns 解決された絶対パス
 */
function resolveToAbsolute(configPath: string, documentPath: string): string {
    if (!configPath || configPath === '') {
        // 空の場合はドキュメントと同じディレクトリ
        return path.dirname(documentPath);
    }
    
    if (path.isAbsolute(configPath)) {
        // 絶対パスはそのまま使用
        return configPath;
    }
    
    // 相対パスはドキュメントの場所を基準に解決
    const docDir = path.dirname(documentPath);
    return path.resolve(docDir, configPath);
}

/**
 * 画像の絶対パスからMarkdown用のパスを生成
 * @param imagePath 画像の絶対パス
 * @param documentPath ドキュメントの絶対パス
 * @param useAbsolute 絶対パスを使用するかどうか
 * @param forceRelative 強制的に相対パスを使用するかどうか
 * @returns Markdown用のパス（絶対または相対）
 */
function toMarkdownPath(imagePath: string, documentPath: string, useAbsolute: boolean, forceRelative: boolean = false): string {
    // forceRelative が true なら、常に相対パスを使用
    if (forceRelative || !useAbsolute) {
        const docDir = path.dirname(documentPath);
        let relativePath = path.relative(docDir, imagePath);
        // Windowsのバックスラッシュをスラッシュに変換
        relativePath = relativePath.replace(/\\/g, '/');
        return relativePath;
    }
    
    // 絶対パス設定の場合: 絶対パスをそのまま使用
    // Windowsのバックスラッシュをスラッシュに変換
    return imagePath.replace(/\\/g, '/');
}

/**
 * ディレクトリが存在しない場合は作成
 */
function ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * ユニークなファイル名を生成（タイムスタンプ形式）
 * 同一タイムスタンプのファイルが存在する場合は連番を付与
 * @param dir ディレクトリパス
 * @param extension 拡張子（ドットなし）
 * @returns ユニークなファイル名
 */
function generateUniqueFileName(dir: string, extension: string): string {
    const timestamp = Date.now();
    const baseName = `${timestamp}.${extension}`;
    const basePath = path.join(dir, baseName);
    
    // ファイルが存在しなければそのまま返す
    if (!fs.existsSync(basePath)) {
        return baseName;
    }
    
    // 同一タイムスタンプのファイルが存在する場合は連番を付与
    let counter = 1;
    while (true) {
        const counterStr = counter.toString().padStart(4, '0');
        const newName = `${timestamp}-${counterStr}.${extension}`;
        const newPath = path.join(dir, newName);
        if (!fs.existsSync(newPath)) {
            return newName;
        }
        counter++;
    }
}

// ============================================
// ImageDirectoryManager: 画像保存ディレクトリの管理
// ============================================

/**
 * パスの末尾スラッシュを正規化（削除）
 */
function normalizeTrailingSlash(p: string): string {
    // ルートパス（/ や C:\）は除外
    if (p === '/' || /^[A-Za-z]:\\?$/.test(p)) {
        return p;
    }
    return p.replace(/[\/\\]+$/, '');
}

class ImageDirectoryManager {
    // ファイルURIをキーとしたIMAGE_DIRのマップ
    private fileImageDirs: Map<string, string> = new Map();
    // 最後に検出されたIMAGE_DIR（変更検出用）
    private lastDetectedDirs: Map<string, string> = new Map();
    // 設定されたパスが絶対パスかどうかを記録
    private useAbsolutePath: Map<string, boolean> = new Map();
    
    /**
     * 現在有効な画像保存ディレクトリを取得
     * 優先順位: 1. ファイル単位のIMAGE_DIR, 2. ドキュメント内のIMAGE_DIRディレクティブ, 3. VS Code設定のimageDefaultDir, 4. ドキュメントと同じディレクトリ
     */
    getImageDirectory(documentUri: vscode.Uri, documentContent: string): string {
        const documentPath = documentUri.fsPath;
        const uriKey = documentUri.toString();
        
        // 1. ファイル単位のIMAGE_DIRをチェック
        const fileImageDir = this.fileImageDirs.get(uriKey);
        if (fileImageDir) {
            const normalized = normalizeTrailingSlash(fileImageDir);
            this.useAbsolutePath.set(uriKey, path.isAbsolute(normalized));
            return resolveToAbsolute(normalized, documentPath);
        }
        
        // 2. ドキュメント内のIMAGE_DIRディレクティブをチェック
        const docImageDir = extractImageDir(documentContent);
        if (docImageDir) {
            const normalized = normalizeTrailingSlash(docImageDir);
            this.useAbsolutePath.set(uriKey, path.isAbsolute(normalized));
            return resolveToAbsolute(normalized, documentPath);
        }
        
        // 3. VS Code設定のimageDefaultDirをチェック
        const config = vscode.workspace.getConfiguration('any-markdown');
        const defaultDir = config.get<string>('imageDefaultDir', '');
        if (defaultDir) {
            const normalized = normalizeTrailingSlash(defaultDir);
            this.useAbsolutePath.set(uriKey, path.isAbsolute(normalized));
            return resolveToAbsolute(normalized, documentPath);
        }
        
        // 4. デフォルト: ドキュメントと同じディレクトリ（相対パス扱い）
        this.useAbsolutePath.set(uriKey, false);
        return path.dirname(documentPath);
    }
    
    /**
     * 設定されたパスが絶対パスかどうかを取得
     * getImageDirectory() を先に呼び出す必要がある
     */
    shouldUseAbsolutePath(documentUri: vscode.Uri): boolean {
        return this.useAbsolutePath.get(documentUri.toString()) || false;
    }
    
    /**
     * 相対パスを強制するかどうかを取得
     * 優先順位: 1. ドキュメント内のFORCE_RELATIVE_PATHディレクティブ, 2. VS Code設定のforceRelativeImagePath
     */
    shouldForceRelativePath(documentUri: vscode.Uri, documentContent: string): boolean {
        // 1. ドキュメント内のディレクティブをチェック
        const docForceRelative = extractForceRelativePath(documentContent);
        if (docForceRelative !== null) {
            return docForceRelative;
        }
        
        // 2. VS Code設定をチェック
        const config = vscode.workspace.getConfiguration('any-markdown');
        return config.get<boolean>('forceRelativeImagePath', false);
    }
    
    /**
     * ファイル単位のIMAGE_DIRを設定
     */
    setFileImageDir(documentUri: vscode.Uri, dirPath: string): void {
        this.fileImageDirs.set(documentUri.toString(), dirPath);
    }
    
    /**
     * ファイル単位のIMAGE_DIRを取得
     */
    getFileImageDir(uriKey: string): string | undefined {
        const dir = this.fileImageDirs.get(uriKey);
        return dir || undefined;
    }

    /**
     * ファイル単位のIMAGE_DIRをクリア
     */
    clearFileImageDir(documentUri: vscode.Uri): void {
        this.fileImageDirs.delete(documentUri.toString());
    }
    
    /**
     * IMAGE_DIRの変更を検出して警告を表示
     */
    checkAndWarnIfChanged(documentUri: vscode.Uri, documentContent: string): boolean {
        const uriKey = documentUri.toString();
        const currentDir = extractImageDir(documentContent);
        const lastDir = this.lastDetectedDirs.get(uriKey);
        
        // 初回は記録のみ
        if (lastDir === undefined) {
            if (currentDir) {
                this.lastDetectedDirs.set(uriKey, currentDir);
            }
            return false;
        }
        
        // 変更を検出
        if (currentDir !== lastDir) {
            this.lastDetectedDirs.set(uriKey, currentDir || '');
            return true; // 変更あり
        }
        
        return false;
    }
    
    /**
     * 初期化時にIMAGE_DIRを記録
     */
    initializeForDocument(documentUri: vscode.Uri, documentContent: string): void {
        const currentDir = extractImageDir(documentContent);
        if (currentDir) {
            this.lastDetectedDirs.set(documentUri.toString(), currentDir);
        }
    }
}

// グローバルインスタンス
const imageDirectoryManager = new ImageDirectoryManager();

export class AnyMarkdownEditorProvider implements vscode.CustomTextEditorProvider {
    private static readonly viewType = 'any-markdown.editor';

    // Track the currently active webview panel for undo/redo command forwarding
    private activeWebviewPanel: vscode.WebviewPanel | undefined;

    constructor(private readonly context: vscode.ExtensionContext) {}

    /**
     * Send undo command to the active webview
     */
    public sendUndo(): void {
        this.activeWebviewPanel?.webview.postMessage({ type: 'performUndo' });
    }

    /**
     * Send redo command to the active webview
     */
    public sendRedo(): void {
        this.activeWebviewPanel?.webview.postMessage({ type: 'performRedo' });
    }

    /**
     * Send toggle source mode command to the active webview
     */
    public sendToggleSourceMode(): void {
        this.activeWebviewPanel?.webview.postMessage({ type: 'toggleSourceMode' });
    }

    /**
     * Extract h1/h2 headings from markdown for side panel TOC
     */
    /**
     * Build a map of image path -> data URL for side panel iframe.
     * The blob: iframe can't access file:// or vscode-resource URIs,
     * so all images must be provided as data URLs.
     */
    private buildImageMap(markdown: string, docUri: vscode.Uri): Record<string, string> {
        const fs = require('fs');
        const pathMod = require('path');
        const imageMap: Record<string, string> = {};
        const docDir = pathMod.dirname(docUri.fsPath);
        // Match ![alt](path) patterns
        const regex = /!\[[^\]]*\]\(([^)]+)\)/g;
        let match;
        while ((match = regex.exec(markdown)) !== null) {
            const imgPath = match[1];
            if (imgPath.startsWith('http://') || imgPath.startsWith('https://') || imgPath.startsWith('data:')) {
                continue;
            }
            const absPath = imgPath.startsWith('/') ? imgPath : pathMod.resolve(docDir, imgPath);
            if (imageMap[imgPath]) continue; // already processed
            try {
                if (fs.existsSync(absPath)) {
                    const buf = fs.readFileSync(absPath);
                    const ext = pathMod.extname(absPath).slice(1) || 'png';
                    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
                    imageMap[imgPath] = `data:${mime};base64,${buf.toString('base64')}`;
                }
            } catch (_) { /* skip unreadable files */ }
        }
        return imageMap;
    }

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

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken
    ): Promise<void> {
        // IMPORTANT: Clear any cached webview state immediately to prevent
        // "Assertion Failed: Argument is undefined or null" errors after extension updates.
        // VSCode may try to restore old webview state that's incompatible with new extension code.
        // Setting html to empty string first ensures we start fresh.
        webviewPanel.webview.html = '';
        
        // Get the document directory and workspace folder for local resource access
        const documentDir = vscode.Uri.joinPath(document.uri, '..');
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        
        // Get user's home directory for accessing Downloads, etc.
        const homeDir = require('os').homedir();
        const homeDirUri = vscode.Uri.file(homeDir);
        
        const localResourceRoots = [
            vscode.Uri.joinPath(this.context.extensionUri, 'media'),
            vscode.Uri.joinPath(this.context.extensionUri, 'node_modules'),
            documentDir,
            homeDirUri // Allow access to home directory (Downloads, Pictures, etc.)
        ];
        if (workspaceFolder) {
            localResourceRoots.push(workspaceFolder.uri);
        }

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots
        };

        // Get the base URI for resolving relative paths
        const documentBaseUri = webviewPanel.webview.asWebviewUri(documentDir).toString();
        
        // Convert absolute image paths to webview URIs
        const convertImagePaths = (content: string): string => {
            // Match image markdown: ![alt](path)
            return content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
                // Skip if already a URL or data URI
                if (src.startsWith('http://') || src.startsWith('https://') || 
                    src.startsWith('data:') || src.startsWith('vscode-webview:') ||
                    src.startsWith('vscode-resource:')) {
                    return match;
                }
                // Convert absolute path to webview URI
                if (src.startsWith('/')) {
                    const fileUri = vscode.Uri.file(src);
                    const webviewUri = webviewPanel.webview.asWebviewUri(fileUri).toString();
                    return `![${alt}](${webviewUri})`;
                }
                // Relative path - will be resolved by webview using documentBaseUri
                return match;
            });
        };
        
        // Remember the original line ending style to preserve on save
        const originalEol = document.eol;

        // nonce を保持（サイドパネル iframe で再利用するため）
        const webviewNonce = { value: getNonce() };

        const updateWebview = () => {
            try {
                const config = vscode.workspace.getConfiguration('any-markdown');
                const content = convertImagePaths(document.getText());
                webviewPanel.webview.html = getWebviewContent(
                    webviewPanel.webview,
                    this.context.extensionUri,
                    content,
                    {
                        theme: config.get<string>('theme', 'github'),
                        fontSize: config.get<number>('fontSize', 16),
                        toolbarMode: config.get<string>('toolbarMode', 'full'),
                        documentBaseUri: documentBaseUri,
                        webviewMessages: getWebviewMessages(),
                        enableDebugLogging: config.get<boolean>('enableDebugLogging', false)
                    },
                    webviewNonce
                );
            } catch (error) {
                console.error('[Any MD] Error updating webview:', error);
                // Show a minimal error page instead of crashing
                webviewPanel.webview.html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Error</title></head>
<body style="padding: 20px; font-family: sans-serif;">
    <h2>Failed to load editor</h2>
    <p>Please try closing and reopening this file.</p>
    <p>If the problem persists, try reloading VS Code window (Cmd/Ctrl+Shift+P → "Reload Window").</p>
    <details>
        <summary>Error details</summary>
        <pre>${String(error)}</pre>
    </details>
</body>
</html>`;
            }
        };

        // Send current image directory status to webview
        const sendImageDirStatus = () => {
            const docContent = document.getText();
            const docPath = document.uri.fsPath;
            const uriKey = document.uri.toString();
            const docDir = path.dirname(docPath);

            // Determine source
            const fileImageDir = imageDirectoryManager.getFileImageDir(uriKey);
            const docImageDir = extractImageDir(docContent);
            const cfg = vscode.workspace.getConfiguration('any-markdown');
            const settingsDir = cfg.get<string>('imageDefaultDir', '');

            let source: 'file' | 'settings' | 'default';
            if (fileImageDir || docImageDir) {
                source = 'file';
            } else if (settingsDir) {
                source = 'settings';
            } else {
                source = 'default';
            }

            // Compute display path (same logic as toMarkdownPath for directories)
            const absDir = imageDirectoryManager.getImageDirectory(document.uri, docContent);
            const useAbsolute = imageDirectoryManager.shouldUseAbsolutePath(document.uri);
            const forceRelative = imageDirectoryManager.shouldForceRelativePath(document.uri, docContent);

            let displayPath: string;
            if (forceRelative || !useAbsolute) {
                displayPath = path.relative(docDir, absDir) || '.';
                displayPath = displayPath.replace(/\\/g, '/');
            } else {
                displayPath = absDir;
            }

            webviewPanel.webview.postMessage({
                type: 'imageDirStatus',
                displayPath,
                source
            });
        };

        // Initial content
        updateWebview();

        // Initialize IMAGE_DIR tracking
        imageDirectoryManager.initializeForDocument(document.uri, document.getText());

        // Send initial image dir status (queued for webview)
        sendImageDirStatus();

        // Sync policy: when user is actively editing, external changes are queued in webview.
        // When user is idle (even with focus), external changes are applied with cursor preservation.
        let webviewHasFocus = false;
        let isActivelyEditing = false;
        let isApplyingOwnEdit = false;

        // Listen for document changes
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() !== document.uri.toString()) return;
            if (e.contentChanges.length === 0) return; // Skip metadata-only changes

            // Skip our own edits — they are already reflected in the webview
            if (isApplyingOwnEdit) return;

            // External change detected — send update to webview.
            // The webview will decide whether to apply immediately (idle) or queue (editing).
            const currentContent = document.getText();
            const content = convertImagePaths(currentContent);

            webviewPanel.webview.postMessage({
                type: 'update',
                content: content
            });

            // Update image dir status (directive may have changed)
            sendImageDirStatus();

            // Check for IMAGE_DIR changes (external edit)
            if (imageDirectoryManager.checkAndWarnIfChanged(document.uri, currentContent)) {
                vscode.window.showInformationMessage(
                    t('imageDirChanged'),
                    t('reload')
                ).then(selection => {
                    if (selection === t('reload')) {
                        updateWebview();
                        imageDirectoryManager.initializeForDocument(document.uri, document.getText());
                    }
                });
            }
        });

        // Listen for file system changes (from external editors like Claude)
        // This ONLY syncs the VS Code document; messaging is handled by onDidChangeTextDocument
        const fileWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(vscode.Uri.joinPath(document.uri, '..'), path.basename(document.uri.fsPath))
        );

        const fileChangeSubscription = fileWatcher.onDidChange(async (uri) => {
            if (uri.toString() === document.uri.toString()) {
                setTimeout(async () => {
                    try {
                        const fileContent = await vscode.workspace.fs.readFile(uri);
                        const newContent = new TextDecoder().decode(fileContent);
                        const currentContent = document.getText();

                        if (newContent !== currentContent) {
                            // Sync VS Code document with file content (triggers onDidChangeTextDocument)
                            isApplyingOwnEdit = true;
                            const fullRange = new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(currentContent.length)
                            );
                            const edit = new vscode.WorkspaceEdit();
                            edit.replace(document.uri, fullRange, newContent);
                            await vscode.workspace.applyEdit(edit);
                            isApplyingOwnEdit = false;

                            // Save immediately to clear dirty state — file on disk is already up to date
                            await document.save();

                            // Notify webview directly (since isApplyingOwnEdit suppressed onDidChangeTextDocument)
                            const content = convertImagePaths(newContent);
                            webviewPanel.webview.postMessage({
                                type: 'update',
                                content: content
                            });
                        }
                    } catch (error) {
                        isApplyingOwnEdit = false;
                        console.error('[Any MD] Error reading file after external change:', error);
                    }
                }, 100);
            }
        });

        // Side panel document — uses TextDocument buffer (same architecture as main editor)
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

            // Open as TextDocument — creates an in-memory buffer (does not open a visible tab)
            sidePanelDocument = await vscode.workspace.openTextDocument(fileUri);

            // Watch for external file changes → sync TextDocument (same pattern as main editor)
            sidePanelFileWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(vscode.Uri.joinPath(fileUri, '..'), path.basename(filePath))
            );
            sidePanelFileChangeSubscription = sidePanelFileWatcher.onDidChange(async (uri) => {
                if (uri.fsPath !== filePath) return;
                console.log('[Any MD][SP-FSW] FileSystemWatcher fired, isApplyingSidePanelEdit=', isApplyingSidePanelEdit);
                if (isApplyingSidePanelEdit) { console.log('[Any MD][SP-FSW] SKIPPED (isApplyingSidePanelEdit)'); return; }
                setTimeout(async () => {
                    try {
                        if (!sidePanelDocument) { console.log('[Any MD][SP-FSW] SKIPPED (no sidePanelDocument)'); return; }
                        const fileContent = await vscode.workspace.fs.readFile(uri);
                        const newContent = new TextDecoder().decode(fileContent);
                        const currentContent = sidePanelDocument.getText();
                        console.log('[Any MD][SP-FSW] disk len=', newContent.length, 'doc len=', currentContent.length, 'same=', newContent === currentContent);
                        if (newContent !== currentContent) {
                            // Sync TextDocument with disk
                            isApplyingSidePanelEdit = true;
                            const fullRange = new vscode.Range(
                                sidePanelDocument.positionAt(0),
                                sidePanelDocument.positionAt(currentContent.length)
                            );
                            const edit = new vscode.WorkspaceEdit();
                            edit.replace(sidePanelDocument.uri, fullRange, newContent);
                            const editResult = await vscode.workspace.applyEdit(edit);
                            console.log('[Any MD][SP-FSW] applyEdit result=', editResult);
                            isApplyingSidePanelEdit = false;
                            // Save to clear dirty state — file on disk is already up to date
                            await sidePanelDocument.save();
                            console.log('[Any MD][SP-FSW] Relaying update to iframe, content len=', newContent.length);
                            // Relay to iframe — onDidChangeTextDocument is skipped during isApplyingSidePanelEdit
                            webviewPanel.webview.postMessage({
                                type: 'sidePanelMessage',
                                data: { type: 'update', content: newContent }
                            });
                        }
                    } catch (error) {
                        isApplyingSidePanelEdit = false;
                        console.error('[Any MD][SP-FSW] Error:', error);
                    }
                }, 100);
            });

            // Watch TextDocument changes → relay to iframe (both external and own edits trigger this)
            sidePanelDocChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
                if (!sidePanelDocument) return;
                if (e.document.uri.toString() !== sidePanelDocument.uri.toString()) return;
                if (e.contentChanges.length === 0) return;
                console.log('[Any MD][SP-DocChange] onDidChangeTextDocument fired, isApplyingSidePanelEdit=', isApplyingSidePanelEdit, 'changes=', e.contentChanges.length);
                // Skip our own edits — already reflected in the iframe
                if (isApplyingSidePanelEdit) { console.log('[Any MD][SP-DocChange] SKIPPED (isApplyingSidePanelEdit)'); return; }
                // External change: send update to iframe
                const content = e.document.getText();
                console.log('[Any MD][SP-DocChange] Relaying update to iframe, content len=', content.length);
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

        // Listen for configuration changes
        const changeConfigSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('any-markdown')) {
                // Re-initialize locale if language setting changed
                if (e.affectsConfiguration('any-markdown.language')) {
                    const langConfig = vscode.workspace.getConfiguration('any-markdown');
                    initLocale(langConfig.get<string>('language', 'default'), vscode.env.language);
                }
                updateWebview();
                sendImageDirStatus();
            }
        });

        // Serialized edit queue — debounce + promise chain (no recursive retry, no freeze)
        let pendingContent: string | null = null;
        let editDebounceTimer: NodeJS.Timeout | null = null;
        let applyEditQueue: Promise<void> = Promise.resolve();

        const scheduleEdit = (content: string) => {
            pendingContent = content;
            if (editDebounceTimer) {
                clearTimeout(editDebounceTimer);
            }
            editDebounceTimer = setTimeout(() => {
                editDebounceTimer = null;
                const contentToApply = pendingContent;
                pendingContent = null;
                if (contentToApply === null) return;

                applyEditQueue = applyEditQueue.then(async () => {
                    try {
                        // Skip if content is identical — prevents unnecessary dirty marking
                        const normalize = (s: string) => s.replace(/\r\n/g, '\n');
                        if (normalize(contentToApply) === normalize(document.getText())) return;

                        isApplyingOwnEdit = true;
                        const edit = new vscode.WorkspaceEdit();
                        edit.replace(
                            document.uri,
                            new vscode.Range(0, 0, document.lineCount, 0),
                            contentToApply
                        );
                        await vscode.workspace.applyEdit(edit);
                    } catch (e) {
                        console.log('[Any MD] Edit error (ignored):', e);
                    } finally {
                        isApplyingOwnEdit = false;
                    }
                });
            }, 100);
        };

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'edit':
                    // Restore original line endings if document uses CRLF
                    const editContent = originalEol === vscode.EndOfLine.CRLF
                        ? message.content.replace(/\n/g, '\r\n')
                        : message.content;
                    scheduleEdit(editContent);
                    break;

                case 'save':
                    await document.save();
                    break;

                case 'editingStateChanged':
                    isActivelyEditing = message.editing;
                    break;

                case 'webviewFocus':
                    webviewHasFocus = true;
                    break;

                case 'webviewBlur':
                    webviewHasFocus = false;
                    isActivelyEditing = false;
                    break;

                case 'insertImage':
                    await this.handleImageInsert(document, webviewPanel.webview);
                    break;

                case 'saveImageAndInsert':
                    // Save pasted/dropped image to file
                    await this.handleSaveImage(document, webviewPanel.webview, message.dataUrl, message.fileName);
                    break;

                case 'readAndInsertImage':
                    // Read an existing image file and insert it
                    await this.handleReadAndInsertImage(document, webviewPanel.webview, message.filePath);
                    break;

                case 'insertLink':
                    const url = await vscode.window.showInputBox({
                        prompt: t('enterUrl'),
                        placeHolder: 'https://example.com'
                    });
                    if (url) {
                        const linkText = message.text || await vscode.window.showInputBox({
                            prompt: t('enterLinkText'),
                            placeHolder: 'Link text',
                            value: 'link'
                        }) || 'link';
                        webviewPanel.webview.postMessage({
                            type: 'insertLinkHtml',
                            url: url,
                            text: linkText
                        });
                    }
                    break;

                case 'openLink':
                case 'openLinkInTab': {
                    const linkHref: string = message.href;
                    const forceTab = message.type === 'openLinkInTab';
                    if (linkHref.startsWith('http')) {
                        vscode.env.openExternal(vscode.Uri.parse(linkHref));
                    } else if (linkHref.startsWith('#')) {
                        webviewPanel.webview.postMessage({
                            type: 'scrollToAnchor',
                            anchor: linkHref.substring(1)
                        });
                    } else {
                        const resolvedUri = linkHref.startsWith('/')
                            ? vscode.Uri.file(linkHref)
                            : vscode.Uri.joinPath(document.uri, '..', linkHref);
                        const resolvedPath = resolvedUri.fsPath.toLowerCase();
                        if (resolvedPath.endsWith('.md') || resolvedPath.endsWith('.markdown')) {
                            const linkOpenMode = forceTab ? 'tab'
                                : vscode.workspace.getConfiguration('any-markdown').get<string>('linkOpenMode', 'sidePanel');
                            if (linkOpenMode === 'tab') {
                                vscode.commands.executeCommand('vscode.openWith', resolvedUri, 'any-markdown.editor');
                            } else {
                                // sidePanel mode: generate iframe HTML and send to webview
                                try {
                                    const fileContent = await vscode.workspace.fs.readFile(resolvedUri);
                                    const text = Buffer.from(fileContent).toString('utf8');
                                    const fileName = resolvedUri.path.split('/').pop() || 'untitled.md';
                                    const linkConfig = vscode.workspace.getConfiguration('any-markdown');
                                    const sidePanelImageMap = this.buildImageMap(text, resolvedUri);
                                    const sidePanelHtml = getSidePanelHtml(
                                        webviewNonce.value,
                                        text,
                                        {
                                            theme: linkConfig.get<string>('theme', 'github'),
                                            fontSize: linkConfig.get<number>('fontSize', 16),
                                            documentBaseUri: resolvedUri.with({ path: resolvedUri.path.replace(/\/[^/]+$/, '/') }).toString(),
                                            webviewMessages: getWebviewMessages(),
                                            enableDebugLogging: linkConfig.get<boolean>('enableDebugLogging', false)
                                        },
                                        sidePanelImageMap
                                    );
                                    webviewPanel.webview.postMessage({
                                        type: 'openSidePanel',
                                        sidePanelHtml: sidePanelHtml,
                                        filePath: resolvedUri.fsPath,
                                        fileName: fileName,
                                        toc: this.extractToc(text),
                                        imageMap: this.buildImageMap(text, resolvedUri)
                                    });
                                    await setupSidePanelFileWatcher(resolvedUri.fsPath);
                                } catch (e) {
                                    vscode.window.showErrorMessage(`Cannot open file: ${resolvedUri.fsPath}`);
                                }
                            }
                        } else {
                            vscode.commands.executeCommand('vscode.open', resolvedUri);
                        }
                    }
                    break;
                }

                case 'requestOutline':
                    const outline = this.generateOutline(document.getText());
                    webviewPanel.webview.postMessage({
                        type: 'outline',
                        data: outline
                    });
                    break;

                case 'requestWordCount':
                    const stats = this.calculateWordCount(document.getText());
                    webviewPanel.webview.postMessage({
                        type: 'wordCount',
                        data: stats
                    });
                    break;

                case 'error':
                    vscode.window.showErrorMessage(`Any MD: ${message.message}`);
                    break;

                case 'openInTextEditor':
                    // Open the same file in VS Code's default text editor
                    await vscode.commands.executeCommand('vscode.openWith', document.uri, 'default');
                    break;

                case 'saveSidePanelFile':
                    try {
                        console.log('[Any MD][SP-Save] saveSidePanelFile called, hasDoc=', !!sidePanelDocument, 'pathMatch=', sidePanelDocument?.uri.fsPath === message.filePath);
                        if (sidePanelDocument && sidePanelDocument.uri.fsPath === message.filePath) {
                            // Use TextDocument buffer (same architecture as main editor)
                            const normalize = (s: string) => s.replace(/\r\n/g, '\n');
                            const msgNorm = normalize(message.content);
                            const docNorm = normalize(sidePanelDocument.getText());
                            console.log('[Any MD][SP-Save] msg len=', msgNorm.length, 'doc len=', docNorm.length, 'same=', msgNorm === docNorm);
                            if (msgNorm === docNorm) { console.log('[Any MD][SP-Save] SKIPPED (same content)'); break; }
                            isApplyingSidePanelEdit = true;
                            const spEdit = new vscode.WorkspaceEdit();
                            spEdit.replace(
                                sidePanelDocument.uri,
                                new vscode.Range(0, 0, sidePanelDocument.lineCount, 0),
                                message.content
                            );
                            const spEditResult = await vscode.workspace.applyEdit(spEdit);
                            console.log('[Any MD][SP-Save] applyEdit result=', spEditResult);
                            isApplyingSidePanelEdit = false;
                            await sidePanelDocument.save();
                            console.log('[Any MD][SP-Save] save() completed');
                        } else {
                            console.log('[Any MD][SP-Save] Fallback: direct file write');
                            // Fallback: direct file write (side panel document not yet opened)
                            const spUri = vscode.Uri.file(message.filePath);
                            const spContent = Buffer.from(message.content, 'utf8');
                            await vscode.workspace.fs.writeFile(spUri, spContent);
                        }
                    } catch (e) {
                        isApplyingSidePanelEdit = false;
                        console.error('[Any MD][SP-Save] Error:', e);
                        vscode.window.showErrorMessage(`Failed to save: ${message.filePath} — ${e instanceof Error ? e.message : String(e)}`);
                    }
                    break;

                case 'sidePanelClosed':
                    disposeSidePanelFileWatcher();
                    break;

                case 'sidePanelOpenLink': {
                    // Link clicked inside side panel iframe — open in same side panel
                    const spLinkHref: string = message.href;
                    const spFilePath: string = message.sidePanelFilePath;
                    if (spLinkHref.startsWith('http')) {
                        vscode.env.openExternal(vscode.Uri.parse(spLinkHref));
                    } else if (spLinkHref.startsWith('#')) {
                        // Scroll inside iframe — relay back to iframe
                        webviewPanel.webview.postMessage({
                            type: 'sidePanelMessage',
                            data: { type: 'scrollToAnchor', anchor: spLinkHref.substring(1) }
                        });
                    } else {
                        // Resolve relative to the side panel file's directory
                        const spBaseUri = vscode.Uri.file(spFilePath);
                        const spResolvedUri = spLinkHref.startsWith('/')
                            ? vscode.Uri.file(spLinkHref)
                            : vscode.Uri.joinPath(spBaseUri, '..', spLinkHref);
                        const spResolvedPath = spResolvedUri.fsPath.toLowerCase();
                        if (spResolvedPath.endsWith('.md') || spResolvedPath.endsWith('.markdown')) {
                            try {
                                const spFileContent = await vscode.workspace.fs.readFile(spResolvedUri);
                                const spText = Buffer.from(spFileContent).toString('utf8');
                                const spFileName = spResolvedUri.path.split('/').pop() || 'untitled.md';
                                const spConfig = vscode.workspace.getConfiguration('any-markdown');
                                const spImageMap = this.buildImageMap(spText, spResolvedUri);
                                const spHtml = getSidePanelHtml(
                                    webviewNonce.value,
                                    spText,
                                    {
                                        theme: spConfig.get<string>('theme', 'github'),
                                        fontSize: spConfig.get<number>('fontSize', 16),
                                        documentBaseUri: spResolvedUri.with({ path: spResolvedUri.path.replace(/\/[^/]+$/, '/') }).toString(),
                                        webviewMessages: getWebviewMessages(),
                                        enableDebugLogging: spConfig.get<boolean>('enableDebugLogging', false)
                                    },
                                    spImageMap
                                );
                                webviewPanel.webview.postMessage({
                                    type: 'openSidePanel',
                                    sidePanelHtml: spHtml,
                                    filePath: spResolvedUri.fsPath,
                                    fileName: spFileName,
                                    toc: this.extractToc(spText),
                                    imageMap: this.buildImageMap(spText, spResolvedUri)
                                });
                                await setupSidePanelFileWatcher(spResolvedUri.fsPath);
                            } catch (e) {
                                vscode.window.showErrorMessage(`Cannot open file: ${spResolvedUri.fsPath}`);
                            }
                        } else {
                            vscode.commands.executeCommand('vscode.open', spResolvedUri);
                        }
                    }
                    break;
                }

                case 'sendToChat':
                    // Open text editor with selection based on line numbers from webview
                    try {
                        const chatStartLine = message.startLine as number;
                        const chatEndLine = message.endLine as number;
                        if (chatStartLine == null || chatEndLine == null) break;

                        // Open the file in VS Code's text editor
                        const textDoc = await vscode.workspace.openTextDocument(document.uri);
                        const textEditor = await vscode.window.showTextDocument(textDoc, { preview: false });

                        // Clamp line numbers to document range
                        const maxLine = textDoc.lineCount - 1;
                        const startLine = Math.max(0, Math.min(chatStartLine, maxLine));
                        const endLine = Math.max(startLine, Math.min(chatEndLine, maxLine));

                        const startPos = new vscode.Position(startLine, 0);
                        const endPos = textDoc.lineAt(endLine).range.end;
                        textEditor.selection = new vscode.Selection(startPos, endPos);
                        textEditor.revealRange(new vscode.Range(startPos, endPos), vscode.TextEditorRevealType.InCenter);

                        // Copy selected markdown to clipboard
                        const selectedMd = message.selectedMarkdown as string;
                        if (selectedMd) {
                            await vscode.env.clipboard.writeText(selectedMd);
                        }
                    } catch (err) {
                        console.error('[Any MD] sendToChat error:', err);
                    }
                    break;

                case 'setImageDir':
                    // Set IMAGE_DIR and FORCE_RELATIVE_PATH directives via toolbar button
                    const inputDir = await vscode.window.showInputBox({
                        prompt: t('enterImageDir'),
                        placeHolder: './images',
                        value: extractImageDir(document.getText()) || ''
                    });
                    if (inputDir !== undefined) {
                        if (inputDir === '') {
                            // 空文字の場合: IMAGE_DIR と FORCE_RELATIVE_PATH 両方をクリア
                            imageDirectoryManager.setFileImageDir(document.uri, '');
                            webviewPanel.webview.postMessage({
                                type: 'setImageDir',
                                dirPath: '',
                                forceRelativePath: null  // null でクリア
                            });
                            vscode.window.showInformationMessage(t('imageDirCleared'));
                            sendImageDirStatus();
                        } else {
                            // パスが入力された場合: FORCE_RELATIVE_PATH の設定を確認
                            const forceRelativeChoice = await vscode.window.showQuickPick(
                                [
                                    { label: 'No', description: t('forceRelativeNo'), value: false },
                                    { label: 'Yes', description: t('forceRelativeYes'), value: true }
                                ],
                                {
                                    placeHolder: t('forceRelativePrompt'),
                                    title: t('forceRelativeTitle')
                                }
                            );
                            
                            if (forceRelativeChoice !== undefined) {
                                // Update the manager
                                imageDirectoryManager.setFileImageDir(document.uri, inputDir);
                                
                                // Send to webview to update both settings
                                webviewPanel.webview.postMessage({
                                    type: 'setImageDir',
                                    dirPath: inputDir,
                                    forceRelativePath: forceRelativeChoice.value
                                });
                                
                                const relativeMsg = forceRelativeChoice.value ? t('relativePathOn') : '';
                                vscode.window.showInformationMessage(`${t('imageDirSet')}${inputDir} ${relativeMsg}`);
                                sendImageDirStatus();
                            }
                        }
                    }
                    break;

                case 'getImageDir':
                    // Return current IMAGE_DIR to webview
                    const currentImageDir = extractImageDir(document.getText()) || '';
                    const config = vscode.workspace.getConfiguration('any-markdown');
                    const defaultImageDir = config.get<string>('imageDefaultDir', '');
                    webviewPanel.webview.postMessage({
                        type: 'imageDirInfo',
                        fileImageDir: currentImageDir,
                        defaultImageDir: defaultImageDir
                    });
                    break;

                case 'searchFiles': {
                    const query: string = message.query || '';
                    if (query.length < 1) {
                        webviewPanel.webview.postMessage({
                            type: 'fileSearchResults',
                            results: [],
                            query: query
                        });
                        break;
                    }
                    const docDir = path.dirname(document.uri.fsPath);
                    const wsFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                    const searchBase = wsFolder ? wsFolder.uri : vscode.Uri.file(docDir);
                    try {
                        const files = await vscode.workspace.findFiles(
                            new vscode.RelativePattern(searchBase, '**/*.md'),
                            '**/node_modules/**',
                            50
                        );
                        const relativePaths = files
                            .map(f => path.relative(docDir, f.fsPath))
                            .filter(p => p.toLowerCase().includes(query.toLowerCase()))
                            .sort((a, b) => a.length - b.length)
                            .slice(0, 10);
                        webviewPanel.webview.postMessage({
                            type: 'fileSearchResults',
                            results: relativePaths,
                            query: query
                        });
                    } catch {
                        webviewPanel.webview.postMessage({
                            type: 'fileSearchResults',
                            results: [],
                            query: query
                        });
                    }
                    break;
                }

                case 'createPageAtPath': {
                    const relativePath: string = message.relativePath || '';
                    if (!relativePath) break;
                    const docDir2 = path.dirname(document.uri.fsPath);
                    let targetPath = relativePath;
                    if (!targetPath.endsWith('.md')) {
                        targetPath += '.md';
                    }
                    const absPath = path.resolve(docDir2, targetPath);
                    try {
                        // Create intermediate directories
                        const targetDir = path.dirname(absPath);
                        if (!fs.existsSync(targetDir)) {
                            fs.mkdirSync(targetDir, { recursive: true });
                        }
                        // Only create if not exists
                        if (!fs.existsSync(absPath)) {
                            fs.writeFileSync(absPath, '', 'utf8');
                        }
                        webviewPanel.webview.postMessage({
                            type: 'pageCreatedAtPath',
                            relativePath: path.relative(docDir2, absPath)
                        });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(`Failed to create page: ${e.message}`);
                    }
                    break;
                }

                case 'createPageAuto': {
                    const docDir3 = path.dirname(document.uri.fsPath);
                    const pagesDir = path.join(docDir3, 'pages');
                    if (!fs.existsSync(pagesDir)) {
                        fs.mkdirSync(pagesDir, { recursive: true });
                    }
                    const fileName = generateUniqueFileName(pagesDir, 'md');
                    const absPath2 = path.join(pagesDir, fileName);
                    fs.writeFileSync(absPath2, '', 'utf8');
                    const relPath = path.relative(docDir3, absPath2);
                    webviewPanel.webview.postMessage({
                        type: 'pageCreatedAtPath',
                        relativePath: relPath
                    });
                    break;
                }

                case 'updatePageH1': {
                    const h1RelPath: string = message.relativePath || '';
                    const h1Text: string = message.h1Text || '';
                    if (!h1RelPath || !h1Text) break;
                    const docDir4 = path.dirname(document.uri.fsPath);
                    const h1AbsPath = path.resolve(docDir4, h1RelPath);
                    try {
                        if (fs.existsSync(h1AbsPath)) {
                            fs.writeFileSync(h1AbsPath, `# ${h1Text}\n`, 'utf8');
                        }
                    } catch (e: any) {
                        // Silent fail — file may have been deleted
                    }
                    break;
                }
            }
        });

        // Track active webview panel for undo/redo command forwarding
        if (webviewPanel.active) {
            this.activeWebviewPanel = webviewPanel;
        }
        webviewPanel.onDidChangeViewState(() => {
            if (webviewPanel.active) {
                this.activeWebviewPanel = webviewPanel;
            } else if (this.activeWebviewPanel === webviewPanel) {
                this.activeWebviewPanel = undefined;
            }
        });

        webviewPanel.onDidDispose(() => {
            if (this.activeWebviewPanel === webviewPanel) {
                this.activeWebviewPanel = undefined;
            }
            changeDocumentSubscription.dispose();
            changeConfigSubscription.dispose();
            fileChangeSubscription.dispose();
            fileWatcher.dispose();
            disposeSidePanelFileWatcher();
        });
    }

    private async handleImageInsert(document: vscode.TextDocument, webview: vscode.Webview) {
        const path = require('path');
        const fs = require('fs');
        
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: t('selectImage'),
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
            },
            // Default to current document's directory
            defaultUri: vscode.Uri.file(path.dirname(document.uri.fsPath))
        };

        const fileUri = await vscode.window.showOpenDialog(options);
        
        if (fileUri && fileUri[0]) {
            const sourcePath = fileUri[0].fsPath;
            
            // Get the image directory from settings/directive
            const imageDir = imageDirectoryManager.getImageDirectory(document.uri, document.getText());

            try {
            // Ensure the directory exists
            ensureDirectoryExists(imageDir);

            // Always generate unique filename using timestamp format
            const ext = path.extname(sourcePath).slice(1) || 'png'; // Remove leading dot
            const fileName = generateUniqueFileName(imageDir, ext);
            const destPath = path.join(imageDir, fileName);
                // Copy the image with new name
                fs.copyFileSync(sourcePath, destPath);
                
                // Get webview URI for display
                const webviewUri = webview.asWebviewUri(vscode.Uri.file(destPath)).toString();

                // Generate path for Markdown (absolute if configured with absolute path)
                const useAbsolute = imageDirectoryManager.shouldUseAbsolutePath(document.uri);
                const forceRelative = imageDirectoryManager.shouldForceRelativePath(document.uri, document.getText());
                const markdownPath = toMarkdownPath(destPath, document.uri.fsPath, useAbsolute, forceRelative);

                // Generate data URL for side panel iframe (can't access vscode-resource URIs)
                const imgBuffer = fs.readFileSync(destPath);
                const imgExt = path.extname(destPath).slice(1) || 'png';
                const mimeType = imgExt === 'jpg' ? 'image/jpeg' : `image/${imgExt}`;
                const dataUrl = `data:${mimeType};base64,${imgBuffer.toString('base64')}`;

                webview.postMessage({
                    type: 'insertImageHtml',
                    markdownPath: markdownPath,
                    displayUri: webviewUri,
                    dataUri: dataUrl
                });
            } catch (error) {
                console.error('Failed to copy image:', error);
                vscode.window.showErrorMessage(`${t('failedToCopyImage')}${error}`);
            }
        }
    }

    private async handleSaveImage(document: vscode.TextDocument, webview: vscode.Webview, dataUrl: string, fileName?: string) {
        const path = require('path');
        const fs = require('fs');
        
        // Get the image directory from settings/directive
        const imageDir = imageDirectoryManager.getImageDirectory(document.uri, document.getText());

        try {
        // Ensure the directory exists
        ensureDirectoryExists(imageDir);

        // Always generate unique filename using timestamp format
        const extension = this.getImageExtension(dataUrl);
        const imageName = generateUniqueFileName(imageDir, extension);
        const imagePath = path.join(imageDir, imageName);

        // Convert data URL to buffer
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
            // Write the file
            fs.writeFileSync(imagePath, imageBuffer);
            console.log('[DEBUG] Image saved to:', imagePath);
            
            // Get webview URI for display
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(imagePath)).toString();

            // Generate path for Markdown (absolute if configured with absolute path)
            const useAbsolute = imageDirectoryManager.shouldUseAbsolutePath(document.uri);
            const forceRelative = imageDirectoryManager.shouldForceRelativePath(document.uri, document.getText());
            const markdownPath = toMarkdownPath(imagePath, document.uri.fsPath, useAbsolute, forceRelative);

            // Send to webview (include dataUri for side panel iframe)
            webview.postMessage({
                type: 'insertImageHtml',
                markdownPath: markdownPath,
                displayUri: webviewUri,
                dataUri: dataUrl
            });
        } catch (error) {
            console.error('[DEBUG] Failed to save image:', error);
            vscode.window.showErrorMessage(`${t('failedToSaveImage')}${error}`);
        }
    }

    private getImageExtension(dataUrl: string): string {
        const match = dataUrl.match(/^data:image\/(\w+);/);
        if (match) {
            return match[1] === 'jpeg' ? 'jpg' : match[1];
        }
        return 'png'; // Default to png
    }

    private async handleReadAndInsertImage(document: vscode.TextDocument, webview: vscode.Webview, filePath: string) {
        const path = require('path');
        const fs = require('fs');
        
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                vscode.window.showErrorMessage(`${t('imageFileNotFound')}${filePath}`);
                return;
            }
            
            // Get the image directory from settings/directive
            const imageDir = imageDirectoryManager.getImageDirectory(document.uri, document.getText());
            
            // Ensure the directory exists
            ensureDirectoryExists(imageDir);
            
            // Always generate unique filename using timestamp format
            const ext = path.extname(filePath).slice(1) || 'png'; // Remove leading dot
            const fileName = generateUniqueFileName(imageDir, ext);
            const destPath = path.join(imageDir, fileName);
            
            // Copy the file with new name
            fs.copyFileSync(filePath, destPath);
            
            // Get webview URI for display
            const webviewUri = webview.asWebviewUri(vscode.Uri.file(destPath)).toString();

            // Generate path for Markdown (absolute if configured with absolute path)
            const useAbsolute = imageDirectoryManager.shouldUseAbsolutePath(document.uri);
            const forceRelative = imageDirectoryManager.shouldForceRelativePath(document.uri, document.getText());
            const markdownPath = toMarkdownPath(destPath, document.uri.fsPath, useAbsolute, forceRelative);

            // Generate data URL for side panel iframe (can't access vscode-resource URIs)
            const imgBuffer = fs.readFileSync(destPath);
            const imgExt = path.extname(destPath).slice(1) || 'png';
            const mimeType = imgExt === 'jpg' ? 'image/jpeg' : `image/${imgExt}`;
            const dataUrl = `data:${mimeType};base64,${imgBuffer.toString('base64')}`;

            // Send to webview
            webview.postMessage({
                type: 'insertImageHtml',
                markdownPath: markdownPath,
                displayUri: webviewUri,
                dataUri: dataUrl
            });
        } catch (error) {
            console.error('Failed to read/copy image:', error);
            vscode.window.showErrorMessage(`${t('failedToProcessImage')}${error}`);
        }
    }

    private generateOutline(content: string): Array<{ level: number; text: string; line: number }> {
        const lines = content.split('\n');
        const outline: Array<{ level: number; text: string; line: number }> = [];

        lines.forEach((line, index) => {
            const match = line.match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                outline.push({
                    level: match[1].length,
                    text: match[2].trim(),
                    line: index
                });
            }
        });

        return outline;
    }

    private calculateWordCount(content: string): { words: number; characters: number; lines: number; readingTime: string } {
        const lines = content.split('\n').length;
        const characters = content.length;
        const words = content.trim().split(/\s+/).filter(word => word.length > 0).length;
        const readingMinutes = Math.ceil(words / 200);
        const readingTime = readingMinutes < 1 ? 'Less than 1 min' : `${readingMinutes} min read`;

        return { words, characters, lines, readingTime };
    }
}
