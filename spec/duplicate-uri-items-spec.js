const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("Fuzzy Workspace views of the same file", () => {
  let main, scratch;

  beforeEach(async () => {
    for (const method of ["openExternal", "openPath", "showItemInFolder", "openApplication"]) {
      spyOn(lumine.shell, method).and.resolveTo();
    }
    spyOn(lumine.application, "openWindow").and.resolveTo();
    spyOn(lumine.clipboard, "write");
    scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workspace-views-")));
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("fuzzy-workspace")).mainModule;
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("fuzzy-workspace");
    for (const editor of lumine.workspace.getTextEditors()) editor.destroy();
    await lumine.fileWatchClient.settlePendingTeardown();
    const base = fs.realpathSync.native(os.tmpdir());
    const relative = path.relative(base, fs.realpathSync.native(scratch));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Owned scratch escaped the temporary root");
    }
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  async function openFile(name = "shared.txt") {
    const file = path.join(scratch, name);
    fs.writeFileSync(file, "sample\n");
    return lumine.workspace.open(file);
  }

  it("lists and focuses both editor instances in split panes", async () => {
    const first = await openFile();
    const firstPane = lumine.workspace.paneForItem(first);
    const secondPane = firstPane.splitRight({ copyActiveItem: true });
    const second = secondPane.getActiveItem();
    expect(second).not.toBe(first);
    expect(second.getURI()).toBe(first.getURI());
    const host = main.ensureSelectList();
    await host.show();
    const items = main.selectList.getItems();
    expect(items.length).toBe(2);
    expect(new Set(items.map((item) => main.selectList.getItemId(item))).size).toBe(2);
    const selected = items.find((item) => item.paneItem === second);
    expect(selected).toBeDefined();
    if (!selected) return;
    await main.selectList.selectItem(selected);
    await main.selectList.runAction("fuzzy-workspace:focus-selected-item");
    expect(lumine.workspace.getActivePane()).toBe(secondPane);
    expect(lumine.workspace.getActiveTextEditor()).toBe(second);
  });

  it("retains a normal file's URI as its persisted recent entry", async () => {
    const editor = await openFile("ordinary.txt");
    await main.ensureSelectList().show();
    const item = main.selectList.getItems()[0];
    await main.selectList.recordRecentItem(item);
    expect(main.serialize().recentlyUsed).toEqual([editor.getURI()]);
  });

  it("persists the file URI and keeps the other view reachable after closing one view", async () => {
    const first = await openFile();
    const second = lumine.workspace
      .paneForItem(first)
      .splitRight({ copyActiveItem: true })
      .getActiveItem();
    await main.ensureSelectList().show();
    const item = main.selectList.getItems().find((entry) => entry.paneItem === second);
    expect(item).toBeDefined();
    if (!item) return;
    const id = main.selectList.getItemId(item);
    await main.selectList.recordRecentItem(item);
    expect(main.serialize().recentlyUsed).toEqual([first.getURI()]);
    await main.performAction("close", {
      item: main.selectList.getItems().find((entry) => entry.paneItem === first),
    });
    const remaining = main.selectList.getItems();
    expect(remaining.length).toBe(1);
    expect(remaining[0].paneItem).toBe(second);
    expect(main.selectList.getItemId(remaining[0])).toBe(id);
    expect(main.serialize().recentlyUsed).toEqual([second.getURI()]);
    await main.selectList.selectItem(remaining[0]);
    await main.selectList.runAction("fuzzy-workspace:focus-selected-item");
    expect(lumine.workspace.getActiveTextEditor()).toBe(second);
  });

  it("keeps distinct untitled editors reachable", async () => {
    const first = await lumine.workspace.open();
    const pane = lumine.workspace.paneForItem(first);
    const second = lumine.workspace.buildTextEditor();
    pane.addItem(second);
    await main.ensureSelectList().show();
    const items = main.selectList.getItems();
    expect(items.length).toBe(2);
    expect(new Set(items.map((item) => main.selectList.getItemId(item))).size).toBe(2);
    expect(main.serialize().recentlyUsed).toEqual([]);
  });
});
