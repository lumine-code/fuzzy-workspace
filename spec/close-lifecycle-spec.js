describe("fuzzy-workspace close lifecycle", () => {
  let main, editor, pane, item;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    ({ mainModule: main } = await lumine.packages.activatePackage("fuzzy-workspace"));
    editor = await lumine.workspace.open();
    pane = lumine.workspace.paneForItem(editor);
    main.ensureSelectList();
    await main.selectListHost.show();
    item = main.buildItems().find((entry) => entry.paneItem === editor);
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("fuzzy-workspace");
  });

  const delayClose = () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const destroyItem = pane.destroyItem.bind(pane);
    spyOn(pane, "destroyItem").and.callFake(async (target) => {
      await gate;
      return destroyItem(target);
    });
    const closing = main.performAction("close", { item }).then(
      () => null,
      (error) => error,
    );
    return { release, closing };
  };

  it("closes the editor and refreshes the current list", async () => {
    const reload = spyOn(main.selectList, "reload").and.callThrough();
    await main.performAction("close", { item });
    expect(editor.isDestroyed()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(main.selectList.getItems().some((entry) => entry.paneItem === editor)).toBe(false);
  });

  it("finishes an authorized close without reloading a deactivated list", async () => {
    const reload = spyOn(main.selectList, "reload").and.callThrough();
    const { release, closing } = delayClose();
    await lumine.packages.deactivatePackage("fuzzy-workspace");
    release();
    expect(await closing).toBeNull();
    expect(editor.isDestroyed()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload a replacement package generation after an old close", async () => {
    const { release, closing } = delayClose();
    await lumine.packages.deactivatePackage("fuzzy-workspace");
    ({ mainModule: main } = await lumine.packages.activatePackage("fuzzy-workspace"));
    main.ensureSelectList();
    await main.selectListHost.show();
    const reload = spyOn(main.selectList, "reload").and.callThrough();
    release();
    expect(await closing).toBeNull();
    expect(editor.isDestroyed()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
  });
});
