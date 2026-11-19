import React from "react";
import { BackHandler, Platform, Text } from "react-native";
import { render } from "@testing-library/react-native";
import { useDoubleBackExit, EXIT_WINDOW_MS } from "../useDoubleBackExit";

jest.mock("@react-navigation/native", () => {
  const { useEffect } = require("react");
  return { useFocusEffect: (cb) => useEffect(cb, [cb]) };
});

function Screen({ onFirst }) {
  useDoubleBackExit(onFirst);
  return <Text>home</Text>;
}

describe("useDoubleBackExit", () => {
  let handler;
  let now;
  beforeEach(() => {
    Platform.OS = "android";
    handler = null;
    now = 1_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    jest.spyOn(BackHandler, "addEventListener").mockImplementation((_, h) => {
      handler = h;
      return { remove: jest.fn() };
    });
    jest.spyOn(BackHandler, "exitApp").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("shows a note on the first back and exits on a quick second one", () => {
    const onFirst = jest.fn();
    render(<Screen onFirst={onFirst} />);
    expect(handler()).toBe(true);
    expect(onFirst).toHaveBeenCalledTimes(1);
    expect(BackHandler.exitApp).not.toHaveBeenCalled();
    now += 500;
    expect(handler()).toBe(true);
    expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
  });

  it("starts over when the second back comes too late", () => {
    const onFirst = jest.fn();
    render(<Screen onFirst={onFirst} />);
    handler();
    now += EXIT_WINDOW_MS + 1;
    handler();
    expect(BackHandler.exitApp).not.toHaveBeenCalled();
    expect(onFirst).toHaveBeenCalledTimes(2);
  });
});
