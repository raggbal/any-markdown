import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebviewMessages } from './i18n/messages';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { generateEditorBodyHtml } = require('./shared/editor-body-html');

export function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

interface EditorConfig {
    theme: string;
    fontSize: number;
    toolbarMode?: string;
    documentBaseUri?: string;
    webviewMessages?: WebviewMessages;
    enableDebugLogging?: boolean;
}

// Vendor JS/CSS キャッシュ（プロセス内で一度だけ読み込み）
let vendorCache: { turndown: string; turndownGfm: string; mermaid: string; katexJs: string; katexCss: string } | null = null;

function getVendorInline(): typeof vendorCache & {} {
    if (!vendorCache) {
        const vendorDir = path.join(__dirname, '..', 'vendor');
        vendorCache = {
            turndown: fs.readFileSync(path.join(vendorDir, 'turndown.js'), 'utf8'),
            turndownGfm: fs.readFileSync(path.join(vendorDir, 'turndown-plugin-gfm.js'), 'utf8'),
            mermaid: fs.readFileSync(path.join(vendorDir, 'mermaid.min.js'), 'utf8'),
            katexJs: fs.readFileSync(path.join(vendorDir, 'katex.min.js'), 'utf8'),
            katexCss: fs.readFileSync(path.join(vendorDir, 'katex.min.css'), 'utf8'),
        };
    }
    return vendorCache!;
}

/**
 * サイドパネル iframe 用の完全自己完結 HTML を生成。
 * blob URL iframe は親と同一オリジンのため、親の CSP（nonceベース）が適用される。
 * よって vendor JS/CSS も全てインライン化し、親の nonce を付与する。
 */
export function getSidePanelHtml(
    nonce: string,
    content: string,
    config: EditorConfig
): string {
    let safeContent = content ?? '';
    if (safeContent.charCodeAt(0) === 0xFEFF) safeContent = safeContent.slice(1);
    safeContent = safeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const safeConfig: EditorConfig = {
        theme: config?.theme ?? 'github',
        fontSize: config?.fontSize ?? 16,
        toolbarMode: 'simple',
        documentBaseUri: config?.documentBaseUri ?? '',
        webviewMessages: config?.webviewMessages,
        enableDebugLogging: config?.enableDebugLogging ?? false
    };

    const msg = safeConfig.webviewMessages || {} as WebviewMessages;
    const base64Content = Buffer.from(safeContent, 'utf8').toString('base64');

    const styles = fs.readFileSync(path.join(__dirname, 'webview', 'styles.css'), 'utf8')
        .replace('__FONT_SIZE__', String(safeConfig.fontSize));

    const hostBridgeScript = fs.readFileSync(
        path.join(__dirname, 'shared', 'side-panel-host-bridge.js'), 'utf8');

    const editorScript = fs.readFileSync(path.join(__dirname, 'webview', 'editor.js'), 'utf8')
        .replace('__DEBUG_MODE__', String(safeConfig.enableDebugLogging ?? false))
        .replace('__I18N__', JSON.stringify(msg))
        .replace('__DOCUMENT_BASE_URI__', safeConfig.documentBaseUri || '')
        .replace('__CONTENT__', `'${base64Content}'`);

    const vendor = getVendorInline();

    return `<!DOCTYPE html>
<html lang="en" data-theme="${safeConfig.theme}" data-toolbar-mode="simple" data-side-panel="true">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Side Panel</title>
    <style nonce="${nonce}">
        ${vendor.katexCss}
    </style>
    <style nonce="${nonce}">
        ${styles}
        .sidebar { display: none !important; }
        .side-panel { display: none !important; }
        .side-panel-overlay { display: none !important; }
    </style>
</head>
<body>
    ${generateEditorBodyHtml(msg, process.platform)}

    <script nonce="${nonce}">${vendor.turndown}</script>
    <script nonce="${nonce}">${vendor.turndownGfm}</script>
    <script nonce="${nonce}">${vendor.mermaid}</script>
    <script nonce="${nonce}">${vendor.katexJs}</script>
    <script nonce="${nonce}">
        ${hostBridgeScript}
    </script>
    <script nonce="${nonce}">
        ${editorScript}
    </script>
</body>
</html>`;
}

export function getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    content: string,
    config: EditorConfig,
    outNonce?: { value: string }
): string {
    // Defensive checks to prevent "Assertion Failed: Argument is undefined or null" errors
    // This can happen when VSCode tries to restore cached webview state after extension updates
    if (!webview) {
        throw new Error('Webview is undefined or null');
    }
    if (!extensionUri) {
        throw new Error('Extension URI is undefined or null');
    }

    // Ensure content is a string (can be undefined/null after extension update)
    let safeContent = content ?? '';
    // Strip BOM (Byte Order Mark) if present - some editors add this to UTF-8 files
    if (safeContent.charCodeAt(0) === 0xFEFF) {
        safeContent = safeContent.slice(1);
    }
    // Normalize line endings: \r\n (Windows) and lone \r (old Mac) → \n
    safeContent = safeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Ensure config has all required properties with defaults
    const safeConfig: EditorConfig = {
        theme: config?.theme ?? 'github',
        fontSize: config?.fontSize ?? 16,
        toolbarMode: config?.toolbarMode ?? 'full',
        documentBaseUri: config?.documentBaseUri ?? '',
        webviewMessages: config?.webviewMessages,
        enableDebugLogging: config?.enableDebugLogging ?? false
    };

    const nonce = getNonce();
    // Export nonce for side panel reuse
    if (outNonce) {
        outNonce.value = nonce;
    }
    // webviewMessages should always be provided, but fallback to empty object for safety
    const msg = safeConfig.webviewMessages || {} as WebviewMessages;

    // Use Base64 encoding to safely pass content to JavaScript
    // This avoids all escaping issues with template literals, special characters, etc.
    const base64Content = Buffer.from(safeContent, 'utf8').toString('base64');

    // Load external CSS and JS files
    const stylesPath = path.join(__dirname, 'webview', 'styles.css');
    const editorScriptPath = path.join(__dirname, 'webview', 'editor.js');

    const styles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(safeConfig.fontSize));

    const hostBridgePath = path.join(__dirname, 'shared', 'vscode-host-bridge.js');
    const hostBridgeScript = fs.readFileSync(hostBridgePath, 'utf8');

    // Vendor library URIs (local instead of CDN)
    const vendorDir = path.join(__dirname, '..', 'vendor');
    const vendorUri = (file: string) => webview.asWebviewUri(
        vscode.Uri.file(path.join(vendorDir, file))
    );
    const turndownUri = vendorUri('turndown.js');
    const turndownGfmUri = vendorUri('turndown-plugin-gfm.js');
    const mermaidUri = vendorUri('mermaid.min.js');
    const katexJsUri = vendorUri('katex.min.js');
    const katexCssUri = vendorUri('katex.min.css');

    const editorScript = fs.readFileSync(editorScriptPath, 'utf8')
        .replace('__DEBUG_MODE__', String(safeConfig.enableDebugLogging ?? false))
        .replace('__I18N__', JSON.stringify(msg))
        .replace('__DOCUMENT_BASE_URI__', safeConfig.documentBaseUri || '')
        .replace('__CONTENT__', `'${base64Content}'`);

    return `<!DOCTYPE html>
<html lang="en" data-theme="${safeConfig.theme}" data-toolbar-mode="${safeConfig.toolbarMode}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src blob:; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: http: data: file:; font-src ${webview.cspSource} https: https://fonts.gstatic.com data:; connect-src http://127.0.0.1:7244;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Any Markdown Editor</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    ${generateEditorBodyHtml(msg, process.platform)}

    <script src="${turndownUri}"></script>
    <script src="${turndownGfmUri}"></script>
    <script src="${mermaidUri}"></script>
    <link rel="stylesheet" href="${katexCssUri}">
    <script src="${katexJsUri}"></script>
    <script nonce="${nonce}">
        ${hostBridgeScript}
    </script>
    <script nonce="${nonce}">
        ${editorScript}
    </script>
</body>
</html>`;
}
