import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupInstallSupport } from "./lib/pwaInstall";

setupInstallSupport();

createRoot(document.getElementById("root")!).render(<App />);
