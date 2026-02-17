"use strict";
/**
 * Round-trip変換テスト
 * Markdown → HTML → Markdown の変換で意味的に等価な結果を検証
 */
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
test_1.test.describe('Round-trip変換', () => {
    test_1.test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => window.__testApi?.ready);
    });
    (0, test_1.test)('《見出し》のRound-trip', async ({ page }) => {
        const markdown = '# 見出し1\n\n## 見出し2\n\n### 見出し3';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        (0, test_1.expect)(result).toContain('# 見出し1');
        (0, test_1.expect)(result).toContain('## 見出し2');
        (0, test_1.expect)(result).toContain('### 見出し3');
    });
    (0, test_1.test)('《段落》のRound-trip', async ({ page }) => {
        const markdown = 'これは段落です。\n\nこれは別の段落です。';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        (0, test_1.expect)(result).toContain('これは段落です。');
        (0, test_1.expect)(result).toContain('これは別の段落です。');
    });
    (0, test_1.test)('《順序なしリスト》のRound-trip（正規化）', async ({ page }) => {
        // 入力: * と + を使用
        const markdown = '* アイテム1\n+ アイテム2\n- アイテム3';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        // 出力: すべて - に正規化
        (0, test_1.expect)(result).toContain('- アイテム1');
        (0, test_1.expect)(result).toContain('- アイテム2');
        (0, test_1.expect)(result).toContain('- アイテム3');
    });
    (0, test_1.test)('《太字》のRound-trip（正規化）', async ({ page }) => {
        // 入力: __ を使用
        const markdown = '__太字テキスト__';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        // 出力: ** に正規化
        (0, test_1.expect)(result).toContain('**太字テキスト**');
    });
    (0, test_1.test)('《斜体》のRound-trip（正規化）', async ({ page }) => {
        // 入力: _ を使用
        const markdown = '_斜体テキスト_';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        // 出力: * に正規化
        (0, test_1.expect)(result).toContain('*斜体テキスト*');
    });
    (0, test_1.test)('《コードブロック》のRound-trip（言語タグ保持）', async ({ page }) => {
        const markdown = '```javascript\nconst x = 1;\n```';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        (0, test_1.expect)(result).toContain('```javascript');
        (0, test_1.expect)(result).toContain('const x = 1;');
    });
    (0, test_1.test)('《画像》パスにアンダースコア含む場合の保持', async ({ page }) => {
        const markdown = '![alt](path_with_underscore.png)';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        // アンダースコアが斜体として誤解釈されていないこと
        (0, test_1.expect)(result).toContain('path_with_underscore.png');
        (0, test_1.expect)(result).not.toContain('<em>');
    });
    (0, test_1.test)('《引用》複数行の保持', async ({ page }) => {
        const markdown = '> 引用1行目\n> 引用2行目\n> 引用3行目';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        // 各行に > プレフィックスが保持されていること
        const lines = result.split('\n').filter((l) => l.startsWith('>'));
        (0, test_1.expect)(lines.length).toBeGreaterThanOrEqual(3);
    });
    (0, test_1.test)('《水平線》のRound-trip（正規化）', async ({ page }) => {
        // 入力: *** を使用
        const markdown = '***';
        await page.evaluate((md) => {
            window.__testApi.setMarkdown(md);
        }, markdown);
        const result = await page.evaluate(() => {
            return window.__testApi.getMarkdown();
        });
        // 出力: --- に正規化
        (0, test_1.expect)(result).toContain('---');
    });
});
//# sourceMappingURL=roundtrip.spec.js.map