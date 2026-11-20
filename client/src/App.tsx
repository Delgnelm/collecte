import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { FieldTeamPage } from './pages/FieldTeamPage';
import { PublicPortalPage } from './pages/PublicPortalPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PublicPortalPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="/terrain/:accessToken" element={<FieldTeamPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
