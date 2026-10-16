const fs = require("node:fs"),
  path = require("node:path");
describe("Workspace file action availability", () => {
  let main, editor;
  beforeEach(async () => {
    jasmine.attachToDOM(lumine.workspace.getElement());
    main = (await lumine.packages.activatePackage("fuzzy-workspace")).mainModule;
    editor = await lumine.workspace.open();
    editor.getBuffer().setPath(path.join(__dirname, "not-yet-written.txt"));
  });
  afterEach(() => {
    if (jasmine.isSpy(fs.statSync)) fs.statSync.and.callThrough();
    if (jasmine.isSpy(lumine.workspace.open)) lumine.workspace.open.and.callThrough();
  });
  it("uses saved file metadata in when but revalidates on execution", async () => {
    const window = lumine.workspace.getMainWindow(),
      item = { paneItem: editor, uri: editor.getPath() };
    const stat = spyOn(fs, "statSync").and.throwError("availability performed I/O");
    expect(main.fileTarget(item, window).path).toBe(editor.getPath());
    expect(stat).not.toHaveBeenCalled();
    stat.and.returnValue({ isFile: () => false });
    const open = spyOn(lumine.workspace, "open");
    await main.performFileAction(item, "external", undefined, window);
    expect(stat).toHaveBeenCalledWith(editor.getPath());
    expect(open).not.toHaveBeenCalled();
  });
});
