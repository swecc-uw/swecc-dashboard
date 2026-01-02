import React, { useState, useRef, useEffect } from 'react'
import { LogEntry } from '../../hooks/useContainerLogs'

interface LogsPanelProps {
  logs: LogEntry[]
  filteredLogs: LogEntry[]
  isStreaming: boolean
  error: string | null
  showTimestamps: boolean
  autoScroll: boolean
  filterText: string
  onClearLogs: () => void
  escapeHtml: (text: string) => string
  highlightLogContent: (message: string) => string
  highlightSearchTerms: (message: string, filterText: string) => string
  showSummary: boolean
  summary: {
    active: string
    status: string
    containers: number
    lines: number
    shown: number
    errors: number
    last: string
  }
}

const LogsPanel: React.FC<LogsPanelProps> = ({
  logs,
  filteredLogs,
  isStreaming,
  error,
  showTimestamps,
  autoScroll,
  filterText,
  onClearLogs,
  escapeHtml,
  highlightLogContent,
  highlightSearchTerms,
  showSummary,
  summary
}) => {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set())

  const logsContainerRef = useRef<HTMLDivElement>(null)

  const toggleExpandLog = (index: number) => {
    const newExpandedLogs = new Set(expandedLogs)
    if (expandedLogs.has(index)) {
      newExpandedLogs.delete(index)
    } else {
      newExpandedLogs.add(index)
    }
    setExpandedLogs(newExpandedLogs)
  }

  const isLogExpandable = (message: string | undefined): boolean => {
    if (!message) return false
    return message.length > 150 || message.includes('\n')
  }

  useEffect(() => {
    if (autoScroll && logsContainerRef.current) {
      logsContainerRef.current.scrollTop =
        logsContainerRef.current.scrollHeight
    }
  }, [autoScroll, logs])

  const formatLogEntry = (entry: LogEntry, index: number) => {
    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString()

    const isExpanded = expandedLogs.has(index)
    const canExpand = isLogExpandable(entry.message)

    const message = entry.message || ''
    const escapedMessage = escapeHtml(message)
    const highlightedMessage = highlightLogContent(escapedMessage)
    const searchHighlightedMessage = filterText
      ? highlightSearchTerms(highlightedMessage, filterText)
      : highlightedMessage

    const logClasses = [
      'log-line',
      entry.type,
      canExpand
        ? isExpanded
          ? 'log-line-expanded'
          : 'log-line-collapsed'
        : '',
      index === logs.length - 1 ? 'log-line-new' : ''
    ]
      .filter(Boolean)
      .join(' ')

    const handleClick = canExpand ? () => toggleExpandLog(index) : undefined

    switch (entry.type) {
      case 'system':
        return (
          <div
            key={index}
            className={`log-line log-system ${
              canExpand ? 'log-line-expandable' : ''
            }`}
            onClick={handleClick}
          >
            <span className='log-time'>[{timestamp}]</span>
            <span className='log-system'>SYSTEM:</span> {message}
          </div>
        )
      case 'error':
        return (
          <div
            key={index}
            className={`log-line log-error ${
              canExpand ? 'log-line-expandable' : ''
            }`}
            onClick={handleClick}
          >
            <span className='log-time'>[{timestamp}]</span>
            <span className='log-error'>ERROR:</span> {message}
          </div>
        )
      case 'logs_started':
        return (
          <div key={index} className='log-line log-success'>
            <span className='log-time'>[{timestamp}]</span>
            <span className='log-success'>STARTED:</span> {message}
          </div>
        )
      case 'logs_stopped':
        return (
          <div key={index} className='log-line log-info'>
            <span className='log-time'>[{timestamp}]</span>
            <span className='log-info'>STOPPED:</span> {message}
          </div>
        )
      case 'log_line': {
        let logTimestamp = timestamp
        const timestampMatch = entry.message?.match(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
        )
        if (timestampMatch) {
          try {
            logTimestamp = new Date(timestampMatch[0]).toLocaleTimeString()
          } catch {
            console.warn('Failed to parse log line timestamp')
          }
        }

        return (
          <div
            key={index}
            className={`log-line ${canExpand ? 'log-line-expandable' : ''} ${
              isExpanded ? 'log-line-expanded' : 'log-line-collapsed'
            }`}
            onClick={handleClick}
          >
            <span className='log-time'>[{logTimestamp}]</span>
            <span
              dangerouslySetInnerHTML={{ __html: searchHighlightedMessage }}
            />
          </div>
        )
      }
      case 'log_error': {
        return (
          <div
            key={index}
            className={`log-line log-stderr ${
              canExpand ? 'log-line-expandable' : ''
            } ${isExpanded ? 'log-line-expanded' : 'log-line-collapsed'}`}
            onClick={handleClick}
          >
            <span className='log-time'>[{timestamp}]</span>
            <span className='log-stderr'>STDERR:</span>
            <span
              dangerouslySetInnerHTML={{ __html: searchHighlightedMessage }}
            />
          </div>
        )
      }
      default:
        return (
          <div key={index} className={logClasses} onClick={handleClick}>
            <span className='log-time'>[{timestamp}]</span>
            {message || JSON.stringify(entry)}
          </div>
        )
    }
  }

  return (
    <div
      id='logs-panel'
      className={`logs-panel ${isStreaming ? 'logs-streaming' : ''}`}
    >
      {error && <div className='error-message logs-error'>{error}</div>}

      <div
        id='logs-container'
        className={`logs-viewer ${!showTimestamps ? 'hide-timestamps' : ''}`}
        ref={logsContainerRef}
      >
        <div className='logs-content'>
          {showSummary && (
            <div className='logs-summary'>
              <div className='logs-summary-item'>{`Active: ${summary.active}`}</div>
              <div className='logs-summary-item'>{`Status: ${summary.status}`}</div>
              <div className='logs-summary-item'>{`Containers: ${summary.containers}`}</div>
              <div className='logs-summary-item'>{`Lines: ${summary.lines}`}</div>
              <div className='logs-summary-item'>{`Shown: ${summary.shown}`}</div>
              <div className='logs-summary-item'>{`Errors: ${summary.errors}`}</div>
              <div className='logs-summary-item'>{`Last: ${summary.last}`}</div>
            </div>
          )}
          {filteredLogs.length === 0 ? (
            <div className='logs-empty'>
              <div className='logs-empty-icon'>Logs</div>
              <p>
                {logs.length === 0
                  ? 'No logs available'
                  : 'No logs match the current filters'}
              </p>
              <p className='text-muted'>
                {logs.length === 0
                  ? 'Logs will appear once streaming begins'
                  : 'Adjust the filter or log level to see more entries'}
              </p>
            </div>
          ) : (
            filteredLogs.map((log, index) => formatLogEntry(log, index))
          )}
        </div>
      </div>

      <div className='logs-footer-actions'>
        <button id='clear-logs-btn' onClick={onClearLogs}>
          Clear
        </button>
      </div>

      <div className='logs-actions'>
        <button
          className='logs-action-button'
          onClick={() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop = 0
            }
          }}
        >
          ⇧<div className='logs-action-tooltip'>Scroll to top</div>
        </button>
        <button
          className='logs-action-button'
          onClick={() => {
            if (logsContainerRef.current) {
              logsContainerRef.current.scrollTop =
                logsContainerRef.current.scrollHeight
            }
          }}
        >
          ⇩<div className='logs-action-tooltip'>Scroll to bottom</div>
        </button>
      </div>
    </div>
  )
}

export default LogsPanel
