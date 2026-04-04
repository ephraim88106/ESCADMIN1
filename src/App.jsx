import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import Schedule from './pages/Schedule';
import Handoff from './pages/Handoff';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/store/:storeId/employees" element={<Employees />} />
          <Route path="/store/:storeId/schedule" element={<Schedule />} />
          <Route path="/store/:storeId/handoff" element={<Handoff />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
