import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

export default function CreateSchedule() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    durationMinutes: 60,
    organizerName: '',
    organizerEmail: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const schedule = await api.createSchedule(form);
      navigate(`/schedule/${schedule.id}`);
    } catch (err) {
      alert('作成に失敗しました: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">スケジュール作成</h1>
          <p className="section-subtitle">新しいスケジュールを作成して参加者を招待しましょう</p>
        </div>
      </div>

      <div className="glass-card-static" style={{ maxWidth: 640 }}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">タイトル *</label>
            <input
              className="form-input"
              name="title"
              placeholder="例: 第4回チームミーティング"
              value={form.title}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">説明（任意）</label>
            <textarea
              className="form-textarea"
              name="description"
              placeholder="ミーティングの目的や議題など"
              value={form.description}
              onChange={handleChange}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">候補開始日 *</label>
              <input
                className="form-input"
                type="date"
                name="startDate"
                value={form.startDate}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">候補終了日 *</label>
              <input
                className="form-input"
                type="date"
                name="endDate"
                value={form.endDate}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">所要時間（分） *</label>
            <input
              className="form-input"
              type="number"
              name="durationMinutes"
              min="1"
              placeholder="例: 60"
              value={form.durationMinutes}
              onChange={handleChange}
              required
            />
            <span className="text-sm text-muted">分単位で入力してください（例: 90 = 1時間30分）</span>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">主催者名</label>
              <input
                className="form-input"
                name="organizerName"
                placeholder="あなたの名前"
                value={form.organizerName}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label className="form-label">主催者メール</label>
              <input
                className="form-input"
                type="email"
                name="organizerEmail"
                placeholder="you@example.com"
                value={form.organizerEmail}
                onChange={handleChange}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>
              {submitting ? '作成中...' : '📅 スケジュールを作成'}
            </button>
            <button type="button" className="btn btn-secondary btn-lg" onClick={() => navigate('/')}>
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
