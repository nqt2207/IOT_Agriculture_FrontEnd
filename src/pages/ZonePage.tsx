import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
} from 'lucide-react';
import {
  useNavigate,
  useParams,
} from 'react-router-dom';

import api from '../services/api';
import AppHeader from '../components/AppHeader';

interface Zone {
  id: number;
  farm_id: number;
  name: string;
  created_at: string;
}

function ZonePage() {
  const { farmId } = useParams<{
    farmId: string;
  }>();

  const navigate = useNavigate();

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /*
   * =========================
   * FETCH ZONES
   * =========================
   */

  useEffect(() => {
    const fetchZones = async () => {
      if (!farmId) {
        setError('Farm ID không hợp lệ');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(
          `/farms/${farmId}/zones`,
        );

        console.log(
          'Zones response:',
          response.data,
        );

        setZones(response.data.data);
      } catch (error: any) {
        console.error(
          'Get zones error:',
          error,
        );

        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        setError(
          error.response?.data?.message ||
            'Không thể lấy danh sách Zone',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchZones();
  }, [farmId, navigate]);

  /*
   * =========================
   * HANDLERS
   * =========================
   */

  const handleZoneClick = (zoneId: number) => {
    navigate(`/zones/${zoneId}`);
  };

  const handleBack = () => {
    navigate('/farms');
  };

  /*
   * =========================
   * LOADING
   * =========================
   */

  if (loading) {
    return (
      <div className="page-loading">
        <div className="loading-spinner" />

        <p>Loading zones...</p>
      </div>
    );
  }

  /*
   * =========================
   * PAGE
   * =========================
   */

  return (
    <div className="app-page">

      <AppHeader />

      <main className="page-container">

        {/* BACK */}

        <button
          type="button"
          className="page-back-button"
          onClick={handleBack}
        >
          <ArrowLeft size={17} />

          <span>Back to Farms</span>
        </button>

        {/* PAGE TITLE */}

        <div className="page-heading zone-heading">

          <div>

            <div className="page-eyebrow">
              FARM {farmId}
            </div>

            <h1>Zones</h1>

            <p>
              Select a zone to open its
              monitoring dashboard.
            </p>

          </div>

          <div className="page-count">
            <span>{zones.length}</span>

            <small>
              {zones.length === 1
                ? 'Zone'
                : 'Zones'}
            </small>
          </div>

        </div>

        {/* ERROR */}

        {error && (
          <div className="page-error">
            <p>{error}</p>
          </div>
        )}

        {/* ZONES */}

        {!error && zones.length === 0 ? (
          <div className="empty-state">

            <div className="empty-state-icon">
              <MapPin size={28} />
            </div>

            <h2>No zones found</h2>

            <p>
              This farm currently has no
              available zones.
            </p>

          </div>
        ) : (
          !error && (
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

                    <p>
                      Zone ID: {zone.id}
                    </p>

                  </div>

                  <div className="zone-card-footer">

                    <span>
                      Open dashboard
                    </span>

                    <ArrowRight size={15} />

                  </div>

                </div>
              ))}

            </div>
          )
        )}

      </main>
    </div>
  );
}

export default ZonePage;