import { test, expect } from '@playwright/test';

test.describe('HTML paste - link normalization', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('.editor');
    });

    test('normalizes multi-line link content from pasted HTML with block elements inside <a>', async ({ page }) => {
        // HTML like what Claude Code docs produces:
        // <a href="/docs/en/how-claude-code-works"><div>How Claude Code works</div></a>
        const html = `<ul>
            <li><a href="/docs/en/how-claude-code-works">
                <div>How Claude Code works</div>
            </a></li>
            <li><a href="/docs/en/features-overview">
                <div>Extend Claude Code</div>
            </a></li>
        </ul>`;

        const result = await page.evaluate(async (html) => {
            const editor = document.querySelector('.editor') as HTMLElement;
            // Focus and set cursor
            editor.focus();
            const p = editor.querySelector('p') || editor;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            // Create paste event with HTML
            const dt = new DataTransfer();
            dt.setData('text/html', html);
            dt.setData('text/plain', 'How Claude Code works\nExtend Claude Code');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);

            await new Promise(r => setTimeout(r, 500));

            return editor.innerHTML;
        }, html);

        // Links should be single-line in the resulting HTML, not multi-line
        // The pasted HTML should produce proper <a> tags with clean text
        expect(result).toContain('How Claude Code works');
        expect(result).toContain('Extend Claude Code');
        // Should NOT contain newlines inside link text
        expect(result).not.toMatch(/\[\s*\n/);
    });

    test('normalizes navigation links with newlines inside <a> tags', async ({ page }) => {
        // Navigation-style links with newlines
        const html = `<a href="/docs/en/overview">Getting started
        </a><a href="/docs/en/sub-agents">Build with Claude Code
        </a>`;

        const result = await page.evaluate(async (html) => {
            const editor = document.querySelector('.editor') as HTMLElement;
            editor.focus();
            const p = editor.querySelector('p') || editor;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            const dt = new DataTransfer();
            dt.setData('text/html', html);
            dt.setData('text/plain', 'Getting started Build with Claude Code');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);

            await new Promise(r => setTimeout(r, 500));

            return editor.innerHTML;
        }, html);

        expect(result).toContain('Getting started');
        expect(result).toContain('Build with Claude Code');
    });

    test('preserves normal single-line links', async ({ page }) => {
        const html = `<p>Visit <a href="https://example.com">Example Site</a> for more info.</p>`;

        const result = await page.evaluate(async (html) => {
            const editor = document.querySelector('.editor') as HTMLElement;
            editor.focus();
            const p = editor.querySelector('p') || editor;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            const dt = new DataTransfer();
            dt.setData('text/html', html);
            dt.setData('text/plain', 'Visit Example Site for more info.');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);

            await new Promise(r => setTimeout(r, 500));

            return editor.innerHTML;
        }, html);

        expect(result).toContain('Example Site');
        expect(result).toContain('https://example.com');
    });

    test('handles <a> with title attribute', async ({ page }) => {
        const html = `<p><a href="https://example.com" title="Example">
            Visit Here
        </a></p>`;

        const result = await page.evaluate(async (html) => {
            const editor = document.querySelector('.editor') as HTMLElement;
            editor.focus();
            const p = editor.querySelector('p') || editor;
            const sel = window.getSelection()!;
            const range = document.createRange();
            range.selectNodeContents(p);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);

            const dt = new DataTransfer();
            dt.setData('text/html', html);
            dt.setData('text/plain', 'Visit Here');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);

            await new Promise(r => setTimeout(r, 500));

            return editor.innerHTML;
        }, html);

        expect(result).toContain('Visit Here');
    });
});
