
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Fan,
  Lightbulb,
  Power,
} from 'lucide-react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';

import api from '../services/api';
import AppHeader from '../components/AppHeader';
import ActuatorHistory from '../components/ActuatorHistory';

interface Zone {
  id: number;
  farm_id: number;
  name: string;
  created_at: string;
}

interface Actuator {
  actuator_id: number;
  farm_id: number;
  esp32_id: string;
  scope: string;
  zone_id: number | null;
  actuator: string;
  type: string;
  control_mode: string;
  desired_state: boolean;
  actual_state: boolean | null;
  state_updated_at: string | null;
}

function ZonePage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const [zones, setZones] = useState<Zone[]>([]);
  const [actuators, setActuators] = useState<Actuator[]>([]);

  const [loading, setLoading] = useState(true);
  const [actuatorLoading, setActuatorLoading] = useState(false);
  const [error, setError] = useState('');
  const [actuatorError, setActuatorError] = useState('');
  const [commandMessage, setCommandMessage] = useState('');

  // FETCH ZONES
  useEffect(() => {
    const fetchZones = async () => {
      if (!farmId) {
        setError('Farm ID không hợp lệ');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/farms/${farmId}/zones`);
        const result = response.data?.data ?? response.data;

        setZones(Array.isArray(result) ? result : []);
      } catch (err: any) {
        console.error('Get zones error:', err);

        if (err.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        setError(
          err.response?.data?.message ||
          'Không thể lấy danh sách Zone',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchZones();
  }, [farmId, navigate]);

  // FETCH FARM-LEVEL ACTUATORS
  useEffect(() => {
    let cancelled = false;

    const fetchActuators = async () => {
      try {
        const response = await api.get('/bbb/actuators/state');
        const result = response.data?.data ?? response.data;

        if (cancelled) return;

        const allActuators: Actuator[] = Array.isArray(result?.actuators)
          ? result.actuators
          : [];

        const farmActuators = allActuators.filter(
          (item) =>
            Number(item.farm_id) === Number(farmId) &&
            item.scope === 'farm' &&
            ['fan', 'light'].includes(item.actuator),
        );

        setActuators(farmActuators);
      } catch (err: any) {
        console.error('Get farm actuator state error:', err);

        if (err.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        if (!cancelled) {
          setActuatorError('Unable to load farm device states.');
        }
      }
    };

    if (farmId) fetchActuators();

    return () => {
      cancelled = true;
    };
  }, [farmId, navigate]);

  // CONTROL FARM ACTUATOR
  const handleActuatorToggle = async (actuator: Actuator) => {
    if (actuatorLoading) return;

    const currentState =
      actuator.actual_state ?? actuator.desired_state;

    const nextState = currentState ? 0 : 1;

    const confirmed = window.confirm(
      `Do you want to turn ${actuator.actuator} ${nextState ? 'on' : 'off'}?`,
    );

    if (!confirmed) return;

    try {
      setActuatorLoading(true);
      setActuatorError('');
      setCommandMessage('');

      const token = localStorage.getItem('accessToken');

      if (!token) {
        navigate('/login');
        return;
      }

      const response = await api.post(
        '/bbb/actuators/control',
        {
          esp32_id: actuator.esp32_id,
          actuator: actuator.actuator,
          state: nextState,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      console.log('Farm actuator command:', response.data);

      setCommandMessage(
        `Command sent to ${actuator.actuator}. Waiting for device feedback.`,
      );
    } catch (err: any) {
      console.error('Farm actuator control error:', err);

      if (err.response?.status === 401) {
        localStorage.removeItem('accessToken');
        navigate('/login');
        return;
      }

      setActuatorError(
        err.response?.data?.message ||
        'Failed to send actuator command.',
      );
    } finally {
      setActuatorLoading(false);
    }
  };

  const handleZoneClick = (zoneId: number) => {
    navigate(`/zones/${zoneId}`);
  };

  const handleBack = () => {
    navigate('/farms');
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <p>Loading zones...</p>
      </div>
    );
  }

  return (
    <div className="app-page">
      <AppHeader />

      <main className="page-container">
        <button
          type="button"
          className="page-back-button"
          onClick={handleBack}
        >
          <ArrowLeft size={17} />
          <span>Back to Farms</span>
        </button>

        <div className="page-heading zone-heading">
          <div>
            <div className="page-eyebrow">
              FARM {farmId}
            </div>

            <h1>Farm Dashboard</h1>

            <p>
              Monitor and control farm-level devices
              and manage your zones.
            </p>
          </div>

          <div className="page-count">
            <span>{zones.length}</span>
            <small>{zones.length === 1 ? 'Zone' : 'Zones'}</small>
          </div>
        </div>

        {error && (
          <div className="page-error">
            <p>{error}</p>
          </div>
        )}

        {/* FARM-LEVEL DEVICE CONTROL */}
        <section className="actuator-section">
          <div className="section-heading">
            <div>
              <h2>Farm Device Control</h2>
              <p>
                Control fan and lighting for the entire farm.
              </p>
            </div>
          </div>

          {actuatorError && (
            <div className="dashboard-error" role="alert">
              {actuatorError}
            </div>
          )}

          {commandMessage && (
            <div className="page-success" role="status">
              {commandMessage}
            </div>
          )}

          <div className="actuator-grid">
            {['fan', 'light'].map((name) => {
              const actuator = actuators.find(
                (item) => item.actuator === name,
              );

              const isOn = actuator?.actual_state;
              const Icon = name === 'fan' ? Fan : Lightbulb;
              const label = name === 'fan' ? 'Fan' : 'Light';

              return (
                <article className="actuator-card" key={name}>
                  <div className="actuator-card-top">
                    <div
                      className={`actuator-icon ${
                        isOn === true ? 'is-on' : 'is-off'
                      }`}
                    >
                      <Icon size={23} />
                    </div>

                    <span
                      className={`actuator-state ${
                        isOn === true
                          ? 'is-on'
                          : isOn === false
                            ? 'is-off'
                            : ''
                      }`}
                    >
                      <span className="actuator-state-dot" />
                      {isOn === null || !actuator
                        ? 'UNKNOWN'
                        : isOn
                          ? 'ON'
                          : 'OFF'}
                    </span>
                  </div>

                  <div className="actuator-card-body">
                    <h3>{label}</h3>
                    <p>
                      {name === 'fan'
                        ? 'Farm ventilation'
                        : 'Farm supplementary lighting'}
                    </p>
                  </div>

                  <div className="actuator-card-footer">
                    <span className="actuator-mode auto">
                      {actuator?.control_mode?.toUpperCase() ?? '--'}
                    </span>

                    <button
                      type="button"
                      className="actuator-toggle-button"
                      disabled={!actuator || actuatorLoading}
                      onClick={() => {
                        if (actuator) {
                          handleActuatorToggle(actuator);
                        }
                      }}
                    >
                      <Power size={16} />
                      Turn {actuator?.desired_state ? 'off' : 'on'}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* ACTUATOR HISTORY */}

        <ActuatorHistory farmId={farmId} />

        {/* ZONE LIST */}
        <section className="zone-list-section">
          <div className="section-heading">
            <div>
              <h2>Farm Zones</h2>
              <p>
                Select a zone to open its monitoring dashboard.
              </p>
            </div>
          </div>

          {zones.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <MapPin size={28} />
              </div>

              <h2>No zones found</h2>

              <p>
                This farm currently has no available zones.
              </p>
            </div>
          ) : (
            <div className="zone-grid">
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  className="zone-card"
                  onClick={() => handleZoneClick(zone.id)}
                >
                  <div className="zone-card-top">
                    <div className="zone-icon">
                      <MapPin size={22} />
                    </div>

                    <div className="zone-arrow">
                      <ArrowRight size={18} />
                    </div>
                  </div>

                  <div className="zone-card-content">
                    <h2>{zone.name}</h2>
                    <p>Zone ID: {zone.id}</p>
                  </div>

                  <div className="zone-card-footer">
                    <span>Open dashboard</span>
                    <ArrowRight size={15} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default ZonePage;
