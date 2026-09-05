import { test, expect } from '@playwright/test';

type CopyTestWindow = Window & {
    __testApi: {
        ready: boolean;
        setMarkdown: (markdown: string) => void;
        getMarkdown: () => string;
    };
    __copiedCode: string[];
};

const cases = [
    { name: 'single-line code', lang: 'javascript', text: 'const x = 1;' },
    { name: 'separate shell commands', lang: 'bash', text: 'pwd\nwhoami' },
    { name: 'an unlabelled block', lang: '', text: 'pwd\nwhoami' },
    { name: 'an internal blank line', lang: 'bash', text: 'pwd\n\nwhoami' },
    {
        name: 'shell line continuations',
        lang: 'bash',
        text: ['printf \\', '  "%s\\n" \\', '  "hello"'].join('\n')
    },
    { name: 'a shell comment', lang: 'bash', text: '# Print the current directory\npwd' },
    { name: 'a heredoc', lang: 'bash', text: "cat <<'EOF'\nfirst line\nsecond line\nEOF" },
    { name: 'highlighted code', lang: 'javascript', text: 'const x = 1;\nconsole.log(x);' },
    {
        name: 'indentation, tabs, trailing spaces, and literal HTML',
        lang: 'bash',
        text: '  printf "<br>&value"\n\tprintf "done"  '
    },
    { name: 'a leading blank line', lang: 'bash', text: '\npwd\nwhoami' },
    { name: 'a trailing blank line', lang: 'bash', text: 'pwd\nwhoami\n' },
    { name: 'two trailing blank lines', lang: '', text: 'pwd\n\n' },
    { name: 'an empty block', lang: '', text: '' }
];

test.describe('Code block copy preserves source text', () => {
    test.beforeEach(async ({ page }) => {
        // Capture the clipboard API boundary per page to avoid system clipboard
        // races between parallel tests. Existing UI tests cover the native API.
        await page.addInitScript(() => {
            const testWindow = window as unknown as CopyTestWindow;
            testWindow.__copiedCode = [];
            Object.defineProperty(navigator.clipboard, 'writeText', {
                value: async (text: string) => {
                    testWindow.__copiedCode.push(text);
                }
            });
        });
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as unknown as CopyTestWindow).__testApi?.ready);
    });

    for (const mode of ['display', 'edit']) {
        for (const { name, lang, text } of cases) {
            test(`copies ${name} from ${mode} mode`, async ({ page }) => {
                const markdown = '```' + lang + '\n' + text + '\n```\n';
                await page.evaluate(md => (window as unknown as CopyTestWindow).__testApi.setMarkdown(md), markdown);

                const block = page.locator('#editor pre').first();
                if (mode === 'edit') {
                    if (text === '') {
                        // The standalone fixture gives an empty code element no
                        // clickable text area. Invoke its normal edit-mode listener.
                        await block.locator('code').dispatchEvent('click');
                    } else {
                        await block.locator('code').click();
                    }
                }
                await expect(block).toHaveAttribute('data-mode', mode);

                const copyButton = block.locator('.code-copy-btn');
                await copyButton.click();
                await expect(copyButton).toHaveText('Copied!');
                await expect(block).toHaveAttribute('data-mode', 'display');

                // Copying must leave the document intact, including blank lines.
                expect(await page.evaluate(() => (window as unknown as CopyTestWindow).__testApi.getMarkdown())).toBe(markdown);
                expect(await page.evaluate(() => (window as unknown as CopyTestWindow).__copiedCode)).toEqual([text]);
            });
        }
    }

    test('copies the latest edit when leaving edit mode', async ({ page }) => {
        await page.evaluate(() => (window as unknown as CopyTestWindow).__testApi.setMarkdown('```bash\necho one\necho two\n```\n'));
        const block = page.locator('#editor pre').first();
        await block.locator('code').click();
        await expect(block).toHaveAttribute('data-mode', 'edit');
        // Entering edit mode places the caret at the start of the first line.
        await page.keyboard.press('End');
        await page.keyboard.type(' updated');
        await block.locator('.code-copy-btn').click();
        await expect(block.locator('.code-copy-btn')).toHaveText('Copied!');

        const expectedText = 'echo one updated\necho two';
        expect(await page.evaluate(() => (window as unknown as CopyTestWindow).__testApi.getMarkdown())).toBe('```bash\n' + expectedText + '\n```\n');
        expect(await page.evaluate(() => (window as unknown as CopyTestWindow).__copiedCode)).toEqual([expectedText]);
    });
});
