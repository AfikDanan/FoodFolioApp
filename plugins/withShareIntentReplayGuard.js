// Stops Android from importing the same shared recipe again.
//
// When FoodFolio is opened by a share (Instagram, TikTok, a PDF...), that share
// becomes the activity's launch intent and stays with the task. Android hands
// the same intent back whenever it re-creates the activity: after the system
// freed it in the background, on a configuration change, or when the app is
// reopened from Recents. expo-share-intent reads the launch intent in
// onCreate, so each of those re-imports the recipe that was already imported.
//
// A fresh share always arrives as a new launch (no saved state, not from
// Recents) or through onNewIntent, so in the other two cases the launch intent
// is stale and is replaced with a plain launcher intent before
// expo-share-intent sees it.
const { withMainActivity } = require("expo/config-plugins");

const MARKER = "// share-intent-replay-guard";

const GUARD = `    ${MARKER}
    if (savedInstanceState != null ||
        (intent.flags and android.content.Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) {
      intent = android.content.Intent(android.content.Intent.ACTION_MAIN)
        .addCategory(android.content.Intent.CATEGORY_LAUNCHER)
        .setPackage(packageName)
    }
`;

function addGuard(src) {
  if (src.includes(MARKER)) return src;
  const onCreate = /override fun onCreate\(savedInstanceState: Bundle\?\)\s*\{\n/;
  if (!onCreate.test(src)) {
    throw new Error("withShareIntentReplayGuard: MainActivity.onCreate(savedInstanceState) not found");
  }
  return src.replace(onCreate, (m) => m + GUARD);
}

module.exports = function withShareIntentReplayGuard(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withShareIntentReplayGuard: expected a Kotlin MainActivity");
    }
    cfg.modResults.contents = addGuard(cfg.modResults.contents);
    return cfg;
  });
};

module.exports.addGuard = addGuard;
