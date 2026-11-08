// Runs INSIDE the hidden WebView (see components/CaptionReader.js). Instagram renders
// the caption client side, so a plain fetch only ever sees a login shell. This expands
// the "more" link, waits for the text, and posts it back to React Native.
//
// Kept as a plain string so the exact same code can be pasted into a desktop browser
// console to test it.
export const CAPTION_SCRIPT = `
(function () {
  var done = false;
  function post(type, text) {
    if (done) return;
    done = true;
    var msg = JSON.stringify({ type: type, text: text || "" });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg);
    else window.__captionResult = msg;
  }
  function clean(text) {
    // Everything after the first comment's "Like / Reply" row is other people talking.
    var cut = text.search(/\\n(לייק|Like)\\n(השב\\/השיבי|Reply)/);
    if (cut > 0) text = text.slice(0, cut);
    return text.slice(0, 8000).trim();
  }
  function findLeaf(root, pattern) {
    var nodes = root.querySelectorAll("a, button, span, div[role=button]");
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.children.length === 0 && pattern.test((n.textContent || "").trim())) return n;
    }
    return null;
  }
  var MORE = /^(…\\s*|\\.\\.\\.\\s*)?(עוד|more)$/i;
  var STAY = /^(להמשיך באתר|Continue on site|Continue on web)$/i;
  var tries = 0;
  (function tick() {
    var root = document.querySelector("main") || document.body;
    // Phones get an "open in the app" interstitial first; step past it.
    var stay = findLeaf(document.body, STAY);
    if (stay) { try { stay.click(); } catch (e) {} }
    var more = findLeaf(root, MORE);
    if (more) { try { more.click(); } catch (e) {} }
    var text = (root.innerText || "");
    tries++;
    // Settled: nothing left to expand and there is real text beyond the login banner.
    if (!more && !stay && text.length > 120) return post("caption", clean(text));
    if (tries >= 20) return post("caption", clean(text));
    setTimeout(tick, 700);
  })();
})();
true;
`;
