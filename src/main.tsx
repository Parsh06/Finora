import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
// Initialize Firebase early
import "@/lib/firebase";
// Check environment variables (development only)
import "@/utils/env-check";

createRoot(document.getElementById("root")!).render(<App />);
