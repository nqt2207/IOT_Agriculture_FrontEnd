
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  RefreshCw,
} from 'lucide-react';

import api from '../services/api';
import { useNavigate } from 'react-router-dom';

// =====================================================
// TYPES
// =====================================================

interface ActuatorHistoryItem {
  id: number;
  farm_id: number;
  farm_name?: string;
  bbb_id?: string;
  esp32_id: string;
  scope?: string;
  zone_id: number | null;
  actuator_id: number;

  // Backend hiện tại có thể trả actuator hoặc actuator_name.
  actuator?: string;
  actuator_name?: string;

  control_mode: string;
  commanded_state: boolean | null;
  actual_state: boolean | null;
  source: 'USER' | 'DEVICE' | string;
  created_at: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface ActuatorHistoryProps {
  farmId?: number | string;
  zoneId?: number | string;
}

// =====================================================
// CONSTANTS
// =====================================================

const PAGE_SIZE = 10;

const defaultPagination: Pagination = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

// =====================================================
// HELPERS
// =====================================================

const getActuatorName = (item: ActuatorHistoryItem) => {
  const name = item.actuator ?? item.actuator_name ?? '';

  const names: Record<string, string> = {
    pump1: 'Pump 1',
    pump2: 'Pump 2',
    fan: 'Fan',
    light: 'Light',
  };

  return (names[name.toLowerCase()] ?? name) || 'Unknown actuator';
};

const formatDateTime = (value: string) => {
  if (!value) return '--';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '--';

  return date.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const formatState = (value: boolean | null) => {
  if (value === null || value === undefined) {
    return 'Unknown';
  }

  return value ? 'ON' : 'OFF';
};

// =====================================================
// COMPONENT
// =====================================================

function ActuatorHistory({
  farmId,
  zoneId,
}: ActuatorHistoryProps) {
  const navigate = useNavigate();

  const [items, setItems] = useState<ActuatorHistoryItem[]>([]);

  const [pagination, setPagination] =
    useState<Pagination>(defaultPagination);

  const [page, setPage] = useState(1);

  const [actuatorFilter, setActuatorFilter] = useState('');

  const [sourceFilter, setSourceFilter] = useState('');

  const [fromDate, setFromDate] = useState('');

  const [toDate, setToDate] = useState('');

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');

  // =====================================================
  // FETCH HISTORY
  // =====================================================

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const token = localStorage.getItem('accessToken');

      if (!token) {
        navigate('/login');
        return;
      }

      const params: Record<string, string | number> = {
        page,
        limit: PAGE_SIZE,
      };

      if (farmId !== undefined) {
        params.farm_id = Number(farmId);
      }

      if (zoneId !== undefined) {
        params.zone_id = Number(zoneId);
      }

      if (actuatorFilter) {
        params.actuator = actuatorFilter;
      }

      if (sourceFilter) {
        params.source = sourceFilter;
      }

      if (fromDate) {
        params.from = fromDate;
      }

      if (toDate) {
        params.to = toDate;
      }

      const response = await api.get(
        '/bbb/actuators/history',
        {
          params,
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      const result =
        response.data?.data ?? response.data;

      const historyItems: ActuatorHistoryItem[] =
        Array.isArray(result?.items)
          ? result.items
          : [];

      setItems(historyItems);

      setPagination({
        page: Number(result?.pagination?.page ?? page),
        limit: Number(
          result?.pagination?.limit ?? PAGE_SIZE,
        ),
        total: Number(result?.pagination?.total ?? 0),
        totalPages: Number(
          result?.pagination?.totalPages ?? 0,
        ),
      });
    } catch (err: any) {
      console.error(
        'Fetch actuator history error:',
        err,
      );

      if (err?.response?.status === 401) {
        localStorage.removeItem('accessToken');
        navigate('/login');
        return;
      }

      setError(
        err?.response?.data?.message ??
          'Unable to load actuator history.',
      );

      setItems([]);
      setPagination(defaultPagination);
    } finally {
      setLoading(false);
    }
  }, [
    farmId,
    zoneId,
    page,
    actuatorFilter,
    sourceFilter,
    fromDate,
    toDate,
    navigate,
  ]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // =====================================================
  // FILTER HANDLERS
  // =====================================================

  const handleActuatorChange = (
    value: string,
  ) => {
    setActuatorFilter(value);
    setPage(1);
  };

  const handleSourceChange = (
    value: string,
  ) => {
    setSourceFilter(value);
    setPage(1);
  };

  const handleFromDateChange = (
    value: string,
  ) => {
    setFromDate(value);
    setPage(1);
  };

  const handleToDateChange = (
    value: string,
  ) => {
    setToDate(value);
    setPage(1);
  };

  const handleResetFilters = () => {
    setActuatorFilter('');
    setSourceFilter('');
    setFromDate('');
    setToDate('');
    setPage(1);
  };

  // =====================================================
  // PAGINATION
  // =====================================================

  const handlePreviousPage = () => {
    setPage((current) => Math.max(1, current - 1));
  };

  const handleNextPage = () => {
    setPage((current) =>
      Math.min(pagination.totalPages, current + 1),
    );
  };

  // =====================================================
  // RENDER
  // =====================================================

  return (
    <section className="actuator-history-section">

      {/* HEADER */}

      <div className="actuator-history-header">
        <div className="actuator-history-title">
          <div className="actuator-history-icon">
            <History size={22} />
          </div>

          <div>
            <h2>Actuator History</h2>

            <p>
              Historical actuator commands and device feedback.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="actuator-history-refresh"
          onClick={fetchHistory}
          disabled={loading}
        >
          <RefreshCw
            size={15}
            className={loading ? 'history-spinning' : ''}
          />

          Refresh
        </button>
      </div>

      {/* FILTERS */}

      <div className="actuator-history-filters">

        <div className="history-filter-heading">
          <Filter size={17} />
          <span>Filters</span>
        </div>

        <div className="history-filter-grid">

          <div className="history-filter-group">
            <label htmlFor="history-actuator">
              Actuator
            </label>

            <select
              id="history-actuator"
              value={actuatorFilter}
              onChange={(event) =>
                handleActuatorChange(event.target.value)
              }
            >
              <option value="">All actuators</option>
              <option value="pump1">Pump 1</option>
              <option value="pump2">Pump 2</option>
              <option value="fan">Fan</option>
              <option value="light">Light</option>
            </select>
          </div>

          <div className="history-filter-group">
            <label htmlFor="history-source">
              Source
            </label>

            <select
              id="history-source"
              value={sourceFilter}
              onChange={(event) =>
                handleSourceChange(event.target.value)
              }
            >
              <option value="">All sources</option>
              <option value="USER">User</option>
              <option value="DEVICE">Device</option>
            </select>
          </div>

          <div className="history-filter-group">
            <label htmlFor="history-from">
              From date
            </label>

            <input
              id="history-from"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) =>
                handleFromDateChange(event.target.value)
              }
            />
          </div>

          <div className="history-filter-group">
            <label htmlFor="history-to">
              To date
            </label>

            <input
              id="history-to"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) =>
                handleToDateChange(event.target.value)
              }
            />
          </div>

        </div>

        <button
          type="button"
          className="history-reset-button"
          onClick={handleResetFilters}
          disabled={
            !actuatorFilter &&
            !sourceFilter &&
            !fromDate &&
            !toDate
          }
        >
          Reset filters
        </button>
      </div>

      {/* SUMMARY */}

      <div className="actuator-history-summary">
        <div>
          <Activity size={17} />

          <span>
            Total records:{' '}
            <strong>{pagination.total}</strong>
          </span>
        </div>
      </div>

      {/* ERROR */}

      {error && (
        <div className="dashboard-error" role="alert">
          {error}
        </div>
      )}

      {/* TABLE */}

      <div className="actuator-history-table-wrapper">

        <table className="actuator-history-table">

          <thead>
            <tr>
              <th>Time</th>
              <th>Actuator</th>
              <th>Device</th>
              <th>Commanded</th>
              <th>Actual</th>
              <th>Mode</th>
              <th>Source</th>
            </tr>
          </thead>

          <tbody>

            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  className="history-table-message"
                >
                  <RefreshCw
                    size={18}
                    className="history-spinning"
                  />

                  Loading history...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="history-table-message"
                >
                  <History size={22} />

                  <span>
                    No actuator history found.
                  </span>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>

                  <td className="history-time-cell">
                    <CalendarDays size={15} />

                    <span>
                      {formatDateTime(item.created_at)}
                    </span>
                  </td>

                  <td>
                    <strong>
                      {getActuatorName(item)}
                    </strong>
                  </td>

                  <td>
                    <span className="history-device-id">
                      {item.esp32_id}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`history-state ${
                        item.commanded_state === true
                          ? 'is-on'
                          : item.commanded_state === false
                            ? 'is-off'
                            : 'is-unknown'
                      }`}
                    >
                      {formatState(item.commanded_state)}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`history-state ${
                        item.actual_state === true
                          ? 'is-on'
                          : item.actual_state === false
                            ? 'is-off'
                            : 'is-unknown'
                      }`}
                    >
                      {formatState(item.actual_state)}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`history-mode ${
                        item.control_mode?.toUpperCase() === 'MANUAL'
                          ? 'manual'
                          : 'auto'
                      }`}
                    >
                      {item.control_mode?.toUpperCase() ?? '--'}
                    </span>
                  </td>

                  <td>
                    <span
                      className={`history-source ${
                        item.source?.toUpperCase() === 'USER'
                          ? 'user'
                          : 'device'
                      }`}
                    >
                      {item.source?.toUpperCase() ?? '--'}
                    </span>
                  </td>

                </tr>
              ))
            )}

          </tbody>
        </table>
      </div>

      {/* PAGINATION */}

      <div className="actuator-history-pagination">

        <span className="history-pagination-info">
          {pagination.total === 0
            ? 'No records'
            : `Page ${pagination.page} of ${pagination.totalPages}`}
        </span>

        <div className="history-pagination-actions">

          <button
            type="button"
            onClick={handlePreviousPage}
            disabled={
              loading ||
              pagination.page <= 1
            }
          >
            <ChevronLeft size={17} />
            Previous
          </button>

          <button
            type="button"
            onClick={handleNextPage}
            disabled={
              loading ||
              pagination.page >= pagination.totalPages
            }
          >
            Next
            <ChevronRight size={17} />
          </button>

        </div>
      </div>

    </section>
  );
}

export default ActuatorHistory;
