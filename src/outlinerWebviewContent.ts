import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from './webviewContent';

interface OutlinerConfig {
    theme: string;
    fontSize: number;
    webviewMessages?: Record<string, string>;
    enableDebugLogging?: boolean;
    outlinerPageTitle?: boolean;
}

export function getOutlinerWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    jsonContent: string,
    config: OutlinerConfig
): string {
    const nonce = getNonce();

    // i18n messages
    const msg = config.webviewMessages || {};

    // Load CSS
    const outlinerCssPath = path.join(__dirname, 'webview', 'outliner.css');
    const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');

    // Load editor styles (for side panel)
    const stylesPath = path.join(__dirname, 'webview', 'styles.css');
    const editorStyles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    // Load HostBridge
    const hostBridgePath = path.join(__dirname, 'shared', 'outliner-host-bridge.js');
    const hostBridgeScript = fs.readFileSync(hostBridgePath, 'utf8');

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

    // Base64 encode JSON content to prevent XSS
    const jsonToEncode = jsonContent || '{"version":1,"rootIds":[],"nodes":{}}';
    const base64Content = Buffer.from(jsonToEncode, 'utf8').toString('base64');

    // Side panel HTML (same structure as editor-body-html.js)
    const sidePanelHtml = `
        <div class="side-panel" id="sidePanel">
            <div class="side-panel-resize-handle" id="sidePanelResizeHandle"></div>
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

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: http: data: file:; font-src ${webview.cspSource} https: https://fonts.gstatic.com data:; frame-src blob:;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Any Markdown Outliner</title>
    <style>
        ${editorStyles}
    </style>
    <style>
        ${outlinerCss}
    </style>
    <link rel="stylesheet" href="${katexCssUri}">
</head>
<body>
    <div class="outliner-container">
        <div class="outliner-page-title" style="${config.outlinerPageTitle ? '' : 'display:none'}">
            <input type="text" class="outliner-page-title-input" placeholder="Untitled" />
        </div>
        <div class="outliner-search-bar">
            <button class="outliner-nav-back-btn" title="Back" disabled><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <button class="outliner-nav-forward-btn" title="Forward" disabled><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
            <button class="outliner-search-mode-toggle" title="Toggle search mode: Tree / Focus"></button>
            <input type="text" class="outliner-search-input" placeholder="Search... (e.g. #tag, keyword, is:page)" />
            <button class="outliner-undo-btn" title="Undo (Cmd+Z)" disabled></button>
            <button class="outliner-redo-btn" title="Redo (Cmd+Shift+Z)" disabled></button>
            <button class="outliner-menu-btn" title="Menu"></button>
        </div>
        <div class="outliner-pinned-nav-bar" style="display:none">
            <div class="outliner-pinned-tags-area"></div>
        </div>
        <div class="outliner-breadcrumb"></div>
        <div class="outliner-tree" role="tree"></div>
    </div>

    ${sidePanelHtml}

    <script src="${turndownUri}"></script>
    <script src="${turndownGfmUri}"></script>
    <script src="${mermaidUri}"></script>
    <script src="${katexJsUri}"></script>

    <script nonce="${nonce}">
        window.__SKIP_EDITOR_AUTO_INIT__ = true;
        window.__outlinerMessages = ${JSON.stringify(config.webviewMessages || {})};
    </script>
    <script nonce="${nonce}">
        ${editorUtilsScript}
    </script>
    <script nonce="${nonce}">
        ${editorScript}
    </script>
    <script nonce="${nonce}">
        ${hostBridgeScript}
    </script>
    <script nonce="${nonce}">
        ${outlinerModelScript}
    </script>
    <script nonce="${nonce}">
        ${outlinerSearchScript}
    </script>
    <script nonce="${nonce}">
        ${outlinerScript}
    </script>
    <script nonce="${nonce}">
        try {
            var initialData = JSON.parse(decodeURIComponent(escape(atob('${base64Content}'))));
            Outliner.init(initialData);
        } catch(e) {
            console.error('[Outliner] Failed to initialize:', e);
            Outliner.init({ version: 1, rootIds: [], nodes: {} });
        }
    </script>
</body>
</html>`;
}
