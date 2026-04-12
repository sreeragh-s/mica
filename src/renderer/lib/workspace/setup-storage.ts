import { getSetupState } from '../config/notelab-app-config-read'
import { setSetupState } from '../config/notelab-app-config-write'
import type { NotelabSetupState } from '../config/notelab-config-schema'

export type { NotelabSetupState, NotelabSyncMode } from '../config/notelab-config-schema'

export function loadSetupState(): NotelabSetupState {
  return getSetupState()
}

export function saveSetupState(state: NotelabSetupState): void {
  setSetupState(state)
}
