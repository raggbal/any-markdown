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
            padding: 8px 12px; border-bottom: 1px solid var(--outliner-border, #e0e0e0);
            box-sizing: border-box;
        }
        .file-panel-title { font-weight: 600; font-size: 13px; white-space: nowrap; }
        .file-panel-actions { display: flex; gap: 4px; align-items: center; }
        .file-panel-btn {
            background: transparent; border: 1px solid var(--outliner-border, #e0e0e0);
            border-radius: 4px; cursor: pointer; color: inherit;
            padding: 4px 6px; line-height: 1; font-size: 13px;
            display: flex; align-items: center; justify-content: center;
            opacity: 0.7;
        }
        .file-panel-btn:hover { opacity: 1; border-color: var(--vscode-focusBorder, #007acc); background: transparent; }
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
            background: transparent; border: 1px solid var(--outliner-border, #e0e0e0);
            border-radius: 4px; cursor: pointer; padding: 4px 6px; line-height: 1;
            display: none; color: inherit; opacity: 0.7; font-size: 13px;
            align-items: center; justify-content: center; flex-shrink: 0; margin-right: 6px;
        }
        .notes-panel-toggle-btn:hover { opacity: 1; border-color: var(--vscode-focusBorder, #007acc); }
        .notes-file-panel.collapsed ~ .notes-main-wrapper .notes-panel-toggle-btn { display: flex; }
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
                    <button class="file-panel-btn" id="filePanelCollapse" title="Collapse panel"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/></svg></button>
                </div>
            </div>
            <div class="file-panel-list" id="notesFileList"></div>
        </aside>`;

    return { css: css, html: html };
}

module.exports = { generateNotesFilePanelHtml };
