import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from './webviewContent';

interface OutlinerConfig {
    theme: string;
    fontSize: number;
    toolbarMode?: string;
    webviewMessages?: Record<string, string>;
    enableDebugLogging?: boolean;
    outlinerPageTitle?: boolean;
    documentBaseUri?: string;
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
    const sidePanelBridgeScript = fs.readFileSync(
        path.join(__dirname, 'shared', 'sidepanel-bridge-methods.js'), 'utf8');
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

    // Side panel HTML (shared with all editors)
    const { generateSidePanelHtml } = require(path.join(__dirname, 'shared', 'editor-body-html.js'));
    const sidePanelHtml = generateSidePanelHtml(msg);

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}" data-toolbar-mode="${config.toolbarMode || 'full'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: http: data: file:; font-src ${webview.cspSource} https: https://fonts.gstatic.com data:; frame-src blob:;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Fractal Outliner</title>
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
        <div class="outliner-scope-search-indicator" style="display:none"><span class="outliner-scope-search-tag"></span></div>
        <div class="outliner-search-bar">
            <button class="outliner-nav-back-btn" title="Back" disabled><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <button class="outliner-nav-forward-btn" title="Forward" disabled><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
            <button class="outliner-search-mode-toggle" title="Toggle search mode: Tree / Focus"></button>
            <div class="outliner-search-input-wrapper"><input type="text" class="outliner-search-input" placeholder="Search... (e.g. #tag, keyword, is:page)" /><button class="outliner-search-clear-btn" style="display:none" title="Clear search"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>
            <button class="outliner-undo-btn" title="Undo (Cmd+Z)" disabled></button>
            <button class="outliner-redo-btn" title="Redo (Cmd+Shift+Z)" disabled></button>
            <button class="outliner-menu-btn" title="Menu"></button>
        </div>
        <div class="outliner-pinned-nav-bar">
            <div class="outliner-pinned-tags-area"></div>
            <div class="outliner-pinned-nav-spacer"></div>
            <button class="outliner-pinned-settings-btn" title="Pinned tag settings"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
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
        window.__outlinerImageBaseUri = "${config.documentBaseUri || ''}";
    </script>
    <script nonce="${nonce}">
        ${editorUtilsScript}
    </script>
    <script nonce="${nonce}">
        ${editorScript}
    </script>
    <script nonce="${nonce}">
        ${sidePanelBridgeScript}
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
