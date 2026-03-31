/**
 * OutlinerModel — アウトライナのデータモデル
 *
 * ツリー構造の CRUD 操作、タグ解析、シリアライズを担当。
 * DOM非依存の純粋ロジック。
 */

// eslint-disable-next-line no-unused-vars
var OutlinerModel = (function() {
    'use strict';

    /** ノードID生成 (ファイル内一意) */
    function generateNodeId() {
        // 短いランダムID (衝突確率は2万ノード程度なら無視できる)
        return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    /** pageId生成 (グローバル一意 UUID v4) */
    function generatePageId() {
        // crypto.randomUUID が利用可能ならそれを使用、なければフォールバック
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        // UUID v4 フォールバック
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /** タグ解析: text内の #tag / @tag を抽出 */
    function parseTags(text) {
        var tags = [];
        // インラインコード内のタグは除外
        var cleaned = text.replace(/`[^`]*`/g, '');
        var regex = /(?<![&#\w\p{L}])([#@][\w\p{L}][\w\p{L}-]*)/gu;
        var match;
        while ((match = regex.exec(cleaned)) !== null) {
            tags.push(match[1]);
        }
        return tags;
    }

    /**
     * @constructor
     * @param {Object} data - JSON からパースしたデータ
     */
    function Model(data) {
        data = data || {};
        this.version = data.version || 1;
        this.title = (data.title !== undefined) ? data.title : '';
        this.rootIds = data.rootIds || [];
        this.nodes = {};

        // nodes のマップ化
        if (data.nodes) {
            if (Array.isArray(data.nodes)) {
                // 旧形式: 配列
                for (var i = 0; i < data.nodes.length; i++) {
                    var n = data.nodes[i];
                    this.nodes[n.id] = n;
                }
            } else {
                // 新形式: オブジェクトマップ
                for (var id in data.nodes) {
                    if (data.nodes.hasOwnProperty(id)) {
                        this.nodes[id] = data.nodes[id];
                    }
                }
            }
        }

        // 各ノードの children が未設定の場合のフォールバック
        this._ensureChildren();
    }

    Model.prototype._ensureChildren = function() {
        // subtext デフォルト設定 + 旧形式データ検出
        for (var id in this.nodes) {
            if (!this.nodes[id].children) {
                console.error('[OutlinerModel] 旧形式データ検出: ノード ' + id + ' に children プロパティがありません。データ形式が古いためサポートされません。');
                this.nodes[id].children = [];
            }
            if (this.nodes[id].subtext === undefined) {
                this.nodes[id].subtext = '';
            }
        }
    };

    // --- CRUD ---

    Model.prototype.getNode = function(nodeId) {
        return this.nodes[nodeId] || null;
    };

    Model.prototype.addNode = function(parentId, afterId, text) {
        var id = generateNodeId();
        text = text || '';
        var node = {
            id: id,
            parentId: parentId || null,
            children: [],
            text: text,
            tags: parseTags(text),
            isPage: false,
            pageId: null,
            collapsed: false,
            checked: null,
            subtext: ''
        };

        this.nodes[id] = node;

        if (parentId === null || parentId === undefined) {
            // ルートノード
            var idx = afterId ? this.rootIds.indexOf(afterId) + 1 : this.rootIds.length;
            if (idx < 0) { idx = this.rootIds.length; }
            this.rootIds.splice(idx, 0, id);
        } else {
            var parent = this.nodes[parentId];
            if (parent) {
                var cidx = afterId ? parent.children.indexOf(afterId) + 1 : parent.children.length;
                if (cidx < 0) { cidx = parent.children.length; }
                parent.children.splice(cidx, 0, id);
            }
        }

        return node;
    };

    /** 指定親の子リスト先頭にノードを追加 */
    Model.prototype.addNodeAtStart = function(parentId, text) {
        var id = generateNodeId();
        text = text || '';
        var node = {
            id: id,
            parentId: parentId || null,
            children: [],
            text: text,
            tags: parseTags(text),
            isPage: false,
            pageId: null,
            collapsed: false,
            checked: null,
            subtext: ''
        };
        this.nodes[id] = node;
        if (parentId === null || parentId === undefined) {
            this.rootIds.unshift(id);
        } else {
            var parent = this.nodes[parentId];
            if (parent) {
                parent.children.unshift(id);
            }
        }
        return node;
    };

    Model.prototype.removeNode = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node) { return; }

        // 再帰的に子ノードも削除
        var children = (node.children || []).slice();
        for (var i = 0; i < children.length; i++) {
            this.removeNode(children[i]);
        }

        // 親の children / rootIds から除去
        if (node.parentId && this.nodes[node.parentId]) {
            var parent = this.nodes[node.parentId];
            var idx = parent.children.indexOf(nodeId);
            if (idx >= 0) { parent.children.splice(idx, 1); }
        } else {
            var ridx = this.rootIds.indexOf(nodeId);
            if (ridx >= 0) { this.rootIds.splice(ridx, 1); }
        }

        delete this.nodes[nodeId];
    };

    Model.prototype.updateText = function(nodeId, text) {
        var node = this.nodes[nodeId];
        if (!node) { return { triggerMakePage: false, node: node }; }
        node.text = text;
        node.tags = parseTags(text);
        return { triggerMakePage: false, node: node };
    };

    Model.prototype.updateSubtext = function(nodeId, subtext) {
        var node = this.nodes[nodeId];
        if (!node) { return; }
        node.subtext = subtext || '';
    };

    /**
     * @page トリガー検出 (Space/Enter 確定時に呼び出す)
     * テキスト末尾が "@page" で終わる場合のみ発動。
     * 入力途中の "@pageview" 等を誤検出しない。
     */
    Model.prototype.checkPageTrigger = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node || node.isPage) { return false; }
        // 末尾が @page (前にスペースか行頭)
        if (/(?:^|\s)@page\s*$/.test(node.text)) {
            node.text = node.text.replace(/\s*@page\s*$/, '').trim();
            node.tags = parseTags(node.text);
            return true;
        }
        return false;
    };

    // --- ツリー操作 ---

    /** ノードの兄弟リストと位置を返す */
    Model.prototype._getSiblingInfo = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node) { return null; }
        var siblings;
        if (node.parentId && this.nodes[node.parentId]) {
            siblings = this.nodes[node.parentId].children;
        } else {
            siblings = this.rootIds;
        }
        var index = siblings.indexOf(nodeId);
        return { siblings: siblings, index: index };
    };

    /** インデント: 前の兄弟の子に移動 */
    Model.prototype.indentNode = function(nodeId) {
        var info = this._getSiblingInfo(nodeId);
        if (!info || info.index <= 0) { return false; }

        var prevSiblingId = info.siblings[info.index - 1];
        var prevSibling = this.nodes[prevSiblingId];
        if (!prevSibling) { return false; }

        // 元の場所から除去
        info.siblings.splice(info.index, 1);

        // 前の兄弟の子の末尾に追加
        var node = this.nodes[nodeId];
        node.parentId = prevSiblingId;
        prevSibling.children.push(nodeId);

        // 折りたたみ解除
        prevSibling.collapsed = false;

        return true;
    };

    /** アウトデント: 親の兄弟に移動 */
    Model.prototype.outdentNode = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node || !node.parentId) { return false; }

        var parent = this.nodes[node.parentId];
        if (!parent) { return false; }

        var childIdx = parent.children.indexOf(nodeId);
        if (childIdx < 0) { return false; }

        // 後続兄弟を自分の子に移動
        var followingSiblings = parent.children.splice(childIdx + 1);
        for (var i = 0; i < followingSiblings.length; i++) {
            node.children.push(followingSiblings[i]);
            this.nodes[followingSiblings[i]].parentId = nodeId;
        }

        // 元の親の children から除去
        var myIdx = parent.children.indexOf(nodeId);
        if (myIdx >= 0) { parent.children.splice(myIdx, 1); }

        // 祖父の children (or rootIds) で親の直後に挿入
        var grandparentId = parent.parentId;
        node.parentId = grandparentId;
        if (grandparentId && this.nodes[grandparentId]) {
            var grandparent = this.nodes[grandparentId];
            var parentIdx = grandparent.children.indexOf(parent.id);
            grandparent.children.splice(parentIdx + 1, 0, nodeId);
        } else {
            var rootIdx = this.rootIds.indexOf(parent.id);
            this.rootIds.splice(rootIdx + 1, 0, nodeId);
        }

        return true;
    };

    /** ノードを上に移動 */
    Model.prototype.moveUp = function(nodeId) {
        var info = this._getSiblingInfo(nodeId);
        if (!info || info.index <= 0) { return false; }
        // swap
        var temp = info.siblings[info.index - 1];
        info.siblings[info.index - 1] = info.siblings[info.index];
        info.siblings[info.index] = temp;
        return true;
    };

    /** ノードを下に移動 */
    Model.prototype.moveDown = function(nodeId) {
        var info = this._getSiblingInfo(nodeId);
        if (!info || info.index >= info.siblings.length - 1) { return false; }
        // swap
        var temp = info.siblings[info.index + 1];
        info.siblings[info.index + 1] = info.siblings[info.index];
        info.siblings[info.index] = temp;
        return true;
    };

    /** ノードを任意の位置に移動（D&D用） */
    Model.prototype.moveNode = function(nodeId, newParentId, afterId) {
        var node = this.nodes[nodeId];
        if (!node) { return false; }

        // 元の場所から除去
        var oldSiblings = node.parentId ? this.nodes[node.parentId].children : this.rootIds;
        var oldIdx = oldSiblings.indexOf(nodeId);
        if (oldIdx >= 0) { oldSiblings.splice(oldIdx, 1); }

        // 新しい親の子リストに挿入
        node.parentId = newParentId || null;
        var newSiblings = newParentId ? this.nodes[newParentId].children : this.rootIds;
        if (afterId) {
            var afterIdx = newSiblings.indexOf(afterId);
            if (afterIdx >= 0) {
                newSiblings.splice(afterIdx + 1, 0, nodeId);
            } else {
                newSiblings.push(nodeId);
            }
        } else {
            // afterId=null → 先頭に挿入
            newSiblings.unshift(nodeId);
        }

        return true;
    };

    /** nodeIdがpotentialAncestorIdの子孫かどうか判定（循環参照防止用） */
    Model.prototype.isDescendant = function(nodeId, potentialAncestorId) {
        var current = nodeId;
        while (current) {
            if (current === potentialAncestorId) { return true; }
            var n = this.nodes[current];
            current = n ? n.parentId : null;
        }
        return false;
    };

    // --- ページ操作 ---

    /** pageId生成のプロキシ（outliner.jsからアクセス用） */
    Model.prototype.generatePageId = function() {
        return generatePageId();
    };

    Model.prototype.makePage = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node || node.isPage) { return null; }
        var pageId = generatePageId();
        node.isPage = true;
        node.pageId = pageId;
        return pageId;
    };

    Model.prototype.removePage = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node) { return null; }
        var oldPageId = node.pageId;
        node.isPage = false;
        node.pageId = null;
        return oldPageId;
    };

    // --- クエリ ---

    Model.prototype.getChildren = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node) { return []; }
        var self = this;
        return (node.children || []).map(function(id) { return self.nodes[id]; }).filter(Boolean);
    };

    Model.prototype.getParent = function(nodeId) {
        var node = this.nodes[nodeId];
        if (!node || !node.parentId) { return null; }
        return this.nodes[node.parentId] || null;
    };

    Model.prototype.getDescendantIds = function(nodeId) {
        var result = [];
        var node = this.nodes[nodeId];
        if (!node) { return result; }
        var stack = (node.children || []).slice();
        while (stack.length > 0) {
            var id = stack.pop();
            result.push(id);
            var child = this.nodes[id];
            if (child && child.children) {
                for (var i = child.children.length - 1; i >= 0; i--) {
                    stack.push(child.children[i]);
                }
            }
        }
        return result;
    };

    /** DFS順でフラット化したノードIDリストを返す (表示順) */
    Model.prototype.getFlattenedIds = function(skipCollapsed) {
        var result = [];
        var self = this;
        function walk(ids) {
            for (var i = 0; i < ids.length; i++) {
                var id = ids[i];
                result.push(id);
                var node = self.nodes[id];
                if (node && node.children && node.children.length > 0) {
                    if (skipCollapsed && node.collapsed) { continue; }
                    walk(node.children);
                }
            }
        }
        walk(this.rootIds);
        return result;
    };

    /** ノードの深さ(0-based)を返す */
    Model.prototype.getDepth = function(nodeId) {
        var depth = 0;
        var node = this.nodes[nodeId];
        while (node && node.parentId) {
            depth++;
            node = this.nodes[node.parentId];
        }
        return depth;
    };

    /** 前のvisibleノードIDを返す */
    Model.prototype.getPreviousVisibleId = function(nodeId) {
        var flat = this.getFlattenedIds(true);
        var idx = flat.indexOf(nodeId);
        return idx > 0 ? flat[idx - 1] : null;
    };

    /** 次のvisibleノードIDを返す */
    Model.prototype.getNextVisibleId = function(nodeId) {
        var flat = this.getFlattenedIds(true);
        var idx = flat.indexOf(nodeId);
        return (idx >= 0 && idx < flat.length - 1) ? flat[idx + 1] : null;
    };

    // --- シリアライズ ---

    Model.prototype.serialize = function() {
        var data = {
            version: this.version,
            rootIds: this.rootIds.slice(),
            nodes: JSON.parse(JSON.stringify(this.nodes))
        };
        if (this.title) {
            data.title = this.title;
        }
        return data;
    };

    // Static methods
    Model.generatePageId = generatePageId;
    Model.generateNodeId = generateNodeId;
    Model.parseTags = parseTags;

    return Model;
})();

// Node.js module exports (テスト用)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OutlinerModel;
}
