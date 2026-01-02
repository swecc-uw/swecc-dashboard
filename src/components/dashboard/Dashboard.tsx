import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useContainers } from '../../hooks/useContainers'
import { useContainerLogs } from '../../hooks/useContainerLogs'
import { useAuth } from '../../hooks/useAuth'
import ContainerOverview from './ContainerOverview'
import ContainerDetails from './ContainerDetails'
import ResourceMetrics from './ResourceMetrics'
import UsagePanel from './UsagePanel'
import PortsPanel from './PortsPanel'
import LabelsPanel from './LabelsPanel'
import LogsPanel from './LogsPanel'
import { REFRESH_INTERVALS, DEFAULT_REFRESH_INTERVAL } from '../../constants'

const Dashboard: React.FC = () => {
  const [currentContainer, setCurrentContainer] = useState<string | null>(null)
  const [refreshInterval, setRefreshInterval] = useState<number>(
    DEFAULT_REFRESH_INTERVAL
  )
  const [showDetails, setShowDetails] = useState<boolean>(false)
  const [showTimestamps, setShowTimestamps] = useState<boolean>(true)
  const [filterText, setFilterText] = useState<string>('')
  const [logLevel, setLogLevel] = useState<string>('all')
  const [logError, setLogError] = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState<boolean>(false)

  const { logout } = useAuth()

  const {
    containers,
    containerNames,
    loading: containersLoading,
    error: containersError,
    fetchContainers
  } = useContainers()

  const {
    logs,
    isStreaming,
    error: logsError,
    autoScroll,
    startLogging,
    stopLogging,
    clearLogs,
    setAutoScroll,
    escapeHtml,
    highlightLogContent,
    highlightSearchTerms
  } = useContainerLogs(currentContainer)

  useEffect(() => {
    setLogError(logsError)
  }, [logsError])

  useEffect(() => {
    if (containerNames.length > 0 && !currentContainer) {
      setCurrentContainer(containerNames[0])
    }
  }, [containerNames, currentContainer])

  const handleContainerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const containerName = e.target.value
    setCurrentContainer(containerName)
  }

  const handleRefreshIntervalChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const interval = parseInt(e.target.value, 10)
    setRefreshInterval(interval)
  }

  const handleStartLogging = useCallback(async () => {
    try {
      setLogError(null)
      await startLogging()
    } catch (err) {
      setLogError(
        err instanceof Error ? err.message : 'Failed to start log streaming'
      )
    }
  }, [startLogging])

  const handleTimestampsToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowTimestamps(e.target.checked)
  }

  const handleAutoScrollToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAutoScroll(e.target.checked)
  }

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilterText(e.target.value)
  }

  const handleLogLevelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLogLevel(e.target.value)
  }

  const normalizedFilter = filterText.trim().toLowerCase()

  const filteredLogs = useMemo(() => {
    if (!normalizedFilter && logLevel === 'all') return logs

    return logs.filter(entry => {
      if (logLevel !== 'all') {
        if (
          logLevel === 'error' &&
          !['error', 'log_error'].includes(entry.type)
        ) {
          return false
        }
        if (logLevel === 'system' && entry.type !== 'system') {
          return false
        }
        if (logLevel === 'success' && entry.type !== 'logs_started') {
          return false
        }
      }

      if (
        normalizedFilter &&
        (!entry.message ||
          !entry.message.toLowerCase().includes(normalizedFilter))
      ) {
        return false
      }

      return true
    })
  }, [logs, logLevel, normalizedFilter])


  useEffect(() => {
    if (!currentContainer) return
    stopLogging()
    handleStartLogging()
  }, [currentContainer, handleStartLogging, stopLogging])

  const refreshData = useCallback(async () => {
    await fetchContainers()
  }, [fetchContainers])

  const currentStatus = currentContainer
    ? containers[currentContainer]
    : 'unknown'

  return (
    <div id='dashboard' className='dashboard-layout'>
      {containersLoading && (
        <div id='dashboard-loading' className='loading-indicator'>
          <div className='loading-spinner'></div>
          <p>Loading data...</p>
        </div>
      )}

      {containersError && (
        <div className='error-message dashboard-error'>{containersError}</div>
      )}

      <div className='dashboard-header dashboard-toolbar'>
        <div className='toolbar-section'>
          <label htmlFor='container-selector' className='toolbar-label'>
            Container
          </label>
          <input
            id='container-selector'
            type='text'
            list='container-options'
            value={currentContainer || ''}
            onChange={handleContainerChange}
            placeholder='Select container'
            aria-label='Select a container'
            className='toolbar-field'
          />
          <datalist id='container-options'>
            {Object.entries(containers).map(([name, status]) => (
              <option
                key={name}
                value={name}
                label={`${name} (${status})`}
              />
            ))}
          </datalist>
          <button
            id='details-toggle'
            onClick={() => setShowDetails(prev => !prev)}
          >
            {showDetails ? 'Hide Details' : 'Show Details'}
          </button>
          <div
            id='logs-status'
            className={`toolbar-status ${
              isStreaming ? 'status-running' : 'status-stopped'
            }`}
          >
            {isStreaming
              ? `Streaming ${currentContainer || 'container'}`
              : 'Streaming paused'}
          </div>
        </div>

        <div className='toolbar-section'>
          <label htmlFor='refresh-interval' className='toolbar-label'>
            Refresh
          </label>
          <select
            id='refresh-interval'
            value={refreshInterval}
            onChange={handleRefreshIntervalChange}
            className='toolbar-field'
          >
            {REFRESH_INTERVALS.map(interval => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>
          <button id='refresh-btn' onClick={refreshData}>
            Refresh
          </button>
          <button id='logout-btn' onClick={() => logout()}>
            Logout
          </button>
        </div>

        <div className='toolbar-section toolbar-filter'>
          <label htmlFor='log-filter' className='toolbar-label'>
            Filter
          </label>
          <input
            id='log-filter'
            type='text'
            placeholder='Filter logs...'
            value={filterText}
            onChange={handleFilterChange}
            className='logs-filter-input toolbar-field'
          />
          <div className='logs-level-filter'>
            <select
              value={logLevel}
              onChange={handleLogLevelChange}
              aria-label='Filter log level'
            >
              <option value='all'>All Logs</option>
              <option value='error'>Errors Only</option>
              <option value='system'>System Only</option>
              <option value='success'>Success Only</option>
            </select>
          </div>
        </div>

        <div className='toolbar-section'>
          <label className='toolbar-toggle'>
            <input
              type='checkbox'
              aria-label='Toggle timestamps'
              id='timestamps-toggle'
              checked={showTimestamps}
              onChange={handleTimestampsToggle}
            />
            <span className='toolbar-toggle-label'>Timestamps</span>
          </label>
          <label className='toolbar-toggle'>
            <input
              type='checkbox'
              aria-label='Toggle auto-scroll'
              id='auto-scroll-toggle'
              checked={autoScroll}
              onChange={handleAutoScrollToggle}
            />
            <span className='toolbar-toggle-label'>Auto-scroll</span>
          </label>
        </div>

        <div className='toolbar-section'>
          <label className='toolbar-toggle'>
            <input
              type='checkbox'
              aria-label='Toggle summary'
              checked={showSummary}
              onChange={e => setShowSummary(e.target.checked)}
            />
            <span className='toolbar-toggle-label'>Summary</span>
          </label>
        </div>
      </div>

      {currentContainer && (
        <div className='dashboard-main'>
          <LogsPanel
            logs={logs}
            filteredLogs={filteredLogs}
            isStreaming={isStreaming}
            error={logError}
            showTimestamps={showTimestamps}
            autoScroll={autoScroll}
            filterText={filterText}
            onClearLogs={clearLogs}
            escapeHtml={escapeHtml}
            highlightLogContent={highlightLogContent}
            highlightSearchTerms={highlightSearchTerms}
            showSummary={showSummary}
            summary={{
              active: currentContainer || 'None',
              status: currentStatus || 'unknown',
              containers: containerNames.length,
              lines: logs.length,
              shown: filteredLogs.length,
              errors: logs.reduce((count, entry) => {
                if (entry.type === 'error' || entry.type === 'log_error') {
                  return count + 1
                }
                return count
              }, 0),
              last: (() => {
                const lastEntry = logs[logs.length - 1]
                if (!lastEntry) return 'N/A'
                if (lastEntry.timestamp) {
                  return new Date(lastEntry.timestamp).toLocaleTimeString()
                }
                return new Date().toLocaleTimeString()
              })()
            }}
          />

          {showDetails && (
            <div className='dashboard-details'>
              <ContainerOverview containerName={currentContainer} />

              <ContainerDetails containerName={currentContainer} />

              <ResourceMetrics containerName={currentContainer} />

              <div className='dashboard-grid'>
                <PortsPanel containerName={currentContainer} />
                <LabelsPanel containerName={currentContainer} />
              </div>

              <UsagePanel
                containerName={currentContainer}
                refreshInterval={refreshInterval}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default Dashboard
