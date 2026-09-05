'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OutlineStateStore } = require('../../src/shared/outline-state-store');
const { generateEditorBodyHtml } = require('../../src/shared/editor-body-html');
const extensionManifest = require('../../package.json');

class FakeMemento {
    constructor(initial = {}) {
        this.values = new Map(Object.entries(initial));
    }

    get(key, defaultValue) {
        return this.values.has(key) ? this.values.get(key) : defaultValue;
    }

    async update(key, value) {
        if (value === undefined) {
            this.values.delete(key);
        } else {
            this.values.set(key, value);
        }
    }
}

test('file scope stores independent visibility for each Markdown resource', async () => {
    const workspaceState = new FakeMemento();
    const globalState = new FakeMemento();
    const store = new OutlineStateStore(workspaceState, globalState);

    assert.equal(store.getOpen('file', 'file:///notes/a.md', true), true);

    await store.setOpen('file', 'file:///notes/a.md', false);
    await store.setOpen('file', 'file:///notes/b.md', true);

    const restoredStore = new OutlineStateStore(workspaceState, globalState);
    assert.equal(restoredStore.getOpen('file', 'file:///notes/a.md', true), false);
    assert.equal(restoredStore.getOpen('file', 'file:///notes/b.md', false), true);
    assert.equal(restoredStore.getOpen('file', 'file:///notes/new.md', false), false);
});

test('global scope applies the last visibility to every Markdown resource', async () => {
    const workspaceState = new FakeMemento();
    const globalState = new FakeMemento();
    const store = new OutlineStateStore(workspaceState, globalState);

    await store.setOpen('global', 'file:///notes/a.md', false);

    const restoredStore = new OutlineStateStore(workspaceState, globalState);
    assert.equal(restoredStore.getOpen('global', 'file:///notes/a.md', true), false);
    assert.equal(restoredStore.getOpen('global', 'file:///notes/b.md', true), false);
});

test('invalid persisted values fall back to the configured default', () => {
    const workspaceState = new FakeMemento({
        'outline.fileStates.v1': {
            'file:///notes/a.md': 'closed',
        },
    });
    const globalState = new FakeMemento({
        'outline.globalOpen.v1': 'closed',
    });
    const store = new OutlineStateStore(workspaceState, globalState);

    assert.equal(store.getOpen('file', 'file:///notes/a.md', true), true);
    assert.equal(store.getOpen('global', 'file:///notes/a.md', false), false);
});

test('editor body starts closed without briefly exposing the outline', () => {
    const html = generateEditorBodyHtml({}, 'darwin', { outlineOpen: false });

    assert.match(html, /<aside class="sidebar hidden" id="sidebar"/);
    assert.match(html, /class="menu-btn" id="openSidebarBtn"/);
});

test('editor body starts open and hides the open button', () => {
    const html = generateEditorBodyHtml({}, 'darwin', { outlineOpen: true });

    assert.match(html, /<aside class="sidebar" id="sidebar"/);
    assert.match(html, /class="menu-btn hidden" id="openSidebarBtn"/);
});

test('extension settings expose file and global outline persistence modes', () => {
    const properties = extensionManifest.contributes.configuration.properties;
    const scopeSetting = properties['any-markdown.outlineStateScope'];

    assert.deepEqual(scopeSetting.enum, ['file', 'global']);
    assert.equal(scopeSetting.default, 'file');
});

test('extension settings preserve the existing open default unless configured otherwise', () => {
    const properties = extensionManifest.contributes.configuration.properties;
    const defaultOpenSetting = properties['any-markdown.outlineDefaultOpen'];

    assert.equal(defaultOpenSetting.type, 'boolean');
    assert.equal(defaultOpenSetting.default, true);
});
