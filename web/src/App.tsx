import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from '@/contexts/theme-context';
import LandingPage from '@/pages/landing';
import DashboardPage from '@/pages/dashboard';
import CapacityPage from '@/pages/capacity';
import LeasesPage from '@/pages/leases';
import ExplainPage from '@/pages/explain';
import SettingsPage from '@/pages/settings';

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/dashboard/capacity" element={<CapacityPage />} />
          <Route path="/dashboard/leases" element={<LeasesPage />} />
          <Route path="/dashboard/explain" element={<ExplainPage />} />
          <Route path="/dashboard/settings" element={<SettingsPage />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
