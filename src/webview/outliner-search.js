/**
 * OutlinerSearch — Dynalist互換検索エンジン
 *
 * クエリパーサとマッチエンジンを提供。
 * DOM非依存の純粋ロジック。
 */

// eslint-disable-next-line no-unused-vars
var OutlinerSearch = (function() {
    'use strict';

    // --- クエリパーサ ---

    /**
     * Dynalist互換クエリ文字列をASTにパース
     * サポート:
     *   - スペース区切り → AND
     *   - OR キーワード → OR
     *   - -keyword → NOT
     *   - #tag / @tag → タグ条件
     *   - "phrase" → フレーズ検索
     *   - in:title, has:children, is:page, is:task → 演算子
     */
    function parseQuery(queryString) {
        if (!queryString || !queryString.trim()) {
            return null;
        }

        var tokens = tokenize(queryString.trim());
        if (tokens.length === 0) { return null; }

        return buildAST(tokens);
    }

    function tokenize(str) {
        var tokens = [];
        var i = 0;
        while (i < str.length) {
            // スキップ空白
            if (str[i] === ' ' || str[i] === '\t') {
                i++;
                continue;
            }

            // フレーズ "..."
            if (str[i] === '"') {
                var end = str.indexOf('"', i + 1);
                if (end < 0) { end = str.length; }
                tokens.push({ type: 'phrase', value: str.slice(i + 1, end) });
                i = end + 1;
                continue;
            }

            // 単語の終端を探す
            var start = i;
            while (i < str.length && str[i] !== ' ' && str[i] !== '\t') {
                i++;
            }
            var word = str.slice(start, i);

            if (word === 'OR') {
                tokens.push({ type: 'OR' });
            } else if (word.startsWith('-') && word.length > 1) {
                // NOT
                var inner = word.slice(1);
                if (inner.startsWith('#') || inner.startsWith('@')) {
                    tokens.push({ type: 'NOT', term: { type: 'tag', value: inner } });
                } else {
                    tokens.push({ type: 'NOT', term: { type: 'text', value: inner } });
                }
            } else if (word.startsWith('#') || word.startsWith('@')) {
                tokens.push({ type: 'tag', value: word });
            } else if (word.indexOf(':') > 0) {
                // 演算子 (in:title, has:children, is:page, is:task)
                var parts = word.split(':');
                tokens.push({ type: 'operator', name: parts[0], value: parts.slice(1).join(':') });
            } else {
                tokens.push({ type: 'text', value: word });
            }
        }
        return tokens;
    }

    function buildAST(tokens) {
        // OR で分割してから AND で結合
        var groups = [[]];
        for (var i = 0; i < tokens.length; i++) {
            if (tokens[i].type === 'OR') {
                groups.push([]);
            } else {
                groups[groups.length - 1].push(tokens[i]);
            }
        }

        if (groups.length === 1) {
            return buildAND(groups[0]);
        }

        // OR 結合
        var orTerms = [];
        for (var g = 0; g < groups.length; g++) {
            if (groups[g].length > 0) {
                orTerms.push(buildAND(groups[g]));
            }
        }
        if (orTerms.length === 1) { return orTerms[0]; }
        return { type: 'OR', terms: orTerms };
    }

    function buildAND(tokens) {
        if (tokens.length === 0) { return null; }
        if (tokens.length === 1) { return tokens[0]; }
        return { type: 'AND', terms: tokens };
    }

    // --- マッチエンジン ---

    /**
     * @param {OutlinerModel} model
     */
    function SearchEngine(model) {
        this.model = model;
    }

    /**
     * 検索実行
     * @param {Object} query - parseQuery() の戻り値
     * @param {Object} scope - { type: 'document' } or { type: 'subtree', rootId: '...' }
     * @returns {Set<string>} - 表示すべきノードIDのSet
     */
    SearchEngine.prototype.search = function(query, scope) {
        if (!query) {
            // クエリなし → 全ノード表示
            return null;
        }

        scope = scope || { type: 'document' };
        var candidates = this._getCandidates(scope);
        var matchedIds = new Set();
        var model = this.model;

        for (var i = 0; i < candidates.length; i++) {
            var nodeId = candidates[i];
            if (this._matches(nodeId, query)) {
                matchedIds.add(nodeId);
                // マッチノードの全子孫も追加
                var descendants = model.getDescendantIds(nodeId);
                for (var j = 0; j < descendants.length; j++) {
                    matchedIds.add(descendants[j]);
                }
                // 祖先も追加（ツリー表示のため）
                var current = model.getNode(nodeId);
                while (current && current.parentId) {
                    matchedIds.add(current.parentId);
                    current = model.getNode(current.parentId);
                }
            }
        }

        return matchedIds;
    };

    SearchEngine.prototype._getCandidates = function(scope) {
        if (scope.type === 'subtree' && scope.rootId) {
            return [scope.rootId].concat(this.model.getDescendantIds(scope.rootId));
        }
        return Object.keys(this.model.nodes);
    };

    SearchEngine.prototype._matches = function(nodeId, query) {
        var node = this.model.getNode(nodeId);
        if (!node) { return false; }

        switch (query.type) {
            case 'text':
                return node.text.toLowerCase().indexOf(query.value.toLowerCase()) >= 0;

            case 'phrase':
                return node.text.toLowerCase().indexOf(query.value.toLowerCase()) >= 0;

            case 'tag':
                var tagLower = query.value.toLowerCase();
                for (var i = 0; i < (node.tags || []).length; i++) {
                    if (node.tags[i].toLowerCase() === tagLower) { return true; }
                }
                return false;

            case 'NOT':
                return !this._matches(nodeId, query.term);

            case 'AND':
                for (var a = 0; a < query.terms.length; a++) {
                    if (!this._matches(nodeId, query.terms[a])) { return false; }
                }
                return true;

            case 'OR':
                for (var o = 0; o < query.terms.length; o++) {
                    if (this._matches(nodeId, query.terms[o])) { return true; }
                }
                return false;

            case 'operator':
                return this._matchOperator(node, query.name, query.value);

            default:
                return false;
        }
    };

    SearchEngine.prototype._matchOperator = function(node, name, value) {
        switch (name) {
            case 'in':
                if (value === 'title') {
                    // in:title は後続のテキスト検索と組み合わせるが、
                    // 単独では全ノードマッチ
                    return true;
                }
                return true;

            case 'has':
                if (value === 'children') {
                    return (node.children || []).length > 0;
                }
                return false;

            case 'is':
                if (value === 'page') { return node.isPage === true; }
                if (value === 'task') { return node.checked !== null && node.checked !== undefined; }
                return false;

            default:
                return false;
        }
    };

    return {
        parseQuery: parseQuery,
        SearchEngine: SearchEngine
    };
})();

// Node.js module exports (テスト用)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OutlinerSearch;
}
