import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import { api } from "../lib/api";
import type { DownloadProgress, ToolStatus } from "../types";
import { useLibrary } from "./library";

interface DownloadState {
  jobs: DownloadProgress[];
  tools: ToolStatus | null;
  installing: boolean;
  panelOpen: boolean;

  refreshTools: () => Promise<void>;
  installYtDlp: () => Promise<void>;
  updateYtDlp: () => Promise<string>;
  extract: (url?: string) => Promise<void>;
  direct: (url: string) => Promise<void>;
  clearFinished: () => void;
  setPanelOpen: (open: boolean) => void;
}

export const useDownloads = create<DownloadState>((set, get) => ({
  jobs: [],
  tools: null,
  installing: false,
  panelOpen: false,

  async refreshTools() {
    set({ tools: await api.toolsStatus() });
  },

  async installYtDlp() {
    set({ installing: true });
    try {
      await api.installYtDlp();
      await get().refreshTools();
    } finally {
      set({ installing: false });
    }
  },

  async updateYtDlp() {
    const out = await api.updateYtDlp();
    await get().refreshTools();
    return out;
  },

  async extract(url) {
    set({ panelOpen: true });
    await api.downloadExtract(url);
  },

  async direct(url) {
    set({ panelOpen: true });
    await api.downloadDirect(url);
  },

  clearFinished() {
    set({ jobs: get().jobs.filter((j) => j.stage !== "done" && j.stage !== "failed") });
  },

  setPanelOpen(open) {
    set({ panelOpen: open });
  },
}));

// Progress arrives as a stream of snapshots keyed by job id.
void listen<DownloadProgress>("download://progress", (event) => {
  const incoming = event.payload;
  const { jobs } = useDownloads.getState();
  const index = jobs.findIndex((j) => j.id === incoming.id);
  useDownloads.setState({
    jobs:
      index >= 0
        ? jobs.map((j) => (j.id === incoming.id ? incoming : j))
        : [incoming, ...jobs],
  });
});

// A finished download means the library grew underneath whatever is on screen.
void listen("library://changed", () => {
  void useLibrary.getState().refresh();
  void useLibrary.getState().refreshPlaylists();
});
