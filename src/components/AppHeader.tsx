import { LogOut, Sprout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  title?: string;
  subtitle?: string;
}

function AppHeader({
  title = 'Agri Monitor',
  subtitle = 'IoT Agriculture',
}: AppHeaderProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    navigate('/login', { replace: true });
  };

  return (
    <header className="app-header">
      <div className="app-header-inner">

        {/* BRAND */}

        <div className="app-brand">
          <div className="app-brand-icon">
            <Sprout size={21} strokeWidth={2.2} />
          </div>

          <div className="app-brand-text">
            <span className="app-brand-title">
              {title}
            </span>

            <span className="app-brand-subtitle">
              {subtitle}
            </span>
          </div>
        </div>

        {/* LOGOUT */}

        <button
          type="button"
          className="logout-button"
          onClick={handleLogout}
        >
          <LogOut size={17} />

          <span>Logout</span>
        </button>

      </div>
    </header>
  );
}

export default AppHeader;