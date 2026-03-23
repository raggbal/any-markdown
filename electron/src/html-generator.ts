import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Electron 用 HTML 生成
 * webviewContent.ts と同等のHTMLを生成するが、VSCode API 不使用
 */

interface ElectronEditorConfig {
    theme: string;
    fontSize: number;
    toolbarMode: string;
    documentBaseUri: string;
    webviewMessages: Record<string, string>;
    enableDebugLogging: boolean;
}

function getResourcePath(relativePath: string): string {
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

function fileUri(filePath: string): string {
    // Windows: file:///C:/... Mac/Linux: file:///Users/...
    const normalized = filePath.replace(/\\/g, '/');
    return `file://${normalized.startsWith('/') ? '' : '/'}${normalized}`;
}

export function generateEditorHtml(
    content: string,
    config: ElectronEditorConfig
): string {
    const stylesPath = getResourcePath('src/webview/styles.css');
    const editorScriptPath = getResourcePath('src/webview/editor.js');
    const editorUtilsScriptPath = getResourcePath('src/webview/editor-utils.js');
    const vendorDir = getResourcePath('vendor');

    // Load shared body HTML generator
    const sharedModulePath = getResourcePath('out/shared/editor-body-html.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateEditorBodyHtml } = require(sharedModulePath);

    const styles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    const editorUtilsScript = fs.readFileSync(editorUtilsScriptPath, 'utf8');
    const editorScript = fs.readFileSync(editorScriptPath, 'utf8')
        .replace('__DEBUG_MODE__', String(config.enableDebugLogging))
        .replace('__I18N__', JSON.stringify(config.webviewMessages))
        .replace('__DOCUMENT_BASE_URI__', config.documentBaseUri)
        .replace('__IS_OUTLINER_PAGE__', 'false')
        .replace('__CONTENT__', `'${Buffer.from(content, 'utf8').toString('base64')}'`);

    const vendorFileUri = (file: string) => fileUri(path.join(vendorDir, file));

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}" data-toolbar-mode="${config.toolbarMode}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src blob:; style-src 'unsafe-inline' file:; script-src 'unsafe-inline' file: blob:; img-src file: data: https: http:; font-src file: data:;">
    <title>Any Markdown</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    ${generateEditorBodyHtml(config.webviewMessages, process.platform)}

    <script src="${vendorFileUri('turndown.js')}"></script>
    <script src="${vendorFileUri('turndown-plugin-gfm.js')}"></script>
    <script src="${vendorFileUri('mermaid.min.js')}"></script>
    <link rel="stylesheet" href="${vendorFileUri('katex.min.css')}">
    <script src="${vendorFileUri('katex.min.js')}"></script>
    <script>${editorUtilsScript}</script>
    <script>
        ${editorScript}
    </script>
</body>
</html>`;
}

/**
 * Markdown から h1/h2 見出しを抽出して TOC を生成する。
 */
export function extractToc(markdown: string): Array<{level: number, text: string, anchor: string}> {
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

/**
 * ファイル未選択時のウェルカム画面HTML
 */
export function generateWelcomeHtml(theme: string): string {
    const isDark = theme === 'night' || theme === 'dark';
    const bg = isDark ? '#1e1e1e' : '#ffffff';
    const fg = isDark ? '#cccccc' : '#333333';
    const subFg = isDark ? '#888888' : '#999999';
    const btnBg = isDark ? '#333333' : '#f0f0f0';
    const btnHover = isDark ? '#444444' : '#e0e0e0';
    const btnBorder = isDark ? '#555555' : '#cccccc';
    const accentColor = isDark ? '#6cb6ff' : '#0078d4';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Any Markdown</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: ${bg};
            color: ${fg};
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            -webkit-app-region: drag;
        }
        .welcome {
            text-align: center;
            -webkit-app-region: no-drag;
        }
        .welcome h1 {
            font-size: 28px;
            font-weight: 300;
            margin-bottom: 8px;
        }
        .welcome p {
            color: ${subFg};
            font-size: 14px;
            margin-bottom: 40px;
        }
        .buttons {
            display: flex;
            flex-direction: column;
            gap: 12px;
            align-items: center;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 240px;
            padding: 12px 24px;
            font-size: 14px;
            border: 1px solid ${btnBorder};
            border-radius: 6px;
            background: ${btnBg};
            color: ${fg};
            cursor: pointer;
            transition: background 0.15s;
        }
        .btn:hover { background: ${btnHover}; }
        .btn-primary {
            background: ${accentColor};
            color: #ffffff;
            border-color: ${accentColor};
        }
        .btn-primary:hover { opacity: 0.9; background: ${accentColor}; }
        .recent { margin-top: 32px; text-align: left; width: 240px; }
        .recent h3 { font-size: 12px; color: ${subFg}; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .recent-item {
            display: block;
            padding: 6px 8px;
            font-size: 13px;
            color: ${accentColor};
            text-decoration: none;
            cursor: pointer;
            border-radius: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .recent-item:hover { background: ${btnBg}; }
    </style>
</head>
<body>
    <div class="welcome">
        <h1>Any Markdown</h1>
        <p>WYSIWYG Markdown Editor</p>
        <div class="buttons">
            <button class="btn btn-primary" id="open-file">Open File</button>
            <button class="btn" id="create-file">Create New File</button>
            <div style="border-top:1px solid ${btnBorder};width:240px;margin:4px 0;"></div>
            <button class="btn" id="open-outliner">Open Outliner Folder</button>
            <button class="btn" id="create-outliner">Create Outliner</button>
        </div>
        <div class="recent" id="recent-section" style="display:none;">
            <h3>Recent Files</h3>
            <div id="recent-list"></div>
        </div>
    </div>
    <script>
        document.getElementById('open-file').addEventListener('click', () => {
            window.welcomeBridge.openFile();
        });
        document.getElementById('create-file').addEventListener('click', () => {
            window.welcomeBridge.createFile();
        });
        document.getElementById('open-outliner').addEventListener('click', () => {
            window.welcomeBridge.openOutlinerFolder();
        });
        document.getElementById('create-outliner').addEventListener('click', () => {
            window.welcomeBridge.createOutlinerFolder();
        });
        // Render recent files
        const recentFiles = window.welcomeBridge.getRecentFiles();
        if (recentFiles && recentFiles.length > 0) {
            document.getElementById('recent-section').style.display = 'block';
            const list = document.getElementById('recent-list');
            recentFiles.slice(0, 5).forEach(fp => {
                const item = document.createElement('div');
                item.className = 'recent-item';
                item.textContent = fp.split('/').pop() || fp;
                item.title = fp;
                item.addEventListener('click', () => {
                    window.welcomeBridge.openRecent(fp);
                });
                list.appendChild(item);
            });
        }
    </script>
</body>
</html>`;
}

// --- Outliner HTML Generation ---

interface ElectronOutlinerConfig {
    theme: string;
    fontSize: number;
    webviewMessages: Record<string, string>;
    enableDebugLogging: boolean;
    mainFolderPath: string;
    panelCollapsed: boolean;
}

interface OutlinerFileEntry {
    filePath: string;
    title: string;
    id: string;
}

export function generateOutlinerHtml(
    outJsonContent: string,
    fileList: OutlinerFileEntry[],
    currentFilePath: string | null,
    config: ElectronOutlinerConfig
): string {
    // Load CSS
    const outlinerCssPath = getResourcePath('src/webview/outliner.css');
    const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');
    const stylesPath = getResourcePath('src/webview/styles.css');
    const editorStyles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    // Load scripts
    const editorUtilsScript = fs.readFileSync(
        getResourcePath('src/webview/editor-utils.js'), 'utf8');
    const editorScript = fs.readFileSync(
        getResourcePath('src/webview/editor.js'), 'utf8')
        .replace('__DEBUG_MODE__', String(config.enableDebugLogging))
        .replace('__I18N__', JSON.stringify(config.webviewMessages))
        .replace('__DOCUMENT_BASE_URI__', '')
        .replace('__IS_OUTLINER_PAGE__', 'true')
        .replace('__CONTENT__', `'(unused)'`);
    const outlinerModelScript = fs.readFileSync(
        getResourcePath('src/webview/outliner-model.js'), 'utf8');
    const outlinerSearchScript = fs.readFileSync(
        getResourcePath('src/webview/outliner-search.js'), 'utf8');
    const outlinerScript = fs.readFileSync(
        getResourcePath('src/webview/outliner.js'), 'utf8');

    // Vendor URIs
    const vendorDir = getResourcePath('vendor');
    const vendorFileUriStr = (file: string) => fileUri(path.join(vendorDir, file));

    // Base64 encode JSON content
    const jsonToEncode = outJsonContent || '{"version":1,"rootIds":[],"nodes":{}}';
    const base64Content = Buffer.from(jsonToEncode, 'utf8').toString('base64');

    // i18n messages
    const msg = config.webviewMessages || {};

    // Side panel HTML (same structure as outlinerWebviewContent.ts)
    const sidePanelHtml = `
        <div class="side-panel" id="sidePanel">
            <aside class="side-panel-sidebar" id="sidePanelSidebar">
                <div class="sidebar-header">
                    <h3>Outline</h3>
                    <button class="sidebar-toggle" id="sidePanelSidebarClose" title="${msg.closeOutline || 'Close Outline'}">&#9776;</button>
                </div>
                <nav class="side-panel-toc" id="sidePanelToc"></nav>
                <div class="side-panel-toc-footer">
                    <div class="side-panel-imagedir" id="sidePanelImageDir">
                        <div class="imagedir-header">
                            <span class="imagedir-label">${msg.imageDirLabel || 'Image save directory:'}</span>
                            <span class="imagedir-source" id="sidePanelImageDirSource"></span>
                            <button class="imagedir-settings-btn" id="sidePanelImageDirBtn" title="${msg.setImageDir || 'Set Image Directory'}">
                                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                            </button>
                        </div>
                        <div class="imagedir-info">
                            <span class="imagedir-path" id="sidePanelImageDirPath"></span>
                        </div>
                    </div>
                </div>
            </aside>
            <div class="side-panel-editor-container">
                <div class="side-panel-header">
                    <button class="menu-btn side-panel-outline-btn" id="sidePanelOpenOutline" title="${msg.openOutline || 'Open Outline'}">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg>
                    </button>
                    <span class="side-panel-filename" id="sidePanelFilename"></span>
                    <div class="side-panel-header-actions">
                        <button class="side-panel-header-btn" data-action="undo" title="Undo"></button>
                        <button class="side-panel-header-btn" data-action="redo" title="Redo"></button>
                        <button class="side-panel-header-btn" data-action="source" title="Source mode"></button>
                    </div>
                    <button class="side-panel-open-tab" id="sidePanelOpenTab" title="Open in new tab">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                    <button class="side-panel-expand" id="sidePanelExpand" title="Expand">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                    </button>
                    <button class="side-panel-close" id="sidePanelClose" title="Close">&times;</button>
                </div>
                <div class="side-panel-iframe-container" id="sidePanelIframeContainer"></div>
            </div>
        </div>
        <div class="side-panel-overlay" id="sidePanelOverlay"></div>`;

    // Left panel collapsed class
    const panelClass = config.panelCollapsed ? ' collapsed' : '';

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src blob:; style-src 'unsafe-inline' file: https://fonts.googleapis.com; script-src 'unsafe-inline' file: blob:; img-src file: data: https: http:; font-src file: data: https://fonts.gstatic.com;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Any Markdown Outliner</title>
    <style>${editorStyles}</style>
    <style>${outlinerCss}</style>
    <link rel="stylesheet" href="${vendorFileUriStr('katex.min.css')}">
    <style>
        /* Electron outliner layout */
        .electron-outliner-layout {
            display: flex; height: 100vh; overflow: hidden;
        }
        .outliner-file-panel {
            width: 220px; min-width: 0; flex-shrink: 0;
            border-right: 1px solid var(--outliner-border, #e0e0e0);
            display: flex; flex-direction: column;
            background: var(--outliner-bg, #fafafa);
            transition: width 0.2s;
            overflow: hidden;
        }
        .outliner-file-panel.collapsed { width: 0; border-right: none; }
        .file-panel-header {
            display: flex; align-items: center; justify-content: space-between;
            padding: 12px 12px 8px; border-bottom: 1px solid var(--outliner-border, #e0e0e0);
            min-height: 44px;
        }
        .file-panel-title { font-weight: 600; font-size: 13px; white-space: nowrap; }
        .file-panel-actions { display: flex; gap: 4px; }
        .file-panel-btn {
            background: none; border: none; font-size: 16px; cursor: pointer;
            padding: 2px 6px; border-radius: 4px; color: inherit; line-height: 1;
        }
        .file-panel-btn:hover { background: var(--outliner-hover, #e8e8e8); }
        .file-panel-list { flex: 1; overflow-y: auto; padding: 4px 0; }
        .file-panel-item {
            padding: 8px 12px; cursor: pointer; font-size: 13px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            border-radius: 4px; margin: 1px 4px;
        }
        .file-panel-item:hover { background: var(--outliner-hover, #e8e8e8); }
        .file-panel-item.active { background: var(--outliner-active, #d8e8f8); font-weight: 500; }
        .file-panel-empty {
            padding: 16px 12px; color: var(--outliner-subtext, #999); font-size: 12px; text-align: center;
        }
        .outliner-main-wrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
        .panel-toggle-btn {
            position: absolute; top: 8px; left: 8px; z-index: 10;
            background: var(--outliner-bg, #fafafa); border: 1px solid var(--outliner-border, #e0e0e0);
            border-radius: 4px; cursor: pointer; padding: 4px 6px; font-size: 14px; line-height: 1;
            display: none; color: inherit;
        }
        .outliner-file-panel.collapsed ~ .outliner-main-wrapper .panel-toggle-btn { display: block; }
        .file-panel-rename-input {
            width: 100%; padding: 4px 8px; font-size: 13px; border: 1px solid var(--outliner-active, #4a9eff);
            border-radius: 3px; outline: none; background: var(--outliner-bg, #fff); color: inherit;
        }
        .file-panel-context-menu {
            position: fixed; background: var(--outliner-bg, #fff); border: 1px solid var(--outliner-border, #ddd);
            border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); padding: 4px 0; z-index: 1000;
            min-width: 140px;
        }
        .file-panel-context-item {
            padding: 6px 16px; cursor: pointer; font-size: 13px; white-space: nowrap;
        }
        .file-panel-context-item:hover { background: var(--outliner-hover, #e8e8e8); }
        .file-panel-context-item.danger { color: #e55; }
    </style>
</head>
<body>
    <div class="electron-outliner-layout">
        <aside class="outliner-file-panel${panelClass}" id="outlinerFilePanel">
            <div class="file-panel-header">
                <span class="file-panel-title">Outlines</span>
                <div class="file-panel-actions">
                    <button class="file-panel-btn" id="filePanelAdd" title="New Outline">+</button>
                    <button class="file-panel-btn" id="filePanelCollapse" title="Collapse panel">◀</button>
                </div>
            </div>
            <div class="file-panel-list" id="outlinerFileList"></div>
        </aside>

        <div class="outliner-main-wrapper">
            <button class="panel-toggle-btn" id="panelToggleBtn" title="Show file panel">▶</button>
            <div class="outliner-container">
                <div class="outliner-page-title" style="display:none;">
                    <input type="text" class="outliner-page-title-input" placeholder="Untitled" />
                </div>
                <div class="outliner-search-bar">
                    <button class="outliner-search-mode-toggle" title="Toggle search mode: Tree / Focus"></button>
                    <input type="text" class="outliner-search-input" placeholder="Search... (e.g. #tag, keyword, is:page)" />
                    <button class="outliner-menu-btn" title="Menu"></button>
                </div>
                <div class="outliner-breadcrumb"></div>
                <div class="outliner-tree" role="tree"></div>
            </div>
        </div>
    </div>

    ${sidePanelHtml}

    <script src="${vendorFileUriStr('turndown.js')}"></script>
    <script src="${vendorFileUriStr('turndown-plugin-gfm.js')}"></script>
    <script src="${vendorFileUriStr('mermaid.min.js')}"></script>
    <script src="${vendorFileUriStr('katex.min.js')}"></script>

    <script>
        window.__SKIP_EDITOR_AUTO_INIT__ = true;
        window.__outlinerMessages = ${JSON.stringify(config.webviewMessages || {})};
    </script>
    <script>${editorUtilsScript}</script>
    <script>${editorScript}</script>
    <script>${outlinerModelScript}</script>
    <script>${outlinerSearchScript}</script>
    <script>${outlinerScript}</script>
    <script>
        try {
            var initialData = JSON.parse(decodeURIComponent(escape(atob('${base64Content}'))));
            Outliner.init(initialData);
        } catch(e) {
            console.error('[Outliner] Failed to initialize:', e);
            Outliner.init({ version: 1, rootIds: [], nodes: {} });
        }
    </script>
    <script>
        // Left file panel management
        (function() {
            var fileList = ${JSON.stringify(fileList)};
            var currentFile = ${JSON.stringify(currentFilePath)};
            var listEl = document.getElementById('outlinerFileList');
            var panelEl = document.getElementById('outlinerFilePanel');
            var addBtn = document.getElementById('filePanelAdd');
            var collapseBtn = document.getElementById('filePanelCollapse');
            var toggleBtn = document.getElementById('panelToggleBtn');
            var contextMenu = null;

            function renderList(files, activeFilePath) {
                listEl.innerHTML = '';
                if (files.length === 0) {
                    listEl.innerHTML = '<div class="file-panel-empty">No outlines yet.<br>Click + to create one.</div>';
                    return;
                }
                files.forEach(function(f) {
                    var item = document.createElement('div');
                    item.className = 'file-panel-item' + (f.filePath === activeFilePath ? ' active' : '');
                    item.textContent = f.title || 'Untitled';
                    item.title = f.filePath;
                    item.dataset.filePath = f.filePath;
                    item.addEventListener('click', function() {
                        if (f.filePath !== currentFile) {
                            window.outlinerFilePanelBridge.openFile(f.filePath);
                        }
                    });
                    item.addEventListener('dblclick', function(e) {
                        e.stopPropagation();
                        startRename(item, f);
                    });
                    item.addEventListener('contextmenu', function(e) {
                        e.preventDefault();
                        showContextMenu(e, f);
                    });
                    listEl.appendChild(item);
                });
            }

            function startRename(itemEl, file) {
                var input = document.createElement('input');
                input.className = 'file-panel-rename-input';
                input.value = file.title || '';
                input.type = 'text';
                itemEl.textContent = '';
                itemEl.appendChild(input);
                input.focus();
                input.select();
                var done = false;
                function finish() {
                    if (done) return;
                    done = true;
                    var val = input.value.trim();
                    if (val && val !== file.title) {
                        window.outlinerFilePanelBridge.renameTitle(file.filePath, val);
                    } else {
                        itemEl.textContent = file.title || 'Untitled';
                    }
                }
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') { finish(); }
                    if (e.key === 'Escape') { done = true; itemEl.textContent = file.title || 'Untitled'; }
                });
            }

            function showContextMenu(e, file) {
                closeContextMenu();
                contextMenu = document.createElement('div');
                contextMenu.className = 'file-panel-context-menu';
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';

                var renameItem = document.createElement('div');
                renameItem.className = 'file-panel-context-item';
                renameItem.textContent = 'Rename';
                renameItem.addEventListener('click', function() {
                    closeContextMenu();
                    var itemEl = listEl.querySelector('[data-file-path="' + CSS.escape(file.filePath) + '"]');
                    if (itemEl) startRename(itemEl, file);
                });

                var deleteItem = document.createElement('div');
                deleteItem.className = 'file-panel-context-item danger';
                deleteItem.textContent = 'Delete';
                deleteItem.addEventListener('click', function() {
                    closeContextMenu();
                    window.outlinerFilePanelBridge.deleteFile(file.filePath);
                });

                contextMenu.appendChild(renameItem);
                contextMenu.appendChild(deleteItem);
                document.body.appendChild(contextMenu);

                setTimeout(function() {
                    document.addEventListener('click', closeContextMenu, { once: true });
                }, 0);
            }

            function closeContextMenu() {
                if (contextMenu && contextMenu.parentNode) {
                    contextMenu.parentNode.removeChild(contextMenu);
                    contextMenu = null;
                }
            }

            addBtn.addEventListener('click', function() {
                // Create inline input in the file list for title entry
                var inputRow = document.createElement('div');
                inputRow.className = 'file-panel-item active';
                var input = document.createElement('input');
                input.className = 'file-panel-rename-input';
                input.type = 'text';
                input.value = '';
                input.placeholder = 'Enter title...';
                inputRow.appendChild(input);
                listEl.insertBefore(inputRow, listEl.firstChild);
                input.focus();
                var done = false;
                function finish() {
                    if (done) return;
                    done = true;
                    var val = input.value.trim();
                    if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow);
                    if (val) {
                        window.outlinerFilePanelBridge.createFile(val);
                    }
                }
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter') { finish(); }
                    if (e.key === 'Escape') { done = true; if (inputRow.parentNode) inputRow.parentNode.removeChild(inputRow); }
                });
            });

            collapseBtn.addEventListener('click', function() {
                panelEl.classList.add('collapsed');
                window.outlinerFilePanelBridge.togglePanel(true);
            });

            toggleBtn.addEventListener('click', function() {
                panelEl.classList.remove('collapsed');
                window.outlinerFilePanelBridge.togglePanel(false);
            });

            // Listen for file list updates from main process
            window.outlinerFilePanelBridge.onFileListChanged(function(newList, newCurrentFile) {
                fileList = newList;
                if (newCurrentFile) currentFile = newCurrentFile;
                renderList(fileList, currentFile);
            });

            // File list updates are handled by onFileListChanged callback below.

            // Initial render
            renderList(fileList, currentFile);

            // File drop support
            document.addEventListener('dragover', function(e) { e.preventDefault(); });
            document.addEventListener('drop', function(e) {
                e.preventDefault();
                if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    var filePath = e.dataTransfer.files[0].path;
                    if (filePath) {
                        window.fileDrop.open(filePath);
                    }
                }
            });
        })();
    </script>
</body>
</html>`;
}

let tempCounter = 0;

export function writeHtmlToTempFile(html: string): string {
    const tempDir = path.join(os.tmpdir(), 'any-markdown');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `editor-${process.pid}-${tempCounter++}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');
    return tempFile;
}
