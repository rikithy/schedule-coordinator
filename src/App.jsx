import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import CreateSchedule from './pages/CreateSchedule';
import ScheduleDetail from './pages/ScheduleDetail';
import RespondPage from './pages/RespondPage';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <nav className="navbar">
          <div className="navbar-inner">
            <Link to="/" className="navbar-brand">
              <div className="navbar-logo">S</div>
              <span className="navbar-title">Schedule Sync</span>
            </Link>
            <div className="navbar-nav">
              <Link to="/create" className="btn btn-primary btn-sm">＋ 新規作成</Link>
            </div>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/create" element={<CreateSchedule />} />
            <Route path="/schedule/:id" element={<ScheduleDetail />} />
            <Route path="/respond/:scheduleId/:participantId" element={<RespondPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
