const path = require("path");
const { CompositeDisposable } = require("lumine");

describe("fuzzy-workspace saved file alternatives", () => {
  let main, editor, host, list, window, pane, leases, external;
  const filename = path.join(__dirname, "..", "README.md");

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    editor = await lumine.workspace.open(filename, { opener: "text-editor" });
    window = lumine.workspace.getMainWindow();
    pane = lumine.workspace.getActivePane().splitRight();
    pane.activate();
    main = (await lumine.packages.activatePackage("fuzzy-workspace")).mainModule;
    external = (await lumine.packages.activatePackage("open-external")).mainModule;
    host = main.ensureSelectList(window);
    list = host.getModel();
    leases = new CompositeDisposable();
    await host.show();
    await list.selectItem(list.getItems().find((item) => item.paneItem === editor));
  });

  afterEach(async () => {
    leases.dispose();
    await lumine.packages.deactivatePackage("fuzzy-workspace");
  });

  async function click(modifiers) {
    const done = new Promise((resolve) => {
      const lease = list.onDidFinishAction((result) => {
        lease.dispose();
        resolve(result);
      });
    });
    list
      .getElement()
      .querySelector('[role="option"].selected')
      .dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          button: 0,
          ...modifiers,
        }),
      );
    return done;
  }

  it("opens the chooser for the selected file in the pane captured when the list opened", async () => {
    await lumine.packages.deactivatePackage("open-with");
    const choose = jasmine.createSpy("choose opener");
    leases.add(
      lumine.commands.add("lumine-workspace", {
        "open-with:toggle": (event) => {
          event.stopPropagation();
          choose(event.detail);
        },
      }),
    );
    lumine.workspace
      .getPanes()
      .find((candidate) => candidate !== pane)
      .activate();
    expect((await click({ altKey: true })).status).toBe("success");
    expect(choose).toHaveBeenCalledOnceWith({ path: filename, pane });
  });

  it("forces a pending text editor for Shift-click without changing primary item activation", async () => {
    lumine.config.set("core.allowPendingPaneItems", false);
    expect((await click({ shiftKey: true })).status).toBe("success");
    expect(pane.getActiveItem().getPath()).toBe(filename);
    expect(pane.getPendingItem()).toBe(pane.getActiveItem());
    expect(pane.getActiveItem()).not.toBe(editor);
  });

  it("uses the external opener for Ctrl+Alt-click", async () => {
    const open = spyOn(external, "openExternal").and.resolveTo("");
    expect((await click({ ctrlKey: true, altKey: true })).status).toBe("success");
    expect(open).toHaveBeenCalledOnceWith(filename);
  });

  it("keeps an unsaved item's primary activation and does not pretend it has a disk path", async () => {
    await host.hide();
    const unsaved = await lumine.workspace.open();
    unsaved.setText("unsaved");
    await host.show();
    await list.selectItem(list.getItems().find((item) => item.paneItem === unsaved));
    expect((await list.runAction("fuzzy-workspace:open-selected-pending")).status).toBe(
      "unavailable",
    );
    expect((await list.confirmSelection()).status).toBe("success");
    expect(lumine.workspace.getActivePaneItem()).toBe(unsaved);
  });
});
