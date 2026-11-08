
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ActuatorHistory from '../components/ActuatorHistory';
import {
  ArrowLeft,
  Droplets,
  Gauge,
  Power,
  X,
  Sprout,
  Sun,
  Thermometer,
  Waves,
} from 'lucide-react';

import AppHeader from '../components/AppHeader';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api from '../services/api';
import { io } from 'socket.io-client';

// =========================
// INTERFACES
// =========================

interface TelemetryItem {
  sensor: string;
  value: number;
  timestamp: string;
  zoneId: number;
  bbbId: string;
  esp32Id: string;
}

interface TelemetryUpdate {
  bbbId: string;
  zoneId: string | number;
  esp32Id: string;
  timestamp: string;
  sensors: Record<string, number>;
}

interface ActuatorStateUpdate {
  zoneId?: number | string;
  zone_id?: number | string;

  esp32Id?: string;
  esp32_id?: string;

  actuator: string;

  actualState?: boolean | null;
  actual_state?: boolean | null;
  value?: number;

  desiredState?: boolean;
  desired_state?: boolean;

  controlMode?: string;
  control_mode?: string;
  reported_control_mode?: string | null;

  timestamp?: string;
}

interface ApiActuator {
  actuator_id: number;
  farm_id: number;
  farm_name?: string;
  bbb_id: string;
  esp32_id: string;
  scope: string;
  zone_id: number | null;
  actuator: string;
  type: string;
  control_mode: string;
  reported_control_mode: string | null;
  desired_state: boolean;
  actual_state: boolean | null;
  state_updated_at: string | null;
}

type SensorType =
  | 'temperature'
  | 'humidity'
  | 'soil_moisture'
  | 'light'
  | 'water_flow'
  | 'water_volume';

type Period = 1 | 7 | 30;

type ActuatorMode = 'AUTO' | 'MANUAL';

interface Actuator {
  actuatorId: number;
  esp32Id: string;
  id: 'pump1';
  label: string;
  description: string;
  state: boolean | null;
  desiredState: boolean;
  mode: ActuatorMode;
}

interface SensorConfig {
  label: string;
  unit: string;
  icon: React.ReactNode;
}

// =========================
// SENSOR CONFIG
// =========================

const sensorConfig: Record<SensorType, SensorConfig> = {
  temperature: {
    label: 'Temperature',
    unit: '°C',
    icon: <Thermometer size={22} />,
  },

  humidity: {
    label: 'Humidity',
    unit: '%',
    icon: <Droplets size={22} />,
  },

  soil_moisture: {
    label: 'Soil Moisture',
    unit: '%',
    icon: <Sprout size={22} />,
  },

  light: {
    label: 'Light',
    unit: 'lux',
    icon: <Sun size={22} />,
  },

  water_flow: {
    label: 'Water Flow',
    unit: 'L/min',
    icon: <Waves size={22} />,
  },

  water_volume: {
    label: 'Water Volume',
    unit: 'L',
    icon: <Gauge size={22} />,
  },
};

// =========================
// COMPONENT
// =========================

function DashboardPage() {
  const navigate = useNavigate();
  const { zoneId } = useParams();

  // =========================
  // TELEMETRY STATE
  // =========================

  const [telemetry, setTelemetry] = useState<TelemetryItem[]>([]);

  const [selectedSensor, setSelectedSensor] =
    useState<SensorType | null>(null);

  const [period, setPeriod] = useState<Period>(1);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const historyRef = useRef<HTMLElement | null>(null);

  // =========================
  // ACTUATOR STATE
  // =========================

  const [actuator, setActuator] = useState<Actuator | null>(null);

  const [actuatorLoading, setActuatorLoading] = useState(false);

  const [actuatorError, setActuatorError] = useState('');

  const [actuatorMessage, setActuatorMessage] = useState('');

  const [pendingActuator, setPendingActuator] =
    useState<'pump1' | null>(null);

  const [actuatorStateReceived, setActuatorStateReceived] =
    useState(false);

  // =========================
  // AUTO SCROLL TO HISTORY
  // =========================

  useEffect(() => {
    if (!selectedSensor) return;

    const animationFrameId = window.requestAnimationFrame(() => {
      historyRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [selectedSensor]);

  // =========================
  // FETCH ACTUATOR STATE
  // =========================

  useEffect(() => {
    let cancelled = false;

    const fetchActuatorState = async () => {
      if (!zoneId) return;

      try {
        setActuatorError('');

        const token = localStorage.getItem('accessToken');

        if (!token) {
          navigate('/login');
          return;
        }

        const response = await api.get('/bbb/actuators/state', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const result = response.data?.data ?? response.data;

        const allActuators: ApiActuator[] =
          Array.isArray(result?.actuators)
            ? result.actuators
            : [];

        // Find pump assigned to the current zone.
        const pump = allActuators.find(
          (item) =>
            Number(item.zone_id) === Number(zoneId) &&
            item.scope === 'zone' &&
            item.actuator === 'pump1',
        );

        if (cancelled) return;

        if (!pump) {
          setActuator(null);
          setActuatorStateReceived(false);

          console.warn(
            'No pump found for zone:',
            zoneId,
            allActuators,
          );

          return;
        }

        const reportedMode =
          pump.reported_control_mode ?? pump.control_mode;

        setActuator({
          actuatorId: pump.actuator_id,
          esp32Id: pump.esp32_id,
          id: 'pump1',
          label: 'Pump',
          description: 'Irrigation water supply',
          state: pump.actual_state,
          desiredState: pump.desired_state,
          mode:
            reportedMode?.toLowerCase() === 'manual'
              ? 'MANUAL'
              : 'AUTO',
        });

        setActuatorStateReceived(true);

        console.log(
          'Pump state loaded:',
          pump,
        );
      } catch (err: any) {
        console.error(
          'Failed to fetch pump state:',
          err,
        );

        if (err?.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        if (!cancelled) {
          setActuatorError(
            err?.response?.data?.message ||
              'Unable to load pump state.',
          );
        }
      }
    };

    fetchActuatorState();

    return () => {
      cancelled = true;
    };
  }, [zoneId, navigate]);

  // =========================
  // FETCH TELEMETRY
  // =========================

  useEffect(() => {
    let cancelled = false;

    const fetchTelemetry = async () => {
      try {
        setLoading(true);
        setError('');

        const token = localStorage.getItem('accessToken');

        if (!token) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        const response = await api.get(
          `/zones/${zoneId}/telemetry`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        const result = response.data?.data ?? response.data;

        if (!cancelled) {
          setTelemetry(Array.isArray(result) ? result : []);
        }
      } catch (err: any) {
        console.error(
          'Failed to fetch telemetry:',
          err,
        );

        if (err?.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        if (!cancelled) {
          setError('Failed to load telemetry data.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (zoneId) {
      fetchTelemetry();
    }

    return () => {
      cancelled = true;
    };
  }, [zoneId, navigate]);

  // =========================
  // WEBSOCKET
  // TELEMETRY + ACTUATOR STATE
  // =========================

  useEffect(() => {
    if (!zoneId) return;

    const socketUrl =
      import.meta.env.VITE_WS_URL ||
      'http://localhost:3001';

    const socket = io(socketUrl, {
      transports: ['websocket'],
    });

    // -------------------------
    // SOCKET CONNECT
    // -------------------------

    socket.on('connect', () => {
      console.log(
        'WebSocket connected:',
        socket.id,
      );
    });

    socket.on('connect_error', (socketError) => {
      console.error(
        'WebSocket connection error:',
        socketError.message,
      );
    });

    // -------------------------
    // TELEMETRY UPDATE
    // -------------------------

    socket.on(
      'telemetry:update',
      (update: TelemetryUpdate) => {
        if (
          Number(update.zoneId) !== Number(zoneId)
        ) {
          return;
        }

        const newItems: TelemetryItem[] = Object.entries(
          update.sensors,
        ).map(([sensor, value]) => ({
          sensor,
          value,
          timestamp: update.timestamp,
          zoneId: Number(update.zoneId),
          bbbId: update.bbbId,
          esp32Id: update.esp32Id,
        }));

        setTelemetry((previous) => {
          const existingKeys = new Set(
            previous.map(
              (item) =>
                `${item.sensor}|${item.timestamp}|${item.bbbId}|${item.esp32Id}`,
            ),
          );

          const uniqueItems = newItems.filter(
            (item) =>
              !existingKeys.has(
                `${item.sensor}|${item.timestamp}|${item.bbbId}|${item.esp32Id}`,
              ),
          );

          return [...previous, ...uniqueItems];
        });
      },
    );

    // -------------------------
    // ACTUATOR STATE UPDATE
    // -------------------------

    socket.on(
      'actuator:state',
      (update: ActuatorStateUpdate) => {
        console.log(
          '[WEBSOCKET] Actuator state received:',
          update,
        );

        const updatedZoneId =
          update.zoneId ?? update.zone_id;

        const updatedEsp32Id =
          update.esp32Id ?? update.esp32_id;

        // Only handle the current zone.
        if (
          updatedZoneId !== undefined &&
          Number(updatedZoneId) !== Number(zoneId)
        ) {
          return;
        }

        // This page only controls pump1.
        if (update.actuator !== 'pump1') {
          return;
        }

        setActuator((previous) => {
          if (!previous) return previous;

          // Verify ESP32 identity.
          if (
            updatedEsp32Id &&
            previous.esp32Id !== updatedEsp32Id
          ) {
            return previous;
          }

          // Read actual state from Backend payload.
          let actualState: boolean | null | undefined;

          if (typeof update.actualState === 'boolean') {
            actualState = update.actualState;
          } else if (
            typeof update.actual_state === 'boolean' ||
            update.actual_state === null
          ) {
            actualState = update.actual_state;
          } else if (
            update.value === 0 ||
            update.value === 1
          ) {
            actualState = update.value === 1;
          }

          // Read desired state if Backend provides it.
          const desiredState =
            typeof update.desiredState === 'boolean'
              ? update.desiredState
              : typeof update.desired_state === 'boolean'
                ? update.desired_state
                : previous.desiredState;

          // Read reported control mode if available.
          const reportedMode =
            update.controlMode ??
            update.control_mode ??
            update.reported_control_mode;

          // No valid actual state: do not change the UI.
          if (actualState === undefined) {
            return previous;
          }

          const nextActuator: Actuator = {
            ...previous,
            state: actualState,
            desiredState,
            mode: reportedMode
              ? reportedMode.toLowerCase() === 'manual'
                ? 'MANUAL'
                : 'AUTO'
              : previous.mode,
          };

          console.log(
            '[WEBSOCKET] Pump UI updated:',
            nextActuator,
          );

          return nextActuator;
        });

        setActuatorStateReceived(true);
        setActuatorMessage('');
      },
    );

    // -------------------------
    // CLEANUP
    // -------------------------

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('telemetry:update');
      socket.off('actuator:state');
      socket.disconnect();
    };
  }, [zoneId]);

  // =========================
  // GET LATEST SENSOR VALUE
  // =========================

  const getLatestValue = (sensor: string) => {
    const items = telemetry
      .filter((item) => item.sensor === sensor)
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() -
          new Date(a.timestamp).getTime(),
      );

    return items[0] ?? null;
  };

  const latestTemperature = getLatestValue('temperature');

  const latestHumidity = getLatestValue('humidity');

  const latestSoilMoisture = getLatestValue('soil_moisture');

  const latestLight = getLatestValue('light');

  const latestTankStatus = getLatestValue('tank_status');

  const latestWaterFlow = getLatestValue('water_flow');

  const latestWaterVolume = getLatestValue('water_volume');

  // =========================
  // FILTER HISTORY
  // =========================

  const filteredTelemetry = useMemo(() => {
    if (!selectedSensor) return [];

    const startTime =
      Date.now() - period * 24 * 60 * 60 * 1000;

    return telemetry
      .filter(
        (item) =>
          item.sensor === selectedSensor &&
          new Date(item.timestamp).getTime() >= startTime,
      )
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() -
          new Date(b.timestamp).getTime(),
      );
  }, [telemetry, selectedSensor, period]);

  // =========================
  // CHART DATA
  // =========================

  const chartData = useMemo(
    () =>
      filteredTelemetry.map((item) => ({
        time: new Date(item.timestamp).toLocaleString(
          'vi-VN',
          {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          },
        ),
        value: item.value,
      })),
    [filteredTelemetry],
  );

  // =========================
  // SENSOR CLICK
  // =========================

  const handleSensorClick = (sensor: SensorType) => {
    setSelectedSensor((current) =>
      current === sensor ? null : sensor,
    );
  };

  // =========================
  // ACTUATOR CONTROL
  // =========================

  const requestActuatorToggle = () => {
    if (!actuator) return;

    setActuatorError('');
    setActuatorMessage('');
    setPendingActuator('pump1');
  };

  const confirmActuatorToggle = async () => {
    if (
      !pendingActuator ||
      !actuator ||
      actuatorLoading
    ) {
      return;
    }

    const currentState =
      actuator.state ?? actuator.desiredState;

    const nextValue = currentState ? 0 : 1;

    try {
      setActuatorLoading(true);
      setActuatorError('');
      setActuatorMessage('');

      const token = localStorage.getItem('accessToken');

      if (!token) {
        navigate('/login');
        return;
      }

      const response = await api.post(
        '/bbb/actuators/control',
        {
          esp32_id: actuator.esp32Id,
          actuator: 'pump1',
          state: nextValue,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      console.log(
        'Pump command accepted by backend:',
        response.data,
      );

      setActuatorMessage(
        'Command sent successfully. Waiting for device feedback.',
      );

      setPendingActuator(null);
    } catch (err: any) {
      console.error(
        'Failed to control pump:',
        err,
      );

      if (err?.response?.status === 401) {
        localStorage.removeItem('accessToken');
        navigate('/login');
        return;
      }

      setActuatorError(
        err?.response?.data?.message ||
          'Failed to send pump command. Please try again.',
      );
    } finally {
      setActuatorLoading(false);
    }
  };

  // =========================
  // BACK
  // =========================

  const handleBack = () => {
    navigate(-1);
  };

  // =========================
  // TANK STATUS
  // =========================

  const tankStatus =
    latestTankStatus?.value === 1
      ? 'Available'
      : latestTankStatus?.value === 0
        ? 'Empty'
        : '--';

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  // =========================
  // DASHBOARD
  // =========================

  return (
    <div className="dashboard-page">
      <AppHeader />

      <div className="dashboard-container">

        {/* HEADER */}

        <header className="dashboard-header">
          <button
            type="button"
            className="page-back-button"
            onClick={handleBack}
          >
            <ArrowLeft size={17} />
            <span>Back to Zones</span>
          </button>

          <div className="dashboard-title-row">
            <div>
              <div className="dashboard-eyebrow">
                AGRICULTURE MONITORING
              </div>

              <h1>Zone {zoneId}</h1>

              <p>
                Monitor environmental conditions
                and water usage in real time.
              </p>
            </div>
          </div>
        </header>

        {error && (
          <div className="dashboard-error">
            {error}
          </div>
        )}

        {/* SENSOR CARDS */}

        <section className="sensor-section">
          <div className="section-heading">
            <div>
              <h2>Current Conditions</h2>
              <p>
                Click a sensor to view its history.
              </p>
            </div>
          </div>

          <div className="sensor-grid">

            {/* TEMPERATURE */}

            <div
              className={`sensor-card ${
                selectedSensor === 'temperature'
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                handleSensorClick('temperature')
              }
            >
              <div className="sensor-card-top">
                <div className="sensor-icon temperature-icon">
                  <Thermometer size={22} />
                </div>

                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">
                Temperature
              </div>

              <h2>
                {latestTemperature
                  ? latestTemperature.value
                  : '--'}
                <span className="sensor-unit">°C</span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* HUMIDITY */}

            <div
              className={`sensor-card ${
                selectedSensor === 'humidity'
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                handleSensorClick('humidity')
              }
            >
              <div className="sensor-card-top">
                <div className="sensor-icon humidity-icon">
                  <Droplets size={22} />
                </div>

                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">
                Humidity
              </div>

              <h2>
                {latestHumidity
                  ? latestHumidity.value
                  : '--'}
                <span className="sensor-unit">%</span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* SOIL MOISTURE */}

            <div
              className={`sensor-card ${
                selectedSensor === 'soil_moisture'
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                handleSensorClick('soil_moisture')
              }
            >
              <div className="sensor-card-top">
                <div className="sensor-icon soil-icon">
                  <Sprout size={22} />
                </div>

                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">
                Soil Moisture
              </div>

              <h2>
                {latestSoilMoisture
                  ? latestSoilMoisture.value
                  : '--'}
                <span className="sensor-unit">%</span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* LIGHT SENSOR */}

            <div
              className={`sensor-card ${
                selectedSensor === 'light'
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                handleSensorClick('light')
              }
            >
              <div className="sensor-card-top">
                <div className="sensor-icon light-icon">
                  <Sun size={22} />
                </div>

                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">
                Light
              </div>

              <h2>
                {latestLight
                  ? latestLight.value
                  : '--'}
                <span className="sensor-unit">lux</span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* WATER TANK */}

            <div className="sensor-card tank-card">
              <div className="sensor-card-top">
                <div className="sensor-icon tank-icon">
                  <Droplets size={22} />
                </div>

                <span className="sensor-status">Status</span>
              </div>

              <div className="sensor-label">
                Water Tank
              </div>

              <h2 className="tank-value">
                {tankStatus}
              </h2>

              <span className="sensor-hint">
                Current tank status
              </span>
            </div>

            {/* WATER FLOW */}

            <div
              className={`sensor-card ${
                selectedSensor === 'water_flow'
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                handleSensorClick('water_flow')
              }
            >
              <div className="sensor-card-top">
                <div className="sensor-icon flow-icon">
                  <Waves size={22} />
                </div>

                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">
                Water Flow
              </div>

              <h2>
                {latestWaterFlow
                  ? latestWaterFlow.value
                  : '--'}
                <span className="sensor-unit">L/min</span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* WATER VOLUME */}

            <div
              className={`sensor-card ${
                selectedSensor === 'water_volume'
                  ? 'selected'
                  : ''
              }`}
              onClick={() =>
                handleSensorClick('water_volume')
              }
            >
              <div className="sensor-card-top">
                <div className="sensor-icon volume-icon">
                  <Gauge size={22} />
                </div>

                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">
                Water Volume
              </div>

              <h2>
                {latestWaterVolume
                  ? latestWaterVolume.value
                  : '--'}
                <span className="sensor-unit">L</span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

          </div>
        </section>

        {/* DEVICE CONTROL: PUMP ONLY */}

        <section className="actuator-section">
          <div className="section-heading">
            <div>
              <h2>Device Control</h2>
              <p>
                Control irrigation pump for this zone.
              </p>
            </div>

            <span className="actuator-demo-badge">
              {actuatorStateReceived
                ? 'Pump registered'
                : 'Waiting for pump state'}
            </span>
          </div>

          {actuatorError && (
            <div className="dashboard-error" role="alert">
              {actuatorError}
            </div>
          )}

          {actuatorMessage && (
            <div className="page-success" role="status">
              {actuatorMessage}
            </div>
          )}

          <div className="actuator-grid">

            {actuator ? (
              <article className="actuator-card">
                <div className="actuator-card-top">
                  <div
                    className={`actuator-icon ${
                      actuator.state === true
                        ? 'is-on'
                        : 'is-off'
                    }`}
                  >
                    <Droplets size={23} />
                  </div>

                  <span
                    className={`actuator-state ${
                      actuator.state === true
                        ? 'is-on'
                        : actuator.state === false
                          ? 'is-off'
                          : ''
                    }`}
                  >
                    <span className="actuator-state-dot" />

                    {actuator.state === null
                      ? 'UNKNOWN'
                      : actuator.state
                        ? 'ON'
                        : 'OFF'}
                  </span>
                </div>

                <div className="actuator-card-body">
                  <h3>Pump</h3>

                  <p>{actuator.description}</p>

                  <p>
                    <small>
                      Device: {actuator.esp32Id}
                    </small>
                  </p>
                </div>

                <div className="actuator-card-footer">
                  <span
                    className={`actuator-mode ${
                      actuator.mode === 'MANUAL'
                        ? 'manual'
                        : 'auto'
                    }`}
                  >
                    {actuator.mode}
                  </span>

                  <div className="actuator-actions">
                    <button
                      type="button"
                      className="actuator-toggle-button"
                      onClick={requestActuatorToggle}
                      disabled={actuatorLoading}
                    >
                      <Power size={16} />

                      Turn{' '}
                      {(actuator.state ??
                        actuator.desiredState)
                        ? 'off'
                        : 'on'}
                    </button>
                  </div>
                </div>
              </article>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <Droplets size={28} />
                </div>

                <h2>No pump found</h2>

                <p>
                  No pump is registered for this zone.
                  Please check the device configuration.
                </p>
              </div>
            )}

          </div>
        </section>

        {/* ACTUATOR HISTORY */}

        <ActuatorHistory zoneId={zoneId} />

        {/* SENSOR HISTORY CHART */}

        {selectedSensor && (
          <section
            className="history-section"
            ref={historyRef}
          >
            <div className="history-header">
              <div>
                <div className="history-title">
                  <div className="history-title-icon">
                    {sensorConfig[selectedSensor].icon}
                  </div>

                  <div>
                    <h2>
                      {sensorConfig[selectedSensor].label}
                      {' '}History
                    </h2>

                    <p>Historical sensor readings</p>
                  </div>
                </div>
              </div>

              <div className="period-buttons">
                <button
                  type="button"
                  className={`period-button ${
                    period === 1 ? 'active' : ''
                  }`}
                  onClick={() => setPeriod(1)}
                >
                  1 Day
                </button>

                <button
                  type="button"
                  className={`period-button ${
                    period === 7 ? 'active' : ''
                  }`}
                  onClick={() => setPeriod(7)}
                >
                  7 Days
                </button>

                <button
                  type="button"
                  className={`period-button ${
                    period === 30 ? 'active' : ''
                  }`}
                  onClick={() => setPeriod(30)}
                >
                  30 Days
                </button>
              </div>
            </div>

            <div className="chart-card">
              {chartData.length === 0 ? (
                <div className="no-data">
                  <div>
                    <p>
                      No data available for this period.
                    </p>
                  </div>
                </div>
              ) : (
                <ResponsiveContainer
                  width="100%"
                  height={380}
                >
                  <LineChart
                    data={chartData}
                    margin={{
                      top: 10,
                      right: 20,
                      left: 0,
                      bottom: 10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e5e7eb"
                    />

                    <XAxis
                      dataKey="time"
                      tick={{
                        fontSize: 12,
                        fill: '#6b7280',
                      }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <YAxis
                      tick={{
                        fontSize: 12,
                        fill: '#6b7280',
                      }}
                      tickLine={false}
                      axisLine={false}
                    />

                    <Tooltip
                      contentStyle={{
                        borderRadius: '10px',
                        border: '1px solid #e5e7eb',
                        boxShadow:
                          '0 8px 20px rgba(0,0,0,0.08)',
                      }}
                    />

                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={{
                        r: 3,
                        fill: '#16a34a',
                      }}
                      activeDot={{
                        r: 6,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        )}

      </div>

      {/* PUMP CONFIRMATION MODAL */}

      {pendingActuator && actuator && (
        <div
          className="actuator-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingActuator(null);
            }
          }}
        >
          <section
            className="actuator-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="actuator-modal-title"
          >
            <button
              type="button"
              className="actuator-modal-close"
              aria-label="Close confirmation"
              onClick={() => setPendingActuator(null)}
            >
              <X size={19} />
            </button>

            <div className="actuator-modal-icon">
              <Power size={24} />
            </div>

            <h2 id="actuator-modal-title">
              Confirm pump control
            </h2>

            <p>
              Do you want to turn the pump{' '}
              {(actuator.state ?? actuator.desiredState)
                ? 'off'
                : 'on'}?
            </p>

            <p className="actuator-modal-note">
              The command will be sent to the backend
              and forwarded to the corresponding ESP32.
              The displayed state will update when
              feedback is received.
            </p>

            <div className="actuator-modal-actions">
              <button
                type="button"
                className="actuator-cancel-button"
                onClick={() => setPendingActuator(null)}
                disabled={actuatorLoading}
              >
                Cancel
              </button>

              <button
                type="button"
                className="actuator-confirm-button"
                onClick={confirmActuatorToggle}
                disabled={actuatorLoading}
              >
                {actuatorLoading
                  ? 'Sending...'
                  : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}

export default DashboardPage;
