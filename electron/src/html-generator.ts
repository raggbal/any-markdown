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
    const vendorDir = getResourcePath('vendor');

    // Load shared body HTML generator
    const sharedModulePath = getResourcePath('out/shared/editor-body-html.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateEditorBodyHtml } = require(sharedModulePath);

    const styles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    const editorScript = fs.readFileSync(editorScriptPath, 'utf8')
        .replace('__DEBUG_MODE__', String(config.enableDebugLogging))
        .replace('__I18N__', JSON.stringify(config.webviewMessages))
        .replace('__DOCUMENT_BASE_URI__', config.documentBaseUri)
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
    <script>
        ${editorScript}
    </script>
</body>
</html>`;
}

/**
 * サイドパネル iframe 用の完全自己完結 HTML を生成。
 * blob: URL からは file:// リソースを読み込めないため、vendor JS/CSS を全てインライン化する。
 */
export function generateSidePanelHtml(
    content: string,
    config: ElectronEditorConfig
): string {
    let safeContent = content ?? '';
    if (safeContent.charCodeAt(0) === 0xFEFF) safeContent = safeContent.slice(1);
    safeContent = safeContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    const stylesPath = getResourcePath('src/webview/styles.css');
    const editorScriptPath = getResourcePath('src/webview/editor.js');
    const vendorDir = getResourcePath('vendor');

    // Load shared body HTML generator
    const sharedModulePath = getResourcePath('out/shared/editor-body-html.js');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateEditorBodyHtml } = require(sharedModulePath);

    // side-panel-host-bridge.js: out/shared/ (compiled) or src/shared/ (dev)
    let hostBridgePath = getResourcePath('out/shared/side-panel-host-bridge.js');
    if (!fs.existsSync(hostBridgePath)) {
        hostBridgePath = getResourcePath('src/shared/side-panel-host-bridge.js');
    }
    const hostBridgeScript = fs.readFileSync(hostBridgePath, 'utf8');

    const styles = fs.readFileSync(stylesPath, 'utf8')
        .replace('__FONT_SIZE__', String(config.fontSize));

    const base64Content = Buffer.from(safeContent, 'utf8').toString('base64');
    const editorScript = fs.readFileSync(editorScriptPath, 'utf8')
        .replace('__DEBUG_MODE__', String(config.enableDebugLogging))
        .replace('__I18N__', JSON.stringify(config.webviewMessages))
        .replace('__DOCUMENT_BASE_URI__', config.documentBaseUri)
        .replace('__CONTENT__', `'${base64Content}'`);

    // Vendor JS/CSS をインライン読み込み
    const turndownJs = fs.readFileSync(path.join(vendorDir, 'turndown.js'), 'utf8');
    const turndownGfmJs = fs.readFileSync(path.join(vendorDir, 'turndown-plugin-gfm.js'), 'utf8');
    const mermaidJs = fs.readFileSync(path.join(vendorDir, 'mermaid.min.js'), 'utf8');
    const katexJs = fs.readFileSync(path.join(vendorDir, 'katex.min.js'), 'utf8');
    const katexCss = fs.readFileSync(path.join(vendorDir, 'katex.min.css'), 'utf8');

    return `<!DOCTYPE html>
<html lang="en" data-theme="${config.theme}" data-toolbar-mode="simple" data-side-panel="true">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Side Panel</title>
    <style>${katexCss}</style>
    <style>
        ${styles}
        .sidebar { display: none !important; }
        .side-panel { display: none !important; }
        .side-panel-overlay { display: none !important; }
    </style>
</head>
<body>
    ${generateEditorBodyHtml(config.webviewMessages, process.platform)}

    <script>${turndownJs}</script>
    <script>${turndownGfmJs}</script>
    <script>${mermaidJs}</script>
    <script>${katexJs}</script>
    <script>${hostBridgeScript}</script>
    <script>${editorScript}</script>
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

let tempCounter = 0;

export function writeHtmlToTempFile(html: string): string {
    const tempDir = path.join(os.tmpdir(), 'any-markdown');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `editor-${process.pid}-${tempCounter++}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');
    return tempFile;
}
