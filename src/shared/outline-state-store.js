'use strict';

const FILE_STATES_KEY = 'outline.fileStates.v1';
const GLOBAL_OPEN_KEY = 'outline.globalOpen.v1';

function asBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
}

function asFileStates(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return { ...value };
}

/**
 * Persists outline visibility without coupling UI state to Markdown content.
 * The supplied mementos follow VS Code's ExtensionContext Memento interface.
 */
class OutlineStateStore {
    constructor(workspaceState, globalState) {
        this.workspaceState = workspaceState;
        this.globalState = globalState;
        this.fileStates = asFileStates(workspaceState.get(FILE_STATES_KEY, {}));
        this.globalOpen = globalState.get(GLOBAL_OPEN_KEY);
        this.writeQueue = Promise.resolve();
    }

    getOpen(scope, resourceKey, defaultOpen) {
        const fallback = asBoolean(defaultOpen, true);
        if (scope === 'global') {
            return asBoolean(this.globalOpen, fallback);
        }
        return asBoolean(this.fileStates[resourceKey], fallback);
    }

    setOpen(scope, resourceKey, open) {
        const nextOpen = open === true;
        if (scope === 'global') {
            this.globalOpen = nextOpen;
            return this.enqueueWrite(() => this.globalState.update(GLOBAL_OPEN_KEY, nextOpen));
        }

        this.fileStates[resourceKey] = nextOpen;
        const snapshot = { ...this.fileStates };
        return this.enqueueWrite(() => this.workspaceState.update(FILE_STATES_KEY, snapshot));
    }

    enqueueWrite(write) {
        const result = this.writeQueue.then(write, write);
        this.writeQueue = result.catch(() => undefined);
        return result;
    }
}

module.exports = {
    FILE_STATES_KEY,
    GLOBAL_OPEN_KEY,
    OutlineStateStore,
};
