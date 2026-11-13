import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import FarmPage from './pages/FarmPage';
import ZonePage from './pages/ZonePage';
import DashboardPage from './pages/DashboardPage';
import AIChatWidget from './components/AIChatWidget';

function App() {
  const location = useLocation();

  // Kiểm tra người dùng đã đăng nhập
  const isAuthenticated = Boolean(
    localStorage.getItem('accessToken')
  );

  // Không hiển thị AI ở trang đăng nhập
  const showAIChat =
    isAuthenticated && location.pathname !== '/login';

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/login" replace />}
        />

        <Route
          path="/login"
          element={<LoginPage />}
        />

        <Route
          path="/farms"
          element={<FarmPage />}
        />

        <Route
          path="/farms/:farmId"
          element={<ZonePage />}
        />

        <Route
          path="/zones/:zoneId"
          element={<DashboardPage />}
        />
      </Routes>

      {showAIChat && <AIChatWidget />}
    </>
  );
}

export default App;