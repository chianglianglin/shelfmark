import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createContext, useState, useEffect } from "react";
import { isLoggedIn } from "./auth";
import Setup from "./pages/Setup";
import Login from "./pages/Login";
import Library from "./pages/Library";
import Reader from "./pages/Reader";
import Settings from "./pages/Settings";
import DocumentReader from "./pages/DocumentReader";
import Transcriptions from "./pages/Transcriptions";
import TranscriptionReader from "./pages/TranscriptionReader";
import SharedTranscription from "./pages/SharedTranscription";

export const ThemeContext = createContext({ theme: "light", setTheme: () => {} });

function RequireAuth({ children }) {
  return isLoggedIn() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("app_theme") || "light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("app_theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <BrowserRouter>
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/login" element={<Login />} />
          <Route path="/library" element={<RequireAuth><Library /></RequireAuth>} />
          <Route path="/read/:id" element={<RequireAuth><Reader /></RequireAuth>} />
          <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/library/reader" element={<RequireAuth><DocumentReader /></RequireAuth>} />
          <Route path="/transcriptions" element={<RequireAuth><Transcriptions /></RequireAuth>} />
          <Route path="/transcription/:id" element={<RequireAuth><TranscriptionReader /></RequireAuth>} />
          <Route path="/shared/:token" element={<SharedTranscription />} />
          <Route path="*" element={<Navigate to="/library" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeContext.Provider>
  );
}
