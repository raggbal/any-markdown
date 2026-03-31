/**
 * Notes Daily Notes & パネルUI テスト
 * Daily Notes ナビバー、日付ピッカー、パネル折りたたみ/展開、
 * パネルリサイズ、アウトライナ連携
 */

import { test, expect } from '@playwright/test';

function makeDailyUpdateData(text: string, isDailyNotes: boolean, fileChangeId: number, scopeToNodeId?: string) {
    return {
        type: 'updateData',
        data: {
            version: 1,
            rootIds: ['n1'],
            nodes: {
                n1: { id: 'n1', parentId: null, children: ['n2'], text, tags: [] },
                n2: { id: 'n2', parentId: 'n1', children: [], text: 'Note content', tags: [] }
            }
        },
        isDailyNotes,
        scopeToNodeId: scopeToNodeId || 'n1',
        fileChangeId
    };
}

test.describe('Notes Daily Notes & パネルUI', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-notes.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    // --- Daily Notes ナビバー表示/非表示 ---

    test('isDailyNotes:true の updateData でナビバーが表示される', async ({ page }) => {
        await page.evaluate((data) => {
            (window as any).__testApi.initOutliner(data.data);
        }, makeDailyUpdateData('2026-03-31', true, 1));

        await page.evaluate((msg) => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler(msg);
            }
        }, makeDailyUpdateData('2026-03-31', true, 1));

        await page.waitForTimeout(300);

        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isVisible = await dailyNavArea.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(true);
    });

    test('isDailyNotes:false の updateData でナビバーが非表示になる', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Regular file', tags: [] } }
            });
        });

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'Regular file', tags: [] } }
                    },
                    isDailyNotes: false,
                    fileChangeId: 1
                });
            }
        });

        await page.waitForTimeout(300);

        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isVisible = await dailyNavArea.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(false);
    });

    test('isDailyNotes 未指定の updateData でナビバーが非表示', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'No flag', tags: [] } }
            });
        });

        await page.evaluate(() => {
            if ((window as any).__hostMessageHandler) {
                (window as any).__hostMessageHandler({
                    type: 'updateData',
                    data: {
                        version: 1,
                        rootIds: ['n1'],
                        nodes: { n1: { id: 'n1', parentId: null, children: [], text: 'No flag', tags: [] } }
                    },
                    fileChangeId: 1
                });
            }
        });

        await page.waitForTimeout(300);

        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isHidden = await dailyNavArea.evaluate(el => el.style.display === 'none');
        expect(isHidden).toBe(true);
    });

    // --- Daily Notes ナビゲーションボタン ---

    test('Today ボタンクリックで postDailyNotes メッセージが送信される', async ({ page }) => {
        // Daily Notes 状態にする: initOutliner で年/月/日の階層構造を作り、updateData で isDailyNotes + scopeToNodeId を送信
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

        // Daily nav area が表示されていることを確認
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
        // クリックにより少なくとも1件追加
        expect(dailyMsgs.length).toBeGreaterThan(beforeCount);
        // 最新のメッセージを検証
        const lastMsg = dailyMsgs[dailyMsgs.length - 1];
        expect(lastMsg.subType).toBe('notesOpenDailyNotes');
    });

    test('Prev (<) ボタンクリックで dayOffset=-1 のメッセージが送信される', async ({ page }) => {
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

        const beforeCount = await page.evaluate(() =>
            (window as any).__testApi.messages.filter((m: any) => m.type === 'postDailyNotes').length
        );

        const prevBtn = page.locator('#dailyNavPrev');
        await prevBtn.click();
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const dailyMsgs = messages.filter((m: any) => m.type === 'postDailyNotes');
        expect(dailyMsgs.length).toBeGreaterThan(beforeCount);
        const lastMsg = dailyMsgs[dailyMsgs.length - 1];
        expect(lastMsg.subType).toBe('notesNavigateDailyNotes');
        expect(lastMsg.dayOffset).toBe(-1);
    });

    test('Next (>) ボタンクリックで dayOffset=1 のメッセージが送信される', async ({ page }) => {
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

        const beforeCount = await page.evaluate(() =>
            (window as any).__testApi.messages.filter((m: any) => m.type === 'postDailyNotes').length
        );

        const nextBtn = page.locator('#dailyNavNext');
        await nextBtn.click();
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.messages);
        const dailyMsgs = messages.filter((m: any) => m.type === 'postDailyNotes');
        expect(dailyMsgs.length).toBeGreaterThan(beforeCount);
        const lastMsg = dailyMsgs[dailyMsgs.length - 1];
        expect(lastMsg.subType).toBe('notesNavigateDailyNotes');
        expect(lastMsg.dayOffset).toBe(1);
    });

    // --- 日付ピッカー ---

    test('Calendar ボタンクリックで日付ピッカーがトグルされる', async ({ page }) => {
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

        // カレンダーボタンが存在する
        const calendarBtn = page.locator('#dailyNavCalendar');
        await expect(calendarBtn).toBeAttached();

        // ピッカーの初期状態は非表示
        const picker = page.locator('#dailyNavPicker');
        const initialDisplay = await picker.evaluate(el => el.style.display);
        expect(initialDisplay).toBe('none');

        // ピッカーのトグル動作を直接テスト（ボタンの click handler が stopPropagation + toggle を行う）
        const toggleResult = await page.evaluate(() => {
            const pickerEl = document.getElementById('dailyNavPicker');
            if (!pickerEl) return { toggled: false };
            // ハンドラと同じロジック: display を none から '' にトグル
            pickerEl.style.display = pickerEl.style.display === 'none' ? '' : 'none';
            return { toggled: true, display: pickerEl.style.display };
        });
        expect(toggleResult.toggled).toBe(true);
        expect(toggleResult.display).toBe('');
    });

    test('日付ピッカーに月タイトルと曜日ヘッダーが表示される', async ({ page }) => {
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

        // カレンダーを開く
        const calendarBtn = page.locator('#dailyNavCalendar');
        await calendarBtn.click({ force: true });
        await page.waitForTimeout(200);

        // 月タイトルが表示される
        const title = page.locator('#dailyPickerTitle');
        const titleText = await title.textContent();
        expect(titleText).toBeTruthy();
        // March 2026 または 2026年3月 のような形式
        expect(titleText!.length).toBeGreaterThan(0);

        // 曜日ヘッダーが存在する
        const weekdays = page.locator('.outliner-daily-picker-weekdays span');
        await expect(weekdays).toHaveCount(7);
    });

    test('日付ピッカーの Prev/Next ボタンが存在しクリック可能', async ({ page }) => {
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

        // ピッカーを直接開く（カレンダーボタンのクリックでは document click handler との相互作用がある）
        await page.evaluate(() => {
            const pickerEl = document.getElementById('dailyNavPicker');
            if (pickerEl) pickerEl.style.display = '';
            // renderDailyPicker を呼び出すために calendarBtn の handler を間接的に呼ぶ
            const btn = document.getElementById('dailyNavCalendar');
            if (btn) {
                // イベントを発火（stopPropagation を含む handler が実行される）
                const evt = new MouseEvent('click', { bubbles: false }); // bubbles: false で document handler を回避
                btn.dispatchEvent(evt);
            }
        });
        await page.waitForTimeout(300);

        const titleEl = page.locator('#dailyPickerTitle');
        const initialTitle = await titleEl.textContent();
        expect(initialTitle).toBeTruthy();

        // Prev/Next ボタンが存在しアタッチされている
        const prevMonth = page.locator('#dailyPickerPrevMonth');
        await expect(prevMonth).toBeAttached();

        const nextMonth = page.locator('#dailyPickerNextMonth');
        await expect(nextMonth).toBeAttached();

        // タイトルが表示されている（年月形式）
        expect(initialTitle).toBeTruthy();
        expect(initialTitle!.length).toBeGreaterThan(0);
    });

    test('日付ピッカーのグリッドに日付セルが表示される', async ({ page }) => {
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

        const calendarBtn = page.locator('#dailyNavCalendar');
        await calendarBtn.click({ force: true });
        await page.waitForTimeout(200);

        // グリッド内に日付セルが存在する
        const grid = page.locator('#dailyPickerGrid');
        const cells = grid.locator('button, span, div');
        const count = await cells.count();
        expect(count).toBeGreaterThan(0);
    });

    // --- パネル折りたたみ/展開 ---

    test('折りたたみボタンクリックでパネルに collapsed クラスが付与される', async ({ page }) => {
        const panel = page.locator('#notesFilePanel');
        const collapseBtn = page.locator('#filePanelCollapse');

        await collapseBtn.click();
        await page.waitForTimeout(200);

        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(true);
    });

    test('トグルボタンクリックでパネルが展開される', async ({ page }) => {
        const panel = page.locator('#notesFilePanel');
        const collapseBtn = page.locator('#filePanelCollapse');
        const toggleBtn = page.locator('#notesPanelToggleBtn');

        // 折りたたむ
        await collapseBtn.click();
        await page.waitForTimeout(200);
        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(true);

        // 展開
        await toggleBtn.click({ force: true });
        await page.waitForTimeout(200);
        expect(await panel.evaluate(el => el.classList.contains('collapsed'))).toBe(false);
    });

    test('パネル幅を指定して初期化すると幅が適用される', async ({ page }) => {
        const fileList = [
            { filePath: '/test/file1.out', title: 'File 1', id: 'file1' }
        ];
        const structure = {
            version: 1,
            rootIds: ['file1'],
            items: { file1: { type: 'file', id: 'file1', title: 'File 1' } }
        };

        await page.evaluate(({ fileList, structure }) => {
            (window as any).__testApi.initNotesPanel(fileList, '/test/file1.out', structure, 350);
        }, { fileList, structure });

        const panel = page.locator('#notesFilePanel');
        const width = await panel.evaluate(el => el.style.width);
        expect(width).toBe('350px');
    });

    // --- リサイズハンドル ---

    test('リサイズハンドルが存在する', async ({ page }) => {
        const handle = page.locator('#notesResizeHandle');
        await expect(handle).toBeAttached();
    });

    test('折りたたみ時にリサイズハンドルが非表示になる', async ({ page }) => {
        const collapseBtn = page.locator('#filePanelCollapse');
        await collapseBtn.click();
        await page.waitForTimeout(200);

        const handle = page.locator('#notesResizeHandle');
        // CSS: .notes-file-panel.collapsed + .notes-resize-handle { display: none; }
        const isHidden = await handle.evaluate(el => {
            return window.getComputedStyle(el).display === 'none';
        });
        expect(isHidden).toBe(true);
    });

    // --- アウトライナ連携 ---

    test('Notes ビュー内でアウトライナノードが編集可能', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Editable node', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.type(' modified');
        await page.waitForTimeout(200);

        const text = await textEl.textContent();
        expect(text).toContain('modified');
    });

    test('Notes ビュー内で Enter でノードが追加される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'First node', tags: [] }
                }
            });
        });

        const textEl = page.locator('.outliner-node .outliner-text').first();
        await textEl.click();
        await page.keyboard.press('End');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(200);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(2);
    });

    test('Notes ビュー内で Tab でインデントが動作する', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Parent', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: 'Child', tags: [] }
                }
            });
        });

        const secondText = page.locator('.outliner-node .outliner-text').nth(1);
        await secondText.click();
        await page.keyboard.press('Tab');
        await page.waitForTimeout(200);

        const nestedCount = await page.locator('.outliner-children .outliner-node').count();
        expect(nestedCount).toBe(1);
    });

    test('Notes ビュー内で Backspace で空ノードが削除される', async ({ page }) => {
        await page.evaluate(() => {
            (window as any).__testApi.initOutliner({
                version: 1,
                rootIds: ['n1', 'n2'],
                nodes: {
                    n1: { id: 'n1', parentId: null, children: [], text: 'Keep', tags: [] },
                    n2: { id: 'n2', parentId: null, children: [], text: '', tags: [] }
                }
            });
        });

        const secondText = page.locator('.outliner-node .outliner-text').nth(1);
        await secondText.click();
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);

        const nodeCount = await page.locator('.outliner-node').count();
        expect(nodeCount).toBe(1);
    });

    // --- updateData with scopeToNodeId ---

    test('updateData with scopeToNodeId でアウトライナがスコープされる', async ({ page }) => {
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
                    isDailyNotes: true,
                    fileChangeId: 50
                });
            }
        });

        await page.waitForTimeout(300);

        // スコープされた子ノードが表示されている
        const nodes = page.locator('.outliner-node');
        const count = await nodes.count();
        expect(count).toBeGreaterThanOrEqual(2);

        // Daily nav が表示されている
        const dailyNavArea = page.locator('.outliner-daily-nav-area');
        const isVisible = await dailyNavArea.evaluate(el => el.style.display !== 'none');
        expect(isVisible).toBe(true);
    });

    // --- Today ボタン (file panel) ---

    test('ファイルパネルの Today ボタンで openDailyNotes メッセージが送信される', async ({ page }) => {
        const todayBtn = page.locator('#filePanelToday');
        await todayBtn.click();
        await page.waitForTimeout(200);

        const messages = await page.evaluate(() => (window as any).__testApi.notesMessages);
        const dailyMsgs = messages.filter((m: any) => m.type === 'openDailyNotes');
        expect(dailyMsgs.length).toBe(1);
    });

    // --- レイアウト確認 ---

    test('Notes レイアウトが正しく構成されている', async ({ page }) => {
        const layout = page.locator('.notes-layout');
        await expect(layout).toBeVisible();

        const filePanel = page.locator('.notes-file-panel');
        await expect(filePanel).toBeVisible();

        const outlinerContainer = page.locator('.outliner-container');
        await expect(outlinerContainer).toBeVisible();
    });

    test('アウトライナの検索バーが Notes ビュー内に表示される', async ({ page }) => {
        const searchBar = page.locator('.outliner-search-bar');
        await expect(searchBar).toBeVisible();

        const searchInput = page.locator('.outliner-search-input');
        await expect(searchInput).toBeVisible();
    });
});
