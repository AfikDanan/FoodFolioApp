import { isSocialUrl, splitShared } from "../share";

describe("splitShared", () => {
  it("keeps the caption that Instagram or TikTok sends with the link", () => {
    const shared = splitShared({
      text: "עוגת גזר 🥕\n2 כוסות קמח\nhttps://www.instagram.com/reel/C1abc/?igsh=x",
    });
    expect(shared.url).toBe("https://www.instagram.com/reel/C1abc/?igsh=x");
    expect(shared.text).toBe("עוגת גזר 🥕\n2 כוסות קמח");
  });

  it("prefers the web URL the share sheet gives", () => {
    const shared = splitShared({
      webUrl: "https://vm.tiktok.com/ZMabc/",
      text: "https://vm.tiktok.com/ZMabc/",
    });
    expect(shared).toEqual({ url: "https://vm.tiktok.com/ZMabc/", text: "" });
  });

  it("returns plain text when no link was shared", () => {
    expect(splitShared({ text: "  מתכון בלי קישור  " })).toEqual({ url: null, text: "מתכון בלי קישור" });
  });

  it("handles an empty share", () => {
    expect(splitShared()).toEqual({ url: null, text: "" });
  });
});

describe("isSocialUrl", () => {
  it.each([
    ["https://www.instagram.com/p/C1abc/", true],
    ["https://instagram.com/reel/C1abc", true],
    ["https://vm.tiktok.com/ZMabc/", true],
    ["https://www.tiktok.com/@chef/video/1", true],
    ["https://www.10dakot.co.il/recipe/x", false],
    ["https://notinstagram.com/p/x", false],
    ["https://example.com/?u=instagram.com", false],
    ["not a url", false],
    [null, false],
  ])("%s -> %s", (url, expected) => {
    expect(isSocialUrl(url)).toBe(expected);
  });
});
