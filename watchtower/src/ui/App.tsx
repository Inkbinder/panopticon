import { Link, Route, Routes } from 'react-router-dom';
import { OverseerDashboardPage } from './pages/OverseerDashboardPage';
import { CellDashboardPage } from './pages/CellDashboardPage';

export function App() {
  return (
    <div className="container">
      <header className="header">
        <div className="brand">
          <strong>Watchtower</strong>
          <span>Panopticon overseer & cell dashboards</span>
        </div>
        <nav style={{ display: 'flex', gap: 10 }}>
          <Link className="btn" to="/">Overseer</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<OverseerDashboardPage />} />
        <Route path="/cells/:cellId" element={<CellDashboardPage />} />
      </Routes>
    </div>
  );
}
