/**
 * コードブロック・引用ブロック内の複数行選択 Tab/Shift+Tab テスト
 * - 複数行選択 + Tab → 全選択行の先頭に4スペース追加
 * - 複数行選択 + Shift+Tab → 全選択行の先頭から最大4スペース削除
 * - 引用ブロックでも同様に動作すること
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

/** コードブロック内のテキストをBR要素と\nテキストの両方を行区切りとして分割する */
async function getCodeLines(page: any): Promise<string[]> {
    return await page.evaluate(() => {
        const code = document.querySelector('pre code');
        if (!code) return [];
        const lines: string[] = [];
        let currentLine = '';
        for (const child of Array.from(code.childNodes)) {
            if (child.nodeType === 1 && (child as Element).tagName === 'BR') {
                lines.push(currentLine);
                currentLine = '';
            } else if (child.nodeType === 3) {
                const text = child.textContent || '';
                const parts = text.split('\n');
                currentLine += parts[0];
                for (let i = 1; i < parts.length; i++) {
                    lines.push(currentLine);
                    currentLine = parts[i];
                }
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    });
}

/** 引用ブロック内のテキストをBR要素で分割する */
async function getBlockquoteLines(page: any): Promise<string[]> {
    return await page.evaluate(() => {
        const bq = document.querySelector('blockquote');
        if (!bq) return [];
        const lines: string[] = [];
        let currentLine = '';
        for (const child of Array.from(bq.childNodes)) {
            if (child.nodeType === 1 && (child as Element).tagName === 'BR') {
                lines.push(currentLine);
                currentLine = '';
            } else if (child.nodeType === 3) {
                const text = child.textContent || '';
                const parts = text.split('\n');
                currentLine += parts[0];
                for (let i = 1; i < parts.length; i++) {
                    lines.push(currentLine);
                    currentLine = parts[i];
                }
            }
        }
        if (currentLine) lines.push(currentLine);
        return lines;
    });
}

test.describe('《コードブロック》複数行選択 Tab/Shift+Tab', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('複数行選択 + Tab → 全選択行インデント', async ({ page }) => {
        // setMarkdownで3行のコードブロックを設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\nline1\nline2\nline3\n```');
        });
        await page.waitForTimeout(200);

        // コードブロックをクリックして編集モードに入る
        await page.click('#editor pre code');
        await page.waitForTimeout(200);

        // line1の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return;
            const firstText = code.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        // Shift+↓で2行選択（line1とline2）
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        // Tab
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        // 確認: line1, line2にインデントが追加されていること
        const lines = await getCodeLines(page);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines[0]).toBe('    line1');
        expect(lines[1]).toBe('    line2');
        // line3は選択範囲外なので変更なし（選択がline3の先頭に到達しているかは実装依存）
    });

    test('複数行選択 + Shift+Tab → 全選択行デインデント', async ({ page }) => {
        // 4スペースインデント付きの3行コードブロック
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\n    line1\n    line2\n    line3\n```');
        });
        await page.waitForTimeout(200);

        await page.click('#editor pre code');
        await page.waitForTimeout(200);

        // line1の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return;
            const firstText = code.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        // Shift+↓で2行選択
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        // Shift+Tab
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        const lines = await getCodeLines(page);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines[0]).toBe('line1');
        expect(lines[1]).toBe('line2');
    });

    test('Shift+Tab で2スペースしかない場合は2スペースのみ削除', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\n  line1\n  line2\n```');
        });
        await page.waitForTimeout(200);

        await page.click('#editor pre code');
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return;
            const firstText = code.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        const lines = await getCodeLines(page);
        expect(lines[0]).toBe('line1');
        expect(lines[1]).toBe('line2');
    });

    test('単一行 Tab は4スペース挿入（回帰テスト）', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\nhello\n```');
        });
        await page.waitForTimeout(200);

        await page.click('#editor pre code');
        await page.waitForTimeout(200);

        // helloの先頭にカーソル
        await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return;
            const firstText = code.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        const lines = await getCodeLines(page);
        expect(lines[0]).toBe('    hello');
    });

    test('単一行 Shift+Tab はデインデント（回帰テスト）', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\n    hello\n```');
        });
        await page.waitForTimeout(200);

        await page.click('#editor pre code');
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return;
            const firstText = code.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        const lines = await getCodeLines(page);
        expect(lines[0]).toBe('hello');
    });
});

test.describe('《引用ブロック》複数行選択 Tab/Shift+Tab', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('複数行選択 + Tab → 全選択行インデント', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('> line1\n> line2\n> line3');
        });
        await page.waitForTimeout(200);

        // 引用ブロックをクリック
        await page.click('#editor blockquote');
        await page.waitForTimeout(200);

        // 先頭にカーソル
        await page.evaluate(() => {
            const bq = document.querySelector('blockquote');
            if (!bq) return;
            const firstText = bq.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        // Shift+↓で2行選択
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        const lines = await getBlockquoteLines(page);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines[0]).toBe('    line1');
        expect(lines[1]).toBe('    line2');
    });

    test('複数行選択 + Shift+Tab → 全選択行デインデント', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('>     line1\n>     line2\n>     line3');
        });
        await page.waitForTimeout(200);

        await page.click('#editor blockquote');
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const bq = document.querySelector('blockquote');
            if (!bq) return;
            const firstText = bq.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        const lines = await getBlockquoteLines(page);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        // '>     line1' → blockquote内は '    line1' (4スペース) → Shift+Tab で全削除
        expect(lines[0]).toBe('line1');
        expect(lines[1]).toBe('line2');
    });

    test('Markdown出力で引用プレフィックスが維持されること', async ({ page }) => {
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('> line1\n> line2\n> line3');
        });
        await page.waitForTimeout(200);

        await page.click('#editor blockquote');
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            const bq = document.querySelector('blockquote');
            if (!bq) return;
            const firstText = bq.childNodes[0];
            if (firstText && firstText.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstText, 0);
                range.collapse(true);
                const sel = window.getSelection()!;
                sel.removeAllRanges();
                sel.addRange(range);
            }
        });
        await page.waitForTimeout(100);

        // 全行選択
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);
        await page.keyboard.press('Shift+ArrowDown');
        await page.waitForTimeout(100);

        await page.keyboard.press('Tab');
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        // 各行に > プレフィックスが維持されていること
        const mdLines = md.trim().split('\n');
        for (const line of mdLines) {
            expect(line.startsWith('>')).toBe(true);
        }
        // インデントが含まれていること（> の後にスペース+4スペースインデント）
        expect(mdLines[0]).toMatch(/^>\s+line1/);
    });
});
