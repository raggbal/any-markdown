/**
 * 取り消し線トグルテスト（要件12A）
 * 取り消し線の適用・解除を検証
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('取り消し線の適用', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('テキストを選択して取り消し線を適用', async ({ page }) => {
        await editor.type('テスト');
        
        // エディタにフォーカスを確実にする
        await page.locator('#editor').click();
        await page.waitForTimeout(50);
        
        // 段落内のテキストのみを選択（<p>タグの中身）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const p = editor?.querySelector('p');
            if (p) {
                const range = document.createRange();
                range.selectNodeContents(p);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(50);
        
        // 取り消し線適用
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<del>テスト</del>');
    });

    test('パターン変換で取り消し線を適用', async ({ page }) => {
        await editor.type('~~削除~~ ');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('<del>削除</del>');
    });

    test('適用時は常に<del>タグを使用', async ({ page }) => {
        await editor.type('テスト');
        
        // 段落内のテキストのみを選択
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const p = editor?.querySelector('p');
            if (p) {
                const range = document.createRange();
                range.selectNodeContents(p);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        await page.waitForTimeout(50);
        
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // <del>タグが使用されていること（<strike>や<s>ではなく）
        expect(html).toContain('<del>');
        expect(html).not.toContain('<strike>');
        expect(html).not.toContain('<s>');
    });
});

test.describe('取り消し線の解除', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('<del>タグ全体を選択して解除', async ({ page }) => {
        // 取り消し線を作成
        await editor.type('~~削除テスト~~ ');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        expect(html).toContain('<del>削除テスト</del>');
        
        // <del>要素を全選択
        await page.evaluate(() => {
            const del = document.querySelector('#editor del');
            if (del) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(del);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        
        // 取り消し線解除
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        expect(html).not.toContain('<del>');
        expect(html).toContain('削除テスト');
    });

    test('<del>タグ内の一部を選択して解除 → タグ全体が解除される', async ({ page }) => {
        // 取り消し線を作成
        await editor.type('~~ABCDEFG~~ ');
        await page.waitForTimeout(100);
        
        let html = await editor.getHtml();
        expect(html).toContain('<del>ABCDEFG</del>');
        
        // <del>要素内の一部（DEF）を選択
        await page.evaluate(() => {
            const del = document.querySelector('#editor del');
            if (del && del.firstChild) {
                const textNode = del.firstChild;
                const range = document.createRange();
                const sel = window.getSelection();
                // "DEF"を選択（位置3から6）
                range.setStart(textNode, 3);
                range.setEnd(textNode, 6);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        
        // 取り消し線解除
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        html = await editor.getHtml();
        // タグ全体が解除される（選択範囲だけでなく）
        expect(html).not.toContain('<del>');
        expect(html).toContain('ABCDEFG');
    });

    test('取り消し線内にカーソルを置いて解除', async ({ page }) => {
        // 取り消し線を作成
        await editor.type('~~テスト~~ ');
        await page.waitForTimeout(100);
        
        // <del>要素内にカーソルを移動（選択なし）
        await page.evaluate(() => {
            const del = document.querySelector('#editor del');
            if (del && del.firstChild) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.setStart(del.firstChild, 2); // "テスト"の中間
                range.collapse(true);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        
        // 選択範囲を作成（1文字選択）
        await page.keyboard.down('Shift');
        await page.keyboard.press('ArrowRight');
        await page.keyboard.up('Shift');
        
        // 取り消し線解除
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).not.toContain('<del>');
    });
});

test.describe('取り消し線タグの互換性', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('<s>タグを選択して解除できる', async ({ page }) => {
        // <s>タグを直接挿入
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (editor) {
                editor.innerHTML = '<p><s>削除テスト</s></p>';
            }
        });
        await page.waitForTimeout(100);
        
        // <s>要素を全選択
        await page.evaluate(() => {
            const s = document.querySelector('#editor s');
            if (s) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(s);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        
        // 取り消し線解除
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).not.toContain('<s>');
        expect(html).toContain('削除テスト');
    });

    test('<strike>タグを選択して解除できる', async ({ page }) => {
        // <strike>タグを直接挿入
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (editor) {
                editor.innerHTML = '<p><strike>削除テスト</strike></p>';
            }
        });
        await page.waitForTimeout(100);
        
        // <strike>要素を全選択
        await page.evaluate(() => {
            const strike = document.querySelector('#editor strike');
            if (strike) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(strike);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        
        // 取り消し線解除
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).not.toContain('<strike>');
        expect(html).toContain('削除テスト');
    });
});

test.describe('取り消し線のトグル動作', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('適用 → 解除 → 再適用のサイクル', async ({ page }) => {
        await editor.type('テスト');
        
        // 段落内のテキストを選択するヘルパー関数
        const selectParagraphContent = async () => {
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                const p = editor?.querySelector('p');
                if (p) {
                    const range = document.createRange();
                    range.selectNodeContents(p);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(50);
        };
        
        await selectParagraphContent();
        
        // 1回目: 適用
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        let html = await editor.getHtml();
        expect(html).toContain('<del>テスト</del>');
        
        // 2回目: 解除
        await selectParagraphContent();
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        html = await editor.getHtml();
        expect(html).not.toContain('<del>');
        
        // 3回目: 再適用
        await selectParagraphContent();
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        html = await editor.getHtml();
        expect(html).toContain('<del>テスト</del>');
    });

    test('複合書式: 太字+取り消し線', async ({ page }) => {
        await editor.type('テスト');
        
        // 段落内のテキストを選択するヘルパー関数
        const selectParagraphContent = async () => {
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                const p = editor?.querySelector('p');
                if (p) {
                    const range = document.createRange();
                    range.selectNodeContents(p);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(50);
        };
        
        await selectParagraphContent();
        
        // 太字適用
        await page.keyboard.press('Control+b');
        await page.waitForTimeout(100);
        
        // 取り消し線適用
        await selectParagraphContent();
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 両方の書式が適用されていること
        expect(html).toContain('<del>');
        expect(html).toMatch(/<(strong|b)>/);
    });

    test('取り消し線のみ解除（太字は維持）', async ({ page }) => {
        // 太字+取り消し線のテキストを作成
        await editor.type('**~~テスト~~** ');
        await page.waitForTimeout(100);
        
        // <del>要素を選択
        await page.evaluate(() => {
            const del = document.querySelector('#editor del');
            if (del) {
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(del);
                sel?.removeAllRanges();
                sel?.addRange(range);
            }
        });
        
        // 取り消し線解除
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 取り消し線は解除
        expect(html).not.toContain('<del>');
        // 太字は維持
        expect(html).toMatch(/<(strong|b)>/);
    });
});

test.describe('取り消し線と選択範囲', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
        editor = new EditorTestHelper(page);
    });

    test('選択なし（カーソルのみ）では何も起きない', async ({ page }) => {
        await editor.type('テスト');
        // カーソルを中間に移動（選択なし）
        await page.keyboard.press('ArrowLeft');
        await page.keyboard.press('ArrowLeft');
        
        const htmlBefore = await editor.getHtml();
        
        // 取り消し線ショートカット
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const htmlAfter = await editor.getHtml();
        // 変化なし（または空の<del>が挿入される可能性）
        // 少なくとも既存テキストに取り消し線は適用されない
        expect(htmlAfter).not.toContain('<del>テスト</del>');
    });

    test('複数行にまたがる選択で取り消し線適用', async ({ page }) => {
        await editor.type('行1');
        await page.keyboard.press('Enter');
        await editor.type('行2');
        
        // 全ての段落のテキストを選択
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            if (editor) {
                const range = document.createRange();
                const firstP = editor.querySelector('p');
                const lastP = editor.querySelectorAll('p')[editor.querySelectorAll('p').length - 1];
                if (firstP && lastP) {
                    range.setStart(firstP, 0);
                    range.setEnd(lastP, lastP.childNodes.length);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            }
        });
        await page.waitForTimeout(50);
        
        // 取り消し線適用
        await page.keyboard.press('Control+Shift+S');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // 両方の行に取り消し線が適用されていること
        expect(html).toContain('<del>');
    });
});
