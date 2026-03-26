/**
 * Notes VSCode HostBridge — acquireVsCodeApi() をラップし、
 * outliner.js が使う window.outlinerHostBridge と
 * notes-file-panel.js が使う window.notesHostBridge の両方を提供する。
 *
 * notesWebviewContent.ts により outliner.js の前に注入される。
 */
(function() {
    var api = acquireVsCodeApi();

    // ファイル切替カウンター: stale syncData を防止
    var currentFileChangeId = window.__initialFileChangeId || 0;
    window.addEventListener('message', function(e) {
        if (e.data && e.data.type === 'updateData' && e.data.fileChangeId !== undefined) {
            currentFileChangeId = e.data.fileChangeId;
        }
    });

    // ── outliner.js 用ブリッジ (既存 outliner-host-bridge.js と同一インターフェース) ──
    window.outlinerHostBridge = {
        // データ同期
        syncData: function(jsonString) {
            api.postMessage({ type: 'syncData', content: jsonString, fileChangeId: currentFileChangeId });
        },

        // 保存
        save: function() {
            api.postMessage({ type: 'save' });
        },

        // ページ操作
        makePage: function(nodeId, pageId, title) {
            api.postMessage({ type: 'makePage', nodeId: nodeId, pageId: pageId, title: title });
        },
        openPage: function(nodeId, pageId) {
            api.postMessage({ type: 'openPage', nodeId: nodeId, pageId: pageId });
        },
        removePage: function(nodeId, pageId) {
            api.postMessage({ type: 'removePage', nodeId: nodeId, pageId: pageId });
        },
        setPageDir: function() {
            api.postMessage({ type: 'setPageDir' });
        },

        // サイドパネル (ページ表示用)
        openPageInSidePanel: function(nodeId, pageId) {
            api.postMessage({ type: 'openPageInSidePanel', nodeId: nodeId, pageId: pageId });
        },
        saveSidePanelFile: function(filePath, content) {
            api.postMessage({ type: 'saveSidePanelFile', filePath: filePath, content: content });
        },
        notifySidePanelClosed: function() {
            api.postMessage({ type: 'sidePanelClosed' });
        },
        sidePanelOpenLink: function(href, sidePanelFilePath) {
            api.postMessage({ type: 'sidePanelOpenLink', href: href, sidePanelFilePath: sidePanelFilePath });
        },
        openLinkInTab: function(href) {
            api.postMessage({ type: 'openLinkInTab', href: href });
        },
        getSidePanelImageDir: function(sidePanelFilePath) {
            api.postMessage({ type: 'getSidePanelImageDir', sidePanelFilePath: sidePanelFilePath });
        },
        requestInsertImage: function(sidePanelFilePath) {
            api.postMessage({ type: 'insertImage', position: 0, sidePanelFilePath: sidePanelFilePath });
        },
        requestSetImageDir: function(sidePanelFilePath) {
            api.postMessage({ type: 'setImageDir', sidePanelFilePath: sidePanelFilePath });
        },
        saveImageAndInsert: function(dataUrl, fileName, sidePanelFilePath) {
            api.postMessage({ type: 'saveImageAndInsert', dataUrl: dataUrl, fileName: fileName, sidePanelFilePath: sidePanelFilePath });
        },
        readAndInsertImage: function(filePath, sidePanelFilePath) {
            api.postMessage({ type: 'readAndInsertImage', filePath: filePath, sidePanelFilePath: sidePanelFilePath });
        },
        searchFiles: function(query) {
            api.postMessage({ type: 'searchFiles', query: query });
        },

        // sendToChat (サイドパネルからの呼び出し)
        sendToChat: function(startLine, endLine, selectedMarkdown, sidePanelFilePath) {
            api.postMessage({ type: 'sendToChat', startLine: startLine, endLine: endLine, selectedMarkdown: selectedMarkdown, sidePanelFilePath: sidePanelFilePath });
        },

        // ページ管理 (サイドパネル内EditorInstanceから呼ばれる — outlinerでは未使用)
        createPageAtPath: function() { /* no-op in outliner */ },
        createPageAuto: function() { /* no-op in outliner */ },
        updatePageH1: function() { /* no-op in outliner */ },

        // Daily Notes ナビゲーション（outliner.jsから呼び出し）
        postDailyNotes: function(type, dayOffset, currentDate) {
            if (window.Outliner && window.Outliner.flushSync) {
                window.Outliner.flushSync();
            }
            if (type === 'notesNavigateToDate') {
                api.postMessage({ type: 'notesNavigateToDate', targetDate: dayOffset }); // dayOffset = date string
            } else {
                api.postMessage({ type: type, dayOffset: dayOffset || 0, currentDate: currentDate || null });
            }
        },

        // リンク
        openLink: function(href) {
            api.postMessage({ type: 'openLink', href: href });
        },

        // フォーカス
        reportFocus: function() {
            api.postMessage({ type: 'webviewFocus' });
        },
        reportBlur: function() {
            api.postMessage({ type: 'webviewBlur' });
        },

        // ホストからのメッセージ受信
        onMessage: function(handler) {
            window.addEventListener('message', function(e) {
                handler(e.data);
            });
        }
    };

    // ── Outliner即時同期ヘルパー ──
    // ファイル切替前に未保存のoutlinerデータを即座にsyncする
    function flushOutlinerSync() {
        if (window.Outliner && window.Outliner.flushSync) {
            window.Outliner.flushSync();
        }
    }

    // ── notes-file-panel.js 用ブリッジ ──
    window.notesHostBridge = {
        // ファイル操作
        openFile: function(filePath) {
            flushOutlinerSync();
            api.postMessage({ type: 'notesOpenFile', filePath: filePath });
        },
        createFile: function(title, parentId) {
            api.postMessage({ type: 'notesCreateFile', title: title, parentId: parentId || null });
        },
        deleteFile: function(filePath) {
            api.postMessage({ type: 'notesDeleteFile', filePath: filePath });
        },
        renameTitle: function(filePath, newTitle) {
            api.postMessage({ type: 'notesRenameTitle', filePath: filePath, newTitle: newTitle });
        },
        togglePanel: function(collapsed) {
            api.postMessage({ type: 'notesTogglePanel', collapsed: collapsed });
        },

        // フォルダ操作
        createFolder: function(title, parentId) {
            api.postMessage({ type: 'notesCreateFolder', title: title, parentId: parentId || null });
        },
        deleteFolder: function(folderId) {
            api.postMessage({ type: 'notesDeleteFolder', folderId: folderId });
        },
        renameFolder: function(folderId, newTitle) {
            api.postMessage({ type: 'notesRenameFolder', folderId: folderId, newTitle: newTitle });
        },
        toggleFolder: function(folderId) {
            api.postMessage({ type: 'notesToggleFolder', folderId: folderId });
        },

        // D&D 移動
        moveItem: function(itemId, targetParentId, index) {
            api.postMessage({ type: 'notesMoveItem', itemId: itemId, targetParentId: targetParentId, index: index });
        },

        // Daily Notes
        openDailyNotes: function() {
            flushOutlinerSync();
            api.postMessage({ type: 'notesOpenDailyNotes' });
        },
        navigateDailyNotes: function(dayOffset, currentDate) {
            flushOutlinerSync();
            api.postMessage({ type: 'notesNavigateDailyNotes', dayOffset: dayOffset, currentDate: currentDate || null });
        },

        // パネル幅保存
        savePanelWidth: function(width) {
            api.postMessage({ type: 'notesSavePanelWidth', width: width });
        },

        // 検索
        search: function(query, options) {
            flushOutlinerSync();
            // outlinerの検索・スコープをリセット (RQ-1-2)
            if (window.Outliner && window.Outliner.resetSearchAndScope) {
                window.Outliner.resetSearchAndScope();
            }
            api.postMessage({
                type: 'notesSearch',
                query: query,
                caseSensitive: options.caseSensitive,
                wholeWord: options.wholeWord,
                useRegex: options.useRegex,
            });
        },
        jumpToNode: function(fileId, nodeId) {
            flushOutlinerSync();
            api.postMessage({ type: 'notesJumpToNode', fileId: fileId, nodeId: nodeId });
        },
        jumpToMdPage: function(outFileId, pageId, lineNumber) {
            flushOutlinerSync();
            api.postMessage({
                type: 'notesJumpToMdPage',
                outFileId: outFileId,
                pageId: pageId,
                lineNumber: lineNumber,
            });
        },
        openMdFileExternal: function(filePath) {
            api.postMessage({ type: 'notesOpenMdExternal', filePath: filePath });
        },
        onSearchStart: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesSearchStart') {
                    handler(e.data.searchId, e.data.query);
                }
            });
        },
        onSearchPartial: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesSearchPartial') {
                    handler(e.data.searchId, e.data.result);
                }
            });
        },
        onSearchEnd: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesSearchEnd') {
                    handler(e.data.searchId);
                }
            });
        },

        // イベントリスナー
        onFileListChanged: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesFileListChanged') {
                    handler(e.data.fileList, e.data.currentFile, e.data.structure);
                }
            });
        },

        // ── S3 Sync ──

        s3Sync: function(bucketPath) {
            flushOutlinerSync();
            api.postMessage({ type: 'notesS3Sync', bucketPath: bucketPath });
        },
        s3RemoteDeleteAndUpload: function(bucketPath) {
            flushOutlinerSync();
            api.postMessage({ type: 'notesS3RemoteDeleteUpload', bucketPath: bucketPath });
        },
        s3LocalDeleteAndDownload: function(bucketPath) {
            flushOutlinerSync();
            api.postMessage({ type: 'notesS3LocalDeleteDownload', bucketPath: bucketPath });
        },
        s3SaveBucketPath: function(bucketPath) {
            api.postMessage({ type: 'notesS3SaveBucketPath', bucketPath: bucketPath });
        },
        s3GetStatus: function() {
            api.postMessage({ type: 'notesS3GetStatus' });
        },
        onS3Progress: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesS3Progress') {
                    handler(e.data);
                }
            });
        },
        onS3Status: function(handler) {
            window.addEventListener('message', function(e) {
                if (e.data && e.data.type === 'notesS3Status') {
                    handler(e.data);
                }
            });
        }
    };
})();
