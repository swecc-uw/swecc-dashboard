export const LOCAL_API_ENDPOINT = 'http://localhost:8000'
export const PROD_API_ENDPOINT = 'https://api.swecc.org'

export const IS_DEV =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1')

export const API_BASE_URL = IS_DEV ? LOCAL_API_ENDPOINT : PROD_API_ENDPOINT

export const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
export const DEFAULT_REFRESH_INTERVAL = 30
export const REFRESH_INTERVALS = [
  { value: 0, label: 'Off' },
  { value: 30, label: '30 seconds' },
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' }
]

// disabling for now because we only have usage data for chronos.
// once enabled should display graphs and stuff...
export const POLL_USAGE = false
