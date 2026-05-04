import { create } from "zustand"

export type SidebarView = "explorer" | "settings" | "source-control"

type SidebarViewStatus = {
  isLoading: boolean
  error: string | null
}

type SidebarViewState = {
  activeView: SidebarView
  views: Record<SidebarView, SidebarViewStatus>
  setActiveView: (view: SidebarView) => void
  setViewLoading: (view: SidebarView, isLoading: boolean) => void
  setViewError: (view: SidebarView, error: string | null) => void
  resetViewStatus: (view: SidebarView) => void
}

const defaultViewStatus = (): SidebarViewStatus => ({
  isLoading: false,
  error: null,
})

export const useSidebarViewStore = create<SidebarViewState>((set) => ({
  activeView: "explorer",
  views: {
    explorer: defaultViewStatus(),
    settings: defaultViewStatus(),
    "source-control": defaultViewStatus(),
  },
  setActiveView: (view) => set({ activeView: view }),
  setViewLoading: (view, isLoading) =>
    set((state) => ({
      views: {
        ...state.views,
        [view]: {
          ...state.views[view],
          isLoading,
        },
      },
    })),
  setViewError: (view, error) =>
    set((state) => ({
      views: {
        ...state.views,
        [view]: {
          ...state.views[view],
          error,
        },
      },
    })),
  resetViewStatus: (view) =>
    set((state) => ({
      views: {
        ...state.views,
        [view]: defaultViewStatus(),
      },
    })),
}))

export const useActiveSidebarView = () =>
  useSidebarViewStore((state) => state.activeView)

export const useSidebarViewStatus = (view: SidebarView) =>
  useSidebarViewStore((state) => state.views[view])
