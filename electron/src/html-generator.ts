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
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' file:; script-src 'unsafe-inline' file:; img-src file: data: https: http:; font-src file: data:;">
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

let tempCounter = 0;

export function writeHtmlToTempFile(html: string): string {
    const tempDir = path.join(os.tmpdir(), 'any-markdown');
    fs.mkdirSync(tempDir, { recursive: true });
    const tempFile = path.join(tempDir, `editor-${process.pid}-${tempCounter++}.html`);
    fs.writeFileSync(tempFile, html, 'utf8');
    return tempFile;
}
