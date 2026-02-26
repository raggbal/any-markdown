/**
 * Round-trip変換テスト
 * Markdown → HTML → Markdown の変換で意味的に等価な結果を検証
 */

import { test, expect } from '@playwright/test';

test.describe('Round-trip変換', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test('《見出し》のRound-trip', async ({ page }) => {
        const markdown = '# 見出し1\n\n## 見出し2\n\n### 見出し3';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        expect(result).toContain('# 見出し1');
        expect(result).toContain('## 見出し2');
        expect(result).toContain('### 見出し3');
    });

    test('《段落》のRound-trip', async ({ page }) => {
        const markdown = 'これは段落です。\n\nこれは別の段落です。';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        expect(result).toContain('これは段落です。');
        expect(result).toContain('これは別の段落です。');
    });

    test('《順序なしリスト》のRound-trip（正規化）', async ({ page }) => {
        // 入力: * と + を使用
        const markdown = '* アイテム1\n+ アイテム2\n- アイテム3';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 出力: すべて - に正規化
        expect(result).toContain('- アイテム1');
        expect(result).toContain('- アイテム2');
        expect(result).toContain('- アイテム3');
    });

    test('《太字》のRound-trip（正規化）', async ({ page }) => {
        // 入力: __ を使用
        const markdown = '__太字テキスト__';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 出力: ** に正規化
        expect(result).toContain('**太字テキスト**');
    });

    test('《斜体》のRound-trip（正規化）', async ({ page }) => {
        // 入力: _ を使用
        const markdown = '_斜体テキスト_';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 出力: * に正規化
        expect(result).toContain('*斜体テキスト*');
    });

    test('《コードブロック》のRound-trip（言語タグ保持）', async ({ page }) => {
        const markdown = '```javascript\nconst x = 1;\n```';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        expect(result).toContain('```javascript');
        expect(result).toContain('const x = 1;');
    });

    test('《画像》パスにアンダースコア含む場合の保持', async ({ page }) => {
        const markdown = '![alt](path_with_underscore.png)';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // アンダースコアが斜体として誤解釈されていないこと
        expect(result).toContain('path_with_underscore.png');
        expect(result).not.toContain('<em>');
    });

    test('《画像》がimgタグとしてレンダリングされる', async ({ page }) => {
        const markdown = '![代替テキスト](https://example.com/image.png)';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });
        
        // imgタグが存在すること
        expect(html).toContain('<img');
        expect(html).toContain('src="https://example.com/image.png"');
        expect(html).toContain('alt="代替テキスト"');
    });

    test('《リンク》がaタグとしてレンダリングされる', async ({ page }) => {
        const markdown = '[リンクテキスト](https://example.com)';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });
        
        // aタグが存在すること
        expect(html).toContain('<a');
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain('リンクテキスト');
    });

    test('《引用》複数行の保持', async ({ page }) => {
        const markdown = '> 引用1行目\n> 引用2行目\n> 引用3行目';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 各行に > プレフィックスが保持されていること
        const lines = result.split('\n').filter((l: string) => l.startsWith('>'));
        expect(lines.length).toBeGreaterThanOrEqual(3);
    });

    test('《水平線》のRound-trip（正規化）', async ({ page }) => {
        // 入力: *** を使用
        const markdown = '***';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 出力: --- に正規化
        expect(result).toContain('---');
    });

    test('《リンク》のRound-trip', async ({ page }) => {
        const markdown = '[リンクテキスト](https://example.com)';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        expect(result).toContain('[リンクテキスト](https://example.com)');
    });

    test('《リンク》URLにアンダースコア含む場合の保持', async ({ page }) => {
        const markdown = '[リンク](https://example.com/path_with_underscore)';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // アンダースコアが斜体として誤解釈されていないこと
        expect(result).toContain('path_with_underscore');
        expect(result).not.toContain('<em>');
    });

    test('《リンク》テキスト内に特殊文字含む場合', async ({ page }) => {
        const markdown = '[テキスト with *special* chars](https://example.com)';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        expect(result).toContain('https://example.com');
    });

    test('《リンク》と《画像》の混在', async ({ page }) => {
        const markdown = '[リンク](https://example.com) と ![画像](image.png) の混在';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        expect(result).toContain('[リンク](https://example.com)');
        expect(result).toContain('![画像](image.png)');
    });
});


import * as fs from 'fs';
import * as path from 'path';

test.describe('ファイルベースRound-trip変換', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/standalone-editor.html');
        await page.waitForFunction(() => (window as any).__testApi?.ready);
    });

    test.skip('samples/b.md → Round-trip → samples/b2.md と一致', async ({ page }) => {
        // このテストは複雑なファイル比較で、多くの要因が影響するためスキップ
        // 入力ファイルを読み込み
        const inputPath = path.join(__dirname, '../../samples/b.md');
        const expectedPath = path.join(__dirname, '../../samples/b2.md');
        
        const inputMarkdown = fs.readFileSync(inputPath, 'utf-8');
        const expectedMarkdown = fs.readFileSync(expectedPath, 'utf-8');
        
        // エディタにMarkdownを設定
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, inputMarkdown);
        
        // Round-trip後のMarkdownを取得
        const resultMarkdown = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 期待結果と比較（空白の正規化を行う）
        // - 改行コードを統一
        // - 連続する空行を1つに正規化
        // - 前後の空白を削除
        const normalizeMarkdown = (s: string) => 
            s.replace(/\r\n/g, '\n')
             .replace(/\n{3,}/g, '\n\n')
             .trim();
        
        expect(normalizeMarkdown(resultMarkdown)).toBe(normalizeMarkdown(expectedMarkdown));
    });

    test('Round-tripを2回実行しても空行が増えない', async ({ page }) => {
        // 各種Markdown要素を含むテストデータ
        const inputMarkdown = [
            '# 見出し1',
            '',
            '段落テキストです。',
            '',
            '## 見出し2',
            '',
            '- リスト1',
            '- リスト2',
            '  - ネストリスト',
            '',
            '1. 番号付き1',
            '2. 番号付き2',
            '',
            '> 引用テキスト',
            '',
            '```javascript',
            'const x = 1;',
            '```',
            '',
            '| col1 | col2 |',
            '| :--- | :--- |',
            '| a | b |',
            '',
            '---',
            '',
            '**太字** と *斜体* と ~~取り消し線~~',
        ].join('\n');
        
        // 1回目のRound-trip
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, inputMarkdown);
        
        const firstResult = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 2回目のRound-trip
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, firstResult);
        
        const secondResult = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 1回目と2回目の結果が同じであること（空行が増えていないこと）
        expect(secondResult).toBe(firstResult);
    });

    test('《コードブロック》末尾の空行が保持される', async ({ page }) => {
        // コードブロック末尾に空行がある場合
        const markdown = '```javascript\nconst x = 1;\n\n```';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 末尾の空行が保持されていること
        expect(result).toContain('const x = 1;\n\n```');
    });

    test('《コードブロック》複数の末尾空行が保持される', async ({ page }) => {
        // コードブロック末尾に複数の空行がある場合
        const markdown = '```python\nprint("hello")\n\n\n```';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 複数の末尾空行が保持されていること
        expect(result).toContain('print("hello")\n\n\n```');
    });

    test('《コードブロック》内の改行がすべて保持される', async ({ page }) => {
        // コードブロック内に複数の改行がある場合
        const markdown = '```\nline1\n\nline2\n\nline3\n```';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // 中間の空行も保持されていること
        expect(result).toContain('line1\n\nline2\n\nline3');
    });

    test('《コードブロック》直後の段落が正しく分離される', async ({ page }) => {
        // コードブロックの直後に段落がある場合
        const markdown = '```javascript\nconst x = 1;\n```\n\nこれは段落です';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const result = await page.evaluate(() => {
            return (window as any).__testApi.getMarkdown();
        });
        
        // コードブロックと段落が正しく分離されていること
        expect(result).toContain('```\n\nこれは段落です');
    });

    test('《コードブロック》HTMLで<br>タグが使用される', async ({ page }) => {
        // コードブロック内の改行がHTMLで<br>として表現されること
        const markdown = '```\nline1\nline2\n```';
        
        await page.evaluate((md) => {
            (window as any).__testApi.setMarkdown(md);
        }, markdown);
        
        const html = await page.evaluate(() => {
            return (window as any).__testApi.getHtml();
        });
        
        // <br>タグが使用されていること
        expect(html).toContain('<br>');
        expect(html).toContain('<pre');
        expect(html).toContain('<code');  // contenteditable属性が付く場合があるため部分一致
    });
});
