import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { X } from "lucide-react";
import directorDeskCss from "../directorDesk/styles/index.css?raw";
import { DirectorDeskShell } from "../directorDesk/app/layout/DirectorDeskShell";
import { DirectorCanvas } from "../directorDesk/editor/canvas/DirectorCanvas";
import { clearDirectorDeskHostBridge, initDirectorDeskHostBridge } from "../directorDesk/editor/io/hostBridge";
import { useDirectorStore } from "../directorDesk/editor/store/directorStore";

const scopedDirectorDeskCss = `${scopeDirectorDeskCss(directorDeskCss)}

.director-desk-app {
  display: grid;
  grid-template-rows: auto 1fr;
  width: 100%;
  height: 100%;
  min-height: 720px;
  overflow: hidden;
}
`;

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function scopeDirectorDeskCss(css: string) {
  return css
    .replace(/:root\[data-theme="dark"\],\s*:root\.dark/g, ".director-desk-app.director-desk-theme-dark")
    .replace(/:root/g, ".director-desk-app")
    .replace(/html,\s*body,\s*#root/g, ".director-desk-app")
    .replace(/(^|})\s*body\s*\{/g, "$1 .director-desk-app {")
    .replace(/(^|})\s*button,\s*input,\s*select,\s*textarea\s*\{/g, "$1 .director-desk-app button, .director-desk-app input, .director-desk-app select, .director-desk-app textarea {")
    .replace(/(^|})\s*button\s*\{/g, "$1 .director-desk-app button {")
    .replace(/(^|})\s*input,\s*select,\s*textarea\s*\{/g, "$1 .director-desk-app input, .director-desk-app select, .director-desk-app textarea {")
    .replace(/(^|})\s*button:focus-visible\s*\{/g, "$1 .director-desk-app button:focus-visible {")
    .replace(/(^|})\s*input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible\s*\{/g, "$1 .director-desk-app input:focus-visible, .director-desk-app select:focus-visible, .director-desk-app textarea:focus-visible {");
}

function DirectorDeskApp() {
  const viewMode = useDirectorStore((state) => state.viewMode);
  const setViewMode = useDirectorStore((state) => state.setViewMode);

  useEffect(() => {
    initDirectorDeskHostBridge({ themeTarget: "container" });

    return () => {
      clearDirectorDeskHostBridge();
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isEditableShortcutTarget(event.target)) return;
      if (!event.metaKey && !event.ctrlKey) return;

      const key = event.key.toLowerCase();
      if (key === "c") {
        event.preventDefault();
        useDirectorStore.getState().copySelectedObjects();
        return;
      }

      if (key === "v") {
        event.preventDefault();
        useDirectorStore.getState().pasteClipboardObjects();
        return;
      }

      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        useDirectorStore.getState().undo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="director-desk-app director-desk-theme-dark">
      <style>{scopedDirectorDeskCss}</style>
      <header className="top-bar">
        <div className="top-bar-left">
          <h1 className="top-bar-title">3D导演台</h1>
        </div>
        <div className="top-bar-center">
          <div className="mode-toggle ui-segmented" role="group" aria-label="视角切换">
            <button
              className={`mode-toggle-button ui-segmented-item ${
                viewMode === "director" ? "ui-segmented-item-active" : ""
              }`}
              aria-pressed={viewMode === "director"}
              type="button"
              onClick={() => setViewMode("director")}
            >
              导演视角
            </button>
            <button
              className={`mode-toggle-button ui-segmented-item ${
                viewMode === "camera" ? "ui-segmented-item-active" : ""
              }`}
              aria-pressed={viewMode === "camera"}
              type="button"
              onClick={() => setViewMode("camera")}
            >
              机位视角
            </button>
          </div>
        </div>
        <div className="top-bar-actions">
          <button className="top-bar-action-button" type="button" aria-label="关闭" title="关闭">
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
      </header>
      <DirectorDeskShell>
        <DirectorCanvas />
      </DirectorDeskShell>
    </div>
  );
}

export function DirectorDeskStep() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<Root | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || rootRef.current) return;

    const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const root = createRoot(shadowRoot);
    rootRef.current = root;
    root.render(<DirectorDeskApp />);

    return () => {
      window.setTimeout(() => root.unmount(), 0);
      rootRef.current = null;
    };
  }, []);

  return (
    <section className="director-desk-step" aria-label="3D导演台">
      <div className="director-desk-shadow-host" ref={hostRef} />
    </section>
  );
}
