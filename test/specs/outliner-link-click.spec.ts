import { test, expect } from '@playwright/test';

test.describe('Outliner link click and URL paste', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('blur状態のリンクをクリックするとopenLinkメッセージが送信される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'before', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'click [here](https://example.com) link', tags: [] }
                }
            });
        });

        // n1にフォーカスを当ててn2をblur状態にする
        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // n2のblur状態のリンク<a>をクリック
        const link = page.locator('.outliner-text[data-node-id="n2"] a');
        await expect(link).toHaveCount(1);
        await link.click();
        await page.waitForTimeout(300);

        // openLinkメッセージが送信されたか
        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const openLinkMessages = messages.filter((m: any) => m.type === 'openLink');
        expect(openLinkMessages).toHaveLength(1);
        expect(openLinkMessages[0].href).toBe('https://example.com');
    });

    test('focus中のノードではリンクをクリックしてもopenLinkが送信されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '[link](https://example.com)', tags: [] }
                }
            });
        });

        // n1をクリックしてフォーカス（編集モード）
        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // focus中はrenderEditingText()で<a>タグが存在しないことを確認
        const linkCount = await page.locator('.outliner-text[data-node-id="n1"] a').count();
        expect(linkCount).toBe(0);

        // メッセージにopenLinkがないことを確認
        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const openLinkMessages = messages.filter((m: any) => m.type === 'openLink');
        expect(openLinkMessages).toHaveLength(0);
    });

    test('URLをペーストすると[URL](URL)形式に変換される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'text ', tags: [] }
                }
            });
        });

        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // カーソルを末尾に
        await page.keyboard.press('End');

        // URLをペースト
        const url = 'https://example.com/path?q=1';
        await page.evaluate((pasteUrl) => {
            const el = document.querySelector('.outliner-text[data-node-id="n1"]');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', pasteUrl);
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        }, url);

        await page.waitForTimeout(500);

        // モデルのテキストが [URL](URL) 形式になっている
        // テキスト内容をDOMから直接取得（focus中はrenderEditingTextで表示）
        const nodeText = await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-text[data-node-id="n1"]');
            return textEl ? textEl.textContent : null;
        });

        expect(nodeText).toBe('text [https://example.com/path?q=1](https://example.com/path?q=1)');
    });

    test('URL以外のテキストをペーストしても変換されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // 通常テキストをペースト
        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text[data-node-id="n1"]');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', 'hello world');
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        });

        await page.waitForTimeout(500);

        const nodeText = await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-text[data-node-id="n1"]');
            return textEl ? textEl.textContent : null;
        });

        // そのまま挿入される
        expect(nodeText).toBe('hello world');
    });

    test('テキスト中のURLをペーストすると変換される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // テキスト中にURLを含むテキストをペースト
        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text[data-node-id="n1"]');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', 'URL: https://docs.aws.amazon.com/ja_jp/apigateway/');
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        });

        await page.waitForTimeout(500);

        const nodeText = await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-text[data-node-id="n1"]');
            return textEl ? textEl.textContent : null;
        });

        expect(nodeText).toBe('URL: [https://docs.aws.amazon.com/ja_jp/apigateway/](https://docs.aws.amazon.com/ja_jp/apigateway/)');
    });

    test('既にMarkdownリンク形式のテキストは二重変換されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // 既にMarkdownリンク形式のテキストをペースト
        await page.evaluate(() => {
            const el = document.querySelector('.outliner-text[data-node-id="n1"]');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', '[example](https://example.com)');
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        });

        await page.waitForTimeout(500);

        const nodeText = await page.evaluate(() => {
            const textEl = document.querySelector('.outliner-text[data-node-id="n1"]');
            return textEl ? textEl.textContent : null;
        });

        // 二重変換されない
        expect(nodeText).toBe('[example](https://example.com)');
    });

    test('リンクをクリックした後ノードがfocus状態にならない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'before', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: '[link](https://example.com)', tags: [] }
                }
            });
        });

        // n1にフォーカス
        const n1Text = page.locator('.outliner-text[data-node-id="n1"]');
        await n1Text.click();
        await page.waitForTimeout(200);

        // n2のリンクをクリック（mousedownでpreventDefaultされるためfocusは移動しない）
        const link = page.locator('.outliner-text[data-node-id="n2"] a');
        await link.click();
        await page.waitForTimeout(300);

        // n2はblur状態のまま（<a>タグがまだ存在する）
        const linkStillExists = await page.locator('.outliner-text[data-node-id="n2"] a').count();
        expect(linkStillExists).toBe(1);
    });
});
