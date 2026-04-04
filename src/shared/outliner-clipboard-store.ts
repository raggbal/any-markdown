/**
 * OutlinerClipboardStore — Cross-outliner clipboard singleton.
 *
 * 全 OutlinerProvider / NotesEditorProvider パネルから参照可能。
 * webview 側で copy/cut 時に saveOutlinerClipboard メッセージ経由で保存し、
 * paste 時に copyPageFileCross / copyImagesCross メッセージ経由でソースの絶対パスを取得する。
 */

export interface ClipboardNodeData {
    text: string;
    level: number;
    isPage: boolean;
    pageId: string | null;
    images: string[];
}

interface ClipboardData {
    plainText: string;
    isCut: boolean;
    nodes: ClipboardNodeData[];
    sourcePagesDirPath: string;
    sourceImagesDirPath: string;
}

export class OutlinerClipboardStore {
    private static data: ClipboardData | null = null;

    static save(data: ClipboardData): void {
        this.data = data;
    }

    static get(plainText: string): ClipboardData | null {
        if (!this.data) return null;
        if (this.data.plainText !== plainText) return null;
        return this.data;
    }

    static consumeIfCut(plainText: string): void {
        if (this.data?.plainText === plainText && this.data.isCut) {
            this.data = null;
        }
    }
}
