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
    // 開発時: プロジェクトルートから相対パス (electron/ の親 = fractal/)
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
    <title>Fractal</title>
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
    <title>Fractal</title>
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
        <h1>Fractal</h1>
        <p>WYSIWYG Markdown Editor</p>
        <div class="buttons">
            <button class="btn btn-primary" id="open-notes">Open Notes</button>
            <div style="border-top:1px solid ${btnBorder};width:240px;margin:4px 0;"></div>
            <button class="btn" id="open-file">Open File</button>
            <button class="btn" id="create-file">Create New File</button>
        </div>
        <div class="recent" id="recent-section" style="display:none;">
            <h3>Recent Files</h3>
            <div id="recent-list"></div>
        </div>
    </div>
    <script>
        document.getElementById('open-notes').addEventListener('click', () => {
            window.welcomeBridge.openNotes();
        });
        document.getElementById('open-file').addEventListener('click', () => {
            window.welcomeBridge.openFile();
        });
        document.getElementById('create-file').addEventListener('click', () => {
            window.welcomeBridge.createFile();
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
    structure?: unknown;
    panelWidth?: number;
    fileChangeId?: number;
    outlinerPageTitle?: boolean;
    folderPanelEnabled?: boolean;
    documentBaseUri?: string;
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
    const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));
    const stylesPath = getResourcePath('src/webview/styles.css');
    const editorStyles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    // Load Notes shared CSS/HTML
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const notesBodyHtml = require(getResourcePath('out/shared/notes-body-html.js'));
    const { css: notesCss, html: notesHtml } = notesBodyHtml.generateNotesFilePanelHtml({
        collapsed: config.panelCollapsed,
    });

    // Load Notes file panel JS
    const notesFilePanelScript = fs.readFileSync(
        getResourcePath('out/shared/notes-file-panel.js'), 'utf8');

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

    // Side panel HTML (shared with all editors)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateSidePanelHtml } = require(getResourcePath('out/shared/editor-body-html.js'));
    const sidePanelHtml = generateSidePanelHtml(msg);

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src blob:; style-src 'unsafe-inline' file: https://fonts.googleapis.com; script-src 'unsafe-inline' file: blob:; img-src file: data: https: http:; font-src file: data: https://fonts.gstatic.com;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Fractal Outliner</title>
    <style>${editorStyles}</style>
    <style>${outlinerCss}</style>
    <link rel="stylesheet" href="${vendorFileUriStr('katex.min.css')}">
    <style>${notesCss}</style>
    ${config.folderPanelEnabled ? `<style>
    .folder-panel { display:flex; flex-direction:column; flex-shrink:0; height:100%; border-right:1px solid var(--border-color,#e0e0e0); background:var(--panel-bg,#f5f5f5); }
    .folder-panel-expanded { width:180px; display:flex; flex-direction:column; overflow:hidden; }
    .folder-panel-header { display:flex; align-items:center; padding:8px 10px; border-bottom:1px solid var(--border-color,#e0e0e0); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.3px; color:var(--muted-color,#888); }
    .folder-panel-title { flex:1; }
    .folder-panel-header button { background:none; border:none; cursor:pointer; padding:2px 4px; color:var(--muted-color,#888); font-size:14px; line-height:1; border-radius:3px; }
    .folder-panel-header button:hover { background:var(--hover-bg,#e0e0e0); color:var(--fg-color,#333); }
    .folder-panel-list { flex:1; overflow-y:auto; padding:4px 0; }
    .folder-panel-item { padding:6px 10px; font-size:13px; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; border-left:3px solid transparent; display:flex; align-items:center; gap:6px; }
    .folder-panel-item:hover { background:var(--hover-bg,#e8e8e8); }
    .folder-panel-item.active { background:var(--active-bg,#dce7f7); border-left-color:var(--accent-color,#0078d4); font-weight:500; }
    .folder-panel-item-icon { flex-shrink:0; width:16px; height:16px; opacity:0.6; }
    .folder-panel-item-name { flex:1; overflow:hidden; text-overflow:ellipsis; }
    .folder-panel-empty { padding:16px 10px; font-size:12px; color:var(--muted-color,#999); text-align:center; line-height:1.5; }
    .folder-panel-collapsed-bar { width:40px; display:flex; flex-direction:column; align-items:center; padding-top:8px; gap:2px; }
    .folder-panel-remove-btn { flex-shrink:0; width:16px; height:16px; border:none; border-radius:3px; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted-color,#aaa); font-size:14px; font-weight:bold; line-height:1; padding:0; opacity:0; transition:opacity 0.15s; }
    .folder-panel-item:hover .folder-panel-remove-btn { opacity:1; }
    .folder-panel-remove-btn:hover { background:var(--hover-bg,#ddd); color:var(--danger-color,#d32f2f); }
    .folder-panel-expand-btn, .folder-panel-icon-btn { width:32px; height:32px; border:none; border-radius:6px; background:transparent; cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--muted-color,#666); font-size:14px; font-weight:600; }
    .folder-panel-expand-btn:hover, .folder-panel-icon-btn:hover { background:var(--hover-bg,#e8e8e8); }
    .folder-panel-icon-btn.active { background:var(--active-bg,#dce7f7); color:var(--accent-color,#0078d4); }
    [data-theme="night"] .folder-panel, [data-theme="dark"] .folder-panel { background:var(--panel-bg,#252525); }
    [data-theme="night"] .folder-panel-item:hover, [data-theme="dark"] .folder-panel-item:hover { background:var(--hover-bg,#333); }
    [data-theme="night"] .folder-panel-item.active, [data-theme="dark"] .folder-panel-item.active { background:var(--active-bg,#2a3a4a); }
    </style>` : ''}
</head>
<body>
    <div class="notes-layout">
        ${config.folderPanelEnabled ? `
        <div class="folder-panel" id="folderPanel">
            <div class="folder-panel-expanded" id="folderPanelExpanded">
                <div class="folder-panel-header">
                    <span class="folder-panel-title">Notes</span>
                    <button id="folderPanelAdd" title="Add folder">+</button>
                    <button id="folderPanelCollapse" title="Collapse">&#9776;</button>
                </div>
                <div class="folder-panel-list" id="folderPanelList"></div>
            </div>
            <div class="folder-panel-collapsed-bar" id="folderPanelCollapsedBar" style="display:none">
                <button class="folder-panel-expand-btn" id="folderPanelExpand" title="Expand"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg></button>
                <div class="folder-panel-icons" id="folderPanelIcons"></div>
            </div>
        </div>
        ` : ''}
        ${notesHtml}
        <div class="notes-main-wrapper">
            <div class="outliner-container">
                <div class="outliner-page-title" style="${config.outlinerPageTitle !== false ? '' : 'display:none;'}">
                    <input type="text" class="outliner-page-title-input" placeholder="Untitled" />
                </div>
                <div class="outliner-search-bar">
                    <button class="notes-panel-toggle-btn" id="notesPanelToggleBtn" title="Show file panel"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg></button>
                    <button class="outliner-nav-back-btn" title="Back" disabled><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
                    <button class="outliner-nav-forward-btn" title="Forward" disabled><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
                    <button class="outliner-search-mode-toggle" title="Toggle search mode: Tree / Focus"></button>
                    <div class="outliner-search-input-wrapper"><input type="text" class="outliner-search-input" placeholder="Search... (e.g. #tag, keyword, is:page)" /><button class="outliner-search-clear-btn" style="display:none" title="Clear search"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
                    <button class="outliner-undo-btn" title="Undo (Cmd+Z)" disabled></button>
                    <button class="outliner-redo-btn" title="Redo (Cmd+Shift+Z)" disabled></button>
                    <button class="outliner-menu-btn" title="Menu"></button>
                </div>
                <div class="outliner-pinned-nav-bar">
                    <div class="outliner-daily-nav-area" style="display:none">
                        <button class="outliner-daily-btn" id="dailyNavToday">Today</button>
                        <button class="outliner-daily-btn outliner-daily-btn-sm" id="dailyNavPrev">&lt;</button>
                        <button class="outliner-daily-btn outliner-daily-btn-sm" id="dailyNavNext">&gt;</button>
                        <button class="outliner-daily-btn outliner-daily-btn-sm" id="dailyNavCalendar"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
                        <div class="outliner-daily-picker" id="dailyNavPicker" style="display:none">
                            <div class="outliner-daily-picker-header">
                                <button class="outliner-daily-picker-nav" id="dailyPickerPrevMonth">&lt;</button>
                                <span class="outliner-daily-picker-title" id="dailyPickerTitle"></span>
                                <button class="outliner-daily-picker-nav" id="dailyPickerNextMonth">&gt;</button>
                            </div>
                            <div class="outliner-daily-picker-weekdays"><span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span></div>
                            <div class="outliner-daily-picker-grid" id="dailyPickerGrid"></div>
                        </div>
                    </div>
                    <div class="outliner-pinned-tags-area"></div>
                    <div class="outliner-pinned-nav-spacer"></div>
                    <button class="outliner-pinned-settings-btn" title="Pinned tag settings"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
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
        window.__initialFileChangeId = ${config.fileChangeId || 0};
        window.__outlinerImageBaseUri = "${config.documentBaseUri || ''}";
    </script>
    <script>${editorUtilsScript}</script>
    <script>${editorScript}</script>
    <script>${outlinerModelScript}</script>
    <script>${outlinerSearchScript}</script>
    <script>${outlinerScript}</script>
    <script>${notesFilePanelScript}</script>
    <script>
        try {
            var initialData = JSON.parse(decodeURIComponent(escape(atob('${base64Content}'))));
            Outliner.init(initialData);
        } catch(e) {
            console.error('[Outliner] Failed to initialize:', e);
            Outliner.init({ version: 1, rootIds: [], nodes: {} });
        }
        // Initialize notes file panel (shared with VSCode)
        notesFilePanel.init(
            window.notesHostBridge,
            ${JSON.stringify(fileList)},
            ${JSON.stringify(currentFilePath)},
            ${JSON.stringify(config.structure || null)},
            ${JSON.stringify(config.panelWidth || null)}
        );

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

        // Folder Panel initialization
        ${config.folderPanelEnabled ? `
        (function() {
            var bridge = window.notesFolderBridge;
            if (!bridge) return;
            var folders = [];
            var activeFolder = null;
            var isCollapsed = false;
            var expandedEl = document.getElementById('folderPanelExpanded');
            var collapsedBarEl = document.getElementById('folderPanelCollapsedBar');
            var listEl = document.getElementById('folderPanelList');
            var iconsEl = document.getElementById('folderPanelIcons');
            var notebookSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>';

            function render() {
                listEl.innerHTML = '';
                if (folders.length === 0) {
                    var empty = document.createElement('div');
                    empty.className = 'folder-panel-empty';
                    empty.textContent = 'No folders added yet. Click + to add a Notes folder.';
                    listEl.appendChild(empty);
                } else {
                    folders.forEach(function(f) {
                        var item = document.createElement('div');
                        item.className = 'folder-panel-item' + (f.path === activeFolder ? ' active' : '');
                        item.title = f.path;
                        var removeBtn = document.createElement('button');
                        removeBtn.className = 'folder-panel-remove-btn';
                        removeBtn.title = 'Remove from list';
                        removeBtn.innerHTML = '\\u2212';
                        removeBtn.addEventListener('click', function(e) {
                            e.stopPropagation();
                            if (confirm('Remove "' + f.name + '" from list?\\n(The folder itself will not be deleted)')) {
                                bridge.removeFolder(f.path);
                            }
                        });
                        var icon = document.createElement('span');
                        icon.className = 'folder-panel-item-icon';
                        icon.innerHTML = notebookSvg;
                        var name = document.createElement('span');
                        name.className = 'folder-panel-item-name';
                        name.textContent = f.name;
                        item.appendChild(icon);
                        item.appendChild(name);
                        item.appendChild(removeBtn);
                        item.addEventListener('click', function() {
                            bridge.selectFolder(f.path);
                        });
                        listEl.appendChild(item);
                    });
                }
                iconsEl.innerHTML = '';
                folders.forEach(function(f) {
                    var btn = document.createElement('button');
                    btn.className = 'folder-panel-icon-btn' + (f.path === activeFolder ? ' active' : '');
                    btn.title = f.name;
                    btn.textContent = (f.name || '?').charAt(0).toUpperCase();
                    btn.addEventListener('click', function() {
                        bridge.selectFolder(f.path);
                        togglePanel(false);
                    });
                    iconsEl.appendChild(btn);
                });
            }

            function togglePanel(collapse) {
                isCollapsed = collapse;
                expandedEl.style.display = collapse ? 'none' : '';
                collapsedBarEl.style.display = collapse ? '' : 'none';
                bridge.savePanelState(collapse);
            }

            document.getElementById('folderPanelAdd').addEventListener('click', function() { bridge.addFolder(); });
            document.getElementById('folderPanelCollapse').addEventListener('click', function() { togglePanel(true); });
            document.getElementById('folderPanelExpand').addEventListener('click', function() { togglePanel(false); });

            bridge.onFoldersChanged(function(newFolders, newActiveFolder) {
                folders = newFolders;
                activeFolder = newActiveFolder;
                render();
            });

            var initData = bridge.getInitialData();
            folders = initData.folders || [];
            activeFolder = initData.activeFolder || null;
            isCollapsed = initData.collapsed || false;
            if (isCollapsed) {
                expandedEl.style.display = 'none';
                collapsedBarEl.style.display = '';
            }
            render();
        })();
        ` : ''}
    </script>
</body>
</html>`;
}

let tempCounter = 0;

export function writeHtmlToTempFile(html: string): string {
    const tempDir = path.join(os.tmpdir(), 'fractal');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `editor-${process.pid}-${tempCounter++}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');
    return tempFile;
}
