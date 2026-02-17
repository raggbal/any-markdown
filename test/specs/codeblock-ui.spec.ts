/**
 * コードブロックUI機能テスト
 * - 言語タグ表示
 * - 言語変更機能
 * - コピーボタン
 * - シンタックスハイライト
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《コードブロック》UI機能', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test.describe('言語タグ表示', () => {
        test('コードブロック作成時に言語タグが表示される', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 言語タグが表示されていることを確認
            const langTag = page.locator('.code-lang-tag').first();
            await expect(langTag).toBeVisible();
            await expect(langTag).toHaveText('javascript');
        });

        test('言語指定なしのコードブロックでは plaintext と表示される', async ({ page }) => {
            // 言語指定なしでコードブロックを作成
            await editor.type('```');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 言語タグが plaintext であることを確認
            const langTag = page.locator('.code-lang-tag').first();
            await expect(langTag).toBeVisible();
            await expect(langTag).toHaveText('plaintext');
        });

        test('複数のコードブロックそれぞれに言語タグが表示される', async ({ page }) => {
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `
                    <pre data-lang="python"><code>print("hello")</code></pre>
                    <p>中間テキスト</p>
                    <pre data-lang="typescript"><code>const x = 1;</code></pre>
                `;
                // setupInteractiveElementsを呼び出す
                if (typeof (window as any).__testApi?.setupInteractiveElements === 'function') {
                    (window as any).__testApi.setupInteractiveElements();
                }
            });
            await page.waitForTimeout(500);
            
            // 両方の言語タグが表示されていることを確認
            const langTags = await page.locator('.code-lang-tag').all();
            expect(langTags.length).toBe(2);
            await expect(langTags[0]).toHaveText('python');
            await expect(langTags[1]).toHaveText('typescript');
        });
    });

    test.describe('言語変更機能', () => {
        test('言語タグクリックで言語セレクターが表示される', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 言語タグをクリック
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(200);
            
            // 言語セレクターが表示されることを確認
            const selector = page.locator('.lang-selector');
            await expect(selector).toBeVisible();
        });

        test('言語セレクターから別の言語を選択できる', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 言語タグをクリック
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(200);
            
            // python を選択
            const pythonOption = page.locator('.lang-selector-item', { hasText: 'python' });
            await pythonOption.click();
            await page.waitForTimeout(200);
            
            // 言語タグが python に変更されていることを確認
            await expect(langTag).toHaveText('python');
            
            // セレクターが閉じていることを確認
            const selector = page.locator('.lang-selector');
            await expect(selector).not.toBeVisible();
        });

        test('言語変更後にdata-lang属性が更新される', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 言語タグをクリック
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(200);
            
            // python を選択
            const pythonOption = page.locator('.lang-selector-item', { hasText: 'python' });
            await pythonOption.click();
            await page.waitForTimeout(300);
            
            // data-lang属性が更新されていることを確認
            const dataLang = await page.locator('pre').first().getAttribute('data-lang');
            expect(dataLang).toBe('python');
        });
    });

    test.describe('コピーボタン', () => {
        test('コードブロックにコピーボタンが表示される', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // コピーボタンが表示されていることを確認
            const copyBtn = page.locator('.code-copy-btn').first();
            await expect(copyBtn).toBeVisible();
        });

        test('コピーボタンクリックでコードがクリップボードにコピーされる', async ({ page, context }) => {
            // クリップボードの権限を付与
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang="javascript"><code>const x = 1;</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // コピーボタンをクリック
            const copyBtn = page.locator('.code-copy-btn').first();
            await copyBtn.click();
            await page.waitForTimeout(200);
            
            // クリップボードの内容を確認
            const clipboardText = await page.evaluate(async () => {
                return await navigator.clipboard.readText();
            });
            expect(clipboardText).toContain('const x = 1;');
        });

        test('コピー後にボタンテキストが変わる', async ({ page, context }) => {
            // クリップボードの権限を付与
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
            
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang="javascript"><code>const x = 1;</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // コピーボタンをクリック
            const copyBtn = page.locator('.code-copy-btn').first();
            const originalText = await copyBtn.textContent();
            await copyBtn.click();
            await page.waitForTimeout(100);
            
            // ボタンテキストが変わっていることを確認
            const newText = await copyBtn.textContent();
            expect(newText).not.toBe(originalText);
        });
    });

    test.describe('シンタックスハイライト', () => {
        test('JavaScriptのキーワードがハイライトされる', async ({ page }) => {
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang="javascript"><code>const x = 1;</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // hljs-keyword クラスが適用されていることを確認
            const keyword = page.locator('pre code .hljs-keyword').first();
            await expect(keyword).toBeVisible();
            await expect(keyword).toHaveText('const');
        });

        test('文字列がハイライトされる', async ({ page }) => {
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang="javascript"><code>const s = "hello";</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // hljs-string クラスが適用されていることを確認
            const str = page.locator('pre code .hljs-string').first();
            await expect(str).toBeVisible();
            await expect(str).toHaveText('"hello"');
        });

        test('コメントがハイライトされる', async ({ page }) => {
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang="javascript"><code>// comment</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // hljs-comment クラスが適用されていることを確認
            const comment = page.locator('pre code .hljs-comment').first();
            await expect(comment).toBeVisible();
            await expect(comment).toHaveText('// comment');
        });

        test('Pythonのキーワードがハイライトされる', async ({ page }) => {
            // パース済みHTMLを直接設定
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang="python"><code>def hello():</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // hljs-keyword クラスが適用されていることを確認
            const keyword = page.locator('pre code .hljs-keyword').first();
            await expect(keyword).toBeVisible();
            await expect(keyword).toHaveText('def');
        });

        test('言語変更後にハイライトが更新される', async ({ page }) => {
            // パース済みHTMLを直接設定（最初はplaintext）
            await page.evaluate(() => {
                const editor = document.getElementById('editor');
                if (!editor) return;
                editor.innerHTML = `<pre data-lang=""><code>const x = 1;</code></pre>`;
                (window as any).__testApi?.setupInteractiveElements?.();
            });
            await page.waitForTimeout(500);
            
            // 最初はハイライトなし（plaintextなので）
            let keywords = await page.locator('pre code .hljs-keyword').all();
            expect(keywords.length).toBe(0);
            
            // 言語をjavascriptに変更
            const langTag = page.locator('.code-lang-tag').first();
            await langTag.click();
            await page.waitForTimeout(200);
            
            const jsOption = page.locator('.lang-selector-item', { hasText: 'javascript' });
            await jsOption.click();
            await page.waitForTimeout(300);
            
            // ハイライトが適用されていることを確認
            const keyword = page.locator('pre code .hljs-keyword').first();
            await expect(keyword).toBeVisible();
            await expect(keyword).toHaveText('const');
        });
    });

    test.describe('UI配置', () => {
        test('ヘッダーがコードブロック内に存在する', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // ヘッダーが存在することを確認
            const header = page.locator('.code-block-header').first();
            await expect(header).toBeVisible();
            
            // ヘッダーがpre要素内にあることを確認
            const headerParent = await page.evaluate(() => {
                const header = document.querySelector('.code-block-header');
                return header?.parentElement?.tagName.toLowerCase();
            });
            expect(headerParent).toBe('pre');
        });

        test('言語タグとコピーボタンが両方表示される', async ({ page }) => {
            // コードブロックを作成
            await editor.type('```javascript');
            await editor.press('Enter');
            await page.waitForTimeout(500);
            
            // 両方が表示されていることを確認
            const langTag = page.locator('.code-lang-tag').first();
            const copyBtn = page.locator('.code-copy-btn').first();
            
            await expect(langTag).toBeVisible();
            await expect(copyBtn).toBeVisible();
        });
    });
});
