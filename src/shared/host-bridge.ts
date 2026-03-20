/**
 * HostBridge — editor.js とホスト環境(VSCode / Electron / テスト)間の通信インターフェース
 *
 * editor.js は window.hostBridge を通じてホスト側と通信する。
 * 各ホスト環境が HostBridge を実装し、editor.js の前に <script> で注入する。
 */

/** editor.js → ホスト (送信) */
export interface HostBridge {
    // ドキュメント操作
    syncContent(markdown: string): void;
    save(): void;

    // フォーカス/編集状態
    reportEditingState(editing: boolean): void;
    reportFocus(): void;
    reportBlur(): void;

    // ホスト側 UI が必要な操作
    openLink(href: string): void;
    openLinkInTab(href: string): void;
    requestInsertLink(text: string): void;
    requestInsertImage(sidePanelFilePath?: string): void;
    requestSetImageDir(sidePanelFilePath?: string): void;
    saveImageAndInsert(dataUrl: string, fileName?: string, sidePanelFilePath?: string): void;
    readAndInsertImage(filePath: string, sidePanelFilePath?: string): void;
    openInTextEditor(): void;
    sendToChat(startLine: number, endLine: number, selectedMarkdown: string): void;
    saveSidePanelFile(filePath: string, content: string): void;
    sidePanelOpenLink(href: string, sidePanelFilePath: string): void;
    notifySidePanelClosed(): void;
    getSidePanelImageDir(sidePanelFilePath: string): void;

    // ページ追加 (Action Panel)
    searchFiles(query: string): void;
    createPageAtPath(relativePath: string): void;
    createPageAuto(): void;
    updatePageH1(relativePath: string, h1Text: string): void;

    // ホストからのメッセージ受信
    onMessage(handler: (message: HostMessage) => void): void;
}

/** ホスト → editor.js (受信メッセージ型) */
export type HostMessage =
    | { type: 'update'; content: string }
    | { type: 'performUndo' }
    | { type: 'performRedo' }
    | { type: 'toggleSourceMode' }
    | { type: 'setImageDir'; dirPath: string; forceRelativePath: boolean | null }
    | { type: 'insertImageHtml'; markdownPath: string; displayUri: string }
    | { type: 'insertLinkHtml'; url: string; text: string }
    | { type: 'externalChangeDetected'; message: string }
    | { type: 'scrollToAnchor'; anchor: string }
    | { type: 'imageDirInfo'; fileImageDir: string; defaultImageDir: string }
    | { type: 'imageDirStatus'; displayPath: string; source: 'file' | 'settings' | 'default' }
    | { type: 'sidePanelImageDirStatus'; displayPath: string; source: 'file' | 'settings' | 'default' }
    | { type: 'sidePanelSetImageDir'; dirPath: string; forceRelativePath: boolean | null }
    | { type: 'openSidePanel'; content: string; filePath: string; fileName: string }
    | { type: 'fileSearchResults'; results: string[]; query: string }
    | { type: 'pageCreatedAtPath'; relativePath: string };

/** window にグローバルとして注入される */
declare global {
    interface Window {
        hostBridge: HostBridge;
    }
}
