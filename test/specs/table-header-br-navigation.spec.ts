import { test, expect } from '@playwright/test';

test.describe('Table header with <br> ArrowUp navigation', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => {
            if (msg.text().includes('[DEBUG]') || msg.text().includes('[Any MD]')) {
                console.log(`[BROWSER ${msg.type()}] ${msg.text()}`);
            }
        });
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('#editor', { state: 'visible' });
    });

    test('ArrowUp from data row to header with trailing <br> - cursor should be on last text line', async ({ page }) => {
        // Setup: table with header containing <br> line breaks
        // | ヘッダA<br>ｄ<br> | ヘッダB |
        // | --- | --- |
        // | セルA1 | セルB1 |
        const result = await page.evaluate(async () => {
            const editor = document.getElementById('editor');
            (window as any).__testApi.setMarkdown(
                '| ヘッダA<br>ｄ<br> | ヘッダB |\n| --- | --- |\n| セルA1 | セルB1 |'
            );
            await new Promise(r => setTimeout(r, 300));

            // Find cell A1 and click on it
            const table = editor.querySelector('table');
            if (!table) return { error: 'no table found' };

            const rows = table.querySelectorAll('tr');
            if (rows.length < 2) return { error: 'not enough rows, found: ' + rows.length };

            // Click on cell A1 (second row, first cell)
            const cellA1 = rows[1].cells[0];
            if (!cellA1) return { error: 'no cell A1' };

            cellA1.click();
            await new Promise(r => setTimeout(r, 100));

            // Set cursor to start of cell A1
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(cellA1);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            // Get header cell info before ArrowUp
            const headerCell = rows[0].cells[0];
            const headerHTML = headerCell.innerHTML;
            const headerChildNodes = Array.from(headerCell.childNodes).map(n =>
                n.nodeType === 3 ? `TEXT:"${n.textContent}"` : n.nodeName
            );

            // Press ArrowUp
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowUp',
                code: 'ArrowUp',
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(event);
            await new Promise(r => setTimeout(r, 200));

            // Check cursor position
            const newSel = window.getSelection();
            if (!newSel || !newSel.rangeCount) {
                return {
                    error: 'no selection after ArrowUp',
                    headerHTML,
                    headerChildNodes
                };
            }

            const newRange = newSel.getRangeAt(0);
            const cursorContainer = newRange.startContainer;
            const cursorOffset = newRange.startOffset;

            // Determine which element the cursor is in
            let cursorElement = cursorContainer;
            while (cursorElement && cursorElement.nodeType !== 1) {
                cursorElement = cursorElement.parentElement;
            }

            // Check if cursor is in the header cell
            const isInHeaderCell = headerCell.contains(cursorContainer);

            // Get text before cursor
            let textBeforeCursor = '';
            if (isInHeaderCell) {
                const testRange = document.createRange();
                testRange.selectNodeContents(headerCell);
                testRange.setEnd(cursorContainer, cursorOffset);
                textBeforeCursor = testRange.toString();
            }

            return {
                headerHTML,
                headerChildNodes,
                isInHeaderCell,
                cursorContainerType: cursorContainer.nodeType,
                cursorContainerName: cursorContainer.nodeName,
                cursorContainerText: cursorContainer.textContent?.substring(0, 30),
                cursorOffset,
                textBeforeCursor,
                cursorElementTag: (cursorElement as Element)?.tagName
            };
        });

        console.log('Table header ArrowUp result:', JSON.stringify(result));

        // Cursor should be in the header cell
        expect(result.isInHeaderCell).toBe(true);
        // Cursor should be at the start of the last text line (ｄ), not at the end
        // textBeforeCursor should include "ヘッダA" + linebreak but NOT "ｄ"
        expect(result.textBeforeCursor).not.toContain('ｄ');
    });

    test('ArrowUp from data row to single-line header - cursor at start', async ({ page }) => {
        // Simple case: single-line header
        const result = await page.evaluate(async () => {
            const editor = document.getElementById('editor');
            (window as any).__testApi.setMarkdown(
                '| ヘッダA | ヘッダB |\n| --- | --- |\n| セルA1 | セルB1 |'
            );
            await new Promise(r => setTimeout(r, 300));

            const table = editor.querySelector('table');
            const rows = table.querySelectorAll('tr');
            const cellA1 = rows[1].cells[0];

            cellA1.click();
            await new Promise(r => setTimeout(r, 100));

            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(cellA1);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            // Press ArrowUp
            const event = new KeyboardEvent('keydown', {
                key: 'ArrowUp',
                code: 'ArrowUp',
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(event);
            await new Promise(r => setTimeout(r, 200));

            const headerCell = rows[0].cells[0];
            const newSel = window.getSelection();
            const newRange = newSel.getRangeAt(0);
            const isInHeaderCell = headerCell.contains(newRange.startContainer);

            return {
                isInHeaderCell,
                headerHTML: headerCell.innerHTML
            };
        });

        console.log('Single-line header result:', JSON.stringify(result));
        expect(result.isInHeaderCell).toBe(true);
    });
});
