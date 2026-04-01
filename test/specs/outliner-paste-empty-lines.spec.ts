import { test, expect } from '@playwright/test';

test.describe('Outliner paste empty lines skip', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('空行を含むテキストのペーストで空行ノードが作成されない', async ({ page }) => {
        // 初期化: 1ノード
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'existing', tags: [] }
                }
            });
        });

        // ノードにフォーカス
        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(200);

        // 空行を含むテキストをペースト
        const pasteText = 'line1\n\nline2\n\nline3';
        await page.evaluate((text) => {
            const el = document.querySelector('.outliner-text');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        }, pasteText);

        await page.waitForTimeout(500);

        // 結果: existing + line1 + line2 + line3 = 4ノード（空行ノードなし）
        // existingノードはテキストありなので残り、line1, line2, line3 が後に追加される
        const nodeTexts = await page.evaluate(() => {
            const texts: string[] = [];
            document.querySelectorAll('.outliner-text').forEach((el) => {
                texts.push((el as HTMLElement).textContent || '');
            });
            return texts;
        });

        expect(nodeTexts).toEqual(['existing', 'line1', 'line2', 'line3']);
    });

    test('連続空行を含むテキストのペーストで空行ノードが作成されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(200);

        // 連続空行を含むテキスト
        const pasteText = 'a\n\n\n\nb';
        await page.evaluate((text) => {
            const el = document.querySelector('.outliner-text');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        }, pasteText);

        await page.waitForTimeout(500);

        const nodeTexts = await page.evaluate(() => {
            const texts: string[] = [];
            document.querySelectorAll('.outliner-text').forEach((el) => {
                texts.push((el as HTMLElement).textContent || '');
            });
            return texts;
        });

        // 空ノードへのペースト: 元の空ノードが削除され、a, b の2ノードのみ
        expect(nodeTexts).toEqual(['a', 'b']);
    });

    test('空行なしテキストのペーストは既存通り動作する', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(200);

        const pasteText = 'line1\nline2\nline3';
        await page.evaluate((text) => {
            const el = document.querySelector('.outliner-text');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        }, pasteText);

        await page.waitForTimeout(500);

        const nodeTexts = await page.evaluate(() => {
            const texts: string[] = [];
            document.querySelectorAll('.outliner-text').forEach((el) => {
                texts.push((el as HTMLElement).textContent || '');
            });
            return texts;
        });

        expect(nodeTexts).toEqual(['line1', 'line2', 'line3']);
    });

    test('インデント付きテキスト+空行のペーストで空行ノードが作成されない', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-text').first();
        await textEl.click();
        await page.waitForTimeout(200);

        // タブインデント付き + 空行
        const pasteText = 'parent\n\tchild1\n\n\tchild2';
        await page.evaluate((text) => {
            const el = document.querySelector('.outliner-text');
            if (!el) return;
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
            el.dispatchEvent(event);
        }, pasteText);

        await page.waitForTimeout(1500); // デバウンス待ち

        // syncDataを検証: parent → child1, child2（空行なし）
        const syncData = await page.evaluate(() => {
            return (window as any).__testApi.lastSyncData
                ? JSON.parse((window as any).__testApi.lastSyncData)
                : null;
        });

        expect(syncData).not.toBeNull();
        // ルートに parent 1ノード
        // n1が削除され、新しいノードが作られる
        const rootNodes = syncData.rootIds.map((id: string) => syncData.nodes[id]);
        expect(rootNodes).toHaveLength(1);
        const parentNode = rootNodes[0];
        expect(parentNode.text).toBe('parent');
        // parentの子にchild1, child2 の2つ（空行ノードなし）
        expect(parentNode.children).toHaveLength(2);
        const child1 = syncData.nodes[parentNode.children[0]];
        const child2 = syncData.nodes[parentNode.children[1]];
        expect(child1.text).toBe('child1');
        expect(child2.text).toBe('child2');
    });
});
