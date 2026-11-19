const { addGuard } = require("../withShareIntentReplayGuard");

const MAIN_ACTIVITY = `class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}
`;

describe("withShareIntentReplayGuard", () => {
  it("drops a stale launch intent before super.onCreate runs", () => {
    const out = addGuard(MAIN_ACTIVITY);
    const guard = out.indexOf("FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY");
    expect(guard).toBeGreaterThan(out.indexOf("override fun onCreate"));
    expect(guard).toBeLessThan(out.indexOf("super.onCreate"));
    expect(out).toContain("savedInstanceState != null");
  });

  it("is applied once even when prebuild runs again", () => {
    const once = addGuard(MAIN_ACTIVITY);
    expect(addGuard(once)).toBe(once);
  });

  it("fails loudly when MainActivity no longer has onCreate", () => {
    expect(() => addGuard("class MainActivity : ReactActivity() {}")).toThrow(/onCreate/);
  });
});
