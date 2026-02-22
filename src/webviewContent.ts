import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WebviewMessages } from './i18n/messages';

function getNonce(): string {
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
    documentBaseUri?: string;
    webviewMessages?: WebviewMessages;
    enableDebugLogging?: boolean;
}

export function getWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    content: string,
    config: EditorConfig
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
        documentBaseUri: config?.documentBaseUri ?? '',
        webviewMessages: config?.webviewMessages,
        enableDebugLogging: config?.enableDebugLogging ?? false
    };
    
    const nonce = getNonce();
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
    
    const editorScript = fs.readFileSync(editorScriptPath, 'utf8')
        .replace('__DEBUG_MODE__', String(safeConfig.enableDebugLogging ?? false))
        .replace('__I18N__', JSON.stringify(msg))
        .replace('__DOCUMENT_BASE_URI__', safeConfig.documentBaseUri || '')
        .replace('__CONTENT__', `'${base64Content}'`);

    return `<!DOCTYPE html>
<html lang="en" data-theme="${safeConfig.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://unpkg.com https://cdn.jsdelivr.net; img-src ${webview.cspSource} https: http: data: file:; font-src ${webview.cspSource} https: data:; connect-src http://127.0.0.1:7244;">
    <title>Any Markdown Editor</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    <div class="container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3>Outline</h3>
                <button class="sidebar-toggle" id="closeSidebar" title="${msg.closeOutline}">☰</button>
            </div>
            <nav class="outline" id="outline"></nav>
            <div class="word-count" id="wordCount"></div>
            <div class="sidebar-resizer" id="sidebarResizer"></div>
        </aside>
        <main class="editor-container">
            <div class="toolbar" id="toolbar">
                <button class="toolbar-scroll-btn toolbar-scroll-btn--left hidden" id="toolbarScrollLeft">&#x276E;</button>
                <div class="toolbar-inner" id="toolbarInner">
                    <button data-action="openOutline" class="menu-btn hidden" id="openSidebarBtn" title="${msg.openOutline}"></button>
                    <div class="toolbar-group" data-group="inline">
                        <button data-action="bold" title="${msg.bold}"></button>
                        <button data-action="italic" title="${msg.italic}"></button>
                        <button data-action="strikethrough" title="${msg.strikethrough}"></button>
                        <button data-action="code" title="${msg.inlineCode}"></button>
                    </div>
                    <div class="toolbar-group" data-group="block">
                        <button data-action="heading1" title="${msg.heading1}"></button>
                        <button data-action="heading2" title="${msg.heading2}"></button>
                        <button data-action="heading3" title="${msg.heading3}"></button>
                        <button data-action="heading4" title="${msg.heading4}"></button>
                        <button data-action="heading5" title="${msg.heading5}"></button>
                        <button data-action="heading6" title="${msg.heading6}"></button>
                        <button data-action="ul" title="${msg.unorderedList}"></button>
                        <button data-action="ol" title="${msg.orderedList}"></button>
                        <button data-action="task" title="${msg.taskList}"></button>
                        <button data-action="quote" title="${msg.blockquote}"></button>
                        <button data-action="codeblock" title="${msg.codeBlock}"></button>
                        <button data-action="hr" title="${msg.horizontalRule}"></button>
                    </div>
                    <div class="toolbar-group" data-group="insert">
                        <button data-action="link" title="${msg.insertLink}"></button>
                        <button data-action="image" title="${msg.insertImage}"></button>
                        <button data-action="imageDir" title="${msg.setImageDir}"></button>
                        <button data-action="table" title="${msg.insertTable}"></button>
                    </div>
                    <div class="toolbar-group" data-group="utility">
                        <button data-action="openInTextEditor" title="${msg.openInTextEditor}"></button>
                        <button data-action="source" title="${msg.toggleSourceMode}"></button>
                    </div>
                </div>
                <button class="toolbar-scroll-btn toolbar-scroll-btn--right hidden" id="toolbarScrollRight">&#x276F;</button>
            </div>
            <div class="editor-wrapper" id="editorWrapper">
                <div class="search-replace-box" id="searchReplaceBox" style="display: none;">
                    <div class="search-row">
                        <input type="text" id="searchInput" placeholder="${msg.searchPlaceholder}" />
                        <span class="search-count" id="searchCount">0/0</span>
                        <button id="searchPrev" title="${msg.searchPrev}">▲</button>
                        <button id="searchNext" title="${msg.searchNext}">▼</button>
                        <button id="toggleReplace" title="${msg.toggleReplace}">⇅</button>
                        <button id="closeSearch" title="${msg.closeSearch}">✕</button>
                    </div>
                    <div class="replace-row" id="replaceRow" style="display: none;">
                        <input type="text" id="replaceInput" placeholder="${msg.replacePlaceholder}" />
                        <button id="replaceOne" title="${msg.replace}">${msg.replace}</button>
                        <button id="replaceAll" title="${msg.replaceAll}">${msg.replaceAll}</button>
                    </div>
                    <div class="search-options">
                        <label><input type="checkbox" id="searchCaseSensitive" /> ${msg.caseSensitive}</label>
                        <label><input type="checkbox" id="searchWholeWord" /> ${msg.wholeWord}</label>
                        <label><input type="checkbox" id="searchRegex" /> ${msg.regex}</label>
                    </div>
                </div>
                <div class="editor" id="editor" contenteditable="true" spellcheck="true"></div>
                <textarea class="source-editor" id="sourceEditor" style="display: none;"></textarea>
            </div>
            <div class="status-bar" id="statusBar">
                <span id="statusLeft">${msg.livePreviewMode}</span>
                <span id="statusImageDir" class="status-image-dir"></span>
                <span id="statusRight"></span>
            </div>
        </main>
    </div>

    <script src="https://unpkg.com/turndown/dist/turndown.js"></script>
    <script src="https://unpkg.com/turndown-plugin-gfm/dist/turndown-plugin-gfm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.css">
    <script src="https://cdn.jsdelivr.net/npm/katex@0.16/dist/katex.min.js"></script>
    <script nonce="${nonce}">
        ${editorScript}
    </script>
</body>
</html>`;
}
