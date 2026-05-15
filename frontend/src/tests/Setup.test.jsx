import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Setup from "../pages/Setup";
import api from "../api";

vi.mock("../api");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

test("submits password and redirects on success", async () => {
  api.post = vi.fn().mockResolvedValue({ data: { access_token: "tok123" } });

  render(<MemoryRouter><Setup /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText(/password/i), {
    target: { value: "secret123" },
  });
  fireEvent.click(screen.getByRole("button", { name: /set password/i }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/setup", { password: "secret123" }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/library"));
});
