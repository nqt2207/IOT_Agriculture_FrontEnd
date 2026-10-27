
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Droplets,
  Fan,
  Gauge,
  Lightbulb,
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

type SensorType =
  | 'temperature'
  | 'humidity'
  | 'soil_moisture'
  | 'light'
  | 'water_flow'
  | 'water_volume';

type Period = 1 | 7 | 30;
type ActuatorId = 'fan' | 'light' | 'pump1';

type ActuatorMode = 'AUTO' | 'MANUAL';

interface ActuatorStateMessage {
  device_id: string;
  simulation: boolean;
  actuators: {
    pump1: 0 | 1;
    fan: 0 | 1;
    light: 0 | 1;
  };
}

interface Actuator {
  id: ActuatorId;
  label: string;
  description: string;
  state: boolean;
  mode: ActuatorMode;
}

interface SensorConfig {
  label: string;
  unit: string;
  icon: React.ReactNode;
}

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

function DashboardPage() {
  const navigate = useNavigate();
  const { zoneId } = useParams();

  const [telemetry, setTelemetry] = useState<TelemetryItem[]>([]);
  const [selectedSensor, setSelectedSensor] =
    useState<SensorType | null>(null);
  const [period, setPeriod] = useState<Period>(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Ref trỏ đến phần biểu đồ lịch sử.
  const historyRef = useRef<HTMLElement | null>(null);

  /*
   * AUTO SCROLL TO HISTORY CHART
   *
   * Khi chọn cảm biến, đợi React render biểu đồ xong
   * rồi cuộn trang xuống phần biểu đồ.
   */
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

  // Trạng thái ban đầu: chờ nhận dữ liệu từ BBB qua WebSocket.
  const [actuators, setActuators] = useState<Actuator[]>([
    {
      id: 'fan',
      label: 'Fan',
      description: 'Air temperature control',
      state: false,
      mode: 'AUTO',
    },
    {
      id: 'light',
      label: 'Light',
      description: 'Supplementary lighting',
      state: false,
      mode: 'AUTO',
    },
    {
      id: 'pump1',
      label: 'Pump',
      description: 'Irrigation water supply',
      state: false,
      mode: 'AUTO',
    },
  ]);

  const [pendingActuator, setPendingActuator] =
    useState<ActuatorId | null>(null);

  const [actuatorLoading, setActuatorLoading] = useState(false);
  const [actuatorError, setActuatorError] = useState('');
  const [actuatorStateReceived, setActuatorStateReceived] =
    useState(false);

    /*
  * FETCH INITIAL ACTUATOR STATE
  *
  * Lấy trạng thái hiện tại của thiết bị từ backend
  * mỗi khi Dashboard được mở hoặc tải lại.
  */
  useEffect(() => {
    let cancelled = false;

    const fetchActuatorState = async () => {
      try {
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

        // Hỗ trợ cả response được bọc trong data
        // và response trả về trực tiếp.
        const result = response.data?.data ?? response.data;

        if (
          !result?.actuators ||
          cancelled
        ) {
          console.warn(
            'API không trả về trạng thái thiết bị hợp lệ:',
            response.data,
          );
          return;
        }

        const receivedActuators = result.actuators;

        // Chỉ chấp nhận trạng thái 0 hoặc 1.
        const validState = (
          value: unknown,
        ): value is 0 | 1 => value === 0 || value === 1;

        if (
          !validState(receivedActuators.pump1) ||
          !validState(receivedActuators.fan) ||
          !validState(receivedActuators.light)
        ) {
          console.warn(
            'Trạng thái thiết bị không hợp lệ:',
            receivedActuators,
          );
          return;
        }

        setActuators((previous) =>
          previous.map((actuator) => {
            const value = receivedActuators[actuator.id];

            return {
              ...actuator,
              state: value === 1,
            };
          }),
        );

        setActuatorStateReceived(true);

        console.log(
          'Initial actuator state loaded from API:',
          result,
        );
      } catch (err: any) {
        console.error(
          'Failed to fetch initial actuator state:',
          err,
        );

        if (err?.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
        }
      }
    };

    fetchActuatorState();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  /*
   * FETCH TELEMETRY
   */
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        setLoading(true);
        setError('');

        const token = localStorage.getItem('accessToken');

        if (!token) {
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

        setTelemetry(response.data?.data ?? []);
      } catch (err: any) {
        console.error('Failed to fetch telemetry:', err);

        if (err?.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        setError('Failed to load telemetry data.');
      } finally {
        setLoading(false);
      }
    };

    fetchTelemetry();
  }, [zoneId, navigate]);

  /*
   * WEBSOCKET TELEMETRY
   */
  useEffect(() => {
    if (!zoneId) return;

    const socketUrl =
      import.meta.env.VITE_WS_URL ||
      'http://localhost:3001';

    const socket = io(socketUrl, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
    });

    socket.on('connect_error', (socketError) => {
      console.error(
        'WebSocket connection error:',
        socketError.message,
      );
    });

    socket.on(
      'telemetry:update',
      (update: TelemetryUpdate) => {
        if (Number(update.zoneId) !== Number(zoneId)) {
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

    socket.on(
      'actuator:state',
      (data: ActuatorStateMessage) => {
        if (data.device_id !== 'BBB_01') {
          return;
        }

        const receivedActuators = data.actuators;

        setActuators((previous) =>
          previous.map((actuator) => {
            const value = receivedActuators[actuator.id];

            if (value !== 0 && value !== 1) {
              return actuator;
            }

            return {
              ...actuator,
              state: value === 1,
            };
          }),
        );

        setActuatorStateReceived(true);

        console.log(
          'Actuator state received:',
          data,
        );
      },
    );

    return () => {
      socket.disconnect();
    };
  }, [zoneId]);

  /*
   * GET LATEST SENSOR VALUE
   */
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

  /*
   * FILTER HISTORY BY PERIOD
   */
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

  /*
   * CHART DATA
   */
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

  /*
   * SENSOR CLICK
   */
  const handleSensorClick = (sensor: SensorType) => {
    setSelectedSensor((current) =>
      current === sensor ? null : sensor,
    );
  };

  /*
   /*
 * ACTUATOR CONTROL
 */

const actuatorToConfirm = actuators.find(
  (actuator) => actuator.id === pendingActuator,
);

const requestActuatorToggle = (
  actuatorId: ActuatorId,
) => {
  setActuatorError('');
  setPendingActuator(actuatorId);
};

const confirmActuatorToggle = async () => {
  if (!pendingActuator || actuatorLoading) {
    return;
  }

  const actuator = actuators.find(
    (item) => item.id === pendingActuator,
  );

  if (!actuator) {
    return;
  }

  const nextValue = actuator.state ? 0 : 1;

  try {
    setActuatorLoading(true);
    setActuatorError('');

    const token = localStorage.getItem('accessToken');

    if (!token) {
      navigate('/login');
      return;
    }

    const response = await api.post(
      '/bbb/actuators/control',
      {
        actuator: pendingActuator,
        state: nextValue,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    console.log(
      'Actuator command accepted by backend:',
      response.data,
    );

    // Không tự đổi state tại đây.
    // Chờ BBB phản hồi qua WebSocket actuator:state.
    setActuators((previous) =>
      previous.map((item) =>
        item.id === pendingActuator
          ? {
              ...item,
              mode: 'MANUAL',
            }
          : item,
      ),
    );

    setPendingActuator(null);
  } catch (err: any) {
    console.error(
      'Failed to control actuator:',
      err,
    );

    if (err?.response?.status === 401) {
      localStorage.removeItem('accessToken');
      navigate('/login');
      return;
    }

    setActuatorError(
      err?.response?.data?.message ||
        'Failed to send actuator command. Please try again.',
    );
  } finally {
    setActuatorLoading(false);
  }
};

const setActuatorAuto = (actuatorId: ActuatorId) => {
  // Hiện tại backend mới có API bật/tắt thiết bị.
  // Chưa có lệnh MQTT riêng để chuyển thiết bị về AUTO.
  // Không giả vờ rằng BBB đã nhận được lệnh AUTO.
  setActuatorError(
    `Automatic mode for ${actuatorId} has not been connected to the backend yet.`,
  );
};

  /*
   * BACK
   */
  const handleBack = () => {
    navigate(-1);
  };

  /*
   * TANK STATUS
   */
  const tankStatus =
    latestTankStatus?.value === 1
      ? 'Available'
      : latestTankStatus?.value === 0
        ? 'Empty'
        : '--';

  /*
   * LOADING
   */
  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  /*
   * DASHBOARD
   */
  return (
    <div className="dashboard-page">
      <AppHeader />

      <div className="dashboard-container">
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
              onClick={() => handleSensorClick('humidity')}
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
              onClick={() => handleSensorClick('light')}
            >
              <div className="sensor-card-top">
                <div className="sensor-icon light-icon">
                  <Sun size={22} />
                </div>
                <span className="sensor-status">Live</span>
              </div>

              <div className="sensor-label">Light</div>

              <h2>
                {latestLight ? latestLight.value : '--'}
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

        {/* DEVICE CONTROL */}
        <section className="actuator-section">
          <div className="section-heading">
            <div>
              <h2>Device Control</h2>
              <p>
                Control actuators manually or return them
                to automatic operation.
              </p>
            </div>

            <span className="actuator-demo-badge">
              {actuatorStateReceived
                ? 'BBB connected · Simulation mode'
                : 'Waiting for BBB state'}
            </span>
          </div>

          {actuatorError && (
            <div className="dashboard-error" role="alert">
              {actuatorError}
            </div>
          )}

          <div className="actuator-grid">
            {actuators.map((actuator) => {
              const Icon =
                actuator.id === 'fan'
                  ? Fan
                  : actuator.id === 'light'
                    ? Lightbulb
                    : Droplets;

              return (
                <article
                  className="actuator-card"
                  key={actuator.id}
                >
                  <div className="actuator-card-top">
                    <div
                      className={`actuator-icon ${
                        actuator.state ? 'is-on' : 'is-off'
                      }`}
                    >
                      <Icon size={23} />
                    </div>

                    <span
                      className={`actuator-state ${
                        actuator.state ? 'is-on' : 'is-off'
                      }`}
                    >
                      <span className="actuator-state-dot" />
                      {actuator.state ? 'ON' : 'OFF'}
                    </span>
                  </div>

                  <div className="actuator-card-body">
                    <h3>{actuator.label}</h3>
                    <p>{actuator.description}</p>
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
                        onClick={() =>
                          requestActuatorToggle(actuator.id)
                        }
                      >
                        <Power size={16} />
                        Turn {actuator.state ? 'off' : 'on'}
                      </button>

                      {actuator.mode === 'MANUAL' && (
                        <button
                          type="button"
                          className="actuator-auto-button"
                          onClick={() =>
                            setActuatorAuto(actuator.id)
                          }
                        >
                          Return to AUTO
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* HISTORY CHART */}
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
                    <p>No data available for this period.</p>
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

      {/* ACTUATOR CONFIRMATION MODAL */}
      {actuatorToConfirm && (
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
              Confirm device control
            </h2>

            <p>
              Do you want to turn{' '}
              {actuatorToConfirm.label.toLowerCase()}{' '}
              {actuatorToConfirm.state ? 'off' : 'on'}?
            </p>

            <p className="actuator-modal-note">
              The command will be sent to the backend and forwarded
              to BBB. The displayed device state will update when
              the backend receives a state message from BBB.
            </p>

            <div className="actuator-modal-actions">
              <button
                type="button"
                className="actuator-cancel-button"
                onClick={() => setPendingActuator(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="actuator-confirm-button"
                onClick={confirmActuatorToggle}
                disabled={actuatorLoading}
              >
                {actuatorLoading ? 'Sending...' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
