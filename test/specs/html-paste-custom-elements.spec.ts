import { test, expect } from '@playwright/test';

test.describe('HTMLペースト - カスタム要素除去とコードブロック言語クリーンアップ', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000/standalone-editor.html');
        await page.waitForSelector('.editor');
    });

    function pasteHtml(page: any, html: string, plain: string) {
        return page.evaluate(async ({ html, plain }: { html: string, plain: string }) => {
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
            dt.setData('text/plain', plain);
            const pasteEvent = new ClipboardEvent('paste', {
                clipboardData: dt,
                bubbles: true,
                cancelable: true
            });
            editor.dispatchEvent(pasteEvent);

            await new Promise(r => setTimeout(r, 500));

            // Get the markdown via syncMarkdown
            const getMd = (window as any).testGetMarkdown || (() => editor.innerText);
            return {
                html: editor.innerHTML,
                md: getMd()
            };
        }, { html, plain });
    }

    test('<Steps>/<Step> タグが除去されてコンテンツのみ残る', async ({ page }) => {
        const html = `<div>
            <p>Some text before</p>
            <Steps>
                <Step title="Navigate to the project root">
                    <pre><code class="language-bash">cd /path/to/project</code></pre>
                </Step>
                <Step title="Start Claude Code">
                    <pre><code class="language-bash">claude</code></pre>
                </Step>
            </Steps>
            <p>Some text after</p>
        </div>`;

        const result = await pasteHtml(page, html, 'Some text\ncd /path/to/project\nclaude');

        // Should NOT contain <Steps> or <Step> tags
        expect(result.html).not.toContain('<steps');
        expect(result.html).not.toContain('<step');
        expect(result.html).not.toContain('</Steps>');
        expect(result.html).not.toContain('</Step>');
        // Content should be preserved (code is syntax-highlighted so check innerText-style)
        expect(result.html).toContain('/path/to/project');
        expect(result.html).toContain('data-lang="bash"');
    });

    test('<Tip>/<Note>/<Warning> タグが除去される', async ({ page }) => {
        const html = `<div>
            <p>Introduction text</p>
            <Tip>
                <p>This is a tip about something important.</p>
            </Tip>
            <Note>
                <p>This is a note.</p>
            </Note>
            <Warning>
                <p>This is a warning.</p>
            </Warning>
        </div>`;

        const result = await pasteHtml(page, html, 'Introduction text\nThis is a tip.\nThis is a note.\nThis is a warning.');

        expect(result.html).not.toContain('<Tip');
        expect(result.html).not.toContain('<Note');
        expect(result.html).not.toContain('<Warning');
        expect(result.html).toContain('This is a tip');
        expect(result.html).toContain('This is a note');
        expect(result.html).toContain('This is a warning');
    });

    test('<Tabs>/<Tab> タグが除去される', async ({ page }) => {
        const html = `<div>
            <Tabs>
                <Tab title="macOS">
                    <p>macOS instructions here</p>
                </Tab>
                <Tab title="Linux">
                    <p>Linux instructions here</p>
                </Tab>
            </Tabs>
        </div>`;

        const result = await pasteHtml(page, html, 'macOS instructions\nLinux instructions');

        expect(result.html).not.toContain('<Tabs');
        expect(result.html).not.toContain('<Tab');
        expect(result.html).toContain('macOS instructions');
        expect(result.html).toContain('Linux instructions');
    });

    test('<Card>/<CardGroup> タグが除去される', async ({ page }) => {
        const html = `<div>
            <CardGroup cols="2">
                <Card title="Best practices" href="/en/best-practices">
                    <p>Patterns for getting the most out of Claude Code</p>
                </Card>
                <Card title="How it works" href="/en/how-it-works">
                    <p>Understand the agentic loop</p>
                </Card>
            </CardGroup>
        </div>`;

        const result = await pasteHtml(page, html, 'Best practices\nHow it works');

        expect(result.html).not.toContain('<Card');
        expect(result.html).not.toContain('<CardGroup');
        expect(result.html).toContain('Patterns for getting the most out of Claude Code');
        expect(result.html).toContain('Understand the agentic loop');
    });

    test('コードブロック言語タグから theme={null} が除去される', async ({ page }) => {
        // Simulate pasting markdown that contains theme={null} in code fences
        const html = `<div>
            <p>Example:</p>
            <pre><code class="language-bash  theme={null}">cd /path/to/project</code></pre>
            <p>Another:</p>
            <pre><code class="language-json  theme={null}">{"key": "value"}</code></pre>
        </div>`;

        const result = await pasteHtml(page, html, 'cd /path/to/project\n{"key": "value"}');

        // Should have code blocks with clean language tags
        expect(result.html).not.toContain('theme=');
        expect(result.html).not.toContain('{null}');
    });

    test('通常のコードブロック（theme属性なし）は影響を受けない', async ({ page }) => {
        const html = `<div>
            <pre><code class="language-javascript">const x = 1;</code></pre>
        </div>`;

        const result = await pasteHtml(page, html, 'const x = 1;');

        // Code is syntax-highlighted, so check for key parts
        expect(result.html).toContain('data-lang="javascript"');
        expect(result.html).toContain('const');
        expect(result.html).toContain('x =');

    });
});
