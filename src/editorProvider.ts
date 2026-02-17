import * as vscode from 'vscode';
import { getWebviewContent } from './webviewContent';
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
        const config = vscode.workspace.getConfiguration('any-md');
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
        const config = vscode.workspace.getConfiguration('any-md');
        return config.get<boolean>('forceRelativeImagePath', false);
    }
    
    /**
     * ファイル単位のIMAGE_DIRを設定
     */
    setFileImageDir(documentUri: vscode.Uri, dirPath: string): void {
        this.fileImageDirs.set(documentUri.toString(), dirPath);
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
    private static readonly viewType = 'any-md.editor';

    constructor(private readonly context: vscode.ExtensionContext) {}

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
        
        const updateWebview = () => {
            try {
                const config = vscode.workspace.getConfiguration('any-md');
                const content = convertImagePaths(document.getText());
                webviewPanel.webview.html = getWebviewContent(
                    webviewPanel.webview,
                    this.context.extensionUri,
                    content,
                    {
                        theme: config.get<string>('theme', 'github'),
                        fontSize: config.get<number>('fontSize', 16),
                        lineNumbers: config.get<boolean>('lineNumbers', false),
                        autoPair: config.get<boolean>('autoPair', true),
                        documentBaseUri: documentBaseUri,
                        webviewMessages: getWebviewMessages(),
                        enableDebugLogging: config.get<boolean>('enableDebugLogging', false)
                    }
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

        // Initial content
        updateWebview();

        // Initialize IMAGE_DIR tracking
        imageDirectoryManager.initializeForDocument(document.uri, document.getText());

        // lastContentFromWebview: bounce-back detection for webview edits
        let lastContentFromWebview: string | null = null;

        // Listen for document changes — single path for ALL webview messaging
        const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                const currentContent = document.getText();
                // Skip bounce-back from webview's own edit (latest or currently being applied)
                if (currentContent === lastContentFromWebview || currentContent === contentBeingApplied) {
                    return;
                }
                // Skip VS Code normalization events (e.g. trailing newline added after applyEdit)
                if (Date.now() - lastApplyEditTime < 500) {
                    lastContentFromWebview = currentContent;
                    return;
                }
                // This is a genuine external change — cancel any pending webview edit
                pendingContent = null;
                if (editDebounceTimer) {
                    clearTimeout(editDebounceTimer);
                    editDebounceTimer = null;
                }
                const content = convertImagePaths(currentContent);
                webviewPanel.webview.postMessage({
                    type: 'update',
                    content: content
                });

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
                            const fullRange = new vscode.Range(
                                document.positionAt(0),
                                document.positionAt(currentContent.length)
                            );
                            const edit = new vscode.WorkspaceEdit();
                            edit.replace(document.uri, fullRange, newContent);
                            await vscode.workspace.applyEdit(edit);
                        }
                    } catch (error) {
                        console.error('[Any MD] Error reading file after external change:', error);
                    }
                }, 100);
            }
        });

        // Listen for configuration changes
        const changeConfigSubscription = vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('any-md')) {
                // Re-initialize locale if language setting changed
                if (e.affectsConfiguration('any-md.language')) {
                    initLocale();
                }
                updateWebview();
            }
        });

        // Edit queue to prevent concurrent workspace edits
        let pendingContent: string | null = null;
        let isApplyingEdit = false;
        let editDebounceTimer: NodeJS.Timeout | null = null;
        // Track content currently being applied to detect bounce-backs during race conditions
        let contentBeingApplied: string | null = null;
        // Cooldown after applyEdit to suppress VS Code normalization events
        let lastApplyEditTime = 0;

        const applyPendingEdit = async () => {
            if (isApplyingEdit || pendingContent === null) return;

            isApplyingEdit = true;
            const content = pendingContent;
            pendingContent = null;
            contentBeingApplied = content;

            try {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, document.lineCount, 0),
                    content
                );
                await vscode.workspace.applyEdit(edit);
            } catch (e) {
                // Ignore edit errors (e.g., file changed in the meantime)
                console.log('Edit error (ignored):', e);
            } finally {
                isApplyingEdit = false;
                contentBeingApplied = null;
                // Record time so normalization events from VS Code are suppressed
                lastApplyEditTime = Date.now();
                // Sync with actual document content (VS Code may normalize content, e.g. trailing newline)
                lastContentFromWebview = document.getText();
                // Process any pending edit that came in while we were applying
                if (pendingContent !== null) {
                    setTimeout(applyPendingEdit, 100);
                }
            }
        };
        
        // Debounced edit scheduling - batches rapid edits
        const scheduleEdit = (content: string) => {
            pendingContent = content;
            if (editDebounceTimer) {
                clearTimeout(editDebounceTimer);
            }
            // Small debounce to batch rapid sequential edits
            editDebounceTimer = setTimeout(() => {
                editDebounceTimer = null;
                applyPendingEdit();
            }, 100);
        };

        // Handle messages from the webview
        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'edit':
                    // Track content from webview to detect bounce-backs in onDidChangeTextDocument
                    lastContentFromWebview = message.content;
                    // Queue the edit with debouncing for better performance
                    scheduleEdit(message.content);
                    break;

                case 'save':
                    await document.save();
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
                    if (message.href.startsWith('http')) {
                        vscode.env.openExternal(vscode.Uri.parse(message.href));
                    } else if (message.href.startsWith('#')) {
                        // Handle anchor links (scroll to heading in the same document)
                        webviewPanel.webview.postMessage({
                            type: 'scrollToAnchor',
                            anchor: message.href.substring(1) // Remove the leading #
                        });
                    } else {
                        // Handle internal links
                        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                        if (workspaceFolder) {
                            const linkUri = vscode.Uri.joinPath(workspaceFolder.uri, message.href);
                            vscode.commands.executeCommand('vscode.open', linkUri);
                        }
                    }
                    break;

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
                            }
                        }
                    }
                    break;

                case 'getImageDir':
                    // Return current IMAGE_DIR to webview
                    const currentImageDir = extractImageDir(document.getText()) || '';
                    const config = vscode.workspace.getConfiguration('any-md');
                    const defaultImageDir = config.get<string>('imageDefaultDir', '');
                    webviewPanel.webview.postMessage({
                        type: 'imageDirInfo',
                        fileImageDir: currentImageDir,
                        defaultImageDir: defaultImageDir
                    });
                    break;
            }
        });

        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            changeConfigSubscription.dispose();
            fileChangeSubscription.dispose();
            fileWatcher.dispose();
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
                
                webview.postMessage({
                    type: 'insertImageHtml',
                    markdownPath: markdownPath,
                    displayUri: webviewUri
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
            
            // Send to webview
            webview.postMessage({
                type: 'insertImageHtml',
                markdownPath: markdownPath,
                displayUri: webviewUri
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
            
            // Send to webview
            webview.postMessage({
                type: 'insertImageHtml',
                markdownPath: markdownPath,
                displayUri: webviewUri
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
