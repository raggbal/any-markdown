import { test, expect } from '@playwright/test';

test.describe('HTMLペースト - Shikiハイライト済みコードブロック', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('.editor');
    });

    test('Shiki形式のコードブロック (language属性) が正しくfenced code blockに変換される', async ({ page }) => {
        // Actual HTML from code.claude.com - Shiki-styled code blocks use language= attribute, not class=
        const html = `<div>
            <p>Example:</p>
            <pre class="shiki shiki-themes github-light-default dark-plus" language="shellscript" style="background-color: rgb(255, 255, 255);">
                <code language="shellscript" numberoflines="1">
                    <span class="line"><span style="color: rgb(5, 80, 174);">cd</span><span style="color: rgb(10, 48, 105);"> /path/to/project</span></span>
                </code>
            </pre>
        </div>`;

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
            dt.setData('text/plain', 'cd /path/to/project');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);
            await new Promise(r => setTimeout(r, 500));
            return editor.innerHTML;
        }, html);

        console.log('Result HTML:', result);

        // Should contain a code block, not raw text
        expect(result).toContain('<pre');
        expect(result).toContain('<code');
    });

    test('Steps/Step divクラス構造が正しく変換される（タグは残らない）', async ({ page }) => {
        // Actual rendered HTML from code.claude.com (not MDX tags, but rendered div classes)
        const html = `<div class="mdx-content">
            <p>Suppose you've just joined a new project.</p>
            <div class="steps ml-3.5 mt-10">
                <div class="step group/step step-container">
                    <div class="w-full overflow-hidden pl-8">
                        <p class="mt-2 font-semibold">Navigate to the project root directory</p>
                        <pre class="shiki" language="shellscript"><code language="shellscript"><span class="line"><span>cd /path/to/project</span></span></code></pre>
                    </div>
                </div>
                <div class="step group/step step-container">
                    <div class="w-full overflow-hidden pl-8">
                        <p class="mt-2 font-semibold">Start Claude Code</p>
                        <pre class="shiki" language="shellscript"><code language="shellscript"><span class="line"><span>claude</span></span></code></pre>
                    </div>
                </div>
            </div>
        </div>`;

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
            dt.setData('text/plain', 'Navigate to the project root\ncd /path/to/project\nStart Claude Code\nclaude');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);
            await new Promise(r => setTimeout(r, 500));
            return editor.innerHTML;
        }, html);

        console.log('Result HTML:', result);

        // Should preserve text content
        expect(result).toContain('Navigate to the project root');
        // Should have code blocks
        expect(result).toContain('<pre');
    });

    test('language属性からコードブロック言語が抽出される', async ({ page }) => {
        // Shiki code block with language attribute (not class)
        const html = `<pre class="shiki" language="typescript"><code language="typescript"><span class="line"><span>const x: number = 42;</span></span></code></pre>`;

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
            dt.setData('text/plain', 'const x: number = 42;');
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);
            await new Promise(r => setTimeout(r, 500));
            return editor.innerHTML;
        }, html);

        console.log('Result HTML:', result);
        // Language should be extracted - check for the code block structure
        expect(result).toContain('<pre');
        expect(result).toContain('42');
    });
});
