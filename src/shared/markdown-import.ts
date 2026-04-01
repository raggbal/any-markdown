/**
 * markdown-import.ts — .md ファイルのインポート処理（共通ロジック）
 *
 * outlinerProvider.ts / notes-message-handler.ts から呼ばれる。
 * webview側（editor-utils.js の normalizeMultiLineTableCells）と同等の変換ロジックを
 * Node.js 環境で実行するためのモジュール。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────

export interface ImportedMdFile {
    title: string;
    content: string;
    pageId: string;
}

// ────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────

/**
 * .md ファイルをインポートし、ページファイルとして保存する。
 *
 * @param sourcePath  元の .md ファイルのフルパス
 * @param pageDir     ページファイルの保存先ディレクトリ
 * @param imageDir    画像ファイルのコピー先ディレクトリ
 * @returns インポート結果（タイトル、変換後コンテンツ、pageId）
 */
export function importMdFile(
    sourcePath: string,
    pageDir: string,
    imageDir: string
): ImportedMdFile | null {
    // ファイル読み込み
    let rawContent: string;
    try {
        rawContent = fs.readFileSync(sourcePath, 'utf-8');
    } catch {
        return null;
    }

    // H1 抽出
    const title = extractH1Title(rawContent);

    // プレーンテキスト正規化
    let content = normalizeMarkdownPlainText(rawContent);

    // 画像処理
    const sourceDir = path.dirname(sourcePath);
    content = processImages(content, sourceDir, imageDir, pageDir);

    // pageId 生成
    const pageId = crypto.randomUUID();

    // ディレクトリ作成
    if (!fs.existsSync(pageDir)) {
        fs.mkdirSync(pageDir, { recursive: true });
    }

    // ページファイル保存
    const pagePath = path.join(pageDir, `${pageId}.md`);
    fs.writeFileSync(pagePath, content, 'utf-8');

    return { title, content, pageId };
}

/**
 * 複数の .md ファイルをインポートする。
 */
export function importMdFiles(
    filePaths: string[],
    pageDir: string,
    imageDir: string
): ImportedMdFile[] {
    const results: ImportedMdFile[] = [];
    for (const fp of filePaths) {
        const result = importMdFile(fp, pageDir, imageDir);
        if (result) {
            results.push(result);
        }
    }
    return results;
}

// ────────────────────────────────────────────
// Markdown normalization (plain text)
// ────────────────────────────────────────────

/**
 * プレーンテキスト Markdown の正規化処理。
 * editor-utils.js の normalizeMultiLineTableCells() と同等ロジック。
 */
export function normalizeMarkdownPlainText(text: string): string {
    return normalizeMultiLineTableCells(text);
}

/**
 * リッチテキスト（HTML）の Markdown 変換処理。
 * 将来の HTML D&D 対応用スタブ。
 * Turndown + エスケープ除去 + リスト空行除去を実装予定。
 */
export function normalizeMarkdownFromHtml(_html: string): string {
    // TODO: 将来実装
    return _html;
}

// ────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────

/**
 * Markdown テキストから最初の H1 テキストを抽出する。
 * H1 がなければ "Untitled" を返す。
 */
function extractH1Title(markdown: string): string {
    const match = markdown.match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : 'Untitled';
}

/**
 * セル内改行テーブルの正規化。
 * editor-utils.js の normalizeMultiLineTableCells と同等ロジック。
 */
function normalizeMultiLineTableCells(text: string): string {
    // Step 1: 平坦化解除 — | <br> | → |\n|
    text = text.replace(/\|\s*<br>\s*(?=\|)/gi, '|\n');

    // Step 2: 孤立セパレータ行除去
    const lines = text.split('\n');
    let result: string[] = [];
    let separatorSeen = false;
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        const isTableRow = trimmed.charAt(0) === '|' && trimmed.charAt(trimmed.length - 1) === '|' && trimmed.length > 2;

        if (isTableRow) {
            // セパレータ行か判定
            let isSep = false;
            const inner = trimmed.slice(1, -1);
            const cells = inner.split('|');
            if (cells.length > 0) {
                isSep = true;
                for (const cell of cells) {
                    if (!/^\s*:?-+:?\s*$/.test(cell)) {
                        isSep = false;
                        break;
                    }
                }
            }

            if (isSep) {
                if (separatorSeen && inTable) {
                    continue; // 重複セパレータをスキップ
                }
                separatorSeen = true;
            }
            inTable = true;
        } else {
            inTable = false;
            separatorSeen = false;
        }

        result.push(lines[i]);
    }

    // Step 3: 折れた行結合
    const lines2 = result;
    result = [];
    let i2 = 0;

    while (i2 < lines2.length) {
        const trimmed2 = lines2[i2].trimEnd();

        if (trimmed2.length > 1 && trimmed2.charAt(0) === '|' && trimmed2.charAt(trimmed2.length - 1) !== '|') {
            let combined = trimmed2;
            let j = i2 + 1;
            let found = false;
            const maxJoin = 50;

            while (j < lines2.length && (j - i2) <= maxJoin) {
                const nextTrimmed = lines2[j].trimEnd();

                if (nextTrimmed === '') {
                    combined += '<br>';
                    j++;
                    continue;
                }

                combined += '<br>' + nextTrimmed;
                j++;

                if (nextTrimmed.charAt(nextTrimmed.length - 1) === '|') {
                    found = true;
                    break;
                }
            }

            if (found) {
                combined = combined.replace(/(<br>)+/g, '<br>');
                result.push(combined);
                i2 = j;
            } else {
                result.push(lines2[i2]);
                i2++;
            }
        } else {
            result.push(lines2[i2]);
            i2++;
        }
    }

    return result.join('\n');
}

/**
 * Markdown 内の画像参照を解析し、画像ファイルをコピーしてパスを書き換える。
 */
function processImages(
    mdContent: string,
    sourceDir: string,
    imageDir: string,
    pageDir: string
): string {
    // ![alt](path) パターンを検出
    return mdContent.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, imgPath: string) => {
        // URL はスキップ
        if (imgPath.startsWith('http://') || imgPath.startsWith('https://')) {
            return `![${alt}](${imgPath})`;
        }

        // パスにクエリパラメータやフラグメントがある場合は除去
        const cleanPath = imgPath.split(/[?#]/)[0];

        // URLエンコードをデコード（Notion等のエクスポートで %20 等が使われる）
        let decodedPath: string;
        try {
            decodedPath = decodeURIComponent(cleanPath);
        } catch {
            decodedPath = cleanPath;
        }

        // 元ファイルからの相対パスで解決
        const absoluteImgPath = path.resolve(sourceDir, decodedPath);

        // ファイルが存在しない場合はそのまま
        if (!fs.existsSync(absoluteImgPath)) {
            return `![${alt}](${imgPath})`;
        }

        // 画像ディレクトリ作成
        if (!fs.existsSync(imageDir)) {
            fs.mkdirSync(imageDir, { recursive: true });
        }

        // リネームしてコピー
        const ext = path.extname(absoluteImgPath).toLowerCase().replace('jpeg', 'jpg') || '.png';
        const newFileName = `image_${Date.now()}_${Math.random().toString(36).slice(2, 6)}${ext}`;
        const destPath = path.join(imageDir, newFileName);
        fs.copyFileSync(absoluteImgPath, destPath);

        // pageDir からの相対パスに書き換え
        const relativePath = path.relative(pageDir, destPath).replace(/\\/g, '/');
        return `![${alt}](${relativePath})`;
    });
}
