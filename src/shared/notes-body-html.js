'use strict';

/**
 * Notes 左パネル CSS + HTML を生成
 * VSCode / Electron 共通
 *
 * @param {object} options
 * @param {boolean} options.collapsed - パネルが折り畳み状態か
 * @returns {{ css: string, html: string }} CSS文字列とHTML文字列
 */
function generateNotesFilePanelHtml(options) {
    var collapsed = options && options.collapsed;
    var panelClass = collapsed ? ' collapsed' : '';

    var css = `
        .notes-layout {
            display: flex; height: 100vh; overflow: hidden;
        }
        .notes-file-panel {
            width: 220px; min-width: 0; flex-shrink: 0;
            border-right: 1px solid var(--outliner-border, #e0e0e0);
            display: flex; flex-direction: column;
            background: var(--outliner-bg, #fafafa);
            transition: width 0.2s;
            overflow: hidden;
        }
        .notes-file-panel.collapsed { width: 0; border-right: none; }
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
        .notes-main-wrapper { flex: 1; overflow: hidden; display: flex; flex-direction: column; position: relative; }
        .notes-panel-toggle-btn {
            position: absolute; top: 8px; left: 8px; z-index: 10;
            background: var(--outliner-bg, #fafafa); border: 1px solid var(--outliner-border, #e0e0e0);
            border-radius: 4px; cursor: pointer; padding: 4px 6px; font-size: 14px; line-height: 1;
            display: none; color: inherit;
        }
        .notes-file-panel.collapsed ~ .notes-main-wrapper .notes-panel-toggle-btn { display: block; }
        .notes-file-panel.collapsed ~ .notes-main-wrapper .outliner-search-bar { padding-left: 44px; }
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
    `;

    var html = `<aside class="notes-file-panel${panelClass}" id="notesFilePanel">
            <div class="file-panel-header">
                <span class="file-panel-title">Outlines</span>
                <div class="file-panel-actions">
                    <button class="file-panel-btn" id="filePanelAdd" title="New Outline">+</button>
                    <button class="file-panel-btn" id="filePanelCollapse" title="Collapse panel">&#x25C0;</button>
                </div>
            </div>
            <div class="file-panel-list" id="notesFileList"></div>
        </aside>`;

    return { css: css, html: html };
}

module.exports = { generateNotesFilePanelHtml };
