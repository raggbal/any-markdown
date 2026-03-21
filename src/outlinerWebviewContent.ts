import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from './webviewContent';

interface OutlinerConfig {
    theme: string;
    fontSize: number;
}

export function getOutlinerWebviewContent(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    jsonContent: string,
    config: OutlinerConfig
): string {
    const nonce = getNonce();

    // Load CSS
    const outlinerCssPath = path.join(__dirname, 'webview', 'outliner.css');
    const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf8');

    // Load HostBridge
    const hostBridgePath = path.join(__dirname, 'shared', 'outliner-host-bridge.js');
    const hostBridgeScript = fs.readFileSync(hostBridgePath, 'utf8');

    // Load outliner scripts
    const outlinerModelPath = path.join(__dirname, 'webview', 'outliner-model.js');
    const outlinerSearchPath = path.join(__dirname, 'webview', 'outliner-search.js');
    const outlinerPath = path.join(__dirname, 'webview', 'outliner.js');
    const outlinerModelScript = fs.readFileSync(outlinerModelPath, 'utf8');
    const outlinerSearchScript = fs.readFileSync(outlinerSearchPath, 'utf8');
    const outlinerScript = fs.readFileSync(outlinerPath, 'utf8');

    // Base64 encode JSON content to prevent XSS (</script> in content etc.)
    const jsonToEncode = jsonContent || '{"version":1,"rootIds":[],"nodes":{}}';
    const base64Content = Buffer.from(jsonToEncode, 'utf8').toString('base64');

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: http: data: file:; font-src ${webview.cspSource} https: https://fonts.gstatic.com data:;">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap">
    <title>Any Markdown Outliner</title>
    <style>
        ${outlinerCss}
    </style>
</head>
<body>
    <div class="outliner-container">
        <div class="outliner-search-bar">
            <button class="outliner-search-mode-toggle" title="Toggle search mode: Tree / Focus">🌲</button>
            <input type="text" class="outliner-search-input" placeholder="Search... (e.g. #tag, keyword, is:page)" />
            <span class="outliner-scope-badge"></span>
        </div>
        <div class="outliner-tree" role="tree"></div>
    </div>

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
