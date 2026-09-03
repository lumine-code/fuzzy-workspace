describe("fuzzy-workspace item actions", () => {
  let main;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    // The package activates on its commands, so dispatch one to trigger it;
    // activation also loads the package keymap the actions list reads.
    const activation = lumine.packages.activatePackage("fuzzy-workspace");
    lumine.commands.dispatch(lumine.views.getView(lumine.workspace), "fuzzy-workspace:toggle");
    main = (await activation).mainModule;
    main.selectListHost.hide();
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("fuzzy-workspace");
  });

  it("describes its explicit actions with command metadata and keybindings", async () => {
    await main.selectList.update({
      items: [
        {
          uri: "file:///selected",
          title: "selected",
          container: "Center",
          paneItem: {},
          pane: {},
        },
      ],
    });
    const actions = main.selectList.getAvailableActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    const closeItem = byCommand.get("fuzzy-workspace:close-selected-item");
    expect(closeItem.name).toBe("Close Selected Item");
    expect(closeItem.description).toBe("Close the item in its pane, keeping the list open.");
    expect(closeItem.keystrokes).toEqual(["alt-delete"]);

    expect(byCommand.get("fuzzy-workspace:copy-selected-path").keystrokes).toEqual(["alt-c"]);
    expect(byCommand.get("fuzzy-workspace:focus-selected-item").keystrokes).toEqual(["enter"]);
    expect(byCommand.get("fuzzy-workspace:close-selected-item").group).toBe("Manage");

    // Every action explains itself with more than a restated title.
    for (const action of actions) {
      expect(action.description).toBeTruthy();
    }

    // Chrome and global commands stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("select-list:actions")).toBe(false);
    expect(byCommand.has("fuzzy-workspace:toggle")).toBe(false);
  });

  it("offers the core recent actions only while recent items exist", async () => {
    main.selectList.selectNone();
    const hasClear = () =>
      main.selectList
        .getAvailableActions()
        .some(({ command }) => command === "select-list:clear-recents");

    expect(hasClear()).toBe(false);
    await main.selectList.setRecentItemIds(["file:///selected"]);
    expect(hasClear()).toBe(true);
    expect(
      main.selectList
        .getAvailableActions()
        .find(({ command }) => command === "select-list:clear-recents").context,
    ).toBe("dialog");
  });

  it("shows the shared action palette as a flow step and runs against captured context", async () => {
    const selected = {
      uri: "file:///selected",
      title: "selected",
      container: "Center",
      paneItem: {},
      pane: {},
    };
    await main.selectListHost.show();
    await main.selectList.update({ items: [selected] });

    expect(await main.selectListHost.showActions()).toBe(true);

    expect(lumine.workspace.getModalTrail()).toEqual(["Workspace", "Actions"]);
    lumine.workspace.popModal();

    const spy = spyOn(main, "performAction");
    await main.selectList.runAction("fuzzy-workspace:close-selected-item");

    expect(spy).toHaveBeenCalled();
    expect(spy.calls.mostRecent().args[0]).toBe("close");
    expect(spy.calls.mostRecent().args[1].item).toBe(selected);
    expect(main.selectListHost.isVisible()).toBeTruthy();
  });
});
