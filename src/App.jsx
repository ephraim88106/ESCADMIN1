import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Handoff from './pages/Handoff';
import Notices from './pages/Notices';
import Checklist from './pages/Checklist';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/store/:storeId/schedule" element={<Schedule />} />
          <Route path="/store/:storeId/handoff" element={<Handoff />} />
          <Route path="/store/:storeId/notices" element={<Notices />} />
          <Route path="/store/:storeId/checklist" element={<Checklist />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
