import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { setToken } from "../auth";

export default function Setup() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const { data } = await api.post("/auth/setup", { password });
      setToken(data.access_token);
      navigate("/library");
    } catch (err) {
      setError(err.response?.data?.detail || "Setup failed");
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: "10vh auto", padding: 24 }}>
      <h1>Welcome — Set Your Password</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", padding: 8, marginBottom: 12 }}
        />
        <button type="submit" style={{ width: "100%", padding: 8 }}>
          Set Password
        </button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
