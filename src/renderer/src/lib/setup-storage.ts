import {
  getSetupState,
  setSetupState,
} from "./gitnotes-app-config"
import type { GitNotesSetupState } from "./gitnotes-config-schema"

export type { GitNotesSetupState, GitNotesSyncMode } from "./gitnotes-config-schema"

export function loadSetupState(): GitNotesSetupState {
  return getSetupState()
}

export function saveSetupState(state: GitNotesSetupState): void {
  setSetupState(state)
}
