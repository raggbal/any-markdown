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
    requestInsertImage(): void;
    requestSetImageDir(): void;
    saveImageAndInsert(dataUrl: string, fileName?: string): void;
    readAndInsertImage(filePath: string): void;
    openInTextEditor(): void;
    sendToChat(startLine: number, endLine: number, selectedMarkdown: string): void;
    saveSidePanelFile(filePath: string, content: string): void;
    sidePanelOpenLink(href: string, sidePanelFilePath: string): void;

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
    | { type: 'openSidePanel'; content: string; filePath: string; fileName: string };

/** window にグローバルとして注入される */
declare global {
    interface Window {
        hostBridge: HostBridge;
    }
}
