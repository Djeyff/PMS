import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./globals.css";

// Apply theme early to avoid flash
const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("app_theme") : null;
const initialTheme = savedTheme ?? (window.location.pathname.startsWith("/login") ? "dark" : "light");
if (initialTheme === "dark") {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

createRoot(document.getElementById("root")!).render(<App />);