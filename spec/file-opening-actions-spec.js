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

  for (const modifiers of [{ shiftKey: true }, { ctrlKey: true, shiftKey: true }]) {
    it(`selects without opening for ${modifiers.ctrlKey ? "Ctrl+Shift" : "Shift"}-click`, async () => {
      const selected = list.getItems()[0];
      await list.selectNone();
      const open = spyOn(lumine.workspace, "open").and.callThrough();
      const action = spyOn(list, "runAction").and.callThrough();
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...modifiers,
      });
      list.getElement().querySelector('[role="option"]').dispatchEvent(event);
      await Promise.resolve();

      expect(event.defaultPrevented).toBe(true);
      expect(list.getSelectedItem()).toBe(selected);
      expect(action).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(host.isVisible()).toBe(true);
    });
  }

  it("uses external and reveal openers for Ctrl+Alt-click and Alt+Shift-click", async () => {
    const open = spyOn(external, "openExternal").and.resolveTo("");
    const show = spyOn(external, "showInFolder").and.resolveTo("");
    expect((await click({ ctrlKey: true, altKey: true })).status).toBe("success");
    await host.show();
    await list.selectItem(list.getItems().find((item) => item.paneItem === editor));
    expect((await click({ altKey: true, shiftKey: true })).status).toBe("success");
    expect(open).toHaveBeenCalledOnceWith(filename);
    expect(show).toHaveBeenCalledOnceWith(filename);
  });

  it("keeps an unsaved item's primary activation and does not pretend it has a disk path", async () => {
    await host.hide();
    const unsaved = await lumine.workspace.open();
    unsaved.setText("unsaved");
    await host.show();
    await list.selectItem(list.getItems().find((item) => item.paneItem === unsaved));
    expect((await list.runAction("fuzzy-workspace:open-selected-with")).status).toBe("unavailable");
    expect((await list.confirmSelection()).status).toBe("success");
    expect(lumine.workspace.getActivePaneItem()).toBe(unsaved);
  });

  it("resolves chooser, external and reveal keys without a separate pending binding", () => {
    const target = list.getQueryEditor().getElement();
    for (const [keystrokes, command] of [
      ["alt-enter", "fuzzy-workspace:open-selected-with"],
      ["ctrl-alt-enter", "fuzzy-workspace:open-selected-external"],
      ["alt-shift-enter", "fuzzy-workspace:show-selected-in-folder"],
    ])
      expect(lumine.keymaps.findKeyBindings({ target, keystrokes })[0]?.command).toBe(command);
    for (const keystrokes of ["shift-enter", "ctrl-shift-enter"])
      expect(
        lumine.keymaps
          .findKeyBindings({ target, keystrokes })
          .some((binding) => binding.command.startsWith("fuzzy-workspace:")),
      ).toBe(false);
  });
});
