/**
 * .md ファイルの Outliner D&D 取り込みテスト
 *
 * Webview内での D&D シミュレーションは困難なため、
 * importMdFilesResult メッセージの受信処理（ノード作成・挿入）を
 * __hostMessageHandler 経由でテストする。
 */

import { test, expect } from '@playwright/test';

test.describe.serial('Outliner .md ファイル D&D 取り込み', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-outliner.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('importMdFilesResult でページノードが作成される', async ({ page }) => {
        // 初期状態: 2ノード
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Node1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Node2', tags: [] }
                }
            });
        });

        // importMdFilesResult を送信（n1の後にページノードを挿入）
        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'importMdFilesResult',
                results: [{
                    title: 'Imported Page',
                    content: '# Imported Page\n\nSome content',
                    pageId: 'test-page-id-001'
                }],
                targetNodeId: 'n1',
                position: 'after'
            });
        });
        await page.waitForTimeout(1500);

        // ノードが3つに増えている
        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(3);

        // 2番目のノードがインポートされたページノード
        const nodes = await page.evaluate(() => {
            const data = JSON.parse((window as any).__testApi.lastSyncData);
            return data.rootIds.map((id: string) => ({
                id,
                text: data.nodes[id].text,
                isPage: data.nodes[id].isPage,
                pageId: data.nodes[id].pageId
            }));
        });

        // n1, imported, n2 の順序
        expect(nodes[0].text).toBe('Node1');
        expect(nodes[1].text).toBe('Imported Page');
        expect(nodes[1].isPage).toBe(true);
        expect(nodes[1].pageId).toBe('test-page-id-001');
        expect(nodes[2].text).toBe('Node2');
    });

    test('position=before でノードの前に挿入される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Node1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Node2', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'importMdFilesResult',
                results: [{ title: 'Before N2', content: '', pageId: 'page-before' }],
                targetNodeId: 'n2',
                position: 'before'
            });
        });
        await page.waitForTimeout(1500);

        const rootIds = await page.evaluate(() => {
            const data = JSON.parse((window as any).__testApi.lastSyncData);
            return data.rootIds;
        });

        // n1, imported, n2 の順序
        expect(rootIds[0]).toBe('n1');
        expect(rootIds[2]).toBe('n2');
        expect(rootIds.length).toBe(3);
    });

    test('position=child でノードの子として挿入される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Parent', tags: [], collapsed: true }
                }
            });
        });

        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'importMdFilesResult',
                results: [{ title: 'Child Page', content: '', pageId: 'page-child' }],
                targetNodeId: 'n1',
                position: 'child'
            });
        });
        await page.waitForTimeout(1500);

        const data = await page.evaluate(() => {
            return JSON.parse((window as any).__testApi.lastSyncData);
        });

        // n1 の子ノードとして挿入
        expect(data.nodes.n1.children.length).toBe(1);
        const childId = data.nodes.n1.children[0];
        expect(data.nodes[childId].text).toBe('Child Page');
        expect(data.nodes[childId].isPage).toBe(true);
        // collapsed が false に展開される
        expect(data.nodes.n1.collapsed).toBe(false);
    });

    test('targetNodeId=null でルート末尾に挿入される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Node1', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'importMdFilesResult',
                results: [{ title: 'Root End', content: '', pageId: 'page-root' }],
                targetNodeId: null,
                position: 'after'
            });
        });
        await page.waitForTimeout(1500);

        const rootIds = await page.evaluate(() => {
            const data = JSON.parse((window as any).__testApi.lastSyncData);
            return data.rootIds;
        });

        expect(rootIds[0]).toBe('n1');
        expect(rootIds.length).toBe(2);
    });

    test('複数ファイルが順序通りに挿入される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Node1', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Node2', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'importMdFilesResult',
                results: [
                    { title: 'File A', content: '', pageId: 'page-a' },
                    { title: 'File B', content: '', pageId: 'page-b' },
                    { title: 'File C', content: '', pageId: 'page-c' }
                ],
                targetNodeId: 'n1',
                position: 'after'
            });
        });
        await page.waitForTimeout(1500);

        const data = await page.evaluate(() => {
            return JSON.parse((window as any).__testApi.lastSyncData);
        });

        // n1, A, B, C, n2 の順序
        expect(data.rootIds.length).toBe(5);
        const texts = data.rootIds.map((id: string) => data.nodes[id].text);
        expect(texts).toEqual(['Node1', 'File A', 'File B', 'File C', 'Node2']);

        // 全てページノード
        for (let i = 1; i <= 3; i++) {
            const id = data.rootIds[i];
            expect(data.nodes[id].isPage).toBe(true);
        }
    });

    test('ページアイコンが表示される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Node1', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            (window as any).__hostMessageHandler({
                type: 'importMdFilesResult',
                results: [{ title: 'Page With Icon', content: '', pageId: 'page-icon' }],
                targetNodeId: 'n1',
                position: 'after'
            });
        });
        await page.waitForTimeout(1500);

        // ページアイコンが表示されている
        const pageIcons = await page.locator('.outliner-page-icon').count();
        expect(pageIcons).toBeGreaterThanOrEqual(1);
    });

    test('importMdFiles メッセージがホストに送信される（D&Dシミュレーション）', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Node1', tags: [] }
                }
            });
        });

        // handleExternalFileDrop を直接呼び出してテスト
        // (実際のD&Dはブラウザセキュリティで制限されるため)
        const sent = await page.evaluate(() => {
            // HostBridgeのimportMdFilesが呼ばれたか確認
            const bridge = (window as any).outlinerHostBridge;
            if (!bridge || !bridge.importMdFiles) return false;
            bridge.importMdFiles(['/test/file.md'], 'n1', 'after');
            return true;
        });
        expect(sent).toBe(true);

        // メッセージが記録されている
        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const importMsg = messages.find((m: any) => m.type === 'importMdFiles');
        expect(importMsg).toBeTruthy();
        expect(importMsg.filePaths).toEqual(['/test/file.md']);
        expect(importMsg.targetNodeId).toBe('n1');
        expect(importMsg.position).toBe('after');
    });
});
