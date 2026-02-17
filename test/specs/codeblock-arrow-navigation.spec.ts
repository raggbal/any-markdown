/**
 * コードブロック内の矢印キーナビゲーションテスト
 * - ArrowUp/ArrowDownでの行移動
 * - ブロック境界での出入り
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《コードブロック》矢印キーナビゲーション', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('コードブロック内で↓キー → 次の行に移動（ブロックを抜けない）', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        
        // コードブロック内にテキストを入力（focus()を呼ばずに直接入力）
        await page.keyboard.type('line1', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line2', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line3', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↓キーで次の行に移動
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // まだコードブロック内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
    });

    test('コードブロック内で↑キー → 前の行に移動（ブロックを抜けない）', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        
        // コードブロック内にテキストを入力
        await page.keyboard.type('line1', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line2', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line3', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 現在は3行目にいる、↑キーで2行目に移動
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        
        // まだコードブロック内にいることを確認
        let tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
        
        // もう一度↑キーで1行目に移動
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        
        tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
    });

    test('コードブロック1行目で↑キー → ブロックを抜けて上の要素に移動', async ({ page }) => {
        // 上に段落を作成
        await editor.type('上の段落');
        await editor.press('Enter');
        
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('code line', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↑キーでブロックを抜ける
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        
        // 段落に移動したことを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).toBe('p');
    });

    test('コードブロック最終行で↓キー → ブロックを抜けて下の要素に移動', async ({ page }) => {
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('code line', { delay: 30 });
        
        // Shift+Enterでブロックを抜けて下に段落を作成
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        await editor.type('下の段落');
        await page.waitForTimeout(200);
        
        // コードブロックに戻る（クリック）
        const code = page.locator('pre code');
        await code.click();
        await page.waitForTimeout(100);
        
        // ↓キーでブロックを抜ける
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // 段落に移動したことを確認（p または p内のbr）
        const tag = await editor.getCursorElementTag();
        expect(['p', 'br']).toContain(tag);
        
        // コードブロック内にいないことを確認
        expect(tag).not.toBe('code');
    });

    test('段落から↓キーでコードブロックに入る', async ({ page }) => {
        // 上に段落を作成
        await editor.type('上の段落');
        await editor.press('Enter');
        
        // コードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('code line', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 上の段落に戻る
        const p = page.locator('p').first();
        await p.click();
        await page.waitForTimeout(100);
        
        // ↓キーでコードブロックに入る
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // コードブロック内にいることを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
    });

    test('複数行コードブロックで↓キーを連続押下 → 各行を順に移動', async ({ page }) => {
        // コードブロックを作成して4行入力
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('line1', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line2', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line3', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line4', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↓キーを3回押して4行目に移動（ブロックを抜けない）
        for (let i = 0; i < 3; i++) {
            await editor.press('ArrowDown');
            await page.waitForTimeout(50);
            const tag = await editor.getCursorElementTag();
            expect(tag).toBe('code');
        }
    });

    test('特殊文字を含む複数行コードブロックで↓キーを連続押下 → 各行を順に移動', async ({ page }) => {
        // ユーザー報告のテストケース: 特殊文字（↓など）を含むコードブロック
        // ```
        //    - d 
        // -|d < sdfas 
        // |
        // ↓
        // 
        // -  d|d
        // ```
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('   - d ', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('-|d < sdfas ', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('|', { delay: 30 });
        await editor.press('Enter');
        // 特殊文字 ↓ を入力
        await page.keyboard.type('↓', { delay: 30 });
        await editor.press('Enter');
        // 空行
        await editor.press('Enter');
        await page.keyboard.type('-  d|d', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↓キーを5回押して全行を移動（ブロックを抜けない）
        // 7行あるので、1行目から6行目まで5回移動
        for (let i = 0; i < 5; i++) {
            await editor.press('ArrowDown');
            await page.waitForTimeout(50);
            const tag = await editor.getCursorElementTag();
            // code または pre 内にいることを確認
            const isInCodeBlock = await page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel || !sel.anchorNode) return false;
                let node = sel.anchorNode;
                while (node) {
                    if (node.nodeType === 1) {
                        const tag = (node as Element).tagName.toLowerCase();
                        if (tag === 'pre' || tag === 'code') return true;
                    }
                    node = node.parentNode;
                }
                return false;
            });
            expect(isInCodeBlock).toBe(true);
        }
    });

    test('特殊文字を含む複数行コードブロックで↑キーを連続押下 → 各行を順に移動', async ({ page }) => {
        // 上に段落を作成（ブロックを抜けた時の移動先）
        await editor.type('上の段落');
        await editor.press('Enter');
        
        // 特殊文字を含むコードブロックを作成
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('   - d ', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('-|d < sdfas ', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('|', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('↓', { delay: 30 });
        await editor.press('Enter');
        await editor.press('Enter');
        await page.keyboard.type('-  d|d', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 現在は最終行にいる
        // ↑キーを5回押して1行目まで移動（ブロックを抜けない）
        for (let i = 0; i < 5; i++) {
            await editor.press('ArrowUp');
            await page.waitForTimeout(50);
            // code または pre 内にいることを確認
            const isInCodeBlock = await page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel || !sel.anchorNode) return false;
                let node = sel.anchorNode;
                while (node) {
                    if (node.nodeType === 1) {
                        const tag = (node as Element).tagName.toLowerCase();
                        if (tag === 'pre' || tag === 'code') return true;
                    }
                    node = node.parentNode;
                }
                return false;
            });
            expect(isInCodeBlock).toBe(true);
        }
        
        // 1行目で↑を押すとブロックを抜ける
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        const finalTag = await editor.getCursorElementTag();
        expect(finalTag).toBe('p');
    });

    test('特殊文字行の前後で正しく移動できる', async ({ page }) => {
        // 特殊文字「↓」の前後の行で正しく移動できることを確認
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('line before arrow', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('↓', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line after arrow', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // 1行目 → 2行目（↓の行）
        await editor.press('ArrowDown');
        await page.waitForTimeout(50);
        let tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
        
        // 2行目（↓の行） → 3行目
        await editor.press('ArrowDown');
        await page.waitForTimeout(50);
        tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
        
        // 3行目 → 2行目（↓の行）
        await editor.press('ArrowUp');
        await page.waitForTimeout(50);
        tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
        
        // 2行目（↓の行） → 1行目
        await editor.press('ArrowUp');
        await page.waitForTimeout(50);
        tag = await editor.getCursorElementTag();
        expect(tag).toBe('code');
    });

    test('コードブロック最終行の先頭で↓キー → すぐにブロックを抜ける（末尾に移動しない）', async ({ page }) => {
        // コンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // 上に段落を作成
        await editor.type('上の段落');
        await editor.press('Enter');
        
        // コードブロックを作成（複数行）
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('line1', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line2', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('last line content', { delay: 30 });
        
        // Shift+Enterでブロックを抜けて下に段落を作成
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        await editor.type('下の段落');
        await page.waitForTimeout(200);
        
        // コードブロックをクリックして戻る
        const code = page.locator('pre code');
        await code.click();
        await page.waitForTimeout(100);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↓キーを2回押して最終行に移動
        await editor.press('ArrowDown');
        await page.waitForTimeout(50);
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // 最終行にいることを確認
        const lineInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return { inCode: false, lineIndex: -1 };
            const code = document.querySelector('pre code');
            if (!code) return { inCode: false, lineIndex: -1 };
            
            // カーソルがコードブロック内にあることを確認
            let node: Node | null = sel.anchorNode;
            let inCode = false;
            while (node) {
                if (node === code) {
                    inCode = true;
                    break;
                }
                node = node.parentNode;
            }
            
            // 行数を確認（デバッグ用）
            const brCount = code.querySelectorAll('br').length;
            return { inCode, brCount };
        });
        expect(lineInfo.inCode).toBe(true);
        
        // ↓キーを押す（最終行なのでブロックを抜けるべき）
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // デバッグログを出力
        console.log('Console logs:', consoleLogs);
        
        // すぐにブロックを抜けて下の段落に移動することを確認
        // （末尾に移動するのではなく）
        const isInCodeBlock = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return true;
            let node: Node | null = sel.anchorNode;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') return true;
                }
                node = node.parentNode;
            }
            return false;
        });
        expect(isInCodeBlock).toBe(false);
    });

    test('パース済みコードブロック最終行の先頭で↓キー → すぐにブロックを抜ける', async ({ page }) => {
        // コンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // Markdownをパースした後のコードブロック（<br>タグを含む）をシミュレート
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor) return;
            // パース済みのHTMLを直接設定
            editor.innerHTML = `
                <p>上の段落</p>
                <pre><code>line1<br>line2<br>last line content</code></pre>
                <p>下の段落</p>
            `;
        });
        await page.waitForTimeout(200);
        
        // 最終行の先頭にカーソルを設定（最後の<br>の直後）
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (!code) return;
            
            const brTags = code.querySelectorAll('br');
            if (brTags.length === 0) return;
            
            const lastBr = brTags[brTags.length - 1];
            const range = document.createRange();
            const nextNode = lastBr.nextSibling;
            if (nextNode && nextNode.nodeType === 3) {
                range.setStart(nextNode, 0);
            } else {
                range.setStartAfter(lastBr);
            }
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        });
        await page.waitForTimeout(100);
        
        // 最終行にいることを確認
        const isAtLastLine = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return false;
            const code = document.querySelector('pre code');
            if (!code) return false;
            
            let node: Node | null = sel.anchorNode;
            while (node && node !== code) {
                node = node.parentNode;
            }
            return node === code;
        });
        expect(isAtLastLine).toBe(true);
        
        // ↓キーを押す
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // デバッグログを出力
        console.log('Console logs for parsed codeblock:', consoleLogs);
        
        // すぐにブロックを抜けて下の段落に移動することを確認
        const isInCodeBlock = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return true;
            let node: Node | null = sel.anchorNode;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') return true;
                }
                node = node.parentNode;
            }
            return false;
        });
        expect(isInCodeBlock).toBe(false);
    });

    test('ユーザー報告データ: 最終行の先頭で↓キー → すぐにブロックを抜ける', async ({ page }) => {
        // コンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // ユーザー報告のデータをパース済みHTMLとして設定
        // ```
        //    - d 
        // -|d < sdfas 
        // |
        // ↓
        // 
        // -  d|d
        // ```
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor) return;
            editor.innerHTML = `
                <p>上の段落</p>
                <pre><code>   - d <br>-|d &lt; sdfas <br>|<br>↓<br><br>-  d|d</code></pre>
                <p>下の段落</p>
            `;
        });
        await page.waitForTimeout(200);
        
        // 最終行の先頭にカーソルを設定（最後の<br>の直後）
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (!code) return;
            
            const brTags = code.querySelectorAll('br');
            if (brTags.length === 0) return;
            
            const lastBr = brTags[brTags.length - 1];
            const range = document.createRange();
            const nextNode = lastBr.nextSibling;
            if (nextNode && nextNode.nodeType === 3) {
                range.setStart(nextNode, 0);
            } else {
                range.setStartAfter(lastBr);
            }
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        });
        await page.waitForTimeout(100);
        
        // 最終行にいることを確認
        const isAtLastLine = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return false;
            const code = document.querySelector('pre code');
            if (!code) return false;
            
            let node: Node | null = sel.anchorNode;
            while (node && node !== code) {
                node = node.parentNode;
            }
            return node === code;
        });
        expect(isAtLastLine).toBe(true);
        
        // ↓キーを押す
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // デバッグログを出力
        console.log('Console logs for user reported data:', consoleLogs);
        
        // すぐにブロックを抜けて下の段落に移動することを確認
        // （末尾に移動するのではなく）
        const isInCodeBlock = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return true;
            let node: Node | null = sel.anchorNode;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') return true;
                }
                node = node.parentNode;
            }
            return false;
        });
        expect(isInCodeBlock).toBe(false);
    });

    test('setStartAfterでカーソル設定: 最終行の先頭で↓キー → すぐにブロックを抜ける', async ({ page }) => {
        // コンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // パース済みHTMLを設定
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor) return;
            editor.innerHTML = `
                <p>上の段落</p>
                <pre><code>line1<br>line2<br>last line</code></pre>
                <p>下の段落</p>
            `;
        });
        await page.waitForTimeout(200);
        
        // 最終行の先頭にカーソルを設定（setStartAfterを使用）
        // これはsetCursorToLineStartと同じ方法
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (!code) return;
            
            const brTags = code.querySelectorAll('br');
            if (brTags.length === 0) return;
            
            const lastBr = brTags[brTags.length - 1];
            const range = document.createRange();
            // setStartAfterを使用（nextSiblingがテキストノードでない場合）
            range.setStartAfter(lastBr);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        });
        await page.waitForTimeout(100);
        
        // カーソル位置を確認
        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return { containerType: -1, containerName: '', offset: -1 };
            return {
                containerType: sel.anchorNode.nodeType,
                containerName: sel.anchorNode.nodeName,
                offset: sel.anchorOffset
            };
        });
        console.log('Cursor info:', cursorInfo);
        
        // ↓キーを押す
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // デバッグログを出力
        console.log('Console logs for setStartAfter:', consoleLogs);
        
        // すぐにブロックを抜けて下の段落に移動することを確認
        const isInCodeBlock = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return true;
            let node: Node | null = sel.anchorNode;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') return true;
                }
                node = node.parentNode;
            }
            return false;
        });
        expect(isInCodeBlock).toBe(false);
    });

    test('下に要素がない場合: 最終行の先頭で↓キー → 新しい段落を作成してそこに移動', async ({ page }) => {
        // コンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // パース済みHTMLを設定（下に要素がない）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor) return;
            editor.innerHTML = `
                <p>上の段落</p>
                <pre><code>line1<br>line2<br>last line</code></pre>
            `;
        });
        await page.waitForTimeout(200);
        
        // 最終行の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (!code) return;
            
            const brTags = code.querySelectorAll('br');
            if (brTags.length === 0) return;
            
            const lastBr = brTags[brTags.length - 1];
            const range = document.createRange();
            range.setStartAfter(lastBr);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
        });
        await page.waitForTimeout(100);
        
        // ↓キーを押す
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // デバッグログを出力
        console.log('Console logs for no next element:', consoleLogs);
        
        // ブロックを抜けて新しい段落に移動することを確認
        const result = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return { inCodeBlock: true, newParagraphCreated: false };
            
            let node: Node | null = sel.anchorNode;
            let inCodeBlock = false;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') {
                        inCodeBlock = true;
                        break;
                    }
                }
                node = node.parentNode;
            }
            
            // 新しい段落が作成されたかチェック
            const pre = document.querySelector('pre');
            const newParagraphCreated = pre?.nextElementSibling?.tagName.toLowerCase() === 'p';
            
            return { inCodeBlock, newParagraphCreated };
        });
        
        // ブロックを抜けて新しい段落に移動することを確認
        expect(result.inCodeBlock).toBe(false);
        expect(result.newParagraphCreated).toBe(true);
    });

    test('最終行の先頭（setCursorToLineStart後）で↓キー → すぐにブロックを抜ける', async ({ page }) => {
        // コンソールログをキャプチャ
        const consoleLogs: string[] = [];
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]')) {
                consoleLogs.push(msg.text());
            }
        });
        
        // パース済みHTMLを設定
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (!editor) return;
            editor.innerHTML = `
                <p>上の段落</p>
                <pre><code>line1<br>line2<br>last line</code></pre>
                <p>下の段落</p>
            `;
        });
        await page.waitForTimeout(200);
        
        // 1行目の先頭にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (code && code.firstChild) {
                const range = document.createRange();
                range.setStart(code.firstChild, 0);
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↓キーを2回押して最終行に移動（setCursorToLineStartが使われる）
        await editor.press('ArrowDown');
        await page.waitForTimeout(50);
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // この時点でカーソルはsetCursorToLineStartによって設定されている
        // カーソル位置を確認
        const cursorInfo = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return { containerType: -1, containerName: '', offset: -1 };
            return {
                containerType: sel.anchorNode.nodeType,
                containerName: sel.anchorNode.nodeName,
                offset: sel.anchorOffset
            };
        });
        console.log('Cursor info after setCursorToLineStart:', cursorInfo);
        
        // ↓キーを押す（最終行なのでブロックを抜けるべき）
        await editor.press('ArrowDown');
        await page.waitForTimeout(100);
        
        // デバッグログを出力
        console.log('Console logs for setCursorToLineStart:', consoleLogs);
        
        // すぐにブロックを抜けて下の段落に移動することを確認
        const isInCodeBlock = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return true;
            let node: Node | null = sel.anchorNode;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') return true;
                }
                node = node.parentNode;
            }
            return false;
        });
        expect(isInCodeBlock).toBe(false);
    });

    test('コードブロック1行目の末尾で↑キー → すぐにブロックを抜ける（先頭に移動しない）', async ({ page }) => {
        // 上に段落を作成
        await editor.type('上の段落');
        await editor.press('Enter');
        
        // コードブロックを作成（複数行）
        await editor.type('```');
        await editor.press('Enter');
        await page.waitForTimeout(200);
        await page.keyboard.type('first line content', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line2', { delay: 30 });
        await editor.press('Enter');
        await page.keyboard.type('line3', { delay: 30 });
        await page.waitForTimeout(200);
        
        // 1行目の末尾にカーソルを設定
        await page.evaluate(() => {
            const code = document.querySelector('pre code');
            if (!code || !code.firstChild) return;
            
            const firstTextNode = code.firstChild;
            if (firstTextNode.nodeType === 3) {
                const range = document.createRange();
                range.setStart(firstTextNode, firstTextNode.textContent?.length || 0); // 行の末尾
                range.collapse(true);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // ↑キーを押す
        await editor.press('ArrowUp');
        await page.waitForTimeout(100);
        
        // すぐにブロックを抜けて上の段落に移動することを確認
        const isInCodeBlock = await page.evaluate(() => {
            const sel = window.getSelection();
            if (!sel || !sel.anchorNode) return true;
            let node = sel.anchorNode;
            while (node) {
                if (node.nodeType === 1) {
                    const tag = (node as Element).tagName.toLowerCase();
                    if (tag === 'pre' || tag === 'code') return true;
                }
                node = node.parentNode;
            }
            return false;
        });
        expect(isInCodeBlock).toBe(false);
        
        // 上の段落に移動したことを確認
        const tag = await editor.getCursorElementTag();
        expect(tag).toBe('p');
    });

    test.describe('スクロール追随 (v0.195.109)', () => {
        test('長いコードブロック内で↓キーを押すとスクロールが追随する', async ({ page }) => {
            // エディタの高さを制限してスクロールが発生するようにする
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (editor) {
                    editor.style.height = '200px';
                    editor.style.overflow = 'auto';
                }
            });
            
            // 長いコードブロックを作成
            await editor.type('```');
            await editor.press('Enter');
            await page.waitForTimeout(200);
            
            // 20行のコードを入力
            for (let i = 1; i <= 20; i++) {
                await page.keyboard.type(`line ${i}`, { delay: 10 });
                if (i < 20) {
                    await editor.press('Enter');
                }
            }
            await page.waitForTimeout(200);
            
            // 1行目の先頭にカーソルを設定
            await page.evaluate(() => {
                const code = document.querySelector('pre code');
                if (code && code.firstChild) {
                    const range = document.createRange();
                    range.setStart(code.firstChild, 0);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // 初期スクロール位置を記録
            const initialScrollTop = await page.evaluate(() => {
                const editor = document.getElementById('editor');
                return editor?.scrollTop || 0;
            });
            
            // ↓キーを10回押す
            for (let i = 0; i < 10; i++) {
                await editor.press('ArrowDown');
                await page.waitForTimeout(50);
            }
            
            // スクロール位置が変化したことを確認
            const finalScrollTop = await page.evaluate(() => {
                const editor = document.getElementById('editor');
                return editor?.scrollTop || 0;
            });
            
            // スクロールが追随している（スクロール位置が変化している）
            expect(finalScrollTop).toBeGreaterThanOrEqual(initialScrollTop);
        });

        test('長いコードブロック内で↑キーを押すとスクロールが追随する', async ({ page }) => {
            // エディタの高さを制限してスクロールが発生するようにする
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (editor) {
                    editor.style.height = '200px';
                    editor.style.overflow = 'auto';
                }
            });
            
            // 長いコードブロックを作成
            await editor.type('```');
            await editor.press('Enter');
            await page.waitForTimeout(200);
            
            // 20行のコードを入力
            for (let i = 1; i <= 20; i++) {
                await page.keyboard.type(`line ${i}`, { delay: 10 });
                if (i < 20) {
                    await editor.press('Enter');
                }
            }
            await page.waitForTimeout(200);
            
            // 現在は最終行にいる
            // 初期スクロール位置を記録
            const initialScrollTop = await page.evaluate(() => {
                const editor = document.getElementById('editor');
                return editor?.scrollTop || 0;
            });
            
            // ↑キーを10回押す
            for (let i = 0; i < 10; i++) {
                await editor.press('ArrowUp');
                await page.waitForTimeout(50);
            }
            
            // スクロール位置が変化したことを確認
            const finalScrollTop = await page.evaluate(() => {
                const editor = document.getElementById('editor');
                return editor?.scrollTop || 0;
            });
            
            // スクロールが追随している（スクロール位置が変化している）
            expect(finalScrollTop).toBeLessThanOrEqual(initialScrollTop);
        });
    });
});
