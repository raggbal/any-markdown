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
            width: var(--notes-panel-width, 220px); min-width: 0; flex-shrink: 0;
            border-right: 1px solid var(--outliner-border, #e0e0e0);
            display: flex; flex-direction: column;
            background: var(--outliner-bg, #fafafa);
            overflow: hidden;
        }
        .notes-file-panel.collapsed { width: 0; border-right: none; }
        .notes-resize-handle {
            width: 4px; cursor: col-resize; background: transparent;
            flex-shrink: 0; position: relative; z-index: 10;
        }
        .notes-resize-handle:hover,
        .notes-resize-handle.active {
            background: var(--vscode-focusBorder, #007acc);
        }
        .notes-file-panel.collapsed + .notes-resize-handle { display: none; }
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
            padding: 7px 8px; line-height: 1; font-size: 13px;
            display: flex; align-items: center; justify-content: center;
            opacity: 0.7;
        }
        .file-panel-btn:hover { opacity: 1; border-color: var(--vscode-focusBorder, #007acc); background: transparent; }
        .file-panel-list { flex: 1; overflow-y: auto; padding: 4px 0; }

        /* ── File item ── */
        .file-panel-item {
            padding: 6px 12px; cursor: pointer; font-size: 13px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            border-radius: 4px; margin: 1px 4px;
            display: flex; align-items: center; gap: 6px;
        }
        .file-panel-item:hover { background: var(--outliner-hover, #e8e8e8); }
        .file-panel-item.active { background: var(--outliner-active, #d8e8f8); font-weight: 500; }
        .file-panel-item-icon { flex-shrink: 0; opacity: 0.5; width: 14px; height: 14px; }
        .file-panel-item-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        /* ── Folder ── */
        .file-panel-folder { }
        .file-panel-folder-header {
            padding: 6px 12px; cursor: pointer; font-size: 13px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            border-radius: 4px; margin: 1px 4px;
            display: flex; align-items: center; gap: 4px;
            font-weight: 500;
        }
        .file-panel-folder-header:hover { background: var(--outliner-hover, #e8e8e8); }
        .file-panel-folder-chevron {
            flex-shrink: 0; width: 14px; height: 14px;
            display: flex; align-items: center; justify-content: center;
            transition: transform 0.15s;
            opacity: 0.6;
        }
        .file-panel-folder.collapsed > .file-panel-folder-header > .file-panel-folder-chevron {
            transform: rotate(-90deg);
        }
        .file-panel-folder-icon { flex-shrink: 0; opacity: 0.5; width: 14px; height: 14px; }
        .file-panel-folder-title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .file-panel-folder-children {
            padding-left: 12px;
        }
        .file-panel-folder.collapsed > .file-panel-folder-children {
            display: none;
        }

        /* ── Drag & Drop ── */
        .file-panel-drag-over { background: var(--outliner-active, #d8e8f8); border-radius: 4px; }
        .file-panel-drop-line {
            height: 2px; background: var(--vscode-focusBorder, #007acc);
            margin: 0 4px; border-radius: 1px;
            pointer-events: none;
        }
        [draggable="true"] { cursor: grab; }
        [draggable="true"]:active { cursor: grabbing; }

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

        /* ── Tabs ── */
        .file-panel-tabs {
            display: flex; border-bottom: 1px solid var(--outliner-border, #e0e0e0);
            padding: 0; flex-shrink: 0;
        }
        .file-panel-tab {
            flex: 1; display: flex; align-items: center; justify-content: center; gap: 4px;
            padding: 8px 4px; border: none; background: none; cursor: pointer;
            font-size: 12px; opacity: 0.6; color: inherit;
            border-bottom: 2px solid transparent; transition: opacity 0.15s;
        }
        .file-panel-tab:hover { opacity: 0.85; }
        .file-panel-tab.active { opacity: 1; border-bottom-color: var(--vscode-focusBorder, #007acc); }
        .file-panel-tab svg { flex-shrink: 0; }
        .file-panel-content { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
        .file-panel-content-actions {
            display: flex; gap: 4px; padding: 6px 8px;
            border-bottom: 1px solid var(--outliner-border, #e0e0e0); flex-shrink: 0;
        }
        .file-panel-content-actions .file-panel-btn { font-size: 12px; padding: 4px 8px; }

        /* ── Search ── */
        .file-panel-search-input-wrap {
            padding: 8px; display: flex; flex-direction: column; gap: 4px;
            border-bottom: 1px solid var(--outliner-border, #e0e0e0);
        }
        .file-panel-search-input {
            width: 100%; padding: 4px 8px; font-size: 13px;
            border: 1px solid var(--outliner-border, #e0e0e0); border-radius: 4px;
            background: var(--outliner-bg, #fff); color: inherit; outline: none;
            box-sizing: border-box;
        }
        .file-panel-search-input:focus { border-color: var(--vscode-focusBorder, #007acc); }
        .file-panel-search-options { display: flex; gap: 2px; }
        .file-panel-search-opt-btn {
            padding: 2px 6px; font-size: 11px; border: 1px solid transparent;
            border-radius: 3px; cursor: pointer; opacity: 0.6; background: transparent; color: inherit;
        }
        .file-panel-search-opt-btn:hover { opacity: 0.8; }
        .file-panel-search-opt-btn.active {
            border-color: var(--vscode-focusBorder, #007acc); opacity: 1;
        }
        .file-panel-search-results { flex: 1; overflow-y: auto; padding: 4px 0; }
        .file-panel-search-file-group { margin-bottom: 4px; }
        .file-panel-search-file-header {
            padding: 4px 12px; font-size: 11px; font-weight: 600; opacity: 0.7;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .file-panel-search-match {
            padding: 4px 12px 4px 20px; font-size: 12px; cursor: pointer;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .file-panel-search-match:hover { background: var(--outliner-hover, #e8e8e8); }
        .file-panel-search-highlight { background: rgba(255, 200, 0, 0.3); font-weight: 500; }
        .file-panel-search-count { padding: 4px 12px; font-size: 11px; opacity: 0.6; }
        .file-panel-search-spinner { padding: 8px 12px; font-size: 12px; opacity: 0.5; }
    `;

    var html = `<aside class="notes-file-panel${panelClass}" id="notesFilePanel">
            <div class="file-panel-header">
                <span class="file-panel-title">Outlines</span>
                <div class="file-panel-actions">
                    <button class="file-panel-btn" id="filePanelCollapse" title="Collapse panel">&#9776;</button>
                </div>
            </div>
            <div class="file-panel-tabs">
                <button class="file-panel-tab active" data-tab="notes">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 13H8"/><path d="M16 13h-2"/><path d="M10 17H8"/><path d="M16 17h-2"/></svg>
                    Notes
                </button>
                <button class="file-panel-tab" data-tab="search">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                    Search
                </button>
            </div>
            <div class="file-panel-content" id="filePanelContentNotes">
                <div class="file-panel-content-actions">
                    <button class="file-panel-btn" id="filePanelAddFolder" title="New Folder"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="9" y1="13" x2="15" y2="13"/></svg></button>
                    <button class="file-panel-btn" id="filePanelAdd" title="New Outline"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
                    <span style="flex:1"></span>
                    <button class="file-panel-btn" id="filePanelToday" title="Today"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Today</button>
                </div>
                <div class="file-panel-list" id="notesFileList"></div>
            </div>
            <div class="file-panel-content" id="filePanelContentSearch" style="display:none">
                <div class="file-panel-search-input-wrap">
                    <input type="text" class="file-panel-search-input" id="notesSearchInput" placeholder="Search..." />
                    <div class="file-panel-search-options">
                        <button class="file-panel-search-opt-btn" id="notesSearchCase" title="Match Case">Aa</button>
                        <button class="file-panel-search-opt-btn" id="notesSearchWord" title="Whole Word">W</button>
                        <button class="file-panel-search-opt-btn" id="notesSearchRegex" title="Use Regex">.*</button>
                    </div>
                </div>
                <div class="file-panel-search-count" id="notesSearchCount"></div>
                <div class="file-panel-search-results" id="notesSearchResults"></div>
            </div>
        </aside>
        <div class="notes-resize-handle" id="notesResizeHandle"></div>`;

    return { css: css, html: html };
}

module.exports = { generateNotesFilePanelHtml };
