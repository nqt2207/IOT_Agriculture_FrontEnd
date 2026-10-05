import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Building2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import AppHeader from '../components/AppHeader';

interface Farm {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

function FarmPage() {
  const navigate = useNavigate();

  const [farms, setFarms] = useState<Farm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFarms = async () => {
      try {
        const response = await api.get('/farms');

        console.log('Farms response:', response.data);

        setFarms(response.data.data);
      } catch (error: any) {
        console.error('Get farms error:', error);

        if (error.response?.status === 401) {
          localStorage.removeItem('accessToken');
          navigate('/login');
          return;
        }

        setError(
          error.response?.data?.message ||
            'Không thể lấy danh sách Farm',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchFarms();
  }, [navigate]);

  const handleFarmClick = (farmId: number) => {
    navigate(`/farms/${farmId}`);
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

        <p>Loading farms...</p>
      </div>
    );
  }

  /*
   * =========================
   * ERROR
   * =========================
   */

  if (error) {
    return (
      <div className="app-page">
        <AppHeader />

        <main className="page-container">

          <div className="page-error">
            <p>{error}</p>
          </div>

        </main>
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

        {/* PAGE TITLE */}

        <div className="page-heading">

          <div>
            <div className="page-eyebrow">
              AGRICULTURE SYSTEM
            </div>

            <h1>My Farms</h1>

            <p>
              Select a farm to view its zones
              and monitoring data.
            </p>
          </div>

          <div className="page-count">
            <span>{farms.length}</span>

            <small>
              {farms.length === 1
                ? 'Farm'
                : 'Farms'}
            </small>
          </div>

        </div>

        {/* FARMS */}

        {farms.length === 0 ? (
          <div className="empty-state">

            <div className="empty-state-icon">
              <Building2 size={28} />
            </div>

            <h2>No farms found</h2>

            <p>
              There are currently no farms
              assigned to your account.
            </p>

          </div>
        ) : (
          <div className="farm-grid">

            {farms.map((farm) => (
              <div
                key={farm.id}
                className="farm-card"
                onClick={() =>
                  handleFarmClick(farm.id)
                }
              >

                <div className="farm-card-top">

                  <div className="farm-icon">
                    <Building2 size={23} />
                  </div>

                  <div className="farm-arrow">
                    <ArrowRight size={18} />
                  </div>

                </div>

                <div className="farm-card-content">

                  <h2>{farm.name}</h2>

                  <p>
                    Farm ID: {farm.id}
                  </p>

                </div>

                <div className="farm-card-footer">
                  <span>
                    View zones
                  </span>

                  <ArrowRight size={15} />
                </div>

              </div>
            ))}

          </div>
        )}

      </main>
    </div>
  );
}

export default FarmPage;