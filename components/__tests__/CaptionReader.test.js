jest.mock("react-native-webview", () => ({ WebView: () => null }));

import { cleanPostUrl } from "../CaptionReader";
import { CAPTION_SCRIPT } from "../../util/captionScript";

test("tracking params and fragments are stripped from the post link", () => {
  expect(cleanPostUrl("https://www.instagram.com/reel/DfQTItxR_3U/?vrfl=abc&igsh=x#y")).toBe(
    "https://www.instagram.com/reel/DfQTItxR_3U/"
  );
});

test("a non-URL is passed through untouched", () => {
  expect(cleanPostUrl("not a url")).toBe("not a url");
});

// A tiny fake page: caption collapsed behind "more"; clicking expands it.
function runScript(bodyText) {
  const posted = [];
  const more = { children: [], textContent: "… עוד", click: () => { page.innerText = bodyText; } };
  const page = {
    innerText: "login banner ".repeat(10),
    querySelectorAll: () => (page.innerText === bodyText ? [] : [more]),
  };
  const win = { ReactNativeWebView: { postMessage: (m) => posted.push(JSON.parse(m)) } };
  const doc = { querySelector: () => page, body: page };
  new Function("window", "document", "setTimeout", CAPTION_SCRIPT)(win, doc, (fn) => fn());
  return posted;
}

test("the page script expands the caption and posts it, without the comments", () => {
  const caption = "פאד סי יו\nמצרכים:\n* 500 גרם סינטה\nאופן ההכנה\n1. מקפיצים. ".repeat(2);
  const posted = runScript(`${caption}\nuser\n \n4 ימים\nוואו\nלייק\nהשב/השיבי\nעוד תגובה`);
  expect(posted).toHaveLength(1);
  expect(posted[0].type).toBe("caption");
  expect(posted[0].text).toContain("אופן ההכנה");
  expect(posted[0].text).not.toContain("עוד תגובה");
});
