import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Board from './components/Board';
import Dashboard from './pages/Dashboard';
import Schedule from './pages/Schedule';
import Handoff from './pages/Handoff';
import Notices from './pages/Notices';
import Checklist from './pages/Checklist';
import Inventory from './pages/Inventory';
import Orders from './pages/Orders';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/store/:storeId/schedule" element={<Schedule />} />
          <Route path="/store/:storeId/checklist" element={<Checklist />} />
          <Route path="/store/:storeId/inventory" element={<Inventory />} />
          <Route path="/store/:storeId/board" element={<Board />}>
            <Route path="orders" element={<Orders />} />
            <Route path="handoff" element={<Handoff />} />
            <Route path="notices" element={<Notices />} />
            <Route index element={<Navigate to="orders" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
