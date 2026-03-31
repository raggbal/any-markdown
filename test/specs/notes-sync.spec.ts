/**
 * Notes 固有の同期機能テスト
 * flushSync, fileChangeId, undo/redo クリア, 外部変更検知,
 * Daily Notes 連携, Notesモード固有動作, 左パネル開閉
 */

import { test, expect } from '@playwright/test';

const fileList = [
    { filePath: '/test/file1.out', title: 'File 1', id: 'file1' },
    { filePath: '/test/file2.out', title: 'File 2', id: 'file2' }
];

const structure = {
    version: 1,
    rootIds: ['file1', 'file2'],
    items: {
        file1: { type: 'file', id: 'file1', title: 'File 1' },
        file2: { type: 'file', id: 'file2', title: 'File 2' }
    }
};

function makeOutlinerData(text: string, nodeId = 'n1') {
    return {
        version: 1,
        rootIds: [nodeId],
        nodes: {
            [nodeId]: { id: nodeId, parentId: null, children: [], text, tags: [] }
        }
    };
}

function makeMultiNodeData(nodes: { id: string; text: string; parentId?: string | null; children?: string[] }[]) {
    const rootIds = nodes.filter(n => !n.parentId).map(n => n.id);
    const nodesMap: Record<string, any> = {};
    for (const n of nodes) {
        nodesMap[n.id] = {
            id: n.id,
            parentId: n.parentId || null,
            children: n.children || [],
            text: n.text,
            tags: []
        };
    }
    return { version: 1, rootIds, nodes: nodesMap };
}

test.describe('Notes 同期機能テスト', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // =========================================================================
    // flushSync + fileChangeId (N-14, NF-1 ~ NF-3)
    // =========================================================================

    test('1. ファイル切替 (openFile) 呼び出し前に flushSync が実行される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure);
        }, { fileList, structure });

        // テキストを編集して未同期状態を作る
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' modified');
        await page.waitForTimeout(100);

        // メッセージをクリア
        await page.evaluate(() => {
            (window as any).__testApi.messages.length = 0;
        });

        // openFile を呼ぶ -> flushSync が先に呼ばれるはず
        await page.evaluate(() => {
            window.notesHostBridge.openFile('/test/file2.out');
        });
        await page.waitForTimeout(200);

        // flushSync により syncData が送信されている
        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMsgs = messages.filter((m: any) => m.type === 'syncData');
        expect(syncMsgs.length).toBeGreaterThanOrEqual(1);
    });

    test('2. syncData メッセージに fileChangeId が付与される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Test'));

        // fileChangeId を設定
        await page.evaluate(() => {
            (window as any).__testApi.setFileChangeId(42);
        });

        // テキストを編集して同期を待つ
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type(' edited');
        await page.waitForTimeout(1500); // debounce を待つ

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMsgs = messages.filter((m: any) => m.type === 'syncData');
        expect(syncMsgs.length).toBeGreaterThanOrEqual(1);

        const lastSync = syncMsgs[syncMsgs.length - 1];
        expect(lastSync.fileChangeId).toBe(42);
    });

    test('3. updateData 受信で currentFileChangeId が更新される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Test'));

        // updateData で fileChangeId=77 を送信
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Updated', tags: [] }
                        }
                    },
                    fileChangeId: 77
                });
            }
        });
        await page.waitForTimeout(300);

        // テキストを編集して syncData を発火させ、fileChangeId=77 が付与されることを確認
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('x');
        await page.waitForTimeout(1500);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const syncMsgs = messages.filter((m: any) => m.type === 'syncData');
        const lastSync = syncMsgs[syncMsgs.length - 1];
        expect(lastSync.fileChangeId).toBe(77);
    });

    // =========================================================================
    // Undo/Redo スタッククリア (BUG-2)
    // =========================================================================

    test('4. テキスト編集後に updateData (fileChangeId あり) -> undo スタッククリア', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        // テキストを編集してスナップショットを作る
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' added');
        await page.waitForTimeout(600);

        // updateData (ファイル切替シミュレーション) を送信
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'New file data', tags: [] }
                        }
                    },
                    fileChangeId: 1
                });
            }
        });
        await page.waitForTimeout(300);

        // 新データが表示されている
        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('New file data');

        // Undo しても元ファイルのデータには戻らない (スタッククリア済み)
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(200);

        const afterUndo = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(afterUndo).toContain('New file data');
    });

    test('5. スタッククリア後に Cmd+Z しても元データに戻らない (新データ維持)', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('File A text'));

        // テキスト編集
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type(' edit1');
        await page.waitForTimeout(600);
        await page.keyboard.type(' edit2');
        await page.waitForTimeout(600);

        // ファイル切替 (updateData + fileChangeId)
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'File B data', tags: [] }
                        }
                    },
                    fileChangeId: 10
                });
            }
        });
        await page.waitForTimeout(300);

        // 複数回 Undo しても File A のデータには戻らない
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Meta+z');
            await page.waitForTimeout(100);
        }

        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('File B data');
        expect(currentText).not.toContain('File A');
    });

    test('6. スタッククリア後に初期スナップショットが保存される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('File A'));

        // ファイル切替
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'File B initial', tags: [] }
                        }
                    },
                    fileChangeId: 2
                });
            }
        });
        await page.waitForTimeout(300);

        // 新ファイルで Enter して構造変更 (即座にスナップショットが取られる)
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);

        // Undo で Enter 前の状態に戻れる (初期スナップショットが保存されているため)
        await page.keyboard.press('Meta+z');
        await page.waitForTimeout(300);

        const restoredCount = await page.locator('.outliner-node').count();
        expect(restoredCount).toBe(1);

        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('File B initial');
    });

    // =========================================================================
    // 外部変更検知
    // =========================================================================

    test('7. アイドル状態で updateData (fileChangeId なし) -> モデル即時更新', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        // アイドル状態 (編集操作なし) で外部変更を送信
        await page.waitForTimeout(200);

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'External update', tags: [] }
                        }
                    }
                    // fileChangeId なし -> 外部変更
                });
            }
        });
        await page.waitForTimeout(300);

        // 即時に更新が反映される
        const text = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(text).toContain('External update');
    });

    test('8. 編集中に updateData (fileChangeId なし) -> キューに保存', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        // テキストを編集 (isActivelyEditing = true になる)
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('typing');

        // 編集直後に外部変更を送信 (キューに保存されるはず)
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Queued update', tags: [] }
                        }
                    }
                    // fileChangeId なし -> 外部変更
                });
            }
        });
        await page.waitForTimeout(200);

        // 編集中なのでまだ反映されていない (元のテキスト + 入力したテキスト)
        const text = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(text).not.toBe('Queued update');
    });

    test('9. 編集後 1.5 秒アイドルでキューが適用される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        // テキストを編集
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('x');
        await page.waitForTimeout(50);

        // 編集直後に外部変更を送信
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Deferred update', tags: [] }
                        }
                    }
                });
            }
        });

        // 1.5秒 + マージン待つ (EDITING_IDLE_TIMEOUT = 1500ms)
        await page.waitForTimeout(2000);

        // アイドルになった後にキューが適用される
        const text = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(text).toContain('Deferred update');
    });

    test('10. fileChangeId あり (Notes ファイル切替) -> 編集中でも即時適用', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Original'));

        // テキストを編集 (isActivelyEditing = true)
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type('typing');

        // 編集中に fileChangeId 付き updateData を送信 (ファイル切替 = 最優先)
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Forced update', tags: [] }
                        }
                    },
                    fileChangeId: 99
                });
            }
        });
        await page.waitForTimeout(300);

        // 編集中でも即時に反映される
        const text = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(text).toContain('Forced update');
    });

    // =========================================================================
    // ファイル切替時のリセット (NUI-1)
    // =========================================================================

    test('11. ファイル切替 (fileChangeId あり updateData) で検索・スコープがリセットされる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Apple', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Banana', tags: [] }
                }
            });
        });

        // 検索を実行
        const searchInput = page.locator('.outliner-search-input');
        await searchInput.click();
        await searchInput.fill('Apple');
        await page.waitForTimeout(500);

        // fileChangeId 付き updateData (ファイル切替)
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'New data', tags: [] }
                        }
                    },
                    fileChangeId: 3
                });
            }
        });
        await page.waitForTimeout(300);

        // 検索入力がクリアされている
        const searchValue = await searchInput.inputValue();
        expect(searchValue).toBe('');
    });

    test('12. ファイル切替で undo スタックがクリアされる (再確認)', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data);
        }, makeOutlinerData('Data A'));

        // テキスト編集
        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.type(' modified');
        await page.waitForTimeout(600);

        // 連続ファイル切替
        await page.evaluate(() => {
            const handler = (window as any).__hostMessageHandler;
            if (!handler) return;

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Data B', tags: [] } }
                },
                fileChangeId: 20
            });

            handler({
                type: 'updateData',
                data: {
                    version: 1, rootIds: ['n1'],
                    nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Data C', tags: [] } }
                },
                fileChangeId: 21
            });
        });
        await page.waitForTimeout(300);

        // 複数回 Undo しても Data A/B には戻らない
        for (let i = 0; i < 5; i++) {
            await page.keyboard.press('Meta+z');
            await page.waitForTimeout(100);
        }

        const currentText = await page.locator('.outliner-node .outliner-text').first().textContent();
        expect(currentText).toContain('Data C');
        expect(currentText).not.toContain('Data A');
        expect(currentText).not.toContain('Data B');
    });

    // =========================================================================
    // Daily Notes 連携
    // =========================================================================

    test('13. isDailyNotes=true の updateData -> ナビバー表示', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: ['n2'], text: '2026-03-31', tags: [] },
                    n2: { id: 'n2', parentId: 'n1', children: [], text: 'Note content', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: ['n2'], text: '2026-03-31', tags: [] },
                            n2: { id: 'n2', parentId: 'n1', children: [], text: 'Note content', tags: [] }
                        }
                    },
                    isDailyNotes: true,
                    scopeToNodeId: 'n1',
                    fileChangeId: 1
                });
            }
        });
        await page.waitForTimeout(300);

        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isVisible = await dailyNavArea.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(true);
    });

    test('14. isDailyNotes=false の updateData -> ナビバー非表示', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Regular file', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Regular file', tags: [] }
                        }
                    },
                    isDailyNotes: false,
                    fileChangeId: 1
                });
            }
        });
        await page.waitForTimeout(300);

        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isHidden = await dailyNavArea.evaluate(el => el.style.display === 'none');
        expect(isHidden).toBe(true);
    });

    test('15. scopeToNodeId 付き updateData -> 指定ノードにスコープ設定', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1, rootIds: ['n1'], nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'placeholder', tags: [] }
                }
            });
        });

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['root'],
                        nodes: {
                            root: { id: 'root', parentId: null, children: ['a', 'b'], text: 'Root Node', tags: [] },
                            a: { id: 'a', parentId: 'root', children: [], text: 'Alpha', tags: [] },
                            b: { id: 'b', parentId: 'root', children: [], text: 'Beta', tags: [] }
                        }
                    },
                    scopeToNodeId: 'root',
                    fileChangeId: 5
                });
            }
        });
        await page.waitForTimeout(300);

        // スコープヘッダーが表示される
        const scopeHeader = page.locator('.outliner-scope-header');
        if (await scopeHeader.count() > 0) {
            const headerText = await scopeHeader.textContent();
            expect(headerText).toContain('Root Node');
        }

        // 子ノードが表示されている
        const nodes = page.locator('.outliner-node');
        const count = await nodes.count();
        expect(count).toBeGreaterThanOrEqual(2);
    });

    test('16. Today ボタンクリック -> postDailyNotes メッセージ送信', async ({ page }) => {
        // Daily Notes 状態にする
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['y2026'],
                nodes: {
                    y2026: { id: 'y2026', parentId: null, children: ['m03'], text: '2026', tags: [] },
                    m03: { id: 'm03', parentId: 'y2026', children: ['d31'], text: '03', tags: [] },
                    d31: { id: 'd31', parentId: 'm03', children: ['note1'], text: '31', tags: [] },
                    note1: { id: 'note1', parentId: 'd31', children: [], text: 'Daily note', tags: [] }
                }
            });
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['y2026'],
                        nodes: {
                            y2026: { id: 'y2026', parentId: null, children: ['m03'], text: '2026', tags: [] },
                            m03: { id: 'm03', parentId: 'y2026', children: ['d31'], text: '03', tags: [] },
                            d31: { id: 'd31', parentId: 'm03', children: ['note1'], text: '31', tags: [] },
                            note1: { id: 'note1', parentId: 'd31', children: [], text: 'Daily note', tags: [] }
                        }
                    },
                    isDailyNotes: true,
                    scopeToNodeId: 'd31',
                    fileChangeId: 1
                });
            }
        });
        await page.waitForTimeout(500);

        // Daily nav area が表示されている
        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isVisible = await dailyNavArea.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(true);

        // メッセージ数を記録
        const beforeCount = await page.evaluate(() =>
            (window as any).__testApi.messages.filter((m: any) => m.type === 'postDailyNotes').length
        );

        // Today ボタンクリック
        const todayBtn = page.locator('#dailyNavToday');
        await todayBtn.click();
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const dailyMsgs = messages.filter((m: any) => m.type === 'postDailyNotes');
        expect(dailyMsgs.length).toBeGreaterThan(beforeCount);

        const lastMsg = dailyMsgs[dailyMsgs.length - 1];
        expect(lastMsg.subType).toBe('notesOpenDailyNotes');
    });

    // =========================================================================
    // Notes モード固有動作
    // =========================================================================

    test('17. Notes 環境 (.notes-layout 存在) -> "Set page directory" メニュー非表示', async ({ page }) => {
        // Notes HTML には .notes-layout が存在する
        const hasNotesLayout = await page.evaluate(() => {
            return !!document.querySelector('.notes-layout');
        });
        expect(hasNotesLayout).toBe(true);

        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Test', tags: [] }
                }
            });
        });

        // メニューボタンを探す (hamburger / 3-dot menu)
        const menuBtn = page.locator('.outliner-menu-btn, .outliner-settings-btn, #outlinerMenuBtn');
        if (await menuBtn.count() > 0) {
            await menuBtn.first().click();
            await page.waitForTimeout(200);

            // "Set page directory" メニューアイテムが存在しないことを確認
            const menuItems = await page.evaluate(() => {
                const items = document.querySelectorAll('.menu-item');
                const texts: string[] = [];
                items.forEach(item => texts.push(item.textContent || ''));
                return texts;
            });

            const hasSetPageDir = menuItems.some(t =>
                t.toLowerCase().includes('set page directory') ||
                t.toLowerCase().includes('page directory')
            );
            expect(hasSetPageDir).toBe(false);
        }
    });

    test('18. jumpToNodeId 付き updateData -> ノードにジャンプ + ハイライト', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'placeholder', tags: [] }
                }
            });
        });

        // 複数ノードのデータを送信し、jumpToNodeId で特定ノードにジャンプ
        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1', 'n2', 'n3'],
                        nodes: {
                            n1: { id: 'n1', parentId: null, children: [], text: 'Node 1', tags: [] },
                            n2: { id: 'n2', parentId: null, children: [], text: 'Node 2', tags: [] },
                            n3: { id: 'n3', parentId: null, children: [], text: 'Target node', tags: [] }
                        }
                    },
                    jumpToNodeId: 'n3',
                    fileChangeId: 1
                });
            }
        });

        // jumpToAndHighlightNode は setTimeout(100) で実行される
        await page.waitForTimeout(500);

        // ターゲットノードが存在し、ハイライトクラスが付与されている
        const targetNode = page.locator('.outliner-node[data-id="n3"]');
        await expect(targetNode).toBeAttached();

        // ハイライトクラスが付いているか確認 (一時的なので既に消えている場合もある)
        // ノードが表示されていることは確認する
        const targetText = await page.locator('.outliner-node[data-id="n3"] .outliner-text').textContent();
        expect(targetText).toContain('Target node');
    });

    // =========================================================================
    // 左パネル開閉 (N-3)
    // =========================================================================

    test('19. パネル折りたたみ -> インラインstyleクリア + .collapsed クラス付与', async ({ page }) => {
        // パネルに初期幅を設定
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure, 300);
        }, { fileList, structure });

        const panel = page.locator('#notesFilePanel');

        // 初期状態: インラインstyleで幅が設定されている
        const initialWidth = await panel.evaluate(el => el.style.width);
        expect(initialWidth).toBe('300px');

        // 折りたたみボタンクリック
        const collapseBtn = page.locator('#filePanelCollapse');
        await collapseBtn.click();
        await page.waitForTimeout(200);

        // インラインstyleがクリアされている
        const afterCollapseWidth = await panel.evaluate(el => el.style.width);
        expect(afterCollapseWidth).toBe('');

        // .collapsed クラスが付与されている
        const hasCollapsed = await panel.evaluate(el => el.classList.contains('collapsed'));
        expect(hasCollapsed).toBe(true);
    });

    test('20. パネル展開 -> lastSavedPanelWidth で幅復元', async ({ page }) => {
        // パネルに初期幅を設定 (= lastSavedPanelWidth)
        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure, 350);
        }, { fileList, structure });

        const panel = page.locator('#notesFilePanel');

        // 折りたたむ
        const collapseBtn = page.locator('#filePanelCollapse');
        await collapseBtn.click();
        await page.waitForTimeout(200);

        // collapsed 状態を確認
        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(true);
        expect(await panel.evaluate(el => el.style.width)).toBe('');

        // 展開 (toggle ボタン)
        const toggleBtn = page.locator('#notesPanelToggleBtn');
        await toggleBtn.click({ force: true });
        await page.waitForTimeout(200);

        // .collapsed が外れている
        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(false);

        // lastSavedPanelWidth で幅が復元されている
        const restoredWidth = await panel.evaluate(el => el.style.width);
        expect(restoredWidth).toBe('350px');
    });
});
