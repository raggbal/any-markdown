import { test, expect } from '@playwright/test';

// ヘルパー関数: プレーンテキストとしてペーストをシミュレート
async function simulatePlainTextPaste(page: any, text: string) {
    await page.evaluate((pastedText: string) => {
        const editor = document.getElementById('editor')!;

        const clipboardData = {
            _data: {
                'text/plain': pastedText,
                'text/html': ''
            } as Record<string, string>,
            getData: function(type: string) {
                return this._data[type] || '';
            },
            setData: function(type: string, value: string) {
                this._data[type] = value;
            },
            items: []
        };

        const event = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: new DataTransfer()
        });

        Object.defineProperty(event, 'clipboardData', {
            value: clipboardData,
            writable: false,
            configurable: true
        });

        editor.dispatchEvent(event);
    }, text);
}

test.describe('Paste markdown table with multi-line cells', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('should paste a simple table with cell content containing newlines', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Table where header row has a newline in the second cell
        const tableText = [
            '| Header1 | Header2',
            'continued | Header3 |',
            '| --- | --- | --- |',
            '| cell1 | cell2 | cell3 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Verify table was created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // Verify column count (3 columns)
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        // Verify header content - second header should contain <br>
        const header2Html = await page.locator('#editor table th').nth(1).innerHTML();
        expect(header2Html).toContain('Header2');
        expect(header2Html).toContain('continued');
    });

    test('should paste a table with multiple newlines in data cells', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| Col1 | Col2 | Col3 |',
            '| --- | --- | --- |',
            '| data1',
            'line2 | data2',
            'line2',
            'line3 | data3 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Table should be created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // 3 columns
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        // 1 data row (header row has <th>, data rows have <td>)
        const dataRowCount = await page.locator('#editor table tr:has(td)').count();
        expect(dataRowCount).toBe(1);

        // First cell should have multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('data1');
        expect(cell1Html).toContain('<br>');
        expect(cell1Html).toContain('line2');

        // Second cell should have multi-line content
        const cell2Html = await page.locator('#editor table td').nth(1).innerHTML();
        expect(cell2Html).toContain('data2');
        expect(cell2Html).toContain('line3');
    });

    test('should paste a complex table (SageMaker-like)', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Simplified version of the user's actual table
        const tableText = [
            '| データセット | 前処理 & 特徴量エンジニアリング',
            ' | 特徴量 | 学習 |',
            '| --- | --- | --- | --- |',
            '| バッチデータ',
            'S3 | バッチ加工',
            '- Processing Job | バッチ',
            '- FeatureStore | 実験管理 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Table should be created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // 4 columns
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(4);

        // 1 data row with 4 cells
        const tdCount = await page.locator('#editor table td').count();
        expect(tdCount).toBe(4);

        // First data cell should contain multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('バッチデータ');
        expect(cell1Html).toContain('S3');
    });

    test('should not affect normal table paste (no newlines in cells)', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| A | B | C |',
            '| --- | --- | --- |',
            '| 1 | 2 | 3 |',
            '| 4 | 5 | 6 |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        const tdCount = await page.locator('#editor table td').count();
        expect(tdCount).toBe(6);
    });

    test('should handle blank lines within cell content', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| H1 | H2 |',
            '| --- | --- |',
            '| line1',
            '',
            'line3 | data |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // First cell should have the multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('line1');
        expect(cell1Html).toContain('line3');
    });

    test('should preserve markdown roundtrip after paste', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const tableText = [
            '| A | B |',
            '| --- | --- |',
            '| cell with',
            'newline | normal |',
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Get markdown output
        const md = await page.evaluate(() => (window as any).__testApi.getMarkdown());

        // Should contain <br> in the cell (HTML→MD preserves <br>)
        expect(md).toContain('<br>');
        expect(md).toContain('cell with');
        expect(md).toContain('newline');
        expect(md).toContain('normal');
    });

    test('should handle flattened table with | <br> | as row separator', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Simulates Notion-style export: entire table on one line with | <br> | between rows
        const tableText = '| H1 | H2 | H3 | <br> | --- | --- | --- | <br> | a | b | c | <br> | d | e | f |';

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        // Table should be created
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // 3 columns (not 12+)
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(3);

        // 2 data rows
        const dataRowCount = await page.locator('#editor table tr:has(td)').count();
        expect(dataRowCount).toBe(2);

        // Verify cell content
        const cell1 = await page.locator('#editor table td').first().textContent();
        expect(cell1?.trim()).toBe('a');
    });

    test('should handle flattened table with cell-internal <br> preserved', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Mix of row-separating <br> and cell-internal <br>
        const tableText = '| H1 | H2 | <br> | --- | --- | <br> | line1<br>line2 | data |';

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(2);

        // Cell-internal <br> should be preserved
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('line1');
        expect(cell1Html).toContain('<br>');
        expect(cell1Html).toContain('line2');
    });

    test('should bypass Turndown when plain text contains markdown table', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Simulate paste with both text/html (p-wrapped) and text/plain (raw markdown table)
        const plainText = [
            '| H1 | H2 |',
            '| --- | --- |',
            '| a | b |',
        ].join('\n');

        // HTML wraps each line in <p> (typical browser clipboard)
        const htmlText = '<p>| H1 | H2 |</p><p>| --- | --- |</p><p>| a | b |</p>';

        await page.evaluate(({ plain, html }) => {
            const editor = document.getElementById('editor')!;
            const clipboardData = {
                _data: { 'text/plain': plain, 'text/html': html } as Record<string, string>,
                getData: function(type: string) { return this._data[type] || ''; },
                setData: function(type: string, value: string) { this._data[type] = value; },
                items: []
            };
            const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
            Object.defineProperty(event, 'clipboardData', { value: clipboardData, writable: false, configurable: true });
            editor.dispatchEvent(event);
        }, { plain: plainText, html: htmlText });

        await page.waitForTimeout(500);

        // Should create a table (not paragraphs from Turndown)
        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(2);
    });

    test('should bypass Turndown for multi-line cell table with HTML', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        const plainText = [
            '| Col1 | Col2 |',
            '| --- | --- |',
            '| line1',
            'line2 | data |',
        ].join('\n');

        // HTML version wraps in <p> tags
        const htmlText = '<p>| Col1 | Col2 |</p><p>| --- | --- |</p><p>| line1</p><p>line2 | data |</p>';

        await page.evaluate(({ plain, html }) => {
            const editor = document.getElementById('editor')!;
            const clipboardData = {
                _data: { 'text/plain': plain, 'text/html': html } as Record<string, string>,
                getData: function(type: string) { return this._data[type] || ''; },
                setData: function(type: string, value: string) { this._data[type] = value; },
                items: []
            };
            const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
            Object.defineProperty(event, 'clipboardData', { value: clipboardData, writable: false, configurable: true });
            editor.dispatchEvent(event);
        }, { plain: plainText, html: htmlText });

        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(2);

        // First cell should have multi-line content
        const cell1Html = await page.locator('#editor table td').first().innerHTML();
        expect(cell1Html).toContain('line1');
        expect(cell1Html).toContain('<br>');
        expect(cell1Html).toContain('line2');
    });

    test('should handle flattened SageMaker-style table with orphaned separator', async ({ page }) => {
        const editor = page.locator('#editor');
        await editor.click();

        // Simplified version: flattened table + orphaned 6-col separator
        const tableText = [
            '| A | B | <br> | --- | --- | <br> | x | y |',
            '| --- | --- | --- | --- | --- | --- |'
        ].join('\n');

        await simulatePlainTextPaste(page, tableText);
        await page.waitForTimeout(500);

        const tableCount = await page.locator('#editor table').count();
        expect(tableCount).toBe(1);

        // Should have 2 columns, not 6
        const thCount = await page.locator('#editor table th').count();
        expect(thCount).toBe(2);
    });
});
