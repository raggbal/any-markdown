import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from './webviewContent';

interface NotesConfig {
    theme: string;
    fontSize: number;
    webviewMessages?: Record<string, string>;
    enableDebugLogging?: boolean;
    outlinerPageTitle?: boolean;
}

interface NotesInitData {
    jsonContent: string;
    fileList: Array<{ filePath: string; title: string; id: string }>;
    currentFilePath: string | null;
    panelCollapsed: boolean;
    structure?: any;
    panelWidth?: number;
    fileChangeId?: number;
}

export function getNotesWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    config: NotesConfig,
    initData: NotesInitData
): string {
    const nonce = getNonce();
    const msg = config.webviewMessages || {};

    // Load CSS
    const outlinerCssPath = path.join(__dirname, 'webview', 'outliner.css');
    const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');

    const stylesPath = path.join(__dirname, 'webview', 'styles.css');
    const editorStyles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    // Load Notes shared CSS/HTML
    const notesBodyHtml = require(path.join(__dirname, 'shared', 'notes-body-html.js'));
    const { css: notesCss, html: notesHtml } = notesBodyHtml.generateNotesFilePanelHtml({
        collapsed: initData.panelCollapsed,
    });

    // Load Notes file panel JS
    const notesFilePanelScript = fs.readFileSync(
        path.join(__dirname, 'shared', 'notes-file-panel.js'), 'utf8');

    // Load HostBridge (shared + notes)
    const sidePanelBridgeScript = fs.readFileSync(
        path.join(__dirname, 'shared', 'sidepanel-bridge-methods.js'), 'utf8');
    const notesHostBridgeScript = fs.readFileSync(
        path.join(__dirname, 'shared', 'notes-host-bridge.js'), 'utf8');

    // Load outliner scripts
    const outlinerModelScript = fs.readFileSync(
        path.join(__dirname, 'webview', 'outliner-model.js'), 'utf8');
    const outlinerSearchScript = fs.readFileSync(
        path.join(__dirname, 'webview', 'outliner-search.js'), 'utf8');
    const outlinerScript = fs.readFileSync(
        path.join(__dirname, 'webview', 'outliner.js'), 'utf8');

    // Load editor scripts (for side panel EditorInstance)
    const editorUtilsScript = fs.readFileSync(
        path.join(__dirname, 'webview', 'editor-utils.js'), 'utf8');
    const editorScript = fs.readFileSync(
        path.join(__dirname, 'webview', 'editor.js'), 'utf8')
        .replace('__DEBUG_MODE__', String(config.enableDebugLogging ?? false))
        .replace('__I18N__', JSON.stringify(msg))
        .replace('__DOCUMENT_BASE_URI__', '')
        .replace('__IS_OUTLINER_PAGE__', 'true')
        .replace('__CONTENT__', `'(unused)'`);

    // Vendor library URIs
    const vendorDir = path.join(__dirname, '..', 'vendor');
    const vendorUri = (file: string) => webview.asWebviewUri(
        vscode.Uri.file(path.join(vendorDir, file))
    );
    const turndownUri = vendorUri('turndown.js');
    const turndownGfmUri = vendorUri('turndown-plugin-gfm.js');
    const mermaidUri = vendorUri('mermaid.min.js');
    const katexJsUri = vendorUri('katex.min.js');
    const katexCssUri = vendorUri('katex.min.css');

    // Base64 encode JSON content
    const jsonToEncode = initData.jsonContent || '{"version":1,"rootIds":[],"nodes":{}}';
    const base64Content = Buffer.from(jsonToEncode, 'utf8').toString('base64');

    // Side panel HTML (shared with all editors)
    const { generateSidePanelHtml } = require(path.join(__dirname, 'shared', 'editor-body-html.js'));
    const sidePanelHtml = generateSidePanelHtml(msg);

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: http: data: file:; font-src ${webview.cspSource} https: https://fonts.gstatic.com data:; frame-src blob:;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Any Markdown Notes</title>
    <style>${editorStyles}</style>
    <style>${outlinerCss}</style>
    <link rel="stylesheet" href="${katexCssUri}">
    <style>${notesCss}</style>
</head>
<body>
    <div class="notes-layout">
        ${notesHtml}
        <div class="notes-main-wrapper">
            <div class="outliner-container">
                <div class="outliner-page-title" style="${config.outlinerPageTitle ? '' : 'display:none;'}">
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

    <script src="${turndownUri}" nonce="${nonce}"></script>
    <script src="${turndownGfmUri}" nonce="${nonce}"></script>
    <script src="${mermaidUri}" nonce="${nonce}"></script>
    <script src="${katexJsUri}" nonce="${nonce}"></script>

    <script nonce="${nonce}">
        window.__SKIP_EDITOR_AUTO_INIT__ = true;
        window.__outlinerMessages = ${JSON.stringify(config.webviewMessages || {})};
        window.__initialFileChangeId = ${initData.fileChangeId || 0};
    </script>
    <script nonce="${nonce}">${sidePanelBridgeScript}</script>
    <script nonce="${nonce}">${notesHostBridgeScript}</script>
    <script nonce="${nonce}">${editorUtilsScript}</script>
    <script nonce="${nonce}">${editorScript}</script>
    <script nonce="${nonce}">${outlinerModelScript}</script>
    <script nonce="${nonce}">${outlinerSearchScript}</script>
    <script nonce="${nonce}">${outlinerScript}</script>
    <script nonce="${nonce}">${notesFilePanelScript}</script>
    <script nonce="${nonce}">
        try {
            var initialData = JSON.parse(decodeURIComponent(escape(atob('${base64Content}'))));
            Outliner.init(initialData);
        } catch(e) {
            console.error('[Notes] Failed to initialize outliner:', e);
            Outliner.init({ version: 1, rootIds: [], nodes: {} });
        }
        // Initialize notes file panel
        notesFilePanel.init(
            window.notesHostBridge,
            ${JSON.stringify(initData.fileList)},
            ${JSON.stringify(initData.currentFilePath)},
            ${JSON.stringify(initData.structure || null)},
            ${JSON.stringify(initData.panelWidth || null)}
        );
    </script>
</body>
</html>`;
}
