import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Droplets,
  Gauge,
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

interface TelemetryItem {
  sensor: string;
  value: number;
  timestamp: string;
  zoneId: number;
  bbbId: string;
  esp32Id: string;
}

type SensorType =
  | 'temperature'
  | 'humidity'
  | 'soil_moisture'
  | 'light'
  | 'water_flow'
  | 'water_volume';

type Period = 1 | 7 | 30;

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

  /*
   * =========================
   * FETCH TELEMETRY
   * =========================
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
   * =========================
   * GET LATEST VALUE
   * =========================
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
   * =========================
   * PERIOD FILTER
   * =========================
   */

  const filteredTelemetry = useMemo(() => {
    if (!selectedSensor) {
      return [];
    }

    const now = Date.now();

    const periodMilliseconds =
      period * 24 * 60 * 60 * 1000;

    const startTime = now - periodMilliseconds;

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
   * =========================
   * CHART DATA
   * =========================
   */

  const chartData = useMemo(() => {
    return filteredTelemetry.map((item) => ({
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
    }));
  }, [filteredTelemetry]);

  /*
   * =========================
   * SENSOR CLICK
   * =========================
   */

  const handleSensorClick = (sensor: SensorType) => {
    if (selectedSensor === sensor) {
      setSelectedSensor(null);
      return;
    }

    setSelectedSensor(sensor);
  };

  /*
   * =========================
   * BACK
   * =========================
   */

  const handleBack = () => {
    navigate(-1);
  };

  /*
   * =========================
   * FORMAT TANK
   * =========================
   */

  const tankStatus =
    latestTankStatus?.value === 1
      ? 'Available'
      : latestTankStatus?.value === 0
        ? 'Empty'
        : '--';

  /*
   * =========================
   * LOADING
   * =========================
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
   * =========================
   * PAGE
   * =========================
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

            <h1>
              Zone {zoneId}
            </h1>

            <p>
              Monitor environmental conditions
              and water usage in real time.
            </p>
          </div>

        </div>

      </header>

        {/* =========================
            ERROR
        ========================= */}

        {error && (
          <div className="dashboard-error">
            {error}
          </div>
        )}

        {/* =========================
            SENSOR CARDS
        ========================= */}

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

                <span className="sensor-status">
                  Live
                </span>

              </div>

              <div className="sensor-label">
                Temperature
              </div>

              <h2>
                {latestTemperature
                  ? latestTemperature.value
                  : '--'}
                <span className="sensor-unit">
                  °C
                </span>
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

                <span className="sensor-status">
                  Live
                </span>

              </div>

              <div className="sensor-label">
                Humidity
              </div>

              <h2>
                {latestHumidity
                  ? latestHumidity.value
                  : '--'}
                <span className="sensor-unit">
                  %
                </span>
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

                <span className="sensor-status">
                  Live
                </span>

              </div>

              <div className="sensor-label">
                Soil Moisture
              </div>

              <h2>
                {latestSoilMoisture
                  ? latestSoilMoisture.value
                  : '--'}
                <span className="sensor-unit">
                  %
                </span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* LIGHT */}

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

                <span className="sensor-status">
                  Live
                </span>

              </div>

              <div className="sensor-label">
                Light
              </div>

              <h2>
                {latestLight
                  ? latestLight.value
                  : '--'}
                <span className="sensor-unit">
                  lux
                </span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>
            </div>

            {/* TANK */}

            <div className="sensor-card tank-card">

              <div className="sensor-card-top">

                <div className="sensor-icon tank-icon">
                  <Droplets size={22} />
                </div>

                <span className="sensor-status">
                  Status
                </span>

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

                <span className="sensor-status">
                  Live
                </span>

              </div>

              <div className="sensor-label">
                Water Flow
              </div>

              <h2>
                {latestWaterFlow
                  ? latestWaterFlow.value
                  : '--'}
                <span className="sensor-unit">
                  L/min
                </span>
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

                <span className="sensor-status">
                  Live
                </span>

              </div>

              <div className="sensor-label">
                Water Volume
              </div>

              <h2>
                {latestWaterVolume
                  ? latestWaterVolume.value
                  : '--'}
                <span className="sensor-unit">
                  L
                </span>
              </h2>

              <span className="sensor-hint">
                View history
              </span>

            </div>

          </div>
        </section>

        {/* =========================
            HISTORY
        ========================= */}

        {selectedSensor && (
          <section className="history-section">

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

                    <p>
                      Historical sensor readings
                    </p>
                  </div>

                </div>
              </div>

              <div className="period-buttons">

                <button
                  className={`period-button ${
                    period === 1 ? 'active' : ''
                  }`}
                  onClick={() => setPeriod(1)}
                >
                  1 Day
                </button>

                <button
                  className={`period-button ${
                    period === 7 ? 'active' : ''
                  }`}
                  onClick={() => setPeriod(7)}
                >
                  7 Days
                </button>

                <button
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
                      No data available for this
                      period.
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
    </div>
  );
}

export default DashboardPage;