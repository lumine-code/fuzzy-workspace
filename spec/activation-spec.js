const path = require("path");

const PACKAGE_NAME = "fuzzy-workspace";
const PACKAGE_PATH = path.join(__dirname, "..");

describe("fuzzy-workspace bootstrap activation", () => {
  let pack;
  let workspaceElement;

  beforeEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    pack = await lumine.packages.startPackage(PACKAGE_PATH);
  });

  afterEach(async () => {
    if (lumine.packages.isPackageLoaded(PACKAGE_NAME)) {
      await lumine.packages.unloadPackage(PACKAGE_NAME);
    }
  });

  it("keeps the select-list DOM out of activation", () => {
    expect(lumine.packages.getPackageLifecycleState(PACKAGE_NAME)).toBe("active");
    expect(pack.mainModule).not.toBeNull();
    expect(pack.mainActivated).toBe(true);
    expect(pack.mainModule.selectListHost).toBeNull();
  });

  it("creates the select list when its toggle command is used", async () => {
    await lumine.commands.dispatch(workspaceElement, "fuzzy-workspace:toggle");

    expect(pack.mainModule.selectListHost).not.toBeNull();
    expect(pack.mainModule.selectListHost.isVisible()).toBe(true);
    pack.mainModule.selectListHost.hide();
  });
});
