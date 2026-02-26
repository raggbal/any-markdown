/**
 * コードブロック内のShift+Tab（デインデント）テスト
 * - Enter後にShift+Tabでデインデントが動作すること
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

test.describe('《コードブロック》Shift+Tab デインデント', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('setMarkdownで設定した後Enter→Shift+Tabでデインデントが動作する', async ({ page }) => {
        // setMarkdownで設定したコードブロック
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('```\na\n    b\n    c\n```');
        });
        await page.waitForTimeout(200);

        // コードブロックをクリックして編集モードに入る
        await page.click('#editor pre code');
        await page.waitForTimeout(200);

        // "c" の末尾にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return;
            for (let i = 0; i < code.childNodes.length; i++) {
                const child = code.childNodes[i];
                if (child.nodeType === 3 && child.textContent?.trimStart() === 'c') {
                    const range = document.createRange();
                    range.setStart(child, child.textContent!.length);
                    range.collapse(true);
                    const sel = window.getSelection()!;
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return;
                }
            }
        });
        await page.waitForTimeout(100);

        // cの末尾でEnterを押す
        await editor.press('Enter');
        await page.waitForTimeout(200);

        // cの先頭に移動: ArrowUp + Home
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(100);
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // Shift+Tab
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        // 確認
        const lines = await getCodeLines(page);
        const cLine = lines.find(l => l.trimStart().startsWith('c'));
        expect(cLine).toBeDefined();
        expect(cLine!.startsWith('    ')).toBe(false);
        expect(cLine!.trimStart()).toBe('c');
    });

    test('Enter後にShift+Tabでデインデントが動作する（タイプ入力）', async ({ page }) => {
        // コードブロックを作成してインデント付き行を入力
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);

        await page.keyboard.type('a', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);
        await page.keyboard.type('b', { delay: 30 });
        await editor.press('Enter');
        // c gets auto-indented from Enter's indent preservation
        await page.keyboard.type('c', { delay: 30 });
        await page.waitForTimeout(200);

        // Enter at end of c
        await editor.press('Enter');
        await page.waitForTimeout(200);

        // Move to c line: ArrowUp + Home
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(100);
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        // Shift+Tab
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        // Verify
        const lines = await getCodeLines(page);
        const cLine = lines.find(l => l.trimStart().startsWith('c'));
        expect(cLine).toBeDefined();
        expect(cLine!.startsWith('    ')).toBe(false);
        expect(cLine!.trimStart()).toBe('c');
    });

    test('カーソルがElement nodeにある場合でもShift+Tabが動作する', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);

        await page.keyboard.type('a', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);
        await page.keyboard.type('b', { delay: 30 });
        await page.waitForTimeout(200);

        // カーソルを強制的にElement nodeに設定（BRの後、テキストノードの前）
        const positioned = await page.evaluate(() => {
            const code = document.querySelector('pre[data-mode="edit"] code');
            if (!code) return false;
            // "    b" のテキストノードのインデックスを探す
            for (let i = 0; i < code.childNodes.length; i++) {
                const child = code.childNodes[i];
                if (child.nodeType === 3 && child.textContent?.trimStart() === 'b') {
                    // カーソルをcode要素のoffset=iに設定（Element node cursor）
                    const range = document.createRange();
                    range.setStart(code, i);
                    range.collapse(true);
                    const sel = window.getSelection()!;
                    sel.removeAllRanges();
                    sel.addRange(range);
                    return true;
                }
            }
            return false;
        });
        expect(positioned).toBe(true);

        // Shift+Tab
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        // Verify
        const lines = await getCodeLines(page);
        const bLine = lines.find(l => l.trimStart().startsWith('b'));
        expect(bLine).toBeDefined();
        expect(bLine!.startsWith('    ')).toBe(false);
    });

    test('Enter前でもShift+Tabでデインデントが動作する', async ({ page }) => {
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);

        await page.keyboard.type('a', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.press('Tab');
        await page.waitForTimeout(50);
        await page.keyboard.type('b', { delay: 30 });
        await page.waitForTimeout(200);

        await page.keyboard.press('Home');
        await page.waitForTimeout(100);

        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        const lines = await getCodeLines(page);
        const bLine = lines.find(l => l.trimStart().startsWith('b'));
        expect(bLine).toBeDefined();
        expect(bLine!.startsWith('    ')).toBe(false);
    });
});
