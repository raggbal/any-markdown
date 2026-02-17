/**
 * スタンドアロンテスト用HTMLを生成するビルドスクリプト
 * 
 * 使用方法:
 *   node test/build-standalone.js
 * 
 * src/webview/editor.jsを読み込んでtest/html/に出力
 */

const fs = require('fs');
const path = require('path');

const editorJsPath = path.join(__dirname, '../src/webview/editor.js');
const outputPath = path.join(__dirname, 'html/standalone-editor.html');

// editor.jsを読み込み
let editorScript = fs.readFileSync(editorJsPath, 'utf-8');

// プレースホルダーを置換
editorScript = editorScript
    .replace('__DEBUG_MODE__', 'false')
    .replace('__I18N__', '{}')
    .replace('__DOCUMENT_BASE_URI__', '')
    .replace('__CONTENT__', '``');

// VSCode固有のコードを除去/置換
editorScript = editorScript
    .replace(/const vscode = acquireVsCodeApi\(\);/g, '// vscode API is mocked');

// HTMLテンプレート
const html = `<!DOCTYPE html>
<html lang="en" data-theme="github">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Standalone Editor Test</title>
    <style>
        :root {
            --font-size: 16px;
            --font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            --font-mono: 'SF Mono', Consolas, monospace;
            --bg-color: #ffffff;
            --text-color: #24292f;
            --heading-color: #1f2328;
            --link-color: #0969da;
            --code-bg: #f6f8fa;
            --border-color: #d0d7de;
            --blockquote-color: #57606a;
            --selection-bg: #b6d7ff;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: var(--font-family);
            font-size: var(--font-size);
            line-height: 1.6;
            color: var(--text-color);
            background: var(--bg-color);
        }
        .editor {
            max-width: 860px;
            margin: 40px auto;
            padding: 20px 40px;
            min-height: 400px;
            outline: none;
            white-space: pre-wrap;
        }
        .editor h1, .editor h2, .editor h3, .editor h4, .editor h5, .editor h6 {
            color: var(--heading-color);
            margin: 0.5em 0;
            font-weight: 600;
        }
        .editor h1 { font-size: 2em; border-bottom: 1px solid var(--border-color); }
        .editor h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); }
        .editor h3 { font-size: 1.25em; }
        .editor p { margin: 0.5em 0; min-height: 1.6em; }
        .editor strong { font-weight: 600; }
        .editor em { font-style: italic; }
        .editor del { text-decoration: line-through; }
        .editor code {
            font-family: var(--font-mono);
            background: var(--code-bg);
            padding: 0.2em 0.4em;
            border-radius: 4px;
        }
        .editor pre {
            background: var(--code-bg);
            padding: 16px;
            border-radius: 6px;
            margin: 1em 0;
            white-space: pre-wrap;
        }
        .editor blockquote {
            margin: 0.5em 0;
            padding: 0 1em;
            color: var(--blockquote-color);
            border-left: 4px solid var(--border-color);
        }
        .editor ul, .editor ol { margin: 0.5em 0; padding-left: 2em; }
        .editor li { margin: 0.25em 0; }
        .editor hr { border: none; border-top: 2px solid var(--border-color); margin: 1em 0; }
        .editor table { border-collapse: collapse; width: 100%; margin: 1em 0; }
        .editor th, .editor td { border: 1px solid var(--border-color); padding: 8px 12px; }
        .editor th { background: var(--code-bg); font-weight: 600; }
        /* Code block header styles */
        .code-block-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 4px 8px;
            background: rgba(0,0,0,0.05);
            border-radius: 6px 6px 0 0;
            margin: -16px -16px 8px -16px;
        }
        .code-lang-tag {
            font-size: 12px;
            color: var(--blockquote-color);
            cursor: pointer;
        }
        .code-copy-btn, .code-expand-btn {
            background: none;
            border: none;
            cursor: pointer;
            font-size: 12px;
            color: var(--blockquote-color);
        }
        /* Language selector styles */
        .lang-selector {
            position: fixed;
            background: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            max-height: 250px;
            overflow-y: auto;
            z-index: 10000;
            min-width: 140px;
        }
        .lang-selector-item {
            padding: 6px 12px;
            cursor: pointer;
            font-size: 12px;
        }
        .lang-selector-item:hover {
            background: var(--selection-bg);
        }
    </style>
</head>
<body>
    <div id="sidebar" style="display:none;"><div id="outline"></div></div>
    <div id="sidebarResizer" style="display:none;"></div>
    <div id="toolbar" style="display:none;"></div>
    <div id="statusLeft" style="display:none;"></div>
    <div id="statusRight" style="display:none;"></div>
    <div id="wordCount" style="display:none;"></div>
    <div id="sourceEditor" style="display:none;"></div>
    <button id="closeSidebar" style="display:none;"></button>
    <button id="openSidebarBtn" style="display:none;"></button>
    <!-- Search & Replace elements (hidden, required by script) -->
    <div id="searchReplaceBox" style="display:none;">
        <input id="searchInput" type="text">
        <input id="replaceInput" type="text">
        <span id="searchCount"></span>
        <button id="searchPrev"></button>
        <button id="searchNext"></button>
        <button id="toggleReplace"></button>
        <button id="closeSearch"></button>
        <div id="replaceRow">
            <button id="replaceOne"></button>
            <button id="replaceAll"></button>
        </div>
        <input id="searchCaseSensitive" type="checkbox">
        <input id="searchWholeWord" type="checkbox">
        <input id="searchRegex" type="checkbox">
    </div>
    <div class="editor" id="editor" contenteditable="true" spellcheck="false"></div>
    
    <script src="https://unpkg.com/turndown/dist/turndown.js"></script>
    <script src="https://unpkg.com/turndown-plugin-gfm/dist/turndown-plugin-gfm.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
    // Test API (must be defined before editor script)
    window.__testApi = {
        messages: [],
        ready: false,
        getMarkdown: null,
        getHtml: null,
        setMarkdown: null
    };
    
    // VSCode API mock
    const vscode = {
        postMessage: (msg) => {
            window.__testApi.messages.push(msg);
        }
    };
    </script>
    <script>
    __EDITOR_SCRIPT__
    </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html.replace('__EDITOR_SCRIPT__', editorScript));
console.log('Generated:', outputPath);
