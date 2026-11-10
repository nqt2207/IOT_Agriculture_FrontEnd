
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
import { io } from 'socket.io-client';

import api from '../services/api';
import AppHeader from '../components/AppHeader';
import ActuatorHistory from '../components/ActuatorHistory';

// =========================
// INTERFACES
// =========================

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
  reported_control_mode?: string | null;
  desired_state: boolean;
  actual_state: boolean | null;
  state_updated_at: string | null;
}

interface ActuatorStateUpdate {
  farmId?: number | string;
  farm_id?: number | string;

  esp32Id?: string;
  esp32_id?: string;

  actuator: string;

  actualState?: boolean | null;
  actual_state?: boolean | null;

  desiredState?: boolean;
  desired_state?: boolean;

  value?: number | boolean;

  controlMode?: string;
  control_mode?: string;
  reported_control_mode?: string | null;

  timestamp?: string;
  state_updated_at?: string;
}

// =========================
// COMPONENT
// =========================

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

  // =========================
  // FETCH ZONES
  // =========================

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

  // =========================
  // FETCH FARM ACTUATORS
  // =========================

  useEffect(() => {
    let cancelled = false;

    const fetchActuators = async () => {
      try {
        const response = await api.get('/bbb/actuators/state');

        const result = response.data?.data ?? response.data;

        if (cancelled) return;

        const allActuators: Actuator[] =
          Array.isArray(result?.actuators)
            ? result.actuators
            : [];

        const farmActuators = allActuators.filter(
          (item) =>
            Number(item.farm_id) === Number(farmId) &&
            item.scope === 'farm' &&
            ['fan', 'light'].includes(item.actuator),
        );

        setActuators(farmActuators);

        console.log(
          '[FARM] Actuators loaded:',
          farmActuators,
        );
      } catch (err: any) {
        console.error(
          'Get farm actuator state error:',
          err,
        );

        if (err.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        if (!cancelled) {
          setActuatorError(
            'Unable to load farm device states.',
          );
        }
      }
    };

    if (farmId) {
      fetchActuators();
    }

    return () => {
      cancelled = true;
    };
  }, [farmId, navigate]);

  // =========================
  // WEBSOCKET
  // FARM ACTUATOR STATE
  // =========================

  useEffect(() => {
    if (!farmId) return;

    const socketUrl =
      import.meta.env.VITE_WS_URL ||
      'http://localhost:3001';

    const socket = io(socketUrl, {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log(
        '[FARM WS] Connected:',
        socket.id,
      );
    });

    socket.on('connect_error', (err) => {
      console.error(
        '[FARM WS] Connection error:',
        err.message,
      );
    });

    socket.on(
      'actuator:state',
      (update: ActuatorStateUpdate) => {
        console.log(
          '[FARM WS] Actuator state received:',
          update,
        );

        // Only handle FAN and LIGHT.
        if (!['fan', 'light'].includes(update.actuator)) {
          return;
        }

        const updatedFarmId =
          update.farmId ?? update.farm_id;

        const updatedEsp32Id =
          update.esp32Id ?? update.esp32_id;

        // Check farm identity when provided.
        if (
          updatedFarmId !== undefined &&
          Number(updatedFarmId) !== Number(farmId)
        ) {
          return;
        }

        // Normalize actual state.
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
          update.value === 1 ||
          typeof update.value === 'boolean'
        ) {
          actualState = Boolean(update.value);
        }

        // Normalize desired state.
        const desiredState =
          typeof update.desiredState === 'boolean'
            ? update.desiredState
            : typeof update.desired_state === 'boolean'
              ? update.desired_state
              : undefined;

        const reportedMode =
          update.controlMode ??
          update.control_mode ??
          update.reported_control_mode;

        // Do not update if no actual state is available.
        if (actualState === undefined) {
          console.warn(
            '[FARM WS] No valid actual state:',
            update,
          );
          return;
        }

        setActuators((previous) => {
          const matched = previous.some(
            (item) =>
              item.actuator === update.actuator &&
              (
                !updatedEsp32Id ||
                item.esp32_id === updatedEsp32Id
              ),
          );

          if (!matched) {
            console.warn(
              '[FARM WS] No matching actuator:',
              update,
            );
            return previous;
          }

          return previous.map((item) => {
            const isTarget =
              item.actuator === update.actuator &&
              (
                !updatedEsp32Id ||
                item.esp32_id === updatedEsp32Id
              );

            if (!isTarget) return item;

            return {
              ...item,
              actual_state: actualState,
              desired_state:
                desiredState ?? item.desired_state,
              control_mode:
                reportedMode ?? item.control_mode,
              reported_control_mode:
                reportedMode ?? item.reported_control_mode,
              state_updated_at:
                update.state_updated_at ??
                update.timestamp ??
                new Date().toISOString(),
            };
          });
        });

        setCommandMessage(
          `${update.actuator === 'fan' ? 'Fan' : 'Light'} status updated from device.`,
        );

        setActuatorError('');

        console.log(
          '[FARM WS] Device state processed:',
          update.actuator,
          actualState,
        );
      },
    );

    return () => {
      socket.off('connect');
      socket.off('connect_error');
      socket.off('actuator:state');
      socket.disconnect();

      console.log('[FARM WS] Disconnected');
    };
  }, [farmId]);

  // =========================
  // CONTROL FARM ACTUATOR
  // =========================

  const handleActuatorToggle = async (
    actuator: Actuator,
  ) => {
    if (actuatorLoading) return;

    const currentState =
      actuator.actual_state ?? actuator.desired_state;

    const nextState = currentState ? 0 : 1;

    const confirmed = window.confirm(
      `Do you want to turn ${actuator.actuator} ${
        nextState ? 'on' : 'off'
      }?`,
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

      console.log(
        '[FARM] Actuator command accepted:',
        response.data,
      );

      setCommandMessage(
        `Command sent to ${actuator.actuator}. Waiting for device feedback.`,
      );
    } catch (err: any) {
      console.error(
        'Farm actuator control error:',
        err,
      );

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

  // =========================
  // NAVIGATION
  // =========================

  const handleZoneClick = (zoneId: number) => {
    navigate(`/zones/${zoneId}`);
  };

  const handleBack = () => {
    navigate('/farms');
  };

  // =========================
  // LOADING
  // =========================

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />
        <p>Loading zones...</p>
      </div>
    );
  }

  // =========================
  // PAGE
  // =========================

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
            <small>
              {zones.length === 1 ? 'Zone' : 'Zones'}
            </small>
          </div>
        </div>

        {error && (
          <div className="page-error">
            <p>{error}</p>
          </div>
        )}

        {/* FARM DEVICE CONTROL */}

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

              const Icon =
                name === 'fan' ? Fan : Lightbulb;

              const label =
                name === 'fan' ? 'Fan' : 'Light';

              const currentState =
                actuator?.actual_state ??
                actuator?.desired_state ??
                false;

              return (
                <article
                  className="actuator-card"
                  key={name}
                >
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

                    {actuator && (
                      <p>
                        <small>
                          Device: {actuator.esp32_id}
                        </small>
                      </p>
                    )}
                  </div>

                  <div className="actuator-card-footer">
                    <span className="actuator-mode auto">
                      {actuator?.reported_control_mode?.toUpperCase() ??
                        actuator?.control_mode?.toUpperCase() ??
                        '--'}
                    </span>

                    <button
                      type="button"
                      className="actuator-toggle-button"
                      disabled={
                        !actuator || actuatorLoading
                      }
                      onClick={() => {
                        if (actuator) {
                          handleActuatorToggle(actuator);
                        }
                      }}
                    >
                      <Power size={16} />

                      Turn {currentState ? 'off' : 'on'}
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
                  onClick={() =>
                    handleZoneClick(zone.id)
                  }
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