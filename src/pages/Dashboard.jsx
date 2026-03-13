import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Dashboard() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSchedules()
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('このスケジュールを削除しますか？')) return;
    await api.deleteSchedule(id);
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⏳</div>
        <div className="empty-state-title">読み込み中...</div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">ダッシュボード</h1>
          <p className="section-subtitle">スケジュール調整の一覧</p>
        </div>
        <Link to="/create" className="btn btn-primary">＋ 新規作成</Link>
      </div>

      {schedules.length === 0 ? (
        <div className="glass-card-static">
          <div className="empty-state">
            <div className="empty-state-icon">📅</div>
            <div className="empty-state-title">スケジュールがありません</div>
            <p className="empty-state-desc">
              新しいスケジュールを作成して、参加者を招待しましょう。
            </p>
            <Link to="/create" className="btn btn-primary btn-lg">最初のスケジュールを作成</Link>
          </div>
        </div>
      ) : (
        <div className="schedule-grid">
          {schedules.map(schedule => (
            <Link
              key={schedule.id}
              to={`/schedule/${schedule.id}`}
              className="glass-card schedule-card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="schedule-card-icon">
                {schedule.status === 'finalized' ? '✅' : '📅'}
              </div>
              <div className="schedule-card-body">
                <div className="schedule-card-title">{schedule.title}</div>
                <div className="schedule-card-meta">
                  <span>📆 {formatDate(schedule.startDate)} 〜 {formatDate(schedule.endDate)}</span>
                  <span>⏱ {schedule.durationMinutes}分</span>
                  <span>👥 {schedule.respondedCount}/{schedule.participantCount} 回答済み</span>
                  <span className={`badge ${schedule.status === 'finalized' ? 'badge-success' : 'badge-info'}`}>
                    {schedule.status === 'finalized' ? '確定済み' : '募集中'}
                  </span>
                </div>
              </div>
              <div className="schedule-card-actions">
                <button
                  className="btn btn-danger btn-sm"
                  onClick={(e) => handleDelete(schedule.id, e)}
                >
                  🗑
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
