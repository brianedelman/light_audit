import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "../App";

describe("App", () => {
  it("renders the get started heading", () => {
    render(<App />);
    expect(screen.getByText("Get started")).toBeInTheDocument();
  });

  it("increments counter on click", () => {
    render(<App />);
    const button = screen.getByRole("button", { name: /count is/i });
    expect(button).toHaveTextContent("Count is 0");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Count is 1");
  });
});
