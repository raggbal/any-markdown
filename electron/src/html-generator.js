"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateEditorHtml = generateEditorHtml;
exports.writeHtmlToTempFile = writeHtmlToTempFile;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
function getResourcePath(relativePath) {
    // 開発時: プロジェクトルートから相対パス (electron/ の親 = any-markdown/)
    const devPath = path.join(__dirname, '..', '..', relativePath);
    if (fs.existsSync(devPath)) {
        console.log(`[html-generator] Found (dev): ${relativePath} → ${devPath}`);
        return devPath;
    }
    // パッケージ時: extraResources からの短縮パス
    // extraResources: src/webview/ → webview/, vendor/ → vendor/
    const resPath = process.resourcesPath || '';
    const prodPath = path.join(resPath, relativePath);
    if (fs.existsSync(prodPath)) {
        console.log(`[html-generator] Found (prod): ${relativePath} → ${prodPath}`);
        return prodPath;
    }
    // extraResources の短縮パス (src/webview/editor.js → webview/editor.js)
    const shortPath = relativePath.replace(/^src\/webview\//, 'webview/');
    const prodShortPath = path.join(resPath, shortPath);
    if (fs.existsSync(prodShortPath)) {
        console.log(`[html-generator] Found (prod-short): ${relativePath} → ${prodShortPath}`);
        return prodShortPath;
    }
    console.error(`[html-generator] Resource NOT FOUND: ${relativePath}`);
    console.error(`  Tried dev: ${devPath}`);
    console.error(`  Tried prod: ${prodPath}`);
    console.error(`  Tried prod-short: ${prodShortPath}`);
    return devPath; // fallback
}
function fileUri(filePath) {
    // Windows: file:///C:/... Mac/Linux: file:///Users/...
    const normalized = filePath.replace(/\\/g, '/');
    return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}
function generateEditorHtml(content, config) {
    const stylesPath = getResourcePath('src/webview/styles.css');
    const editorScriptPath = getResourcePath('src/webview/editor.js');
    const vendorDir = getResourcePath('vendor');
    const styles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));
    const editorScript = fs.readFileSync(editorScriptPath, 'utf8')
        .replace('__DEBUG_MODE__', String(config.enableDebugLogging))
        .replace('__I18N__', JSON.stringify(config.webviewMessages))
        .replace('__DOCUMENT_BASE_URI__', config.documentBaseUri)
        .replace('__CONTENT__', `'${Buffer.from(content, 'utf8').toString('base64')}'`);
    const vendorFileUri = (file) => fileUri(path.join(vendorDir, file));
    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}" data-toolbar-mode="${config.toolbarMode}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' file:; script-src 'unsafe-inline' file:; img-src file: data: https: http:; font-src file: data:;">
    <title>Any Markdown</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    <div class="container">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <h3>Outline</h3>
                <button class="sidebar-toggle" id="closeSidebar" title="${config.webviewMessages.closeOutline || 'Close'}">&#9776;</button>
            </div>
            <nav class="outline" id="outline"></nav>
            <div class="sidebar-footer">
                <div class="word-count" id="wordCount"></div>
                <div class="sidebar-status-mode" id="statusLeft">${config.webviewMessages.livePreviewMode || 'Live Preview'}</div>
                <div class="sidebar-status-imagedir" id="statusImageDir"></div>
            </div>
            <div class="sidebar-resizer" id="sidebarResizer"></div>
        </aside>
        <main class="editor-container">
            <div class="toolbar" id="toolbar">
                <button class="toolbar-scroll-btn toolbar-scroll-btn--left hidden" id="toolbarScrollLeft">&#x276E;</button>
                <div class="toolbar-inner" id="toolbarInner">
                    <button data-action="openOutline" class="menu-btn hidden" id="openSidebarBtn" title="${config.webviewMessages.openOutline || 'Outline'}"></button>
                    <div class="toolbar-group" data-group="history">
                        <button data-action="undo" title="${config.webviewMessages.undo || 'Undo'}"></button>
                        <button data-action="redo" title="${config.webviewMessages.redo || 'Redo'}"></button>
                    </div>
                    <div class="toolbar-group" data-group="inline">
                        <button data-action="bold" title="${config.webviewMessages.bold || 'Bold'}"></button>
                        <button data-action="italic" title="${config.webviewMessages.italic || 'Italic'}"></button>
                        <button data-action="strikethrough" title="${config.webviewMessages.strikethrough || 'Strikethrough'}"></button>
                        <button data-action="code" title="${config.webviewMessages.inlineCode || 'Code'}"></button>
                    </div>
                    <div class="toolbar-group" data-group="block">
                        <button data-action="heading1" title="${config.webviewMessages.heading1 || 'H1'}"></button>
                        <button data-action="heading2" title="${config.webviewMessages.heading2 || 'H2'}"></button>
                        <button data-action="heading3" title="${config.webviewMessages.heading3 || 'H3'}"></button>
                        <button data-action="heading4" title="${config.webviewMessages.heading4 || 'H4'}"></button>
                        <button data-action="heading5" title="${config.webviewMessages.heading5 || 'H5'}"></button>
                        <button data-action="heading6" title="${config.webviewMessages.heading6 || 'H6'}"></button>
                        <button data-action="ul" title="${config.webviewMessages.unorderedList || 'Bullet List'}"></button>
                        <button data-action="ol" title="${config.webviewMessages.orderedList || 'Numbered List'}"></button>
                        <button data-action="task" title="${config.webviewMessages.taskList || 'Task List'}"></button>
                        <button data-action="quote" title="${config.webviewMessages.blockquote || 'Quote'}"></button>
                        <button data-action="codeblock" title="${config.webviewMessages.codeBlock || 'Code Block'}"></button>
                        <button data-action="mermaid" title="${config.webviewMessages.mermaidBlock || 'Mermaid'}"></button>
                        <button data-action="math" title="${config.webviewMessages.mathBlock || 'Math'}"></button>
                        <button data-action="hr" title="${config.webviewMessages.horizontalRule || 'Horizontal Rule'}"></button>
                    </div>
                    <div class="toolbar-group" data-group="insert">
                        <button data-action="link" title="${config.webviewMessages.insertLink || 'Link'}"></button>
                        <button data-action="image" title="${config.webviewMessages.insertImage || 'Image'}"></button>
                        <button data-action="imageDir" title="${config.webviewMessages.setImageDir || 'Image Dir'}"></button>
                        <button data-action="table" title="${config.webviewMessages.insertTable || 'Table'}"></button>
                    </div>
                    <div class="toolbar-group" data-group="utility">
                        <button data-action="openInTextEditor" title="${config.webviewMessages.openInTextEditor || 'Open in Text Editor'} (${process.platform === 'darwin' ? 'Cmd+Shift+.' : 'Ctrl+Shift+.'})"></button>
                        <button data-action="source" title="${config.webviewMessages.toggleSourceMode || 'Source Mode'} (${process.platform === 'darwin' ? 'Cmd' : 'Ctrl'}+.)"></button>
                        <button data-action="copyPath" title="${config.webviewMessages.copyPath || 'Copy Path'}"></button>
                    </div>
                </div>
                <button class="toolbar-scroll-btn toolbar-scroll-btn--right hidden" id="toolbarScrollRight">&#x276F;</button>
            </div>
            <div class="editor-wrapper" id="editorWrapper">
                <div class="search-replace-box" id="searchReplaceBox" style="display: none;">
                    <div class="search-row">
                        <input type="text" id="searchInput" placeholder="${config.webviewMessages.searchPlaceholder || 'Search...'}" />
                        <span class="search-count" id="searchCount">0/0</span>
                        <button id="searchPrev" title="${config.webviewMessages.searchPrev || 'Previous'}">&#9650;</button>
                        <button id="searchNext" title="${config.webviewMessages.searchNext || 'Next'}">&#9660;</button>
                        <button id="toggleReplace" title="${config.webviewMessages.toggleReplace || 'Replace'}">&#8693;</button>
                        <button id="closeSearch" title="${config.webviewMessages.closeSearch || 'Close'}">&#10005;</button>
                    </div>
                    <div class="replace-row" id="replaceRow" style="display: none;">
                        <input type="text" id="replaceInput" placeholder="${config.webviewMessages.replacePlaceholder || 'Replace...'}" />
                        <button id="replaceOne" title="${config.webviewMessages.replace || 'Replace'}">${config.webviewMessages.replace || 'Replace'}</button>
                        <button id="replaceAll" title="${config.webviewMessages.replaceAll || 'Replace All'}">${config.webviewMessages.replaceAll || 'All'}</button>
                    </div>
                    <div class="search-options">
                        <label><input type="checkbox" id="searchCaseSensitive" /> ${config.webviewMessages.caseSensitive || 'Aa'}</label>
                        <label><input type="checkbox" id="searchWholeWord" /> ${config.webviewMessages.wholeWord || 'Word'}</label>
                        <label><input type="checkbox" id="searchRegex" /> ${config.webviewMessages.regex || '.*'}</label>
                    </div>
                </div>
                <div class="editor" id="editor" contenteditable="true" spellcheck="true"></div>
                <textarea class="source-editor" id="sourceEditor" style="display: none;"></textarea>
            </div>
        </main>
    </div>

    <script src="${vendorFileUri('turndown.js')}"></script>
    <script src="${vendorFileUri('turndown-plugin-gfm.js')}"></script>
    <script src="${vendorFileUri('mermaid.min.js')}"></script>
    <link rel="stylesheet" href="${vendorFileUri('katex.min.css')}">
    <script src="${vendorFileUri('katex.min.js')}"></script>
    <script>
        ${editorScript}
    </script>
</body>
</html>`;
}
let tempCounter = 0;
function writeHtmlToTempFile(html) {
    const tempDir = path.join(os.tmpdir(), 'any-markdown');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `editor-${process.pid}-${tempCounter++}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');
    return tempFile;
}
//# sourceMappingURL=html-generator.js.map