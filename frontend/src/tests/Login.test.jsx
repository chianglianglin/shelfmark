import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Login from "../pages/Login";
import api from "../api";

vi.mock("../api");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => mockNavigate,
}));

test("submits password and redirects on success", async () => {
  api.post = vi.fn().mockResolvedValue({ data: { access_token: "tok456" } });

  render(<MemoryRouter><Login /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText(/password/i), {
    target: { value: "mypassword" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/auth/login", { password: "mypassword" }));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/library"));
});

test("shows error message on failed login", async () => {
  api.post = vi.fn().mockRejectedValue(new Error("Unauthorized"));

  render(<MemoryRouter><Login /></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText(/password/i), {
    target: { value: "wrongpassword" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await waitFor(() => expect(screen.getByText("Invalid password")).toBeInTheDocument());
});
