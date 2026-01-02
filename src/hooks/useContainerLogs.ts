import { useState, useEffect, useCallback, useRef } from 'react'
import api from '../services/api'
import { log } from '../utils/utils'
import { IS_DEV } from '../constants'

export type LogType =
  | 'system'
  | 'error'
  | 'logs_started'
  | 'logs_stopped'
  | 'log_line'
  | 'log_error'

export interface LogEntry {
  type: LogType
  message: string
  timestamp?: string
}

export function useContainerLogs (containerName: string | null) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [autoScroll, setAutoScroll] = useState<boolean>(true)

  const socketRef = useRef<WebSocket | null>(null)
  const reconnectAttemptsRef = useRef<number>(0)
  const maxReconnectAttempts = 5
  const reconnectDelay = 2000
  const reconnectTimerRef = useRef<number | null>(null)
  const intentionalClosureRef = useRef<boolean>(false)
  const bufferMaxSize = 1000

  const fetchJwtToken = useCallback(async (): Promise<boolean> => {
    try {
      interface TokenResponse {
        token?: string
      }

      const response = await api.get<TokenResponse>('/auth/jwt/')

      if (response.status === 200 && response.data.token) {
        setToken(response.data.token)
        log('JWT token fetched successfully')
        return true
      } else {
        log('Invalid token response:', response)
        throw new Error('Invalid token response')
      }
    } catch (error) {
      log('Error fetching JWT token:', error)
      setError('Failed to get authentication token for logs service')
      throw new Error('Failed to get authentication token for logs service')
    }
  }, [])

  useEffect(() => {
    if (!token) {
      fetchJwtToken().catch(e => {
        log('Error initializing logs:', e)
      })
    }
  }, [fetchJwtToken, token])

  const connectWebSocket = useCallback(
    (targetContainer?: string | null) => {
      const resolvedContainer = targetContainer ?? containerName
      if (!token || !resolvedContainer) return

      if (socketRef.current) {
        try {
          socketRef.current.close()
        } catch (e) {
          log('Error closing existing socket:', e)
        }
        socketRef.current = null
      }

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsBaseUrl = IS_DEV
          ? `${protocol}//localhost:8004`
          : `${protocol}//api.swecc.org`

        const wsUrl = `${wsBaseUrl}/ws/logs/${token}`
        log(`Connecting to WebSocket: ${wsUrl}`)

        const socket = new WebSocket(wsUrl)
        socketRef.current = socket

        socket.onopen = () => {
          log('WebSocket connected')
          setIsStreaming(true)
          reconnectAttemptsRef.current = 0

          try {
            socket.send(
              JSON.stringify({
                type: 'start_logs',
                container_name: resolvedContainer
              })
            )
            log(`Sent start_logs request for ${resolvedContainer}`)

            addLogEntry({
              type: 'logs_started',
              message: `Log streaming started for ${resolvedContainer}`
            })
          } catch (error) {
            log('Error sending start_logs message:', error)
            addLogEntry({
              type: 'error',
              message: `Failed to start logs: ${String(error)}`
            })
          }
        }

        socket.onmessage = event => {
          try {
            const data = JSON.parse(event.data) as LogEntry
            log('Received message type:', data.type)
            addLogEntry(data)
          } catch (error) {
            log('Error parsing log message:', error, event.data)
            addLogEntry({
              type: 'error',
              message: `Failed to parse log message: ${String(error)}`
            })
          }
        }

        socket.onclose = event => {
          setIsStreaming(false)
          log(
            `WebSocket closed: ${event.code} - ${
              event.reason || 'No reason provided'
            }`
          )

          if (!intentionalClosureRef.current && event.code !== 1000) {
            attemptReconnect()
          } else {
            log(
              'Not reconnecting due to intentional closure or normal close code'
            )
          }
        }

        socket.onerror = event => {
          log('WebSocket error:', event)
          addLogEntry({
            type: 'error',
            message: 'WebSocket connection error'
          })
        }

        addLogEntry({
          type: 'system',
          message: `Connecting to logs for ${resolvedContainer}...`
        })
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        log('Error creating WebSocket:', error)
        addLogEntry({
          type: 'error',
          message: `Failed to connect to log service: ${errorMessage}`
        })
        setError(`Failed to connect to log service: ${errorMessage}`)
      }
    },
    [token, containerName]
  )

  const attemptReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      addLogEntry({
        type: 'error',
        message: `Failed to reconnect after ${maxReconnectAttempts} attempts`
      })
      return
    }

    reconnectAttemptsRef.current++
    const delay =
      reconnectDelay * Math.pow(1.5, reconnectAttemptsRef.current - 1)

    addLogEntry({
      type: 'system',
      message: `Connection lost. Reconnecting in ${Math.round(
        delay / 1000
      )} seconds... (Attempt ${
        reconnectAttemptsRef.current
      }/${maxReconnectAttempts})`
    })

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
    }

    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null
      if (!isStreaming && containerName && !intentionalClosureRef.current) {
        connectWebSocket()
      }
    }, delay)
  }, [connectWebSocket, isStreaming, containerName])

  const addLogEntry = useCallback((entry: LogEntry) => {
    if (!entry.timestamp && entry.type === 'log_line') {
      const timestampMatch = entry.message?.match(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
      )
      if (timestampMatch) {
        entry.timestamp = timestampMatch[0]
      }
    }

    setLogs(prevLogs => {
      const newLogs = [...prevLogs, entry]
      if (newLogs.length > bufferMaxSize) {
        return newLogs.slice(-bufferMaxSize)
      }
      return newLogs
    })
  }, [])

  const startLogging = useCallback(async (targetContainer?: string | null) => {
    const resolvedContainer = targetContainer ?? containerName
    if (!resolvedContainer) {
      setError('Please select a container first')
      return
    }

    intentionalClosureRef.current = false

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    reconnectAttemptsRef.current = 0

    if (!token) {
      try {
        await fetchJwtToken()
      } catch {
        setError('Failed to authenticate for log streaming. Please try again.')
        return
      }
    }

    connectWebSocket(resolvedContainer)
  }, [containerName, token, fetchJwtToken, connectWebSocket])

  const stopLogging = useCallback(() => {
    intentionalClosureRef.current = true

    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }

    if (socketRef.current) {
      if (isStreaming) {
        try {
          socketRef.current.send(
            JSON.stringify({
              type: 'stop_logs'
            })
          )
          log('Sent stop_logs message')
        } catch (e) {
          log('Error sending stop_logs message:', e)
        }
      }

      try {
        socketRef.current.close(1000, 'User stopped logging')
        log('Socket closure initiated')
      } catch (e) {
        log('Error closing socket:', e)
      }

      socketRef.current = null
      setIsStreaming(false)
      log('Logging stopped by user')

      addLogEntry({
        type: 'system',
        message: 'Log streaming stopped'
      })
    }
  }, [isStreaming, addLogEntry])

  const clearLogs = useCallback(() => {
    setLogs([])
    log('Logs cleared')
  }, [])

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close()
        } catch (e) {
          log('Error closing socket on unmount:', e)
        }
        socketRef.current = null
      }

      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current)
      }
    }
  }, [])

  const escapeHtml = useCallback((text: string): string => {
    if (!text) return ''

    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }, [])

  const highlightLogContent = useCallback((message: string): string => {
    return message
      .replace(
        /\b(error|failed|exception|warning|warn|critical)\b/gi,
        '<span class="log-highlight-error">$1</span>'
      )
      .replace(
        /\b(success|completed|started|listening on|ready)\b/gi,
        '<span class="log-highlight-success">$1</span>'
      )
      .replace(
        /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?\b/g,
        '<span class="log-highlight-ip">$1$2</span>'
      )
      .replace(
        /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}([.,]\d{3})?(Z|[+-]\d{2}:?\d{2})?\b/g,
        '<span class="log-highlight-timestamp">$&</span>'
      )
  }, [])

  const highlightSearchTerms = useCallback(
    (message: string, filterText: string): string => {
      if (!filterText || !message) return message

      const escapedFilter = filterText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const regex = new RegExp(`(${escapedFilter})`, 'gi')
      return message.replace(
        regex,
        '<span class="log-search-highlight">$1</span>'
      )
    },
    []
  )

  return {
    logs,
    isStreaming,
    error,
    autoScroll,
    startLogging,
    stopLogging,
    clearLogs,
    setAutoScroll,
    escapeHtml,
    highlightLogContent,
    highlightSearchTerms
  }
}
