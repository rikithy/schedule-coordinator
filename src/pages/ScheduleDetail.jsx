import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api';

const TABS = [
  { id: 'overview', label: '概要' },
  { id: 'participants', label: '参加者ステータス' },
  { id: 'visualization', label: '空き状況一覧' },
  { id: 'slots', label: '空きスロット検索' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function generateDays(startDate, endDate) {
  const days = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

// Assign distinct colors to participants
const PARTICIPANT_COLORS = [
  '#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316', '#6366f1', '#14b8a6', '#e11d48',
];

export default function ScheduleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [tab, setTab] = useState('overview');
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [slotSelections, setSlotSelections] = useState({});
  const [vizData, setVizData] = useState(null);
  const [vizLoading, setVizLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ startDate: '', endDate: '', durationMinutes: 60 });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const reload = async () => {
    try {
      const s = await api.getSchedule(id);
      setSchedule(s);
      setParticipants(s.participants || []);
    } catch {
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [id]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteName.trim()) return;
    await api.addParticipant(id, { name: inviteName, email: inviteEmail });
    setInviteName('');
    setInviteEmail('');
    setShowInvite(false);
    showToast(`${inviteName} を招待しました`);
    reload();
  };

  const handleSearchSlots = async () => {
    setSlotsLoading(true);
    try {
      const result = await api.getSlots(id);
      const rawSlots = result.slots || [];
      
      let merged = [];
      try {
        const sorted = [...rawSlots].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        for (const slot of sorted) {
          if (merged.length === 0) {
            merged.push({ ...slot, originalSlots: [slot] });
            continue;
          }
          const last = merged[merged.length - 1];
          const isConsecutive = new Date(last.end).getTime() === new Date(slot.start).getTime();

          
          const ap1 = (last.availableParticipants || []).map(p => p.id || p.name).sort().join(',');
          const ap2 = (slot.availableParticipants || []).map(p => p.id || p.name).sort().join(',');
          const up1 = (last.unavailableParticipants || []).map(p => p.id || p.name).sort().join(',');
          const up2 = (slot.unavailableParticipants || []).map(p => p.id || p.name).sort().join(',');
          const isSameParticipants = (ap1 === ap2 && up1 === up2);
          
          if (isConsecutive && isSameParticipants) {
            last.end = slot.end;
            last.originalSlots.push(slot);
          } else {
            merged.push({ ...slot, originalSlots: [slot] });
          }
        }
        // パーセンテージ降順→日時昇順でソート（100%スロットが常に先頭）
        merged.sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0) || new Date(a.start).getTime() - new Date(b.start).getTime());
      } catch (mergeErr) {
        console.error('Merge error:', mergeErr);
        merged = rawSlots.map(s => ({ ...s, originalSlots: [s] }));
      }
      
      setSlots(merged);
      setSlotSelections({});
    } catch (err) {
      console.error(err);
      showToast('スロット検索に失敗しました', 'error');
    } finally {
      setSlotsLoading(false);
    }
  };

  const handleLoadViz = async () => {
    setVizLoading(true);
    try {
      const data = await api.getAvailabilityOverview(id);
      setVizData(data);
    } catch (err) {
      showToast('空き状況の取得に失敗しました', 'error');
    } finally {
      setVizLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!selectedSlot) return;
    if (!confirm('このスロットで確定しますか？')) return;
    try {
      await api.finalizeSchedule(id, selectedSlot);
      showToast('スケジュールを確定しました！');
      reload();
    } catch (err) {
      showToast('確定に失敗しました', 'error');
    }
  };

  const handleRemind = async (pid, name) => {
    try {
      await api.remindParticipant(id, pid);
      showToast(`${name} にリマインダーを送信しました`);
    } catch {
      showToast('リマインダーの送信に失敗しました', 'error');
    }
  };

  const handleRemindAll = async () => {
    try {
      const result = await api.remindAll(id);
      showToast(`未回答者 ${result.count} 人にリマインダーを送信しました`);
    } catch {
      showToast('リマインダーの送信に失敗しました', 'error');
    }
  };

  const formatDateTime = (iso) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const formatTimeOnly = (iso) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const getBarClass = (pct) => {
    if (pct === 100) return 'excellent';
    if (pct >= 75) return 'good';
    if (pct >= 50) return 'fair';
    return 'poor';
  };

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-title">読み込み中...</div></div>;
  }

  if (!schedule) return null;

  const respondedCount = participants.filter(p => p.responded).length;
  const pendingCount = participants.length - respondedCount;

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">{schedule.title}</h1>
          <p className="section-subtitle">
            {schedule.description || `${new Date(schedule.startDate).toLocaleDateString('ja-JP')} 〜 ${new Date(schedule.endDate).toLocaleDateString('ja-JP')} · ${schedule.durationMinutes}分`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {schedule.status === 'open' && (
            <button className="btn btn-accent btn-sm" onClick={() => setShowInvite(true)}>
              ＋ 参加者を追加
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>← 戻る</button>
        </div>
      </div>

      {schedule.status === 'finalized' && (
        <div className="finalized-banner mb-2">
          <h3>✅ スケジュール確定済み</h3>
          <p>{formatDateTime(schedule.finalizedSlot.start)} 〜 {formatTimeOnly(schedule.finalizedSlot.end)}</p>
        </div>
      )}

      <div className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => {
              setTab(t.id);
              if (t.id === 'slots' && slots.length === 0) handleSearchSlots();
              if (t.id === 'visualization' && !vizData) handleLoadViz();
            }}
          >
            {t.label}
            {t.id === 'participants' && pendingCount > 0 && (
              <span className="badge badge-warning" style={{ marginLeft: 6 }}>{pendingCount}</span>
            )}
          </button>
        ))}
      </div>

      {/* === Overview Tab === */}
      {tab === 'overview' && (
        <div className="glass-card-static">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>概要</h3>
            {schedule.status === 'open' && !editing && (
              <button className="btn btn-secondary btn-sm" onClick={() => {
                setEditing(true);
                setEditForm({
                  startDate: schedule.startDate,
                  endDate: schedule.endDate,
                  durationMinutes: schedule.durationMinutes,
                });
              }}>✏️ 編集</button>
            )}
            {editing && (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary btn-sm" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await api.updateSchedule(id, editForm);
                    showToast('スケジュールを更新しました');
                    setEditing(false);
                    reload();
                  } catch (err) {
                    showToast('更新に失敗しました', 'error');
                  } finally {
                    setSaving(false);
                  }
                }}>{saving ? '保存中...' : '✔ 保存'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>キャンセル</button>
              </div>
            )}
          </div>

          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">候補開始日</label>
                <input className="form-input" type="date" value={editForm.startDate} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">候補終了日</label>
                <input className="form-input" type="date" value={editForm.endDate} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">所要時間（分）</label>
                <input className="form-input" type="number" min="1" value={editForm.durationMinutes} onChange={e => setEditForm(f => ({ ...f, durationMinutes: e.target.value }))} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
              <div>
                <div className="form-label">候補日範囲</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  {new Date(schedule.startDate).toLocaleDateString('ja-JP')} 〜 {new Date(schedule.endDate).toLocaleDateString('ja-JP')}
                </div>
              </div>
              <div>
                <div className="form-label">所要時間</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{schedule.durationMinutes}分</div>
              </div>
              <div>
                <div className="form-label">参加者</div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                  {respondedCount}/{participants.length} 回答済み
                </div>
              </div>
              <div>
                <div className="form-label">ステータス</div>
                <span className={`badge ${schedule.status === 'finalized' ? 'badge-success' : 'badge-info'}`}>
                  {schedule.status === 'finalized' ? '確定済み' : '募集中'}
                </span>
              </div>
            </div>
          )}
          {participants.length > 0 && (
            <div className="mt-3">
              <div className="form-label mb-1">回答用リンク（参加者に共有してください）</div>
              {participants.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                  <span style={{ fontWeight: 600, minWidth: 80 }}>{p.name}:</span>
                  <code style={{ background: 'var(--surface-200)', padding: '0.25rem 0.5rem', borderRadius: 4, fontSize: '0.8125rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {window.location.origin}/respond/{id}/{p.id}
                  </code>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/respond/${id}/${p.id}`);
                      showToast('リンクをコピーしました');
                    }}
                  >📋</button>
                  {p.responded ? (
                    <button
                      className="btn btn-sm"
                      style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', background: 'var(--success-400)', color: '#fff', opacity: 0.85 }}
                      onClick={() => navigate(`/respond/${id}/${p.id}`)}
                    >✅ 回答済み・再回答</button>
                  ) : (
                    <button
                      className="btn btn-accent btn-sm"
                      style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                      onClick={() => navigate(`/respond/${id}/${p.id}`)}
                    >📝 回答する</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === Participants Tab === */}
      {tab === 'participants' && (
        <div className="glass-card-static">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>参加者ステータス</h3>
            {pendingCount > 0 && (
              <button className="btn btn-accent btn-sm" onClick={handleRemindAll}>
                📧 未回答者全員にリマインダー ({pendingCount}人)
              </button>
            )}
          </div>
          {participants.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">👥</div>
              <div className="empty-state-title">参加者がいません</div>
              <p className="empty-state-desc">参加者を招待してください</p>
            </div>
          ) : (
            <div className="participant-list">
              {participants.map(p => (
                <div key={p.id} className="participant-item">
                  <div className={`participant-avatar ${p.responded ? 'responded' : 'pending'}`}>
                    {p.name[0]}
                  </div>
                  <div className="participant-info">
                    <div className="participant-name">{p.name}</div>
                    <div className="participant-email">
                      {p.email || 'メール未設定'}
                      {p.inputMethod && <span style={{ marginLeft: 8 }} className="badge badge-info">{p.inputMethod === 'manual' ? '手動入力' : 'カレンダー連携'}</span>}
                    </div>
                  </div>
                  <span className={`badge ${p.responded ? 'badge-success' : 'badge-warning'}`}>
                    {p.responded ? '回答済み' : '未回答'}
                  </span>
                  {!p.responded && (
                    <button className="btn btn-ghost btn-sm" onClick={() => handleRemind(p.id, p.name)}>
                      📧
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* === Slots Tab === */}
      {tab === 'slots' && (
        <div className="glass-card-static">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>空きスロット検索結果</h3>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={handleSearchSlots} disabled={slotsLoading}>
                {slotsLoading ? '検索中...' : '🔄 再検索'}
              </button>
              {selectedSlot && schedule.status === 'open' && (
                <button className="btn btn-primary btn-sm" onClick={handleFinalize}>
                  ✅ このスロットで確定
                </button>
              )}
            </div>
          </div>

          {(() => {
            const visibleSlots = slots.filter(s => s.percentage == null || s.percentage > 0).slice(0, 50);
            if (slots.length === 0 || visibleSlots.length === 0) return (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div className="empty-state-title">
                  {slotsLoading ? '検索中...' : '対象のスロットがありません'}
                </div>
                <p className="empty-state-desc">参加者の回答が集まってから再検索してください</p>
              </div>
            );
            return (
            <div className="slot-list">
              {visibleSlots.map((slot, i) => {
                const subSel = slotSelections[i] !== undefined ? slotSelections[i] : 'all';
                let chosenSlot = { start: slot.start, end: slot.end };
                if (subSel !== 'all' && slot.originalSlots && slot.originalSlots[subSel]) {
                  chosenSlot = slot.originalSlots[subSel];
                }
                const isSelected = selectedSlot && selectedSlot.start === chosenSlot.start && selectedSlot.end === chosenSlot.end;

                return (
                  <div
                    key={i}
                    className={`slot-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedSlot({ start: chosenSlot.start, end: chosenSlot.end })}
                  >
                    <div>
                      <div className="slot-time">
                        {formatTimeOnly(slot.start)} 〜 {formatTimeOnly(slot.end)}
                        {slot.originalSlots && slot.originalSlots.length > 1 && (() => {
                          const hours = Math.round((new Date(slot.end) - new Date(slot.start)) / 3600000);
                          return (
                            <span style={{ fontSize: '0.75rem', marginLeft: '6px', padding: '1px 6px', borderRadius: '999px', background: 'rgba(99,102,241,0.15)', color: 'var(--primary-400)', fontWeight: 600 }}>
                              最大{hours}時間枠
                            </span>
                          );
                        })()}
                      </div>
                      <div className="slot-date">
                        {new Date(slot.start).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
                      </div>
                      {slot.originalSlots && slot.originalSlots.length > 1 && isSelected && (
                        <div className="mt-2" onClick={e => e.stopPropagation()}>
                          <label className="text-sm" style={{ display: 'block', marginBottom: '4px', color: 'var(--text-secondary)', fontWeight: 600 }}>この枠内の時間を選択:</label>
                          <select 
                            className="form-input" 
                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%' }}
                            value={subSel}
                            onChange={e => {
                              const val = e.target.value;
                              setSlotSelections(prev => ({ ...prev, [i]: val }));
                              if (val === 'all') {
                                setSelectedSlot({ start: slot.start, end: slot.end });
                              } else {
                                const os = slot.originalSlots[Number(val)];
                                setSelectedSlot({ start: os.start, end: os.end });
                              }
                            }}
                          >
                            {(() => {
                              const hours = Math.round((new Date(slot.end) - new Date(slot.start)) / 3600000);
                              return <option value="all">🕐 枠全体（最大{hours}時間）{formatTimeOnly(slot.start)}〜{formatTimeOnly(slot.end)}</option>;
                            })()}
                            {slot.originalSlots.map((os, idx) => {
                              const durMin = Math.round((new Date(os.end) - new Date(os.start)) / 60000);
                              return (
                                <option key={idx} value={idx}>{formatTimeOnly(os.start)} 〜 {formatTimeOnly(os.end)}（{durMin}分）</option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="slot-bar-container">
                        <div
                          className={`slot-bar ${getBarClass(slot.percentage)}`}
                          style={{ width: `${slot.percentage}%` }}
                        />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                        {(slot.availableParticipants || []).map(p => p.name).join(', ')}
                        {slot.unavailableParticipants && slot.unavailableParticipants.length > 0 && (
                          <span style={{ color: 'var(--danger-400)', marginLeft: 8 }}>
                            ✕ {(slot.unavailableParticipants || []).map(p => p.name).join(', ')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="slot-percentage" style={{ color: slot.percentage === 100 ? 'var(--success-400)' : 'var(--text-secondary)' }}>
                      {slot.percentage}%
                    </div>
                  </div>
                );
              })}
            </div>
          );})()}
        </div>
      )}

      {/* === Visualization Tab === */}
      {tab === 'visualization' && (
        <div className="glass-card-static">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>空き状況一覧</h3>
            <button className="btn btn-secondary btn-sm" onClick={handleLoadViz} disabled={vizLoading}>
              {vizLoading ? '読込中...' : '🔄 更新'}
            </button>
          </div>

          {!vizData || vizData.participants.filter(p => p.responded).length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📊</div>
              <div className="empty-state-title">回答データがありません</div>
              <p className="empty-state-desc">参加者が回答してから再度確認してください</p>
            </div>
          ) : (() => {
            const days = generateDays(vizData.schedule.startDate, vizData.schedule.endDate);
            const respondedParticipants = vizData.participants.filter(p => p.responded);

            // Build busy map: for each day+hour, which participants are busy
            const busyMap = {}; // key: `${dayIdx}-${hour}` => Set of participant ids
            respondedParticipants.forEach(p => {
              p.blocks.forEach(block => {
                const bStart = new Date(block.start);
                const bEnd = new Date(block.end);
                days.forEach((day, dayIdx) => {
                  if (bStart.toDateString() === day.toDateString()) {
                    // Mark all hours this block covers
                    for (let h = bStart.getHours(); h < bEnd.getHours(); h++) {
                      const key = `${dayIdx}-${h}`;
                      if (!busyMap[key]) busyMap[key] = new Set();
                      busyMap[key].add(p.id);
                    }
                  }
                });
              });
            });

            const totalP = respondedParticipants.length;

            return (
              <div>
                {/* Legend */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
                  <span className="text-sm" style={{ fontWeight: 600 }}>凡例:</span>
                  {respondedParticipants.map((p, i) => (
                    <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem' }}>
                      <span style={{
                        width: 12, height: 12, borderRadius: 2,
                        background: PARTICIPANT_COLORS[i % PARTICIPANT_COLORS.length],
                        display: 'inline-block',
                      }} />
                      {p.name}(NG)
                    </span>
                  ))}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.8125rem', marginLeft: '1rem' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(16, 185, 129, 0.25)', display: 'inline-block', border: '1px solid rgba(16, 185, 129, 0.4)' }} />
                    全員OK
                  </span>
                </div>

                {/* Grid */}
                <div style={{ overflowX: 'auto' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `60px repeat(${days.length}, minmax(80px, 1fr))`,
                    gap: '2px',
                    minWidth: Math.max(600, days.length * 80 + 60),
                  }}>
                    {/* Header */}
                    <div />
                    {days.map((day, dayIdx) => (
                      <div key={dayIdx} className="ng-day-label">
                        {`${day.getMonth() + 1}/${day.getDate()}(${WEEKDAYS[day.getDay()]})`}
                      </div>
                    ))}

                    {/* Rows */}
                    {HOURS.map(hour => (
                      <>
                        <div key={`lbl-${hour}`} className="ng-time-label">
                          {String(hour).padStart(2, '0')}:00
                        </div>
                        {days.map((_day, dayIdx) => {
                          const key = `${dayIdx}-${hour}`;
                          const busySet = busyMap[key];
                          const busyCount = busySet ? busySet.size : 0;
                          const allFree = busyCount === 0;

                          if (allFree) {
                            return (
                              <div
                                key={key}
                                style={{
                                  minHeight: 28,
                                  borderRadius: 3,
                                  background: 'rgba(16, 185, 129, 0.15)',
                                  border: '1px solid rgba(16, 185, 129, 0.2)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: '0.625rem', color: 'var(--success-400)',
                                }}
                                title={`${String(hour).padStart(2,'0')}:00 — 全員OK`}
                              >
                                ✓
                              </div>
                            );
                          }

                          // Show colored segments for who is busy
                          const busyParticipants = respondedParticipants.filter(p => busySet.has(p.id));
                          return (
                            <div
                              key={key}
                              style={{
                                minHeight: 28,
                                borderRadius: 3,
                                background: busyCount === totalP
                                  ? 'rgba(239, 68, 68, 0.2)'
                                  : 'rgba(239, 68, 68, 0.08)',
                                border: `1px solid rgba(239, 68, 68, ${busyCount === totalP ? 0.3 : 0.15})`,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '2px',
                                padding: '2px 4px',
                                flexWrap: 'wrap',
                              }}
                              title={`${String(hour).padStart(2, '0')}:00 — NG: ${busyParticipants.map(p => p.name).join(', ')}`}
                            >
                              {busyParticipants.map((p) => {
                                const colorIdx = respondedParticipants.findIndex(rp => rp.id === p.id);
                                return (
                                  <span
                                    key={p.id}
                                    style={{
                                      width: 16, height: 16, borderRadius: 3,
                                      background: PARTICIPANT_COLORS[colorIdx % PARTICIPANT_COLORS.length],
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      fontSize: '0.5625rem', color: 'white', fontWeight: 700,
                                      flexShrink: 0,
                                    }}
                                    title={`${p.name}: NG`}
                                  >
                                    {p.name[0]}
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })}
                      </>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="modal-overlay" onClick={() => setShowInvite(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">参加者を招待</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowInvite(false)}>✕</button>
            </div>
            <form onSubmit={handleInvite}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">名前 *</label>
                  <input className="form-input" value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="参加者の名前" required />
                </div>
                <div className="form-group">
                  <label className="form-label">メールアドレス（任意）</label>
                  <input className="form-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="participant@example.com" />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInvite(false)}>キャンセル</button>
                <button type="submit" className="btn btn-primary">招待する</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className={`toast ${toast.type}`}>{toast.msg}</div>
        </div>
      )}
    </div>
  );
}
