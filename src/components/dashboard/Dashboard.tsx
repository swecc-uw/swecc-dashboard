import React, { useState, useEffect, useCallback } from 'react';
import metricsService, { ContainerStatus } from '../../services/MetricsService';
import logsService from '../../services/LogsService';
import ContainerOverview from './ContainerOverview';
import ContainerDetails from './ContainerDetails';
import ResourceMetrics from './ResourceMetrics';
import UsagePanel from './UsagePanel';
import PortsPanel from './PortsPanel';
import LabelsPanel from './LabelsPanel';
import LogsPanel from './LogsPanel';
import { REFRESH_INTERVALS, DEFAULT_REFRESH_INTERVAL } from '../../constants';
import { log } from '../../utils/utils';

const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [containers, setContainers] = useState<Record<string, ContainerStatus>>({});
  const [currentContainer, setCurrentContainer] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState<number>(DEFAULT_REFRESH_INTERVAL);
  const [refreshTimer, setRefreshTimer] = useState<NodeJS.Timeout | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const success = await metricsService.fetchContainers();

      if (!success) {
        log('Failed to load container data');
        setError('Failed to load containers. Please try again later.');
        return false;
      }

      const containersList = metricsService.getContainers();
      setContainers(containersList);

      const containerNames = metricsService.getContainerNames();
      if (containerNames.length > 0) {
        await selectContainer(containerNames[0]);
      } else {
        setError('No containers found.');
      }

      try {
        await logsService.initialize();
      } catch (err) {
        log('Error initializing logs service:', err);
      }

      return true;
    } catch (err) {
      log('Error loading dashboard:', err);
      setError('An error occurred while loading the dashboard.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const selectContainer = useCallback(async (containerName: string) => {
    setCurrentContainer(containerName);
    setLoading(true);

    try {
      const detailsPromise = metricsService.fetchContainerDetails(containerName);
      const usagePromise = metricsService.fetchContainerUsage(containerName);

      await detailsPromise;
      await usagePromise;

      if (logsService.getConnectionStatus()) {
        logsService.stopLogging();
      }
    } catch (err) {
      log('Error selecting container:', err);
      setError(`An error occurred while loading details for ${containerName}.`);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      await metricsService.fetchContainers();
      setContainers(metricsService.getContainers());

      if (currentContainer) {
        const detailsPromise = metricsService.fetchContainerDetails(currentContainer);
        const usagePromise = metricsService.fetchContainerUsage(currentContainer);

        await detailsPromise;
        await usagePromise;
      }
    } catch (err) {
      log('Error refreshing data:', err);
      setError('Failed to refresh container data.');
    } finally {
      setLoading(false);
    }
  }, [currentContainer]);

  const setupAutoRefresh = useCallback(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }

    if (refreshInterval > 0) {
      const timer = setInterval(refreshData, refreshInterval * 1000);
      setRefreshTimer(timer);
      log(`Auto-refresh set to ${refreshInterval} seconds`);
    } else {
      log('Auto-refresh disabled');
    }
  }, [refreshInterval, refreshData, refreshTimer]);

  useEffect(() => {
    loadDashboard();

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      if (logsService.getConnectionStatus()) {
        logsService.stopLogging();
      }
    };
  }, [loadDashboard]);

  useEffect(() => {
    setupAutoRefresh();

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
    };
  }, [refreshInterval, setupAutoRefresh]);

  const handleContainerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const containerName = e.target.value;
    selectContainer(containerName);
  };

  const handleRefreshIntervalChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const interval = parseInt(e.target.value, 10);
    setRefreshInterval(interval);
  };

  return (
    <div id="dashboard">
      {loading && (
        <div id="dashboard-loading" className="loading-indicator">
          <div className="loading-spinner"></div>
          <p>Loading data...</p>
        </div>
      )}

      {error && <div className="error-message dashboard-error">{error}</div>}

      <div className="dashboard-header">
        <h2>Container Info</h2>
        <div className="dashboard-controls">
          <select 
            id="container-selector" 
            value={currentContainer || ''}
            onChange={handleContainerChange}
            aria-label="Select a container"
          >
            {Object.keys(containers).length === 0 ? (
              <option value="">Loading containers...</option>
            ) : (
              Object.entries(containers).map(([name, status]) => (
                <option 
                  key={name} 
                  value={name}
                  className={`status-${status}`}
                >
                  {name} ({status})
                </option>
              ))
            )}
          </select>

          <label htmlFor="refresh-interval">Auto Refresh:</label>
          <select 
            id="refresh-interval"
            value={refreshInterval}
            onChange={handleRefreshIntervalChange}
          >
            {REFRESH_INTERVALS.map(interval => (
              <option key={interval.value} value={interval.value}>
                {interval.label}
              </option>
            ))}
          </select>

          <button id="refresh-btn" onClick={() => refreshData()}>
            Refresh Now
          </button>
        </div>
      </div>

      {currentContainer && (
        <>
          <ContainerOverview containerName={currentContainer} />
          
          <ContainerDetails containerName={currentContainer} />
          
          <ResourceMetrics containerName={currentContainer} />

          <div className="dashboard-grid">
            <PortsPanel containerName={currentContainer} />
            <LabelsPanel containerName={currentContainer} />
          </div>

          <UsagePanel containerName={currentContainer} />
          
          <LogsPanel containerName={currentContainer} />
        </>
      )}
    </div>
  );
};

export default Dashboard;