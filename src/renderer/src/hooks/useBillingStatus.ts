import { useCallback, useEffect, useRef, useState } from 'react'
import { serverFetchJson } from '@/lib/core/server-api'

export type BillingStatus = {
  status: 'active' | 'on_hold' | 'cancelled' | 'expired' | 'none'
  creditBalance: number
  overageEnabled: boolean
  currentPeriodEnd: string | null
}

const REFRESH_INTERVAL_MS = 60_000 // refresh every 60s

export type UseBillingStatusResult = {
  billing: BillingStatus | null
  isLoading: boolean
  /** True if the user can send chat messages right now. */
  canChat: boolean
  /** True if credits are low (< 500k tokens). */
  creditsLow: boolean
  refresh: () => void
}

export function useBillingStatus(): UseBillingStatusResult {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async () => {
    const res = await serverFetchJson<BillingStatus>('/api/billing/status')
    if (res.ok) {
      setBilling(res.data)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    void fetchStatus()
    intervalRef.current = setInterval(() => void fetchStatus(), REFRESH_INTERVAL_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchStatus])

  const canChat =
    billing !== null &&
    billing.status === 'active' &&
    (billing.creditBalance > 0 || billing.overageEnabled)

  const creditsLow = billing !== null && billing.creditBalance < 10000

  return {
    billing,
    isLoading,
    canChat,
    creditsLow,
    refresh: () => void fetchStatus(),
  }
}
