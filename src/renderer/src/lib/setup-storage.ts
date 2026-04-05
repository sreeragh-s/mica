import {
  getSetupState,
  setSetupState,
} from "./notelab-app-config"
import type { NotelabSetupState } from "./notelab-config-schema"

export type { NotelabSetupState, NotelabSyncMode } from "./notelab-config-schema"

export function loadSetupState(): NotelabSetupState {
  return getSetupState()
}

export function saveSetupState(state: NotelabSetupState): void {
  setSetupState(state)
}
