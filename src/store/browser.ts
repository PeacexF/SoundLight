import { create } from "zustand";

interface BrowserState {
  /** The page currently loaded, or null for a blank browser. */
  url: string | null;
  open: (url: string) => void;
  close: () => void;
}

/**
 * Browser state lives outside the view so the sidebar can close the page.
 * The native webview covers the content area, so any control that must always
 * be reachable has to sit outside it.
 */
export const useBrowser = create<BrowserState>((set) => ({
  url: null,
  open: (url) => set({ url }),
  close: () => set({ url: null }),
}));
