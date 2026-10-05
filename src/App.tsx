import {
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import FarmPage from './pages/FarmPage';
import ZonePage from './pages/ZonePage';
import DashboardPage from './pages/DashboardPage';

function App() {
  return (
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
  );
}

export default App;