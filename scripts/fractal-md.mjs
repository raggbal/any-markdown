#!/usr/bin/env node
/**
 * fractal-md.mjs
 * Fractal の .out ノートに Markdown ファイルをページノードとして登録する
 *
 * Usage:
 *   # 単一登録
 *   node scripts/fractal-md.mjs --note path/to/note.out --md file.md
 *
 *   # 一括登録
 *   node scripts/fractal-md.mjs --note path/to/note.out --md "docs/*.md"
 *
 *   # 差し込み位置指定
 *   node scripts/fractal-md.mjs --note path/to/note.out --md file.md --parent "ノードテキスト"
 *
 *   # 一括登録（グループ名指定）
 *   node scripts/fractal-md.mjs --note path/to/note.out --md "docs/*.md" --group-name "リサーチ結果"
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// --- ID生成 ---

let nodeIdCounter = 0;

function generateNodeId() {
    const ts = (Date.now() + nodeIdCounter++).toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return 'n' + ts + rand;
}

function generatePageId() {
    return crypto.randomUUID();
}

// --- H1抽出 ---

function extractH1(mdContent) {
    const match = mdContent.match(/^# (.+)$/m);
    return match ? match[1].trim() : null;
}

// --- 引数パース ---

function parseArgs(argv) {
    const args = {
        note: null,
        mdPatterns: [],
        parent: null,
        groupName: null,
    };

    let i = 2; // skip node, script
    while (i < argv.length) {
        switch (argv[i]) {
            case '--note':
                args.note = argv[++i];
                break;
            case '--md':
                i++;
                // --md 以降、次の -- フラグまでを全て MD パターンとして収集
                while (i < argv.length && !argv[i].startsWith('--')) {
                    args.mdPatterns.push(argv[i]);
                    i++;
                }
                continue; // i は既に進んでいるので increment しない
            case '--parent':
                args.parent = argv[++i];
                break;
            case '--group-name':
                args.groupName = argv[++i];
                break;
            default:
                console.error(`Unknown option: ${argv[i]}`);
                process.exit(1);
        }
        i++;
    }

    if (!args.note) {
        console.error('Error: --note is required');
        process.exit(1);
    }
    if (args.mdPatterns.length === 0) {
        console.error('Error: --md is required');
        process.exit(1);
    }

    return args;
}

// --- glob展開 ---

function expandMdFiles(patterns) {
    const files = [];
    for (const pattern of patterns) {
        // そのままファイルとして存在するか確認
        if (fs.existsSync(pattern) && fs.statSync(pattern).isFile()) {
            files.push(path.resolve(pattern));
            continue;
        }
        // glob 展開 (簡易: ディレクトリ + *.md パターン)
        const dir = path.dirname(pattern);
        const base = path.basename(pattern);
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            const re = new RegExp('^' + base.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
            for (const entry of fs.readdirSync(dir)) {
                if (re.test(entry) && entry.endsWith('.md')) {
                    files.push(path.resolve(dir, entry));
                }
            }
        } else {
            console.error(`Warning: pattern "${pattern}" matched no files`);
        }
    }
    // 重複排除 & ソート
    return [...new Set(files)].sort();
}

// --- 差し込み位置の解決 ---

function resolveParent(data, parentArg) {
    if (!parentArg) return null;

    // ノードIDで直接指定
    if (data.nodes[parentArg]) {
        return parentArg;
    }

    // テキストで検索（完全一致優先、なければ部分一致）
    let exactMatch = null;
    let partialMatch = null;
    for (const node of Object.values(data.nodes)) {
        if (node.text === parentArg) {
            exactMatch = node.id;
            break;
        }
        if (!partialMatch && node.text.includes(parentArg)) {
            partialMatch = node.id;
        }
    }
    const found = exactMatch || partialMatch;
    if (!found) {
        console.error(`Error: parent node not found: "${parentArg}"`);
        process.exit(1);
    }
    return found;
}

// --- ノード作成 ---

function createNode({ parentId, text, isPage, pageId }) {
    return {
        id: generateNodeId(),
        parentId: parentId || null,
        children: [],
        text: text || '',
        tags: [],
        isPage: !!isPage,
        pageId: pageId || null,
        collapsed: false,
        checked: null,
        subtext: '',
    };
}

// --- ノードを .out データに挿入 ---

function insertNode(data, node, parentNodeId, position = 'top') {
    data.nodes[node.id] = node;

    if (!parentNodeId) {
        // ルートに挿入
        node.parentId = null;
        if (position === 'top') {
            data.rootIds.unshift(node.id);
        } else {
            data.rootIds.push(node.id);
        }
    } else {
        // 指定ノードの子に挿入
        node.parentId = parentNodeId;
        const parent = data.nodes[parentNodeId];
        if (!parent) {
            console.error(`Error: parent node ${parentNodeId} not found in data`);
            process.exit(1);
        }
        if (position === 'top') {
            parent.children.unshift(node.id);
        } else {
            parent.children.push(node.id);
        }
    }
}

// --- メイン処理 ---

async function main() {
    const args = parseArgs(process.argv);

    // .out パス解決
    let notePath = args.note;
    if (!notePath.endsWith('.out')) {
        notePath += '.out';
    }
    notePath = path.resolve(notePath);

    if (!fs.existsSync(notePath)) {
        console.error(`Error: note file not found: ${notePath}`);
        process.exit(1);
    }

    // .out 読み込み
    const data = JSON.parse(fs.readFileSync(notePath, 'utf-8'));

    // pages ディレクトリ特定
    const noteDir = path.dirname(notePath);
    const pageDir = data.pageDir
        ? (path.isAbsolute(data.pageDir) ? data.pageDir : path.resolve(noteDir, data.pageDir))
        : path.resolve(noteDir, 'pages');

    // pages ディレクトリ作成
    fs.mkdirSync(pageDir, { recursive: true });
    fs.mkdirSync(path.join(pageDir, 'images'), { recursive: true });

    // MD ファイル展開
    const mdFiles = expandMdFiles(args.mdPatterns);
    if (mdFiles.length === 0) {
        console.error('Error: no markdown files found');
        process.exit(1);
    }

    // 差し込み位置解決
    const parentNodeId = resolveParent(data, args.parent);

    const isBulk = mdFiles.length > 1;
    const results = [];

    if (isBulk) {
        // === 一括登録モード ===
        const groupName = args.groupName || 'Imported';
        const groupNode = createNode({
            parentId: parentNodeId,
            text: groupName,
            isPage: false,
            pageId: null,
        });
        insertNode(data, groupNode, parentNodeId, 'top');
        console.log(`📁 Group node: "${groupName}" (${groupNode.id})`);

        for (const mdFile of mdFiles) {
            const mdContent = fs.readFileSync(mdFile, 'utf-8');
            const h1 = extractH1(mdContent);
            const text = h1 || path.basename(mdFile, '.md');
            const pageId = generatePageId();

            // MD をページとしてコピー
            fs.copyFileSync(mdFile, path.join(pageDir, `${pageId}.md`));

            // ノード作成 → グループノードの子として末尾追加
            const node = createNode({
                parentId: groupNode.id,
                text,
                isPage: true,
                pageId,
            });
            insertNode(data, node, groupNode.id, 'bottom');

            results.push({ text, nodeId: node.id, pageId, source: mdFile });
            console.log(`  📄 "${text}" → ${pageId}.md`);
        }
    } else {
        // === 単一登録モード ===
        const mdFile = mdFiles[0];
        const mdContent = fs.readFileSync(mdFile, 'utf-8');
        const h1 = extractH1(mdContent);
        const text = h1 || path.basename(mdFile, '.md');
        const pageId = generatePageId();

        // MD をページとしてコピー
        fs.copyFileSync(mdFile, path.join(pageDir, `${pageId}.md`));

        // ノード作成 → 差し込み位置に挿入
        const node = createNode({
            parentId: parentNodeId,
            text,
            isPage: true,
            pageId,
        });
        insertNode(data, node, parentNodeId, 'top');

        results.push({ text, nodeId: node.id, pageId, source: mdFile });
        console.log(`📄 "${text}" → ${pageId}.md`);
    }

    // .out 書き戻し
    fs.writeFileSync(notePath, JSON.stringify(data, null, 2), 'utf-8');

    // 結果サマリ
    console.log(`\n✅ ${results.length} page(s) registered to ${path.basename(notePath)}`);
    console.log(`   Pages dir: ${pageDir}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
