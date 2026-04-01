/**
 * Outliner スタンドアロンテスト用HTMLを生成するビルドスクリプト
 *
 * 使用方法:
 *   node test/build-standalone-outliner.js
 *
 * outliner.js + outliner-model.js + outliner-search.js を読み込んで
 * test/html/standalone-outliner.html に出力
 */

const fs = require('fs');
const path = require('path');

// --- ソースファイルパス ---
const editorJsPath = path.join(__dirname, '../src/webview/editor.js');
const editorUtilsJsPath = path.join(__dirname, '../src/webview/editor-utils.js');
const outlinerJsPath = path.join(__dirname, '../src/webview/outliner.js');
const outlinerModelJsPath = path.join(__dirname, '../src/webview/outliner-model.js');
const outlinerSearchJsPath = path.join(__dirname, '../src/webview/outliner-search.js');
const outlinerCssPath = path.join(__dirname, '../src/webview/outliner.css');
const stylesPath = path.join(__dirname, '../src/webview/styles.css');
const sidePanelBridgePath = path.join(__dirname, '../src/shared/sidepanel-bridge-methods.js');
const editorBodyHtmlPath = path.join(__dirname, '../src/shared/editor-body-html.js');
const outputPath = path.join(__dirname, 'html/standalone-outliner.html');

// vendor/ → test/html/vendor/ にコピー（テストサーバー用）
const vendorSrc = path.join(__dirname, '../vendor');
const vendorDest = path.join(__dirname, 'html/vendor');
if (fs.existsSync(vendorSrc)) {
    fs.mkdirSync(vendorDest, { recursive: true });
    for (const file of fs.readdirSync(vendorSrc)) {
        const srcPath = path.join(vendorSrc, file);
        if (fs.statSync(srcPath).isDirectory()) {
            const destDir = path.join(vendorDest, file);
            fs.mkdirSync(destDir, { recursive: true });
            for (const f of fs.readdirSync(srcPath)) {
                fs.copyFileSync(path.join(srcPath, f), path.join(destDir, f));
            }
        } else {
            fs.copyFileSync(srcPath, path.join(vendorDest, file));
        }
    }
}

// --- CSS読み込み ---
const stylesContent = fs.readFileSync(stylesPath, 'utf-8')
    .replace('__FONT_SIZE__', '16px');
const outlinerCss = fs.readFileSync(outlinerCssPath, 'utf-8');

// --- スクリプト読み込み ---
const editorUtilsScript = fs.readFileSync(editorUtilsJsPath, 'utf-8');

let editorScript = fs.readFileSync(editorJsPath, 'utf-8');
editorScript = editorScript
    .replace('__DEBUG_MODE__', 'false')
    .replace('__I18N__', '{}')
    .replace('__DOCUMENT_BASE_URI__', '')
    .replace('__IS_OUTLINER_PAGE__', 'true')
    .replace('__CONTENT__', `'(unused)'`);

const sidePanelBridgeScript = fs.readFileSync(sidePanelBridgePath, 'utf-8');
const outlinerModelScript = fs.readFileSync(outlinerModelJsPath, 'utf-8');
const outlinerSearchScript = fs.readFileSync(outlinerSearchJsPath, 'utf-8');
const outlinerScript = fs.readFileSync(outlinerJsPath, 'utf-8');

// サイドパネルHTML生成
const { generateSidePanelHtml } = require(editorBodyHtmlPath);
const sidePanelHtml = generateSidePanelHtml({});

// --- テスト用 HostBridge モック ---
const testOutlinerHostBridge = `
(function() {
    window.__testApi = {
        messages: [],
        ready: false,
        lastSyncData: null,
        getModel: null,
        getTree: null
    };

    var postFn = function(msg) { window.__testApi.messages.push(msg); };

    // 共通メソッド
    var shared = window.__createSidePanelBridgeMethods(postFn);

    window.outlinerHostBridge = Object.assign(shared, {
        syncData: function(jsonString) {
            window.__testApi.messages.push({ type: 'syncData', content: jsonString });
            window.__testApi.lastSyncData = jsonString;
        },
        makePage: function(nodeId, pageId, title) {
            window.__testApi.messages.push({ type: 'makePage', nodeId: nodeId, pageId: pageId, title: title });
        },
        openPage: function(nodeId, pageId) {
            window.__testApi.messages.push({ type: 'openPage', nodeId: nodeId, pageId: pageId });
        },
        removePage: function(nodeId, pageId) {
            window.__testApi.messages.push({ type: 'removePage', nodeId: nodeId, pageId: pageId });
        },
        copyPageFile: function(sourcePageId, newPageId) {
            window.__testApi.messages.push({ type: 'copyPageFile', sourcePageId: sourcePageId, newPageId: newPageId });
        },
        setPageDir: function() {
            window.__testApi.messages.push({ type: 'setPageDir' });
        },
        openPageInSidePanel: function(nodeId, pageId) {
            window.__testApi.messages.push({ type: 'openPageInSidePanel', nodeId: nodeId, pageId: pageId });
        },
        openInTextEditor: function() {
            window.__testApi.messages.push({ type: 'openInTextEditor' });
        },
        copyFilePath: function() {
            window.__testApi.messages.push({ type: 'copyFilePath' });
        },
        createPageAtPath: function() {},
        createPageAuto: function() {},
        updatePageH1: function() {},
        postDailyNotes: function() {},
        saveOutlinerImage: function(nodeId, dataUrl, fileName) {
            window.__testApi.messages.push({ type: 'saveOutlinerImage', nodeId: nodeId, dataUrl: dataUrl, fileName: fileName });
            // テスト用: 即座にモデルに追加して返す
            var mockPath = './images/' + (fileName || 'test_image.png');
            if (window.__hostMessageHandler) {
                window.__hostMessageHandler({
                    type: 'outlinerImageSaved',
                    nodeId: nodeId,
                    imagePath: mockPath,
                    displayUri: dataUrl
                });
            }
        },
        importMdFilesDialog: function(targetNodeId) {
            window.__testApi.messages.push({ type: 'importMdFilesDialog', targetNodeId: targetNodeId });
        },
        setOutlinerImageDir: function() {
            window.__testApi.messages.push({ type: 'setOutlinerImageDir' });
        },
        getOutlinerImageDir: function() {
            window.__testApi.messages.push({ type: 'getOutlinerImageDir' });
        },
        showConfirm: function(id, message) {
            window.__testApi.messages.push({ type: 'showConfirm', id: id, message: message });
        },
        onMessage: function(handler) {
            window.__hostMessageHandler = handler;
        }
    });
})();
`;

// --- HTMLテンプレート ---
const html = `<!DOCTYPE html>
<html lang="en" data-theme="github">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Standalone Outliner Test</title>
    <style>${stylesContent}</style>
    <style>${outlinerCss}</style>
</head>
<body>
    <div class="outliner-container">
        <div class="outliner-page-title" style="display:none">
            <input type="text" class="outliner-page-title-input" placeholder="Untitled" />
        </div>
        <div class="outliner-scope-search-indicator" style="display:none"><span class="outliner-scope-search-tag"></span></div>
        <div class="outliner-search-bar">
            <button class="outliner-nav-back-btn" title="Back" disabled></button>
            <button class="outliner-nav-forward-btn" title="Forward" disabled></button>
            <button class="outliner-search-mode-toggle" title="Toggle search mode: Tree / Focus"></button>
            <div class="outliner-search-input-wrapper">
                <input type="text" class="outliner-search-input" placeholder="Search..." />
                <button class="outliner-search-clear-btn" style="display:none" title="Clear search"></button>
            </div>
            <button class="outliner-undo-btn" title="Undo" disabled></button>
            <button class="outliner-redo-btn" title="Redo" disabled></button>
            <button class="outliner-menu-btn" title="Menu"></button>
        </div>
        <div class="outliner-pinned-nav-bar">
            <div class="outliner-pinned-tags-area"></div>
            <div class="outliner-pinned-nav-spacer"></div>
            <button class="outliner-pinned-settings-btn" title="Pinned tag settings"></button>
        </div>
        <div class="outliner-breadcrumb"></div>
        <div class="outliner-tree" role="tree"></div>
    </div>

    ${sidePanelHtml}

    <!-- editor.js のサイドパネル用に必要な隠しDOM要素 -->
    <div class="sidebar" id="sidebar" style="display:none;"><div class="outline" id="outline"></div></div>
    <div class="sidebar-resizer" id="sidebarResizer" style="display:none;"></div>
    <div class="toolbar" id="toolbar" style="display:none;"></div>
    <div id="statusLeft" style="display:none;"></div>
    <div class="sidebar-status-imagedir" id="statusImageDir" style="display:none;"></div>
    <div class="word-count" id="wordCount" style="display:none;"></div>
    <div class="source-editor" id="sourceEditor" style="display:none;"></div>
    <button class="sidebar-toggle" id="closeSidebar" style="display:none;"></button>
    <button data-action="openOutline" id="openSidebarBtn" style="display:none;"></button>
    <div class="search-replace-box" id="searchReplaceBox" style="display:none;">
        <input class="search-input" id="searchInput" type="text">
        <input class="replace-input" id="replaceInput" type="text">
        <span class="search-count" id="searchCount"></span>
        <button class="search-prev" id="searchPrev"></button>
        <button class="search-next" id="searchNext"></button>
        <button class="toggle-replace" id="toggleReplace"></button>
        <button class="close-search" id="closeSearch"></button>
        <div class="replace-row" id="replaceRow">
            <button class="replace-one" id="replaceOne"></button>
            <button class="replace-all" id="replaceAll"></button>
        </div>
        <input class="search-case-sensitive" id="searchCaseSensitive" type="checkbox">
        <input class="search-whole-word" id="searchWholeWord" type="checkbox">
        <input class="search-regex" id="searchRegex" type="checkbox">
    </div>
    <div class="editor" id="editor" contenteditable="true" spellcheck="false" style="display:none;"></div>

    <script src="vendor/turndown.js"></script>
    <script src="vendor/turndown-plugin-gfm.js"></script>
    <script src="vendor/mermaid.min.js"></script>

    <script>
    window.__SKIP_EDITOR_AUTO_INIT__ = true;
    window.__outlinerMessages = {};
    window.__outlinerImageBaseUri = '';
    </script>
    <script>
    __EDITOR_UTILS_SCRIPT__
    </script>
    <script>
    __EDITOR_SCRIPT__
    </script>
    <script>
    __SIDEPANEL_BRIDGE__
    </script>
    <script>
    __TEST_HOST_BRIDGE__
    </script>
    <script>
    __OUTLINER_MODEL_SCRIPT__
    </script>
    <script>
    __OUTLINER_SEARCH_SCRIPT__
    </script>
    <script>
    __OUTLINER_SCRIPT__
    </script>
    <script>
    // テストAPI公開
    window.__testApi.ready = false;
    window.__testApi.initOutliner = function(data) {
        var defaultData = { version: 1, rootIds: [], nodes: {} };
        Outliner.init(data || defaultData);
        window.__testApi.ready = true;
    };
    window.__testApi.getSerializedData = function() {
        if (window.__testApi.lastSyncData) {
            return JSON.parse(window.__testApi.lastSyncData);
        }
        return null;
    };
    // 空データで初期化
    window.__testApi.initOutliner();
    </script>
</body>
</html>`;

fs.writeFileSync(outputPath, html
    .replace('__EDITOR_UTILS_SCRIPT__', editorUtilsScript)
    .replace('__EDITOR_SCRIPT__', editorScript)
    .replace('__SIDEPANEL_BRIDGE__', sidePanelBridgeScript)
    .replace('__TEST_HOST_BRIDGE__', testOutlinerHostBridge)
    .replace('__OUTLINER_MODEL_SCRIPT__', outlinerModelScript)
    .replace('__OUTLINER_SEARCH_SCRIPT__', outlinerSearchScript)
    .replace('__OUTLINER_SCRIPT__', outlinerScript));

console.log('Generated:', outputPath);
