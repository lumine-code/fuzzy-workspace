const { CompositeDisposable } = require("lumine");

const CONTAINERS = [
  { label: "Center", get: () => lumine.workspace.getCenter() },
  { label: "Left Dock", get: () => lumine.workspace.getLeftDock() },
  { label: "Right Dock", get: () => lumine.workspace.getRightDock() },
  { label: "Bottom Dock", get: () => lumine.workspace.getBottomDock() },
];

module.exports = {
  provideBackgroundTips() {
    return {
      packageName: "fuzzy-workspace",
      tips: [
        "You can jump to anything already open in the workspace with {{ 'fuzzy-workspace:toggle' | keystroke }}",
      ],
    };
  },

  items: [],
  selectList: null,
  selectListHost: null,
  disposables: null,
  recentlyUsed: [],
  recentCount: 0,
  untitledItemIds: null,
  nextUntitledItemId: 0,
  paneItemIds: null,
  uriOwners: null,
  duplicateItemOwners: null,

  ensureSelectList() {
    if (this.selectListHost) return this.selectListHost;

    const selectListOptions = {
      emptyMessage: "No open items found",
      getItemId: (item) => this.getItemId(item),
      search: {
        getFilterText: (item) => item.title,
        ignoreDiacritics: true,
        algorithm: "command-t",
      },
      renderItem: (item, options) => this.renderItem(item, options),
      source: {
        mode: "snapshot",
        load: () => this.listSnapshot(),
      },
      commands: {
        "fuzzy-workspace:focus-selected-item": {
          description: "Reveal the item's dock if hidden, activate its pane, and focus it.",
          didDispatch: (event) => this.performAction("focus", event.detail),
        },
        "fuzzy-workspace:close-selected-item": {
          description: "Close the item in its pane, keeping the list open.",
          didDispatch: (event) => this.performAction("close", event.detail),
        },
        "fuzzy-workspace:copy-selected-path": {
          description: "Copy the item's file path or URI to the clipboard.",
          didDispatch: (event) => this.performAction("copy-path", event.detail),
        },
        "fuzzy-workspace:query-selection": {
          description: "Use the editor selection as the query.",
          didDispatch: () => this.selectList.setQueryFromSelection(),
        },
      },
      actions: [
        {
          command: "fuzzy-workspace:focus-selected-item",
          context: "item",
          primary: true,
          group: "Navigate",
          disposition: "close",
          recordsRecent: ({ item }) => Boolean(item.uri),
        },
        {
          command: "fuzzy-workspace:close-selected-item",
          context: "item",
          group: "Manage",
          disposition: "stay",
          recordsRecent: ({ item }) => Boolean(item.uri),
        },
        {
          command: "fuzzy-workspace:copy-selected-path",
          context: "item",
          group: "Path",
          disposition: "close",
          enabled: ({ item }) => Boolean(item.uri),
          disabledReason: "The selected item has no path or URI.",
          recordsRecent: ({ item }) => Boolean(item.uri),
        },
        {
          command: "fuzzy-workspace:query-selection",
          context: "dialog",
          group: "Query",
          disposition: "stay",
        },
      ],
      recents: {
        limit: this.recentCount,
        adapter: {
          load: () => this.recentlyUsed,
          save: (ids) => {
            const currentIds = ids.map((id) => {
              if (typeof id !== "string") return id;
              const owner = this.uriOwners.get(id)?.deref();
              return (owner && this.uriFor(owner)) || id;
            });
            this.recentlyUsed = [
              ...new Set(
                currentIds
                  .map((id) => {
                    if (typeof id === "string") return id;
                    const record = this.duplicateItemOwners.get(id);
                    const owner = record?.owner.deref();
                    return (owner && this.uriFor(owner)) || record?.uri;
                  })
                  .filter((uri) => typeof uri === "string"),
              ),
            ];
            if (currentIds.some((id, index) => id !== ids[index]))
              return this.selectList.setRecentItemIds(currentIds, { persist: false });
          },
        },
      },
    };

    this.selectListHost = lumine.workspace.addSelectList(selectListOptions, {
      className: "fuzzy-workspace",
      crumb: "Workspace",
    });
    this.selectList = this.selectListHost.getModel();
    return this.selectListHost;
  },

  activate(state) {
    this.items = [];
    this.untitledItemIds = new WeakMap();
    this.nextUntitledItemId = 0;
    this.paneItemIds = new WeakMap();
    this.uriOwners = new Map();
    this.duplicateItemOwners = new Map();
    this.recentCount = lumine.config.get("fuzzy-workspace.recentCount");
    this.recentlyUsed = [
      ...new Set(
        (Array.isArray(state?.recentlyUsed) ? state.recentlyUsed : []).filter(
          (uri) => typeof uri === "string",
        ),
      ),
    ].slice(0, this.recentCount);

    this.disposables = new CompositeDisposable(
      lumine.config.onDidChange("fuzzy-workspace.recentCount", ({ newValue }) => {
        this.recentCount = newValue;
        if (this.selectList) void this.selectList.setRecentLimit(newValue);
      }),
      lumine.commands.add("lumine-workspace", {
        "fuzzy-workspace:toggle": () => this.ensureSelectList().toggle(),
        "fuzzy-workspace:clear-recent": {
          description: "Forget the recently used items kept at the top of the list.",
          didDispatch: () => this.ensureSelectList().getModel().clearRecentItems(),
        },
      }),
    );
  },

  serialize() {
    return { recentlyUsed: this.recentlyUsed };
  },

  deactivate() {
    this.disposables?.dispose();
    this.selectListHost?.destroy();
    this.disposables = null;
    this.selectListHost = null;
    this.selectList = null;
    this.paneItemIds = null;
    this.uriOwners = null;
    this.duplicateItemOwners = null;
  },

  getItemId(item) {
    if (item.uri) {
      const cached = this.paneItemIds.get(item.paneItem);
      if (cached?.uri === item.uri) return cached.id;
      const owner = this.uriOwners.get(item.uri)?.deref();
      let id = item.uri;
      if (
        owner &&
        owner !== item.paneItem &&
        lumine.workspace.paneForItem(owner) &&
        this.uriFor(owner) === item.uri
      ) {
        id = Symbol("fuzzy-workspace-duplicate-view");
        this.duplicateItemOwners.set(id, { uri: item.uri, owner: new WeakRef(item.paneItem) });
      } else {
        this.uriOwners.set(item.uri, new WeakRef(item.paneItem));
      }
      this.paneItemIds.set(item.paneItem, { uri: item.uri, id });
      return id;
    }
    let id = this.untitledItemIds.get(item.paneItem);
    if (!id) {
      id = Symbol(`fuzzy-workspace-untitled-${++this.nextUntitledItemId}`);
      this.untitledItemIds.set(item.paneItem, id);
    }
    return id;
  },

  buildItems() {
    const items = [];
    for (const { label, get } of CONTAINERS) {
      const container = get();
      if (!container) continue;
      for (const pane of container.getPanes()) {
        for (const paneItem of pane.getItems()) {
          const uri = this.uriFor(paneItem);
          items.push({
            paneItem,
            pane,
            container: label,
            active: paneItem === pane.getActiveItem(),
            title: this.titleFor(paneItem),
            uri,
          });
        }
      }
    }
    return items;
  },

  titleFor(paneItem) {
    if (paneItem && typeof paneItem.getTitle === "function") {
      const title = paneItem.getTitle();
      if (title) return title;
    }
    return "untitled";
  },

  uriFor(paneItem) {
    if (paneItem && typeof paneItem.getURI === "function") {
      return paneItem.getURI() || undefined;
    }
    if (paneItem && typeof paneItem.getPath === "function") {
      return paneItem.getPath() || undefined;
    }
    return undefined;
  },

  renderItem(item, { highlight }) {
    // The item's own icon name wins over its path — `normalizeTarget` settles
    // that. Only a real path is offered as one; a `scheme://` URI is not. An
    // item with neither still reads as a file.
    const uri = item.uri && !item.uri.includes("://") ? item.uri : null;
    let target = { item: item.paneItem, path: uri, context: "fuzzy-workspace" };
    if (lumine.icons.iconFor(target).render === "none") target = { name: "file-text" };

    return {
      className: item.active ? "active-item" : undefined,
      primary: highlight(item.title),
      secondary: item.uri || item.container,
      didRender: (li) => {
        lumine.icons.applyTo(li.firstChild, target, { setData: false });
        li.firstChild.dataset.container = item.container;
      },
    };
  },

  infoLine() {
    return `${this.items.length} open item${this.items.length !== 1 ? "s" : ""}`;
  },

  listSnapshot() {
    this.items = this.buildItems();
    return {
      items: this.items,
      infoMessage: this.infoLine(),
    };
  },

  async performAction(mode, context = {}) {
    const item = context.item ?? this.selectList.getSelectedItem();
    if (!item) return;

    if (mode === "copy-path") {
      const uri = this.uriFor(item.paneItem);
      if (!uri) {
        lumine.notifications.addWarning("Selected item has no path");
        return false;
      }
      lumine.clipboard.write(uri);
      return;
    }

    if (mode === "close") {
      const owner = this.disposables;
      const list = this.selectList;
      const pane = lumine.workspace.paneForItem(item.paneItem);
      if (!pane) return false;
      await pane.destroyItem(item.paneItem);
      if (
        !list ||
        !owner ||
        owner.disposed ||
        this.disposables !== owner ||
        this.selectList !== list
      )
        return;
      return list.reload();
    }

    if (mode === "focus") {
      const opened = await lumine.workspace.open(item.paneItem, { searchAllPanes: true });
      if (!opened) return;
      const el = typeof item.paneItem.getElement === "function" ? item.paneItem.getElement() : null;
      if (el && typeof el.focus === "function") el.focus();
    }
  },
};
