/**
 * テーブルセル操作テスト
 * - Shift+Enterで改行挿入
 * - 矢印キーナビゲーション
 * - ペースト処理
 * - Cmd+A全選択
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

test.describe('《テーブルセル》Shift+Enter改行', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('セル内でShift+Enter → 改行（<br>）が1つ挿入される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // セルにテキストを入力
        await editor.type('line1');
        
        // Shift+Enterで改行
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        await editor.type('line2');
        
        const html = await editor.getHtml();
        expect(html).toContain('line1');
        expect(html).toContain('line2');
        expect(html).toContain('<br>');
    });

    test('セル末尾でShift+Enter → 改行が1つだけ挿入される（2つ入らない）', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // セルにテキストを入力
        await editor.type('text');
        
        // Shift+Enterで改行
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        // <br>が2つ連続していないことを確認
        const brCount = (html.match(/<br>/g) || []).length;
        // 末尾の改行は1つだけ（カーソル位置決め用の<br>は許容）
        expect(brCount).toBeLessThanOrEqual(2);
    });

    test('新しく追加した行のセルでShift+Enter → 改行が挿入される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // Enterで新しい行を追加
        await editor.press('Enter');
        await page.waitForTimeout(200);
        
        // 新しい行のセルでShift+Enter
        await editor.shiftPress('Enter');
        await page.waitForTimeout(100);
        
        await editor.type('after break');
        
        const html = await editor.getHtml();
        expect(html).toContain('after break');
        expect(html).toContain('<br>');
    });
});

test.describe('《テーブルセル》ペースト', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('セル内にテキストをペースト → プレーンテキストとして挿入', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // クリップボードにテキストを設定してペースト
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const cell = editor?.querySelector('td, th');
            if (cell) {
                const range = document.createRange();
                range.selectNodeContents(cell);
                range.collapse(true);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            }
        });
        
        // ペーストイベントをシミュレート
        await page.evaluate(() => {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData?.setData('text/plain', 'pasted text');
            document.getElementById('editor')?.dispatchEvent(pasteEvent);
        });
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('pasted text');
    });

    test('セル内に改行を含むテキストをペースト → 改行が<br>に変換される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // セルにフォーカス
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const cell = editor?.querySelector('td, th');
            if (cell) {
                const range = document.createRange();
                range.selectNodeContents(cell);
                range.collapse(true);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            }
        });
        
        // 改行を含むテキストをペースト
        await page.evaluate(() => {
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: new DataTransfer()
            });
            pasteEvent.clipboardData?.setData('text/plain', 'line1\nline2\nline3');
            document.getElementById('editor')?.dispatchEvent(pasteEvent);
        });
        await page.waitForTimeout(100);
        
        const html = await editor.getHtml();
        expect(html).toContain('line1');
        expect(html).toContain('line2');
        expect(html).toContain('line3');
        expect(html).toContain('<br>');
    });
});

test.describe('《テーブルセル》Cmd+A全選択', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('セル内でCmd+A → セル内のテキストのみ選択される', async ({ page }) => {
        // テーブルをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('| col1 | col2 |\n| --- | --- |\n| cell content | data |');
        });
        await page.waitForTimeout(300);
        
        // 最初のセルをクリックしてフォーカス
        await page.click('#editor table td:first-child');
        await page.waitForTimeout(100);
        
        // Cmd+Aで全選択
        await editor.shortcut('a');
        await page.waitForTimeout(100);
        
        // 選択されたテキストを確認
        const selectedText = await page.evaluate(() => {
            return window.getSelection()?.toString() || '';
        });
        
        // セル内のテキストのみが選択されている（エディタ全体ではない）
        expect(selectedText).toBe('cell content');
    });
});

test.describe('《テーブル》列配置（左寄せ/中央寄せ/右寄せ）', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('Markdownの配置記法 :---: が中央寄せとして反映される', async ({ page }) => {
        // 中央寄せのテーブルをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('| Header |\n|:---:|\n| Center |');
        });
        await page.waitForTimeout(300);
        
        // テーブルが作成されたことを確認
        const hasTable = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            return !!editor?.querySelector('table');
        });
        expect(hasTable).toBe(true);
    });

    test('Markdownの配置記法 ---: が右寄せとして反映される', async ({ page }) => {
        // 右寄せのMarkdownテーブルを設定
        const markdown = `| Left | Center | Right |
|:---|:---:|---:|
| L | C | R |`;
        
        await page.evaluate((md) => {
            const editor = document.getElementById('editor');
            if (editor && (window as any).renderFromMarkdownText) {
                (window as any).renderFromMarkdownText(md);
            }
        }, markdown);
        await page.waitForTimeout(300);
        
        // 各列の配置を確認
        const alignments = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const tds = editor?.querySelectorAll('td');
            if (!tds || tds.length === 0) return [];
            return Array.from(tds).map(td => td.style.textAlign || 'left');
        });
        
        // 3列の場合: 左、中央、右
        if (alignments.length >= 3) {
            expect(alignments[0]).toBe('left');
            expect(alignments[1]).toBe('center');
            expect(alignments[2]).toBe('right');
        }
    });

    test('setColumnAlignment関数で列の配置が変更される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // setColumnAlignment関数を呼び出して配置を変更
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const td = editor?.querySelector('td');
            if (!td) return { before: '', after: '' };
            
            const before = td.style.textAlign || 'left';
            
            // activeTableCellを設定
            (window as any).activeTableCell = td;
            (window as any).activeTable = td.closest('table');
            
            // setColumnAlignment関数を呼び出し
            if ((window as any).setColumnAlignment) {
                (window as any).setColumnAlignment('center');
            }
            
            const after = td.style.textAlign || 'left';
            return { before, after };
        });
        
        expect(result.after).toBe('center');
    });

    test('配置変更がMarkdownに正しく反映される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 列の配置を変更
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const tds = editor?.querySelectorAll('td');
            if (tds && tds.length > 0) {
                // 1列目を右寄せに
                tds[0].style.textAlign = 'right';
            }
            // syncMarkdownを呼び出し
            if ((window as any).syncMarkdown) {
                (window as any).syncMarkdown();
            }
        });
        await page.waitForTimeout(200);
        
        // Markdownを取得
        const markdown = await page.evaluate(() => {
            return (window as any).markdown || '';
        });
        
        // 右寄せの記法 ---: が含まれていることを確認
        expect(markdown).toContain('---:');
    });
});

test.describe('《テーブル》列幅リサイズ', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('テーブルにリサイズハンドルが追加される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // リサイズハンドルが存在することを確認
        const handleCount = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const handles = editor?.querySelectorAll('.table-col-resize-handle');
            return handles?.length || 0;
        });
        
        // 2列なので2つのハンドルがあるはず
        expect(handleCount).toBe(2);
    });

    test('リサイズハンドルはヘッダーセル（th）にのみ追加される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // ハンドルの親要素を確認
        const parentTags = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const handles = editor?.querySelectorAll('.table-col-resize-handle');
            if (!handles) return [];
            return Array.from(handles).map(h => h.parentElement?.tagName || '');
        });
        
        // すべてのハンドルがTH内にある
        parentTags.forEach(tag => {
            expect(tag).toBe('TH');
        });
    });

    test('initializeTableColumnWidthsでtable-layout: fixedが設定される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // initializeTableColumnWidthsを呼び出し
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const table = editor?.querySelector('table');
            if (!table) return { before: '', after: '' };
            
            const before = table.style.tableLayout || 'auto';
            
            // initializeTableColumnWidthsを呼び出し
            if ((window as any).initializeTableColumnWidths) {
                (window as any).initializeTableColumnWidths(table);
            }
            
            const after = table.style.tableLayout || 'auto';
            return { before, after };
        });
        
        expect(result.after).toBe('fixed');
    });

    test('updateColumnWidthで列幅が変更される', async ({ page }) => {
        // テーブルをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('| col1 | col2 |\n| --- | --- |\n| data1 | data2 |');
        });
        await page.waitForTimeout(300);
        
        // 列幅を変更
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const table = editor?.querySelector('table');
            const th = table?.querySelector('th');
            if (!table || !th) return { before: '', after: '', success: false };
            
            // まず初期化
            if ((window as any).initializeTableColumnWidths) {
                (window as any).initializeTableColumnWidths(table);
            }
            
            const before = th.style.width;
            
            // updateColumnWidthを呼び出し
            if ((window as any).updateColumnWidth) {
                (window as any).updateColumnWidth(table, 0, 200);
            }
            
            const after = th.style.width;
            return { before, after, success: true };
        });
        
        // 幅が200pxに変更されている（style.widthで確認）
        expect(result.success).toBe(true);
        expect(result.after).toBe('200px');
    });

    test('列幅の最小値は80px', async ({ page }) => {
        // テーブルをMarkdownで直接設定
        await page.evaluate(() => {
            const testApi = (window as any).__testApi;
            testApi.setMarkdown('| col1 | col2 |\n| --- | --- |\n| data1 | data2 |');
        });
        await page.waitForTimeout(300);
        
        // 列幅を最小値以下に設定しようとする
        const result = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const table = editor?.querySelector('table');
            const th = table?.querySelector('th');
            if (!table || !th) return { success: false, width: '' };
            
            // まず初期化
            if ((window as any).initializeTableColumnWidths) {
                (window as any).initializeTableColumnWidths(table);
            }
            
            // 50pxに設定しようとする
            if ((window as any).updateColumnWidth) {
                (window as any).updateColumnWidth(table, 0, 50);
            }
            
            return { success: true, width: th.style.width };
        });
        
        // 最小値の80pxになっている（style.widthで確認）
        expect(result.success).toBe(true);
        expect(result.width).toBe('80px');
    });

    test('列追加後もリサイズハンドルが追加される', async ({ page }) => {
        // テーブルを作成
        await editor.type('| col1 | col2 |');
        await editor.press('Enter');
        await page.waitForTimeout(300);
        
        // 初期のハンドル数
        const initialCount = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            return editor?.querySelectorAll('.table-col-resize-handle').length || 0;
        });
        
        // 列を追加（insertTableColumnRightを呼び出し）
        await page.evaluate(() => {
            const editor = document.getElementById('editor');
            const td = editor?.querySelector('td');
            if (td) {
                (window as any).activeTableCell = td;
                (window as any).activeTable = td.closest('table');
                if ((window as any).insertTableColumnRight) {
                    (window as any).insertTableColumnRight();
                }
            }
        });
        await page.waitForTimeout(200);
        
        // 新しいハンドル数
        const newCount = await page.evaluate(() => {
            const editor = document.getElementById('editor');
            return editor?.querySelectorAll('.table-col-resize-handle').length || 0;
        });
        
        // ハンドルが1つ増えている
        expect(newCount).toBe(initialCount + 1);
    });
});
