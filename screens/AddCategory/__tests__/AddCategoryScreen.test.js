import React from "react";
import { Alert } from "react-native";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import AddCategoryScreen from "../AddCategoryScreen";
import { insertCategory } from "../../../util/database";

jest.mock("../../../util/database", () => ({
  insertCategory: jest.fn(),
}));

describe("AddCategoryScreen", () => {
  let navigationMock;

  beforeEach(() => {
    jest.spyOn(Alert, "alert").mockImplementation(() => {});
    navigationMock = {
      goBack: jest.fn(),
    };
  });

  /*Test Cases:*/

  //Test 1: Rendering the Screen
  it("renders the screen correctly", () => {
    const { getByPlaceholderText, getByText } = render(
      <AddCategoryScreen navigation={navigationMock} />
    );

    expect(getByPlaceholderText("שם קטגוריה")).toBeTruthy();
    expect(getByText("שמור")).toBeTruthy();
  });

  //Test 2: Validation for Empty Category Name
  it("shows an alert if category name is not provided", async () => {
    const { getByText } = render(
      <AddCategoryScreen navigation={navigationMock} />
    );

    const saveButton = getByText("שמור");

    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith("שגיאה", "נא להזין שם קטגוריה", [
        { text: "אישור" },
      ]);
    });
  });

  //Test 3: Successful Category Insertion
  it("calls insertCategory with correct parameters and navigates back on success", async () => {
    insertCategory.mockResolvedValue({ success: true, id: 1 });

    const { getByPlaceholderText, getByText } = render(
      <AddCategoryScreen navigation={navigationMock} />
    );

    fireEvent.changeText(getByPlaceholderText("שם קטגוריה"), "קינוחים");

    fireEvent.press(getByText("שמור"));

    await waitFor(() => {
      expect(insertCategory).toHaveBeenCalledWith("קינוחים", "");
      expect(navigationMock.goBack).toHaveBeenCalled();
    });
  });

  //Test 4: Failed Category Insertion
  it("does not navigate back if category insertion fails", async () => {
    insertCategory.mockResolvedValue({ success: false });

    const { getByPlaceholderText, getByText } = render(
      <AddCategoryScreen navigation={navigationMock} />
    );

    fireEvent.changeText(getByPlaceholderText("שם קטגוריה"), "בישול");

    fireEvent.press(getByText("שמור"));

    await waitFor(() => {
      expect(insertCategory).toHaveBeenCalledWith("בישול", "");
      expect(navigationMock.goBack).not.toHaveBeenCalled();
    });
  });
});
