import { createRoot } from "react-dom/client";

// Fonts are bundled, never fetched. Jyoma runs air-gapped, so a CDN @import
// would silently fall back to system faces on a real install.
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/ibm-plex-sans/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/dancing-script/400.css";
import "@fontsource/dancing-script/700.css";

import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
