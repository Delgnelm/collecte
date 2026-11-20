import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { FieldTeamPage } from './pages/FieldTeamPage';
import { PublicPortalPage } from './pages/PublicPortalPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/t/:slug" element={<PublicPortalPage mode="donor" />} />
        <Route path="/t/:slug/benevole" element={<PublicPortalPage mode="volunteer" />} />
        <Route path="/t/:slug/benevoles" element={<PublicPortalPage mode="volunteer" />} />
        <Route path="/terrain/:accessToken" element={<FieldTeamPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
