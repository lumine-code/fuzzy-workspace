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
    lumine.commands.dispatch(workspaceElement, "fuzzy-workspace:toggle");
    main = (await activation).mainModule;
    main.selectList.hide();
    main.clearRecent();
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("fuzzy-workspace");
  });

  // `show` pushes the rows through `willShow`, but only schedules an etch
  // update when something actually changed — so awaiting the next update
  // promise can hang. A no-op update always resolves and always lands after
  // whatever `willShow` queued.
  async function showList() {
    main.selectList.show();
    await main.selectList.update({});
    return main.selectList;
  }

  function itemFor(uri) {
    return main.items.find((item) => item.uri === uri);
  }

  it("keeps the items it focused at the top, ruled off from the rest", async () => {
    await showList();
    main.recordRecent(itemFor(alpha));

    const selectList = await showList();

    expect(selectList.items[0].uri).toBe(alpha);
    const separator = selectList.element.querySelector(".select-list-separator");
    expect(separator.previousElementSibling.textContent).toContain("alpha");
    expect(separator.nextElementSibling.textContent).not.toContain("alpha");
  });

  it("records an item when it is focused", async () => {
    const selectList = await showList();
    await selectList.selectItem(itemFor(alpha));

    main.performAction("focus");

    expect(main.recentlyUsed).toEqual([alpha]);
    expect(main.serialize()).toEqual({ recentlyUsed: [alpha] });
  });

  it("records an item for every action over it, not only a focus", async () => {
    spyOn(lumine.clipboard, "write");
    const selectList = await showList();
    await selectList.selectItem(itemFor(beta));

    main.performAction("copy-path");

    expect(lumine.clipboard.write).toHaveBeenCalledWith(beta);
    expect(main.recentlyUsed).toEqual([beta]);
  });

  it("records an item it closed, since reopening brings it back", async () => {
    const selectList = await showList();
    await selectList.selectItem(itemFor(beta));

    main.performAction("close");

    expect(main.recentlyUsed).toEqual([beta]);
  });

  it("never records an item that has no URI", async () => {
    await showList();
    const untitled = { uri: undefined, title: "untitled" };

    main.recordRecent(untitled);

    expect(main.recentlyUsed).toEqual([]);
  });

  it("drops one item from the section without closing the list", async () => {
    await showList();
    main.recordRecent(itemFor(beta));
    main.recordRecent(itemFor(alpha));
    const selectList = await showList();
    await selectList.selectItem(itemFor(alpha));

    lumine.commands.dispatch(selectList.element, "fuzzy-workspace:remove-from-recent");
    await lumine.views.getNextUpdatePromise();

    expect(main.recentlyUsed).toEqual([beta]);
    expect(selectList.isVisible()).toBe(true);
    expect(selectList.getSelectedItem().uri).toBe(alpha);
  });

  it("offers the action only while a recent item is selected", async () => {
    await showList();
    main.recordRecent(itemFor(alpha));
    const selectList = await showList();

    await selectList.selectItem(itemFor(alpha));
    let actions = selectList.itemActions().map((action) => action.command);
    expect(actions).toContain("fuzzy-workspace:remove-from-recent");

    await selectList.selectItem(itemFor(beta));
    actions = selectList.itemActions().map((action) => action.command);
    expect(actions).not.toContain("fuzzy-workspace:remove-from-recent");
    expect(actions).toContain("fuzzy-workspace:copy-selected-path");
  });

  it("stands the section down under a query", async () => {
    await showList();
    main.recordRecent(itemFor(alpha));
    const selectList = await showList();

    selectList.refs.queryEditor.setText("beta");
    await lumine.views.getNextUpdatePromise();

    expect(selectList.element.querySelector(".select-list-separator")).toBeNull();
  });

  it("caps the list at the configured count", async () => {
    await showList();
    lumine.config.set("fuzzy-workspace.recentCount", 1);

    main.recordRecent(itemFor(alpha));
    main.recordRecent(itemFor(beta));

    expect(main.recentlyUsed).toEqual([beta]);
  });

  it("forgets everything on clear-recent", async () => {
    await showList();
    main.recordRecent(itemFor(alpha));
    const selectList = await showList();

    lumine.commands.dispatch(workspaceElement, "fuzzy-workspace:clear-recent");
    await lumine.views.getNextUpdatePromise();

    expect(main.recentlyUsed).toEqual([]);
    expect(selectList.element.querySelector(".select-list-separator")).toBeNull();
  });
});
