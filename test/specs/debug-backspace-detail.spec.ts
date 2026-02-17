/**
 * Backspace詳細デバッグテスト
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('Backspaceデバッグ', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
        
        // コンソールログをキャプチャ
        page.on('console', msg => {
            if (msg.text().includes('[')) {
                console.log('BROWSER:', msg.text());
            }
        });
    });

    test('バグ再現: - - | になるケース', async ({ page }) => {
        // ユーザー報告のケース
        // - 
        //   - 
        //     - 
        //   - |    ← カーソル位置
        //     - 
        
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li><br><ul><li><br><ul><li><br></li></ul></li><li><br><ul><li><br></li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 4番目のli（2番目のネストの2番目の項目）にカーソルを設定
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const allLis = editor.querySelectorAll('li');
            console.log('Total lis:', allLis.length);
            for (let i = 0; i < allLis.length; i++) {
                console.log(`li[${i}]:`, allLis[i].innerHTML.substring(0, 50));
            }
            const targetLi = allLis[3];
            if (targetLi) {
                const range = document.createRange();
                range.selectNodeContents(targetLi);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        // 各Backspace後の状態をログ
        for (let i = 1; i <= 5; i++) {
            console.log(`\n=== Backspace ${i} ===`);
            
            // Backspace前の状態を確認
            const beforeState = await page.evaluate(() => {
                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                let container = range?.startContainer;
                
                // 親要素を探す
                let parentP = null;
                let parentLi = null;
                let node = container;
                while (node && node.id !== 'editor') {
                    if (node.tagName === 'P') parentP = node;
                    if (node.tagName === 'LI') parentLi = node;
                    node = node.parentNode;
                }
                
                return {
                    inParagraph: !!parentP,
                    inLi: !!parentLi,
                    containerName: container?.nodeName,
                    offset: range?.startOffset
                };
            });
            console.log('Before:', beforeState);
            
            await editor.press('Backspace');
            await page.waitForTimeout(100);
            
            const state = await page.evaluate(() => {
                const editor = document.getElementById('editor');
                const sel = window.getSelection();
                const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
                
                return {
                    html: editor.innerHTML,
                    cursorNode: range?.startContainer?.nodeName,
                    cursorOffset: range?.startOffset,
                    cursorParent: range?.startContainer?.parentNode?.nodeName,
                    cursorText: range?.startContainer?.textContent?.substring(0, 20)
                };
            });
            
            console.log('HTML:', state.html);
            console.log('Cursor:', state.cursorNode, 'offset:', state.cursorOffset);
            console.log('Parent:', state.cursorParent);
            
            // 壊れたliがないかチェック
            const hasBroken = await page.evaluate(() => {
                const lis = document.querySelectorAll('#editor li');
                for (const li of lis) {
                    for (const child of li.childNodes) {
                        if (child.nodeType === 3 && child.textContent.includes('- ')) {
                            return { broken: true, text: child.textContent };
                        }
                    }
                }
                return { broken: false };
            });
            
            if (hasBroken.broken) {
                console.log('!!! BROKEN LI FOUND:', hasBroken.text);
            }
        }
    });

    test('2つ上に移動するケース調査', async ({ page }) => {
        // li内に段落がある構造
        // - parent
        //   - child1
        //   - child2
        //     |  ← 空の段落
        //     - grandchild
        
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            editor.innerHTML = '<ul><li>parent<ul><li>child1</li><li>child2<p><br></p><ul><li>grandchild</li></ul></li></ul></li></ul>';
        });
        await page.waitForTimeout(100);
        
        // 空の段落にカーソルを設定
        await page.evaluate(() => {
            const p = document.querySelector('p');
            if (p) {
                const range = document.createRange();
                range.selectNodeContents(p);
                range.collapse(true);
                window.getSelection().removeAllRanges();
                window.getSelection().addRange(range);
            }
        });
        await page.waitForTimeout(100);
        
        console.log('\n=== Before Backspace ===');
        let state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const sel = window.getSelection();
            const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            return {
                html: editor.innerHTML,
                cursorNode: range?.startContainer?.nodeName,
                cursorParent: range?.startContainer?.parentNode?.nodeName
            };
        });
        console.log('HTML:', state.html);
        console.log('Cursor in:', state.cursorNode, 'parent:', state.cursorParent);
        
        await editor.press('Backspace');
        await page.waitForTimeout(100);
        
        console.log('\n=== After Backspace ===');
        state = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const sel = window.getSelection();
            const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            
            // カーソルがどのliにあるか
            let cursorLi = range?.startContainer;
            while (cursorLi && cursorLi.tagName !== 'LI') {
                cursorLi = cursorLi.parentNode;
            }
            
            return {
                html: editor.innerHTML,
                cursorNode: range?.startContainer?.nodeName,
                cursorParent: range?.startContainer?.parentNode?.nodeName,
                cursorLiText: cursorLi?.textContent?.substring(0, 30)
            };
        });
        console.log('HTML:', state.html);
        console.log('Cursor in:', state.cursorNode, 'parent:', state.cursorParent);
        console.log('Cursor li text:', state.cursorLiText);
        
        // 期待: カーソルは "child2" の末尾にあるべき
        expect(state.cursorLiText).toContain('child2');
    });
});
