import { startTransition, useEffect, useState, useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { SidebarInset, SidebarProvider } from "./components/ui/sidebar";
import "./App.css";
import { AppSidebar } from "./components/app-sidebar";
import {
  AppSidebarRight,
  type RightSidebarView,
} from "./components/app-sidebar-right";
import { AppTopbar } from "./components/app-topbar";
import { MainArea } from "./components/main-area";
import type { OpenFileTab } from "./components/editor-tabs-panel";
import {
  SidebarView,
  useActiveSidebarView,
  useSidebarViewStore,
} from "./components/sidebar-view";
import {
  DEFAULT_SETTINGS_PANEL,
  OPEN_SETTINGS_PANEL_EVENT,
  type SettingsPanelId,
} from "./lib/settings-panel";
import { TooltipProvider } from "./components/ui/tooltip";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LoginForm } from "./components/login-form";
import { OnboardingWizard } from "./components/onboarding-wizard";
import {
  clearGuestSession,
  isGuestSession,
  useSession,
} from "./lib/auth-client";
import { readCachedAuthUser } from "./lib/cached-auth-user";
import { isOnboardingComplete } from "./lib/onboarding";
import { DiffViewer } from "./components/source-control/diff-viewer";
import { exists, mkdir, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  getCurrentWorkspace,
  getWorkspaceScopedStorageKey,
} from "./lib/workspace";
import {
  refreshWorkspaceWikiLinkIndex,
  rebuildWorkspaceWikiLinkIndex,
  useOpenWikiLinkGraph,
  useWikiLinkRebuildRequests,
  WIKI_GRAPH_TAB_NAME,
  WIKI_GRAPH_TAB_PATH,
  type WikiLinkIndexingState,
} from "./lib/wikilink-utils";
import {
  defaultShortcutConfig,
  getShortcutBindingLabel,
  loadShortcutConfig,
  matchShortcutEvent,
  persistShortcutConfig,
  type ShortcutAction,
} from "./lib/shortcuts";
import {
  getDisplayNameForUrl,
  getFaviconUrl,
  OPEN_IN_APP_BROWSER_EVENT,
  UPDATE_BROWSER_TAB_EVENT,
  type BrowserTabUpdate,
} from "./lib/browser-settings";
import { logInstantFeel } from "./lib/instant-feel-logger";
import { armUpdateCheck } from "./lib/updater";
import { UpdateNotificationDialog } from "./components/update-notification-dialog";

interface SelectedFile {
  id: string;
  path: string;
  name: string;
}

interface DiffState {
  selectedPath: string | null;
  diffContent: string | null;
  diffLoading: boolean;
  diffStaged: boolean;
}

type PersistedOpenFileTab = {
  path: string;
  name: string;
};

const OPEN_TABS_STORAGE_KEY = "open-files";
const ACTIVE_FILE_PATH_STORAGE_KEY = "active-file-path";
const EMPTY_EXCALIDRAW_DOCUMENT = JSON.stringify(
  {
    type: "excalidraw",
    version: 2,
    source: "https://notelab.app",
    elements: [],
    appState: {
      viewBackgroundColor: "#ffffff",
      gridSize: null,
    },
    files: {},
  },
  null,
  2
);

const EMPTY_CODE_DRAWING_DOCUMENT = JSON.stringify(
  {
    code: "",
    drawingType: "Mermaid",
    drawingMode: "Both",
  },
  null,
  2
);

function App() {
  const [openFiles, setOpenFiles] = useState<OpenFileTab[]>([]);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<string | null>(
    () => getCurrentWorkspace()
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  const activeView = useActiveSidebarView();
  const setActiveView = useSidebarViewStore((state) => state.setActiveView);
  const [settingsPanel, setSettingsPanel] =
    useState<SettingsPanelId>(DEFAULT_SETTINGS_PANEL);
  const { data: authPayload, isPending: sessionPending } = useSession();
  const guest = isGuestSession();
  const signedInUser = authPayload?.user;
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const [diffState, setDiffState] = useState<DiffState>({
    selectedPath: null,
    diffContent: null,
    diffLoading: false,
    diffStaged: false,
  });
  const [rightSidebarOpen, setRightSidebarOpen] = useState(false);
  const [rightSidebarView, setRightSidebarView] =
    useState<RightSidebarView>("chat");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [zenMode, setZenMode] = useState(false);
  const [shortcuts, setShortcuts] = useState(loadShortcutConfig);
  const [wikiLinkIndexingState, setWikiLinkIndexingState] =
    useState<WikiLinkIndexingState>({
      currentFile: null,
      error: null,
      phase: "idle",
      processedFiles: 0,
      totalFiles: 0,
      workspace: null,
    });
  const activePathRef = useRef<string | null>(null);
  const openFilesRef = useRef<OpenFileTab[]>([]);
  const selectedFileRef = useRef<SelectedFile | null>(null);
  const activeViewRef = useRef<SidebarView>("explorer");
  const nextTabIdRef = useRef(1);
  const workspaceStateReadyRef = useRef(false);
  const currentWorkspaceRef = useRef<string | null>(currentWorkspace);
  const wikiLinkRebuildInFlightRef = useRef(false);
  const wikiLinkPendingWorkspaceRef = useRef<string | null>(null);
  const wikiLinkPendingForceRef = useRef(false);
  const wikiLinkIncrementalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createTab = useCallback((path: string, name: string): OpenFileTab => {
    const tab = {
      id: `tab-${nextTabIdRef.current}`,
      path,
      name,
    };
    nextTabIdRef.current += 1;
    return tab;
  }, []);

  useEffect(() => {
    setOnboardingDone(isOnboardingComplete());
  }, []);

  useEffect(() => {
    armUpdateCheck();
  }, []);

  useEffect(() => {
    if (signedInUser) clearGuestSession();
  }, [signedInUser]);

  const isCheckingAuth =
    sessionPending &&
    !guest &&
    !(
      typeof navigator !== "undefined" &&
      !navigator.onLine &&
      readCachedAuthUser()
    );
  const isAuthenticated = Boolean(signedInUser) || guest;

  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);

  useEffect(() => {
    currentWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);

  useEffect(() => {
    persistShortcutConfig(shortcuts);
  }, [shortcuts]);

  useEffect(() => {
    if (zenMode && (activeView !== "explorer" || !selectedFile)) {
      setZenMode(false);
    }
  }, [activeView, selectedFile, zenMode]);

  const restoreWorkspaceState = useCallback(
    (workspace: string | null) => {
      setCurrentWorkspaceState(workspace);

      if (!workspace) {
        startTransition(() => {
          setOpenFiles([]);
          setSelectedFile(null);
        });
        workspaceStateReadyRef.current = true;
        return;
      }

      const rawOpenTabs = localStorage.getItem(
        getWorkspaceScopedStorageKey(OPEN_TABS_STORAGE_KEY, workspace)
      );

      let persistedTabs: PersistedOpenFileTab[] = [];

      if (rawOpenTabs) {
        try {
          const parsed = JSON.parse(rawOpenTabs);
          if (Array.isArray(parsed)) {
            persistedTabs = parsed.filter(
              (item): item is PersistedOpenFileTab =>
                Boolean(item) &&
                typeof item === "object" &&
                typeof item.path === "string" &&
                typeof item.name === "string"
            );
          }
        } catch {
          persistedTabs = [];
        }
      }

      const restoredTabs = persistedTabs.map((tab) => createTab(tab.path, tab.name));
      const restoredSelectedPath = localStorage.getItem(
        getWorkspaceScopedStorageKey(ACTIVE_FILE_PATH_STORAGE_KEY, workspace)
      );
      const restoredSelectedFile =
        restoredTabs.find((tab) => tab.path === restoredSelectedPath) ??
        restoredTabs[0] ??
        null;

      startTransition(() => {
        setOpenFiles(restoredTabs);
        setSelectedFile(restoredSelectedFile);
      });

      workspaceStateReadyRef.current = true;
    },
    [createTab]
  );

  useEffect(() => {
    restoreWorkspaceState(getCurrentWorkspace());

    const handleWorkspaceChange = () => {
      workspaceStateReadyRef.current = false;
      restoreWorkspaceState(getCurrentWorkspace());
    };

    window.addEventListener("workspace-changed", handleWorkspaceChange);
    return () => window.removeEventListener("workspace-changed", handleWorkspaceChange);
  }, [restoreWorkspaceState]);

  useEffect(() => {
    if (!workspaceStateReadyRef.current || !currentWorkspace) {
      return;
    }

    const serializedTabs = openFiles.map(({ path, name }) => ({ path, name }));
    localStorage.setItem(
      getWorkspaceScopedStorageKey(OPEN_TABS_STORAGE_KEY, currentWorkspace),
      JSON.stringify(serializedTabs)
    );
  }, [currentWorkspace, openFiles]);

  const processWikiLinkRebuildQueue = useCallback(() => {
    if (wikiLinkRebuildInFlightRef.current) {
      return;
    }

    const workspace = wikiLinkPendingWorkspaceRef.current ?? currentWorkspaceRef.current;
    if (!workspace) {
      return;
    }

    const forceRebuild = wikiLinkPendingForceRef.current;
    wikiLinkPendingWorkspaceRef.current = null;
    wikiLinkPendingForceRef.current = false;

    wikiLinkRebuildInFlightRef.current = true;

    const runIndexUpdate = forceRebuild
      ? rebuildWorkspaceWikiLinkIndex
      : refreshWorkspaceWikiLinkIndex;

    void runIndexUpdate(workspace, (nextState) => {
      if (currentWorkspaceRef.current !== workspace) {
        return;
      }

      setWikiLinkIndexingState(nextState);
    })
      .catch((error) => {
        console.error("[WikiLinkIndex] Failed to rebuild workspace index:", error);

        if (currentWorkspaceRef.current !== workspace) {
          return;
        }

        setWikiLinkIndexingState({
          currentFile: null,
          error: error instanceof Error ? error.message : "Failed to rebuild wiki-link index.",
          phase: "error",
          processedFiles: 0,
          totalFiles: 0,
          workspace,
        });
      })
      .finally(() => {
        wikiLinkRebuildInFlightRef.current = false;

        const activeWorkspace = currentWorkspaceRef.current;
        if (!activeWorkspace) {
          return;
        }

        if (!wikiLinkPendingWorkspaceRef.current && activeWorkspace !== workspace) {
          wikiLinkPendingWorkspaceRef.current = activeWorkspace;
        }

        if (wikiLinkPendingWorkspaceRef.current) {
          processWikiLinkRebuildQueue();
        }
      });
  }, []);

  const queueWikiLinkRebuild = useCallback(
    ({ force }: { force?: boolean } = {}) => {
      const workspace = currentWorkspaceRef.current;
      if (!workspace) {
        return;
      }

      wikiLinkPendingWorkspaceRef.current = workspace;
      wikiLinkPendingForceRef.current = wikiLinkPendingForceRef.current || Boolean(force);
      processWikiLinkRebuildQueue();
    },
    [processWikiLinkRebuildQueue]
  );

  useWikiLinkRebuildRequests((force) => {
    queueWikiLinkRebuild({ force });
  });

  const openGraphTab = useCallback(() => {
    const existing = openFilesRef.current.find((file) => file.path === WIKI_GRAPH_TAB_PATH);
    const tab = existing ?? createTab(WIKI_GRAPH_TAB_PATH, WIKI_GRAPH_TAB_NAME);

    setActiveView("explorer");
    if (!existing) {
      setOpenFiles((prev) => [...prev, tab]);
    }
    setSelectedFile(tab);
  }, [createTab]);

  useOpenWikiLinkGraph(openGraphTab);

  useEffect(() => {
    if (!currentWorkspace) {
      if (wikiLinkIncrementalTimerRef.current) {
        clearTimeout(wikiLinkIncrementalTimerRef.current);
        wikiLinkIncrementalTimerRef.current = null;
      }

      wikiLinkPendingWorkspaceRef.current = null;
      wikiLinkPendingForceRef.current = false;
      setWikiLinkIndexingState({
        currentFile: null,
        error: null,
        phase: "idle",
        processedFiles: 0,
        totalFiles: 0,
        workspace: null,
      });
      return;
    }

    queueWikiLinkRebuild();
  }, [currentWorkspace, queueWikiLinkRebuild]);

  useEffect(() => {
    const scheduleIncrementalRebuild = () => {
      if (!currentWorkspaceRef.current) {
        return;
      }

      if (wikiLinkIncrementalTimerRef.current) {
        clearTimeout(wikiLinkIncrementalTimerRef.current);
      }

      wikiLinkIncrementalTimerRef.current = setTimeout(() => {
        wikiLinkIncrementalTimerRef.current = null;
        queueWikiLinkRebuild();
      }, 450);
    };

    window.addEventListener("note-content-saved", scheduleIncrementalRebuild);
    window.addEventListener("file-renamed", scheduleIncrementalRebuild);
    window.addEventListener("entry-moved", scheduleIncrementalRebuild);
    window.addEventListener("entry-deleted", scheduleIncrementalRebuild);
    window.addEventListener("directory-refresh", scheduleIncrementalRebuild);

    return () => {
      if (wikiLinkIncrementalTimerRef.current) {
        clearTimeout(wikiLinkIncrementalTimerRef.current);
        wikiLinkIncrementalTimerRef.current = null;
      }

      window.removeEventListener("note-content-saved", scheduleIncrementalRebuild);
      window.removeEventListener("file-renamed", scheduleIncrementalRebuild);
      window.removeEventListener("entry-moved", scheduleIncrementalRebuild);
      window.removeEventListener("entry-deleted", scheduleIncrementalRebuild);
      window.removeEventListener("directory-refresh", scheduleIncrementalRebuild);
    };
  }, [queueWikiLinkRebuild]);

  useEffect(() => {
    const handleFileSelected = (e: Event) => {
      const { path, name } = (e as CustomEvent<SelectedFile>).detail;
      const existingTab = openFilesRef.current.find((file) => file.path === path);
      if (existingTab) {
        logInstantFeel("activate-existing-tab", { path, tabId: existingTab.id });
        setActiveView("explorer");
        flushSync(() => {
          setSelectedFile(existingTab);
        });
        return;
      }

      const nextTab = createTab(path, name);
      logInstantFeel("open-tab-requested", { path, tabId: nextTab.id, name });
      setActiveView("explorer");
      flushSync(() => {
        setOpenFiles((prev) => [...prev, nextTab]);
        setSelectedFile(nextTab);
      });
    };
    const handleFileRenamed = (e: Event) => {
      const { path, nextPath, name } = (e as CustomEvent<{
        path: string;
        nextPath: string;
        name: string;
      }>).detail;

      startTransition(() => {
        setOpenFiles((prev) =>
          prev.map((file) =>
            file.path === path ? { ...file, path: nextPath, name } : file
          )
        );
        setSelectedFile((prev) =>
          prev?.path === path ? { ...prev, path: nextPath, name } : prev
        );
      });
    };
    const handleEntryMoved = (e: Event) => {
      const { path, nextPath, isDir } = (e as CustomEvent<{
        path: string;
        nextPath: string;
        isDir: boolean;
      }>).detail;

      const normalizePath = (value: string) =>
        value.replace(/\\/g, "/").replace(/\/+$/, "");

      const source = normalizePath(path);
      const destination = normalizePath(nextPath);

      const remapPath = (candidate: string) => {
        const normalizedCandidate = normalizePath(candidate);
        if (normalizedCandidate === source) {
          return destination;
        }
        if (isDir && normalizedCandidate.startsWith(`${source}/`)) {
          return `${destination}${normalizedCandidate.slice(source.length)}`;
        }
        return candidate;
      };

      startTransition(() => {
        setOpenFiles((prev) =>
          prev.map((file) => ({
            ...file,
            path: remapPath(file.path),
          }))
        );
        setSelectedFile((prev) =>
          prev
            ? {
                ...prev,
                path: remapPath(prev.path),
              }
            : prev
        );
      });
    };
    const resolveParentDir = async (workspace: string): Promise<string> => {
      const activePath = activePathRef.current;
      if (!activePath) return workspace;
      if (!activePath.startsWith(`${workspace}/`) && activePath !== workspace) {
        return workspace;
      }
      try {
        const info = await stat(activePath);
        if (info.isDirectory) return activePath;
        return activePath.split("/").slice(0, -1).join("/");
      } catch {
        return workspace;
      }
    };

    const resolveAvailableName = async (
      parentDir: string,
      base: string,
      extension: string
    ): Promise<string> => {
      if (!(await exists(`${parentDir}/${base}${extension}`))) {
        return `${base}${extension}`;
      }
      if (!(await exists(`${parentDir}/${base} copy${extension}`))) {
        return `${base} copy${extension}`;
      }
      let counter = 1;
      while (await exists(`${parentDir}/${base} copy ${counter}${extension}`)) {
        counter++;
      }
      return `${base} copy ${counter}${extension}`;
    };

    const handleNewFolder = async () => {
      const workspace = getCurrentWorkspace();
      if (!workspace) return;
      const parentDir = await resolveParentDir(workspace);
      const finalName = await resolveAvailableName(parentDir, "Untitled", "");
      const finalPath = `${parentDir}/${finalName}`;
      try {
        await mkdir(finalPath, { recursive: true });
        window.dispatchEvent(new CustomEvent("directory-refresh", { detail: { path: parentDir } }));
      } catch (err) {
        console.error("Failed to create folder:", err);
        alert(`Failed to create folder: ${err}`);
      }
    };

    const handleNewNote = async () => {
      const workspace = getCurrentWorkspace();
      if (!workspace) return;
      const parentDir = await resolveParentDir(workspace);
      const finalName = await resolveAvailableName(parentDir, "Untitled", ".md");
      const finalPath = `${parentDir}/${finalName}`;
      try {
        await writeTextFile(finalPath, `# Untitled\n\n`);
        window.dispatchEvent(new CustomEvent("directory-refresh", { detail: { path: parentDir } }));
        window.dispatchEvent(new CustomEvent("file-selected", { detail: { path: finalPath, name: finalName } }));
      } catch (err) {
        console.error("Failed to create note:", err);
        alert(`Failed to create note: ${err}`);
      }
    };
    const handleNewExcalidraw = async () => {
      const workspace = getCurrentWorkspace();
      if (!workspace) return;
      const parentDir = await resolveParentDir(workspace);
      const finalName = await resolveAvailableName(parentDir, "Untitled", ".excalidraw");
      const finalPath = `${parentDir}/${finalName}`;
      try {
        await writeTextFile(finalPath, EMPTY_EXCALIDRAW_DOCUMENT);
        window.dispatchEvent(new CustomEvent("directory-refresh", { detail: { path: parentDir } }));
        window.dispatchEvent(
          new CustomEvent("file-selected", {
            detail: { path: finalPath, name: finalName },
          })
        );
      } catch (err) {
        console.error("Failed to create Excalidraw file:", err);
        alert(`Failed to create Excalidraw file: ${err}`);
      }
    };
    const handleNewCodeDrawing = async () => {
      const workspace = getCurrentWorkspace();
      if (!workspace) return;
      const parentDir = await resolveParentDir(workspace);
      const finalName = await resolveAvailableName(parentDir, "Untitled", ".codedrawing");
      const finalPath = `${parentDir}/${finalName}`;
      try {
        await writeTextFile(finalPath, EMPTY_CODE_DRAWING_DOCUMENT);
        window.dispatchEvent(new CustomEvent("directory-refresh", { detail: { path: parentDir } }));
        window.dispatchEvent(
          new CustomEvent("file-selected", {
            detail: { path: finalPath, name: finalName },
          })
        );
      } catch (err) {
        console.error("Failed to create Code Drawing file:", err);
        alert(`Failed to create Code Drawing file: ${err}`);
      }
    };
    const handleActivePathChanged = (e: Event) => {
      const { path } = (e as CustomEvent<{ path: string | null }>).detail;
      activePathRef.current = path;
    };
    window.addEventListener("file-selected", handleFileSelected);
    window.addEventListener("file-renamed", handleFileRenamed);
    window.addEventListener("entry-moved", handleEntryMoved);
    window.addEventListener("workspace-new-folder", handleNewFolder);
    window.addEventListener("workspace-new-note", handleNewNote);
    window.addEventListener("workspace-new-excalidraw", handleNewExcalidraw);
    window.addEventListener("workspace-new-codedrawing", handleNewCodeDrawing);
    window.addEventListener("active-path-changed", handleActivePathChanged);
    return () => {
      window.removeEventListener("file-selected", handleFileSelected);
      window.removeEventListener("file-renamed", handleFileRenamed);
      window.removeEventListener("entry-moved", handleEntryMoved);
      window.removeEventListener("workspace-new-folder", handleNewFolder);
      window.removeEventListener("workspace-new-note", handleNewNote);
      window.removeEventListener("workspace-new-excalidraw", handleNewExcalidraw);
      window.removeEventListener("workspace-new-codedrawing", handleNewCodeDrawing);
      window.removeEventListener("active-path-changed", handleActivePathChanged);
    };
  }, [createTab]);

  useEffect(() => {
    const handleOpenSettingsPanel = (event: Event) => {
      const detail = (event as CustomEvent<{ panel?: SettingsPanelId }>).detail;
      setActiveView("settings");
      setSettingsPanel(detail?.panel ?? DEFAULT_SETTINGS_PANEL);
      setLeftSidebarOpen(true);
    };

    window.addEventListener(OPEN_SETTINGS_PANEL_EVENT, handleOpenSettingsPanel);
    return () => window.removeEventListener(OPEN_SETTINGS_PANEL_EVENT, handleOpenSettingsPanel);
  }, []);

  useEffect(() => {
    const handleOpenInAppBrowser = (event: Event) => {
      const detail = (event as CustomEvent<{ url?: string }>).detail;
      const url = detail?.url?.trim();
      if (!url) return;

      const existingTab = openFilesRef.current.find((file) => file.path === url);
      if (existingTab) {
        setSelectedFile(existingTab);
        return;
      }

      const displayName = getDisplayNameForUrl(url);
      const faviconUrl = getFaviconUrl(url);

      const nextTab: OpenFileTab = {
        ...createTab(url, displayName),
        faviconUrl,
      };
      setOpenFiles((prev) => [...prev, nextTab]);
      setSelectedFile(nextTab);
      setActiveView("explorer");
    };

    const handleBrowserTabUpdate = (event: Event) => {
      const detail = (event as CustomEvent<BrowserTabUpdate>).detail;
      if (!detail?.path) return;

      setOpenFiles((prev) =>
        prev.map((file) => {
          if (file.path !== detail.path) return file;
          return {
            ...file,
            ...(typeof detail.name === "string" && detail.name.length > 0
              ? { name: detail.name }
              : null),
            ...(detail.faviconUrl !== undefined
              ? { faviconUrl: detail.faviconUrl }
              : null),
          };
        }),
      );
      setSelectedFile((prev) => {
        if (!prev || prev.path !== detail.path) return prev;
        return {
          ...prev,
          ...(typeof detail.name === "string" && detail.name.length > 0
            ? { name: detail.name }
            : null),
        };
      });
    };

    window.addEventListener(OPEN_IN_APP_BROWSER_EVENT, handleOpenInAppBrowser);
    window.addEventListener(UPDATE_BROWSER_TAB_EVENT, handleBrowserTabUpdate);
    return () => {
      window.removeEventListener(OPEN_IN_APP_BROWSER_EVENT, handleOpenInAppBrowser);
      window.removeEventListener(UPDATE_BROWSER_TAB_EVENT, handleBrowserTabUpdate);
    };
  }, [createTab]);

  useEffect(() => {
    localStorage.removeItem(ACTIVE_FILE_PATH_STORAGE_KEY);

    if (!workspaceStateReadyRef.current || !currentWorkspace) {
      return;
    }

    const activeFileStorageKey = getWorkspaceScopedStorageKey(
      ACTIVE_FILE_PATH_STORAGE_KEY,
      currentWorkspace
    );

    if (!selectedFile) {
      localStorage.removeItem(activeFileStorageKey);
      window.dispatchEvent(new CustomEvent("active-file-changed", { detail: { path: null } }));
      return;
    }

    localStorage.setItem(activeFileStorageKey, selectedFile.path);
    window.dispatchEvent(new CustomEvent("active-file-changed", { detail: selectedFile }));
  }, [currentWorkspace, selectedFile]);

  useEffect(() => {
    const win = getCurrentWindow();
    const checkFullscreen = async () => setIsFullscreen(await win.isFullscreen());
    checkFullscreen();
    let unlisten: (() => void) | undefined;
    win.onResized(() => checkFullscreen()).then(fn => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  const activateFile = (file: SelectedFile) => {
    if (selectedFile?.id === file.id) return;
    setSelectedFile(file);
  };

  const closeFile = useCallback((tabId: string) => {
    setOpenFiles((prev) => {
      const nextFiles = prev.filter((file) => file.id !== tabId);

      if (selectedFileRef.current?.id === tabId) {
        const closedIndex = prev.findIndex((file) => file.id === tabId);
        const fallbackFile =
          nextFiles[closedIndex] ?? nextFiles[closedIndex - 1] ?? null;

        startTransition(() => {
          setSelectedFile(fallbackFile);
        });
      }

      return nextFiles;
    });
  }, []);

  const closeActiveTabOrWindow = useCallback(async () => {
    const activeTabId = selectedFileRef.current?.id ?? openFilesRef.current.at(-1)?.id;

    if (activeTabId) {
      closeFile(activeTabId);
      return;
    }

    try {
      await getCurrentWindow().close();
    } catch (error) {
      console.error("[App] Failed to close window:", error);
    }
  }, [closeFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-shortcut-capture='true']")) {
        return;
      }

      if (event.repeat) {
        return;
      }

      if (matchShortcutEvent(event, shortcuts.toggleRightSidebar)) {
        event.preventDefault();
        setRightSidebarOpen((value) => !value);
        return;
      }

      if (matchShortcutEvent(event, shortcuts.toggleLeftSidebar)) {
        event.preventDefault();
        setLeftSidebarOpen((value) => !value);
        return;
      }

      if (matchShortcutEvent(event, shortcuts.toggleZenMode)) {
        if (activeViewRef.current !== "explorer" || !selectedFileRef.current) {
          return;
        }

        event.preventDefault();
        setZenMode((value) => !value);
        return;
      }

      if (matchShortcutEvent(event, shortcuts.closeCurrentTab)) {
        event.preventDefault();
        void closeActiveTabOrWindow();
        return;
      }

      if (matchShortcutEvent(event, shortcuts.newNote)) {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent("workspace-new-note"));
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeActiveTabOrWindow, shortcuts]);

  const handleShortcutChange = useCallback((action: ShortcutAction, binding: string) => {
    setShortcuts((prev) => ({
      ...prev,
      [action]: binding,
    }));
  }, []);

  const handleResetShortcuts = useCallback(() => {
    setShortcuts(defaultShortcutConfig);
  }, []);

  const handleSourceControlDiff = useCallback((path: string, staged: boolean) => {
    setDiffState((prev) => ({
      ...prev,
      selectedPath: path,
      diffLoading: true,
      diffContent: null,
      diffStaged: staged,
    }));
  }, []);

  const handleSourceControlDiffLoaded = useCallback((path: string, diff: string) => {
    setDiffState((prev) => ({
      ...prev,
      selectedPath: path,
      diffLoading: false,
      diffContent: diff,
    }));
  }, []);

  const handleCloseDiff = useCallback(() => {
    setDiffState({
      selectedPath: null,
      diffContent: null,
      diffLoading: false,
      diffStaged: false,
    });
  }, []);

  const handleRightSidebarViewToggle = useCallback(
    (view: RightSidebarView) => {
      setRightSidebarOpen((currentOpen) => {
        const shouldClose = currentOpen && rightSidebarView === view;
        return !shouldClose;
      });
      setRightSidebarView(view);
    },
    [rightSidebarView]
  );

  if (isCheckingAuth || onboardingDone === null) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!onboardingDone) {
    return (
      <OnboardingWizard
        onComplete={() => {
          setOnboardingDone(true);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <LoginForm />
      </div>
    );
  }

  const zenModeActive = zenMode && activeView === "explorer" && Boolean(selectedFile);

  return (
    <TooltipProvider>
      <SidebarProvider
        className="h-svh overflow-hidden"
        open={leftSidebarOpen}
        onOpenChange={setLeftSidebarOpen}
      >
        {!zenModeActive && (
          <AppTopbar
            isFullscreen={isFullscreen}
            selectedFileName={selectedFile?.name ?? null}
            wikiLinkIndexingState={wikiLinkIndexingState}
            rightSidebarOpen={rightSidebarOpen}
            rightSidebarView={rightSidebarView}
            onChatSidebarToggle={() => handleRightSidebarViewToggle("chat")}
            onWikiLinksSidebarToggle={() => handleRightSidebarViewToggle("wiki-links")}
            leftSidebarOpen={leftSidebarOpen}
            onLeftSidebarToggle={() => setLeftSidebarOpen((v) => !v)}
            leftSidebarShortcutLabel={getShortcutBindingLabel("toggleLeftSidebar", shortcuts)}
            rightSidebarShortcutLabel={getShortcutBindingLabel("toggleRightSidebar", shortcuts)}
          />
        )}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {!zenModeActive && (
            <AppSidebar
              activeView={activeView}
              onViewChange={setActiveView}
              settingsPanel={settingsPanel}
              onSettingsPanelChange={setSettingsPanel}
              onSourceControlDiff={handleSourceControlDiff}
              onSourceControlDiffLoaded={handleSourceControlDiffLoaded}
              diffState={diffState}
              onCloseDiff={handleCloseDiff}
              sidebarOpen={leftSidebarOpen}
              onSidebarOpenChange={setLeftSidebarOpen}
            />
          )}
          <SidebarInset className="min-h-0 overflow-hidden">
            {!zenModeActive && <div className="titlebar-spacer" />}
            {activeView === "source-control" && diffState.selectedPath ? (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <DiffViewer
                  path={diffState.selectedPath}
                  diff={diffState.diffContent}
                  loading={diffState.diffLoading}
                  onClose={handleCloseDiff}
                />
              </div>
            ) : (
              <MainArea
                activeView={activeView}
                onViewChange={setActiveView}
                settingsPanel={settingsPanel}
                shortcuts={shortcuts}
                onShortcutChange={handleShortcutChange}
                onResetShortcuts={handleResetShortcuts}
                zenMode={zenModeActive}
                openFiles={openFiles}
                selectedFile={selectedFile}
                onActivateFile={activateFile}
                onCloseFile={closeFile}
                wikiLinkIndexingState={wikiLinkIndexingState}
              />
            )}
          </SidebarInset>
          {!zenModeActive && (
            <AppSidebarRight open={rightSidebarOpen} view={rightSidebarView} />
          )}
        </div>
      </SidebarProvider>
      <UpdateNotificationDialog />
    </TooltipProvider>
  );
}

export default App;
