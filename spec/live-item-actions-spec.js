const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Fuzzy Workspace live item actions", () => {
  let main, editor, scratch, host, item;

  beforeEach(async () => {
    for (const operation of ["openExternal", "openPath", "showItemInFolder", "openApplication"])
      if (!jasmine.isSpy(lumine.shell[operation])) spyOn(lumine.shell, operation).and.resolveTo();
    if (!jasmine.isSpy(lumine.application.openWindow))
      spyOn(lumine.application, "openWindow").and.resolveTo();
    if (!jasmine.isSpy(lumine.clipboard.write)) spyOn(lumine.clipboard, "write");
    scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workspace-live-")));
    const file = path.join(scratch, "original.txt");
    fs.writeFileSync(file, "owned text\n");
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("fuzzy-workspace")).mainModule;
    editor = await lumine.workspace.open(file);
    host = main.ensureSelectList();
    await host.show();
    item = main.selectList.getItems().find((row) => row.paneItem === editor);
    expect(item).toBeDefined();
    await main.selectList.selectItem(item);
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("fuzzy-workspace");
    for (const open of lumine.workspace.getTextEditors()) open.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
    const relative = path.relative(fs.realpathSync.native(os.tmpdir()), scratch);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
      throw new Error("Refusing cleanup outside owned picker scratch");
    fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  it("copies the current path after the listed editor is saved under a new name", async () => {
    const renamed = path.join(scratch, "renamed.txt");
    await editor.saveAs(renamed);
    expect(item.uri).not.toBe(editor.getURI());
    await main.selectList.runAction("fuzzy-workspace:copy-selected-path");
    expect(lumine.clipboard.write).toHaveBeenCalledOnceWith(editor.getURI());
    expect(main.workspaceState.get("recentlyUsed", [])).toEqual([editor.getURI()]);
    expect(main.selectList.getRecentItemIds()).toEqual([editor.getURI()]);
  });

  it("closes the listed item after it moves to another pane", async () => {
    const originalPane = lumine.workspace.paneForItem(editor);
    const movedPane = originalPane.splitRight();
    originalPane.moveItemToPane(editor, movedPane, 0);
    expect(lumine.workspace.paneForItem(editor)).toBe(movedPane);
    expect(item.pane).toBe(originalPane);
    await main.selectList.runAction("fuzzy-workspace:close-selected-item");
    expect(editor.isDestroyed()).toBe(true);
    expect(movedPane.getItems()).not.toContain(editor);
  });

  it("copies an unchanged item's ordinary path", async () => {
    await main.selectList.runAction("fuzzy-workspace:copy-selected-path");
    expect(lumine.clipboard.write).toHaveBeenCalledOnceWith(editor.getURI());
  });

  it("refreshes active rows after repeated focus without losing query, selection or recents", async () => {
    host.hide();
    const otherFile = path.join(scratch, "other.txt");
    fs.writeFileSync(otherFile, "other text\n");
    const other = await lumine.workspace.open(otherFile);
    await host.show();
    const list = host.getModel();
    await list.setQuery(".txt");
    await list.runAction("select-list:toggle-keep-open");
    const recents = [];

    for (const target of [editor, other]) {
      await list.selectItem(list.getItems().find((row) => row.paneItem === target));
      await list.confirmSelection();
      recents.unshift(target.getURI());

      expect(host.isVisible()).toBe(true);
      expect(list.getQuery()).toBe(".txt");
      expect(list.getSelectedItem().paneItem).toBe(target);
      expect(list.getRecentItemIds().slice(0, recents.length)).toEqual(recents);
      const rows = list.getElement().querySelectorAll('[role="option"]');
      for (const [index, entry] of list.getDisplayedItems().entries()) {
        expect(rows[index].classList.contains("active-item")).toBe(
          entry.pane.getActiveItem() === entry.paneItem,
        );
      }
    }
  });

  it("does not refresh a newer picker after an older accepted focus finishes", async () => {
    const list = host.getModel();
    await list.runAction("select-list:toggle-keep-open");
    let release, entered;
    const gate = new Promise((resolve) => (release = resolve));
    const started = new Promise((resolve) => (entered = resolve));
    const open = lumine.workspace.open.bind(lumine.workspace);
    spyOn(lumine.workspace, "open").and.callFake(async (...args) => {
      if (args[0] === editor) {
        entered();
        await gate;
      }
      return open(...args);
    });
    const focusing = list.runAction("fuzzy-workspace:focus-selected-item");
    await started;
    host.hide();
    await host.show();
    await list.setQuery("new session query");
    const reload = spyOn(list, "reload").and.callThrough();

    release();
    await focusing;

    expect(reload).not.toHaveBeenCalled();
    expect(host.isVisible()).toBe(true);
    expect(list.getQuery()).toBe("new session query");
  });
});
