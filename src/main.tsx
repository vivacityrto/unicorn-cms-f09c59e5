import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/dark-safety-net.css";
import { setupInstallSupport } from "./lib/pwaInstall";

setupInstallSupport();

createRoot(document.getElementById("root")!).render(<App />);
