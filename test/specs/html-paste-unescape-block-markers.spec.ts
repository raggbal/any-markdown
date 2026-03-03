/**
 * HTMLペースト時のブロックレベルMarkdown構文エスケープ解除テスト
 *
 * Turndownはテキストノード内の行頭 -, +, >, # 等をエスケープする（\-, \+ 等）。
 * これはHTMLの段落セマンティクスを保持するためだが、Markdownエディタにペーストする場合は
 * Markdown構文として解釈されるべき。
 *
 * 例: <p>- Amazon Bedrock...</p> → "\- Amazon Bedrock..." ではなく "- Amazon Bedrock..."
 */

import { test, expect } from '@playwright/test';
import { EditorTestHelper } from '../utils/editor-test-helper';

// 外部HTMLペーストをシミュレート
async function simulateHtmlPaste(page, html: string, plainText?: string) {
    await page.evaluate(({ html, text }) => {
        const editor = document.getElementById('editor');

        const clipboardData = {
            _data: {
                'text/plain': text || '',
                'text/html': html,
            },
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
    }, { html, text: plainText || '' });
}

async function setupEmptyEditor(page) {
    await page.evaluate(() => {
        const editor = document.getElementById('editor');
        editor.innerHTML = '<p><br></p>';
        const p = editor.querySelector('p');
        const range = document.createRange();
        range.selectNodeContents(p);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    });
    await page.waitForTimeout(100);
}

test.describe('HTMLペースト - ブロックレベルMarkdown構文のエスケープ解除', () => {
    let editor: EditorTestHelper;

    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForSelector('#editor');
        editor = new EditorTestHelper(page);
        await editor.focus();
    });

    test('行頭の \\- がリスト項目として解釈される（<p>形式のバレット）', async ({ page }) => {
        await setupEmptyEditor(page);

        // HTMLが <ul><li> ではなく <p> や <div> でバレットを表現している場合
        // Turndownはテキストの行頭 - をエスケープする
        await simulateHtmlPaste(page,
            '<p>- Amazon Bedrock、OpenAI API</p><p>- MLOps・LLMOps</p><p>- フロントエンド開発</p>',
            '- Amazon Bedrock、OpenAI API\n- MLOps・LLMOps\n- フロントエンド開発'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (\\- unescape):', JSON.stringify(md));

        // \- ではなく - としてリスト項目になること
        expect(md).not.toContain('\\-');
        expect(md).toContain('- Amazon Bedrock');
        expect(md).toContain('- MLOps');
        expect(md).toContain('- フロントエンド開発');
    });

    test('行頭の \\+ がリスト項目として解釈される', async ({ page }) => {
        await setupEmptyEditor(page);

        await simulateHtmlPaste(page,
            '<p>+ item1</p><p>+ item2</p>',
            '+ item1\n+ item2'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (\\+ unescape):', JSON.stringify(md));

        expect(md).not.toContain('\\+');
        // + は - に正規化される
        expect(md).toContain('- item1');
        expect(md).toContain('- item2');
    });

    test('行頭の数字\\. が順序付きリストとして解釈される', async ({ page }) => {
        await setupEmptyEditor(page);

        await simulateHtmlPaste(page,
            '<p>1. first item</p><p>2. second item</p><p>3. third item</p>',
            '1. first item\n2. second item\n3. third item'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (ordered unescape):', JSON.stringify(md));

        expect(md).not.toContain('\\.');
        expect(md).toMatch(/\d+\.\s+first item/);
        expect(md).toMatch(/\d+\.\s+second item/);
        expect(md).toMatch(/\d+\.\s+third item/);
    });

    test('行頭の \\> がブロック引用として解釈される', async ({ page }) => {
        await setupEmptyEditor(page);

        await simulateHtmlPaste(page,
            '<p>> quoted text</p><p>> more quoted</p>',
            '> quoted text\n> more quoted'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (\\> unescape):', JSON.stringify(md));

        expect(md).not.toContain('\\>');
        expect(md).toContain('> quoted text');
    });

    test('行頭の \\# が見出しとして解釈される', async ({ page }) => {
        await setupEmptyEditor(page);

        await simulateHtmlPaste(page,
            '<p># Heading Text</p>',
            '# Heading Text'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (\\# unescape):', JSON.stringify(md));

        expect(md).not.toContain('\\#');
        expect(md).toContain('# Heading Text');
    });

    test('正規の <ul><li> HTMLは引き続き正しく変換される', async ({ page }) => {
        await setupEmptyEditor(page);

        // 正規の <ul><li> 構造はcompactListItemルールで処理される（エスケープ問題なし）
        await simulateHtmlPaste(page,
            '<ul><li>item1</li><li>item2</li><li>item3</li></ul>',
            'item1\nitem2\nitem3'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (proper ul>li):', JSON.stringify(md));

        expect(md).toContain('- item1');
        expect(md).toContain('- item2');
        expect(md).toContain('- item3');
    });

    test('複数の <div> によるバレットリスト', async ({ page }) => {
        await setupEmptyEditor(page);

        // <div>形式でバレットを表現（一部のアプリケーションの出力形式）
        await simulateHtmlPaste(page,
            '<div>- Amazon Bedrock</div><div>- MLOps</div><div>- API設計</div>',
            '- Amazon Bedrock\n- MLOps\n- API設計'
        );
        await page.waitForTimeout(300);

        const md = await editor.getMarkdown();
        console.log('Markdown output (div bullets):', JSON.stringify(md));

        expect(md).not.toContain('\\-');
        expect(md).toContain('- Amazon Bedrock');
        expect(md).toContain('- MLOps');
        expect(md).toContain('- API設計');
    });
});
