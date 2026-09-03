const path = require("path");
const os = require("os");

describe("fuzzy-workspace recent items", () => {
  let main, workspaceElement;

  const alpha = path.join(os.tmpdir(), "fuzzy-workspace-alpha.txt");
  const beta = path.join(os.tmpdir(), "fuzzy-workspace-beta.txt");

  beforeEach(async () => {
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    lumine.config.set("fuzzy-workspace.recentCount", 10);

    await lumine.workspace.open(alpha);
    await lumine.workspace.open(beta);

    const activation = lumine.packages.activatePackage("fuzzy-workspace");
    const opening = lumine.commands.dispatch(workspaceElement, "fuzzy-workspace:toggle");
    main = (await activation).mainModule;
    await opening;
    main.selectListHost.hide();
    await main.selectList.clearRecentItems();
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("fuzzy-workspace");
  });

  async function showList() {
    await main.selectListHost.show();
    return main.selectList;
  }

  function itemFor(uri) {
    return main.items.find((item) => item.uri === uri);
  }

  it("keeps the items it focused at the top, ruled off from the rest", async () => {
    await showList();
    await main.selectList.recordRecentItem(itemFor(alpha));

    const selectList = await showList();

    expect(selectList.getDisplayedItems()[0].uri).toBe(alpha);
    const separator = selectList.getElement().querySelector(".select-list-separator");
    expect(separator.previousElementSibling.textContent).toContain("alpha");
    expect(separator.nextElementSibling.textContent).not.toContain("alpha");
  });

  it("records an item when it is focused", async () => {
    const selectList = await showList();
    await selectList.selectItem(itemFor(alpha));

    const open = spyOn(lumine.workspace, "open").and.callThrough();
    const item = itemFor(alpha);
    await selectList.runAction("fuzzy-workspace:focus-selected-item");

    expect(main.recentlyUsed).toEqual([alpha]);
    expect(main.serialize()).toEqual({ recentlyUsed: [alpha] });
    expect(open).toHaveBeenCalledWith(item.paneItem, { searchAllPanes: true });
  });

  it("records an item for every action over it, not only a focus", async () => {
    spyOn(lumine.clipboard, "write");
    const selectList = await showList();
    await selectList.selectItem(itemFor(beta));

    await selectList.runAction("fuzzy-workspace:copy-selected-path");

    expect(lumine.clipboard.write).toHaveBeenCalledWith(beta);
    expect(main.recentlyUsed).toEqual([beta]);
  });

  it("records an item it closed, since reopening brings it back", async () => {
    const selectList = await showList();
    await selectList.selectItem(itemFor(beta));

    await selectList.runAction("fuzzy-workspace:close-selected-item");

    expect(main.recentlyUsed).toEqual([beta]);
  });

  it("never records an item that has no URI", async () => {
    await showList();
    const untitled = {
      uri: undefined,
      title: "untitled",
      container: "Center",
      paneItem: {},
      pane: {},
    };
    await main.selectList.update({ items: [untitled] });
    spyOn(lumine.workspace, "open").and.resolveTo(null);
    await main.selectList.runAction("fuzzy-workspace:focus-selected-item");

    expect(main.recentlyUsed).toEqual([]);
  });

  it("drops one item from the section without closing the list", async () => {
    await showList();
    await main.selectList.recordRecentItem(itemFor(beta));
    await main.selectList.recordRecentItem(itemFor(alpha));
    const selectList = await showList();
    await selectList.selectItem(itemFor(alpha));

    await selectList.runAction("select-list:remove-recent");
    await lumine.views.getNextUpdatePromise();

    expect(main.recentlyUsed).toEqual([beta]);
    expect(main.selectListHost.isVisible()).toBe(true);
    expect(selectList.getSelectedItem().uri).toBe(alpha);
  });

  it("offers the action only while a recent item is selected", async () => {
    await showList();
    await main.selectList.recordRecentItem(itemFor(alpha));
    const selectList = await showList();

    await selectList.selectItem(itemFor(alpha));
    let actions = selectList.getAvailableActions().map((action) => action.command);
    expect(actions).toContain("select-list:remove-recent");

    await selectList.selectItem(itemFor(beta));
    actions = selectList.getAvailableActions().map((action) => action.command);
    expect(actions).not.toContain("select-list:remove-recent");
    expect(actions).toContain("fuzzy-workspace:copy-selected-path");
  });

  it("stands the section down under a query", async () => {
    await showList();
    await main.selectList.recordRecentItem(itemFor(alpha));
    const selectList = await showList();

    selectList.getQueryEditor().setText("beta");
    await lumine.views.getNextUpdatePromise();

    expect(selectList.getElement().querySelector(".select-list-separator")).toBeNull();
  });

  it("caps the list at the configured count", async () => {
    await showList();
    lumine.config.set("fuzzy-workspace.recentCount", 1);

    await main.selectList.recordRecentItem(itemFor(alpha));
    await main.selectList.recordRecentItem(itemFor(beta));

    expect(main.recentlyUsed).toEqual([beta]);
  });

  it("forgets everything on clear-recent", async () => {
    await showList();
    await main.selectList.recordRecentItem(itemFor(alpha));
    const selectList = await showList();

    await lumine.commands.dispatch(workspaceElement, "fuzzy-workspace:clear-recent");
    await lumine.views.getNextUpdatePromise();

    expect(main.recentlyUsed).toEqual([]);
    expect(selectList.getElement().querySelector(".select-list-separator")).toBeNull();
  });
});
