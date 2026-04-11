import { getSetupState, setSetupState } from '../config/notelab-app-config'
import type { NotelabSetupState } from '../config/notelab-config-schema'

export type { NotelabSetupState, NotelabSyncMode } from '../config/notelab-config-schema'

export function loadSetupState(): NotelabSetupState {
  return getSetupState()
}

export function saveSetupState(state: NotelabSetupState): void {
  setSetupState(state)
}
