/**
 * コードブロック編集機能テスト
 * - 先頭空白行の保持
 * - Enter時のインデント維持
 * - Shift+矢印キーでの範囲選択
 * - Backspaceでコードブロックに合流
 * - 連続コードブロック間のナビゲーション
 * - 言語セレクターのフロート表示
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《コードブロック》編集機能', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test.describe('先頭空白行の保持 (v0.195.94)', () => {
        test('先頭に空白行があるMarkdownがソースモード切り替え後も保持される', async ({ page }) => {
            const result = await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                // 先頭に空白行があるMarkdown
                const originalMd = '\\n\\n# Title\\n\\nContent';
                testApi.setMarkdown(originalMd);
                
                // Markdownを取得
                const resultMd = testApi.getMarkdown();
                
                return {
                    originalMd,
                    resultMd,
                    startsWithNewline: resultMd.startsWith('\\n')
                };
            });
            
            // 先頭の空白行が保持されている
            expect(result.startsWithNewline).toBe(true);
        });

        test('先頭に複数の空白行があるMarkdownが保持される', async ({ page }) => {
            const result = await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                // 先頭に3つの空白行があるMarkdown
                const originalMd = '\\n\\n\\n# Title';
                testApi.setMarkdown(originalMd);
                
                const resultMd = testApi.getMarkdown();
                
                // 先頭の改行数をカウント
                const leadingNewlines = (resultMd.match(/^\\n+/) || [''])[0].length;
                
                return {
                    leadingNewlines
                };
            });
            
            // 先頭の空白行が保持されている（少なくとも1つ以上）
            expect(result.leadingNewlines).toBeGreaterThanOrEqual(1);
        });
    });

    test.describe('Enter時のインデント維持 (v0.195.95)', () => {
        test('コードブロック内でインデントされた行でEnterを押すとインデントが維持される', async ({ page }) => {
            // コードブロックをMarkdownで直接設定（インデントされた行を含む）
            await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                testApi.setMarkdown('```javascript\nfunction test() {\n    const x = 1;\n```');
            });
            await page.waitForTimeout(200);
            
            // コードブロック内をクリックしてフォーカス
            await page.click('#editor pre code');
            await page.waitForTimeout(100);
            
            // カーソルを最後の行の末尾に移動
            await page.keyboard.press('End');
            await page.waitForTimeout(100);
            
            // Enterを押す
            await editor.press('Enter');
            await page.waitForTimeout(100);
            
            // 新しい行にインデントが維持されているか確認
            const result = await page.evaluate(() => {
                const code = document.querySelector('pre code');
                if (!code) return { hasIndent: false };
                
                // カーソル位置の前のテキストを取得
                const sel = window.getSelection();
                if (!sel || !sel.anchorNode) return { hasIndent: false };
                
                // コードの内容を取得
                const content = code.textContent || '';
                const lines = content.split('\n');
                
                // 最後の行（カーソルがある行）のインデントを確認
                const lastLine = lines[lines.length - 1];
                const hasIndent = lastLine.startsWith('    ');
                
                return { hasIndent, lastLine, lineCount: lines.length };
            });
            
            expect(result.hasIndent).toBe(true);
        });

        test('タブインデントもEnter時に維持される', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```');
            await editor.press('Enter');
            await page.waitForTimeout(200);
            
            // タブでインデントされた行を入力
            await page.keyboard.type('\\tindented line', { delay: 30 });
            await page.waitForTimeout(100);
            
            // Enterを押す
            await editor.press('Enter');
            await page.waitForTimeout(100);
            
            // 新しい行にタブインデントが維持されているか確認
            const result = await page.evaluate(() => {
                const code = document.querySelector('pre code');
                if (!code) return { hasTabIndent: false };
                
                const content = code.textContent || '';
                const lines = content.split('\\n');
                const lastLine = lines[lines.length - 1];
                
                return { 
                    hasTabIndent: lastLine.startsWith('\\t'),
                    lastLine 
                };
            });
            
            expect(result.hasTabIndent).toBe(true);
        });
    });

    test.describe('Shift+矢印キーでの範囲選択 (v0.195.96)', () => {
        test('コードブロック内でShift+↓で範囲選択ができる', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```');
            await editor.press('Enter');
            await page.waitForTimeout(200);
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
            
            // Shift+↓で範囲選択
            await editor.shiftPress('ArrowDown');
            await page.waitForTimeout(100);
            
            // 選択範囲があることを確認
            const result = await page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel) return { hasSelection: false, selectedText: '' };
                
                return {
                    hasSelection: !sel.isCollapsed,
                    selectedText: sel.toString()
                };
            });
            
            expect(result.hasSelection).toBe(true);
            expect(result.selectedText.length).toBeGreaterThan(0);
        });

        test('コードブロック内でShift+↑で範囲選択ができる', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```');
            await editor.press('Enter');
            await page.waitForTimeout(200);
            await page.keyboard.type('line1', { delay: 30 });
            await editor.press('Enter');
            await page.keyboard.type('line2', { delay: 30 });
            await editor.press('Enter');
            await page.keyboard.type('line3', { delay: 30 });
            await page.waitForTimeout(200);
            
            // 現在は最終行にいる
            // Shift+↑で範囲選択
            await editor.shiftPress('ArrowUp');
            await page.waitForTimeout(100);
            
            // 選択範囲があることを確認
            const result = await page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel) return { hasSelection: false, selectedText: '' };
                
                return {
                    hasSelection: !sel.isCollapsed,
                    selectedText: sel.toString()
                };
            });
            
            expect(result.hasSelection).toBe(true);
            expect(result.selectedText.length).toBeGreaterThan(0);
        });

        test('引用ブロック内でShift+↓で範囲選択ができる', async ({ page }) => {
            // 引用ブロックを作成
            await editor.type('> ');
            await page.waitForTimeout(200);
            await page.keyboard.type('line1', { delay: 30 });
            await editor.press('Enter');
            await page.keyboard.type('line2', { delay: 30 });
            await editor.press('Enter');
            await page.keyboard.type('line3', { delay: 30 });
            await page.waitForTimeout(200);
            
            // 1行目の先頭にカーソルを設定
            await page.evaluate(() => {
                const blockquote = document.querySelector('blockquote');
                if (blockquote && blockquote.firstChild) {
                    const range = document.createRange();
                    range.setStart(blockquote.firstChild, 0);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // Shift+↓で範囲選択
            await editor.shiftPress('ArrowDown');
            await page.waitForTimeout(100);
            
            // 選択範囲があることを確認
            const result = await page.evaluate(() => {
                const sel = window.getSelection();
                if (!sel) return { hasSelection: false };
                
                return {
                    hasSelection: !sel.isCollapsed
                };
            });
            
            expect(result.hasSelection).toBe(true);
        });
    });

    test.describe('Backspaceでコードブロックに合流 (v0.195.90)', () => {
        test('コードブロック直下の空の段落でBackspaceを押すとコードブロックに入る', async ({ page }) => {
            // パース済みHTMLを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                    <p><br></p>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 空の段落にカーソルを設定
            await page.evaluate(() => {
                const p = document.querySelector('#editor p');
                if (p) {
                    const range = document.createRange();
                    range.selectNodeContents(p);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // Backspaceを押す
            await editor.press('Backspace');
            await page.waitForTimeout(200);
            
            // 段落が削除され、コードブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const paragraphs = document.querySelectorAll('#editor p');
                const pre = document.querySelector('#editor pre');
                
                return {
                    paragraphCount: paragraphs.length,
                    preMode: pre?.getAttribute('data-mode')
                };
            });
            
            // 空の段落が削除されている
            expect(result.paragraphCount).toBe(0);
            // コードブロックが編集モードになっている
            expect(result.preMode).toBe('edit');
        });

        test('コードブロック直下の内容がある段落でBackspaceを押すと内容がコードブロックに追加される', async ({ page }) => {
            // パース済みHTMLを設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                    <p>追加テキスト</p>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 段落の先頭にカーソルを設定
            await page.evaluate(() => {
                const p = document.querySelector('#editor p');
                if (p && p.firstChild) {
                    const range = document.createRange();
                    range.setStart(p.firstChild, 0);
                    range.collapse(true);
                    const sel = window.getSelection();
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // Backspaceを押す
            await editor.press('Backspace');
            await page.waitForTimeout(200);
            
            // 段落の内容がコードブロックに追加されていることを確認
            const result = await page.evaluate(() => {
                const paragraphs = document.querySelectorAll('#editor p');
                const code = document.querySelector('#editor pre code');
                
                return {
                    paragraphCount: paragraphs.length,
                    codeContent: code?.textContent || ''
                };
            });
            
            // 段落が削除されている
            expect(result.paragraphCount).toBe(0);
            // コードブロックに内容が追加されている
            expect(result.codeContent).toContain('追加テキスト');
        });
    });

    test.describe('連続コードブロック間のナビゲーション (v0.195.92)', () => {
        test('上のコードブロックの最終行で↓を押すと下のコードブロックに入る', async ({ page }) => {
            // パース済みHTMLを設定（連続するコードブロック）
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                    <pre data-lang="python" data-mode="display"><code>y = 2</code></pre>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 上のコードブロックをクリックして編集モードに
            const firstPre = page.locator('pre').first();
            await firstPre.locator('code').click();
            await page.waitForTimeout(100);
            
            // ↓キーを押す
            await editor.press('ArrowDown');
            await page.waitForTimeout(200);
            
            // 下のコードブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const pres = document.querySelectorAll('#editor pre');
                return {
                    firstPreMode: pres[0]?.getAttribute('data-mode'),
                    secondPreMode: pres[1]?.getAttribute('data-mode')
                };
            });
            
            // 上のコードブロックは描画モードに戻っている
            expect(result.firstPreMode).toBe('display');
            // 下のコードブロックは編集モードになっている
            expect(result.secondPreMode).toBe('edit');
        });

        test('下のコードブロックの先頭行で↑を押すと上のコードブロックに入る', async ({ page }) => {
            // パース済みHTMLを設定（連続するコードブロック）
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="display"><code>const x = 1;</code></pre>
                    <pre data-lang="python" data-mode="display"><code>y = 2</code></pre>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 下のコードブロックをクリックして編集モードに
            const secondPre = page.locator('pre').nth(1);
            await secondPre.locator('code').click();
            await page.waitForTimeout(100);
            
            // ↑キーを押す
            await editor.press('ArrowUp');
            await page.waitForTimeout(200);
            
            // 上のコードブロックが編集モードになっていることを確認
            const result = await page.evaluate(() => {
                const pres = document.querySelectorAll('#editor pre');
                return {
                    firstPreMode: pres[0]?.getAttribute('data-mode'),
                    secondPreMode: pres[1]?.getAttribute('data-mode')
                };
            });
            
            // 上のコードブロックは編集モードになっている
            expect(result.firstPreMode).toBe('edit');
            // 下のコードブロックは描画モードに戻っている
            expect(result.secondPreMode).toBe('display');
        });
    });

    test.describe('言語セレクターのフロート表示 (v0.195.93)', () => {
        test('言語セレクターがコードブロックの外にフロート表示される', async ({ page }) => {
            // コードブロックをMarkdownで直接設定
            await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                testApi.setMarkdown('```javascript\ncode\n```');
            });
            await page.waitForTimeout(500);
            
            // 言語タグをクリック
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(300);
            
            // 言語セレクターがbodyの直下にあることを確認
            const result = await page.evaluate(() => {
                const selector = document.querySelector('.lang-selector');
                if (!selector) return { exists: false, parentTag: '' };
                
                const computedStyle = window.getComputedStyle(selector);
                return {
                    exists: true,
                    parentTag: selector.parentElement?.tagName.toLowerCase() || '',
                    position: computedStyle.position
                };
            });
            
            expect(result.exists).toBe(true);
            expect(result.parentTag).toBe('body');
            expect(result.position).toBe('fixed');
        });

        test('言語セレクターがビューポート内に収まる', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 言語タグをクリック
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(200);
            
            // 言語セレクターがビューポート内にあることを確認
            const result = await page.evaluate(() => {
                const selector = document.querySelector('.lang-selector');
                if (!selector) return { inViewport: false };
                
                const rect = selector.getBoundingClientRect();
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                
                return {
                    inViewport: rect.top >= 0 && 
                               rect.bottom <= viewportHeight && 
                               rect.left >= 0 && 
                               rect.right <= viewportWidth,
                    top: rect.top,
                    bottom: rect.bottom,
                    viewportHeight
                };
            });
            
            expect(result.inViewport).toBe(true);
        });
    });

    test.describe('言語/コピーボタンクリックで描画モードに切り替え (v0.195.98)', () => {
        test('編集モード中に言語ボタンをクリックすると描画モードに切り替わる', async ({ page }) => {
            // パース済みHTMLを設定（編集モード）
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="edit"><code contenteditable="true">const x = 1;</code></pre>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // 言語タグをクリック
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(200);
            
            // 描画モードに切り替わっていることを確認
            const result = await page.evaluate(() => {
                const pre = document.querySelector('#editor pre');
                return {
                    mode: pre?.getAttribute('data-mode')
                };
            });
            
            expect(result.mode).toBe('display');
        });

        test('編集モード中にコピーボタンをクリックすると描画モードに切り替わる', async ({ page, context }) => {
            // クリップボードの権限を付与
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            
            // パース済みHTMLを設定（編集モード）
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="javascript" data-mode="edit"><code contenteditable="true">const x = 1;</code></pre>
                `;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(200);
            
            // コピーボタンをクリック
            const copyBtn = page.locator('.code-copy-btn').first();
            await copyBtn.click();
            await page.waitForTimeout(200);
            
            // 描画モードに切り替わっていることを確認
            const result = await page.evaluate(() => {
                const pre = document.querySelector('#editor pre');
                return {
                    mode: pre?.getAttribute('data-mode')
                };
            });
            
            expect(result.mode).toBe('display');
        });
    });

    test.describe('空白行のみのコードブロック (v0.195.107)', () => {
        test('空のコードブロックをクリックすると編集モードになる', async ({ page }) => {
            // 空のコードブロックを作成
            await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                testApi.setMarkdown('```javascript\n```');
            });
            await page.waitForTimeout(200);
            
            // code要素にクリックイベントを発火
            await page.evaluate(() => {
                const code = document.querySelector('#editor pre code');
                if (code) {
                    code.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            });
            await page.waitForTimeout(100);
            
            const result = await page.evaluate(() => {
                const pre = document.querySelector('#editor pre');
                const code = pre?.querySelector('code');
                
                return {
                    mode: pre?.getAttribute('data-mode'),
                    contentEditable: code?.getAttribute('contenteditable'),
                    hasBr: code?.querySelector('br') !== null
                };
            });
            
            expect(result.mode).toBe('edit');
            expect(result.contentEditable).toBe('true');
            // 空のコードブロックには<br>が挿入されている
            expect(result.hasBr).toBe(true);
        });

        test('空のコードブロックに文字を入力すると<br>が消える', async ({ page }) => {
            // 空のコードブロックを作成
            await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                testApi.setMarkdown('```javascript\n```');
            });
            await page.waitForTimeout(200);
            
            // code要素にクリックイベントを発火して編集モードに
            await page.evaluate(() => {
                const code = document.querySelector('#editor pre code');
                if (code) {
                    code.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            });
            await page.waitForTimeout(100);
            
            // 文字を入力
            await page.keyboard.type('const x = 1;', { delay: 30 });
            await page.waitForTimeout(100);
            
            const result = await page.evaluate(() => {
                const code = document.querySelector('#editor pre code');
                const brElements = code?.querySelectorAll('br') || [];
                const textContent = code?.textContent || '';
                
                return {
                    brCount: brElements.length,
                    hasContent: textContent.includes('const x = 1;')
                };
            });
            
            // 文字入力後は末尾に<br>がない（文字がある場合は末尾BRなし）
            expect(result.brCount).toBe(0);
            expect(result.hasContent).toBe(true);
        });

        test('空のコードブロックでMarkdown変換が正しく動作する', async ({ page }) => {
            const result = await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                testApi.setMarkdown('```javascript\n```');
                
                // Markdownを取得
                const resultMd = testApi.getMarkdown();
                
                return {
                    resultMd,
                    hasCodeBlock: resultMd.includes('```javascript') && resultMd.includes('```')
                };
            });
            
            expect(result.hasCodeBlock).toBe(true);
        });

        test('1行の空白行のみのコードブロックで↓キーを押すと1回で抜けられる', async ({ page }) => {
            // 空のコードブロックを作成
            await page.evaluate(() => {
                const testApi = (window as any).__testApi;
                testApi.setMarkdown('```javascript\n```\n\nParagraph below');
            });
            await page.waitForTimeout(200);
            
            // pre要素をクリックして編集モードに（フォーカスも設定される）
            await page.click('#editor pre');
            await page.waitForTimeout(100);
            
            // code要素にフォーカスを移動
            await page.evaluate(() => {
                const code = document.querySelector('#editor pre code') as HTMLElement;
                if (code) {
                    code.focus();
                    // カーソルを設定
                    const sel = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(code);
                    range.collapse(false); // 末尾に
                    sel?.removeAllRanges();
                    sel?.addRange(range);
                }
            });
            await page.waitForTimeout(100);
            
            // ↓キーを1回押す
            await editor.press('ArrowDown');
            await page.waitForTimeout(200);
            
            const result = await page.evaluate(() => {
                const pre = document.querySelector('#editor pre');
                const sel = window.getSelection();
                const p = document.querySelector('#editor p');
                const cursorInP = sel?.anchorNode && (
                    sel.anchorNode === p || 
                    p?.contains(sel.anchorNode)
                );
                
                return {
                    preMode: pre?.getAttribute('data-mode'),
                    cursorInP
                };
            });
            
            // コードブロックを抜けて段落にカーソルが移動している
            expect(result.preMode).toBe('display');
            expect(result.cursorInP).toBe(true);
        });
    });
});
