import { render, screen, fireEvent } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("pdfjs-dist", () => ({ GlobalWorkerOptions: {}, getDocument: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: vi.fn(() => Promise.resolve({})) }));

import { ThemeContext } from "../App";
import ThemeToggle from "../components/ThemeToggle";

function renderToggle(theme = "light", setTheme = vi.fn()) {
  return render(
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <ThemeToggle />
    </ThemeContext.Provider>
  );
}

describe("ThemeToggle", () => {
  it("renders light icon when theme is light", () => {
    renderToggle("light");
    expect(screen.getByRole("button", { name: /toggle theme/i })).toHaveTextContent("☀️");
  });

  it("renders dark icon when theme is dark", () => {
    renderToggle("dark");
    expect(screen.getByRole("button", { name: /toggle theme/i })).toHaveTextContent("🌙");
  });

  it("opens dropdown with 4 options on click", () => {
    renderToggle("light");
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    expect(screen.getByText("Light")).toBeInTheDocument();
    expect(screen.getByText("Dark")).toBeInTheDocument();
    expect(screen.getByText("Sepia")).toBeInTheDocument();
    expect(screen.getByText("High Contrast")).toBeInTheDocument();
  });

  it("calls setTheme with the selected value", () => {
    const setTheme = vi.fn();
    renderToggle("light", setTheme);
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    fireEvent.click(screen.getByText("Dark"));
    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("closes dropdown after selecting a theme", () => {
    renderToggle("light");
    fireEvent.click(screen.getByRole("button", { name: /toggle theme/i }));
    fireEvent.click(screen.getByText("Sepia"));
    expect(screen.queryByText("Light")).not.toBeInTheDocument();
  });
});
