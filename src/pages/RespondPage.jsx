import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

// Generate time slots for a day (0:00-23:00, 1-hour intervals)
function generateTimeSlots() {
  const slots = [];
  for (let h = 0; h < 24; h++) {
    slots.push({ hour: h, minute: 0, label: `${String(h).padStart(2, '0')}:00` });
  }
  return slots;
}

// Generate days from startDate to endDate
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

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const TIME_SLOTS = generateTimeSlots();

export default function RespondPage() {
  const { scheduleId, participantId } = useParams();
  const navigate = useNavigate();
  const [schedule, setSchedule] = useState(null);
  const [participant, setParticipant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // NG grid: Record<dayIndex, Set<slotIndex>>
  const [ngBlocks, setNgBlocks] = useState({});
  // Clipboard for copy
  const [clipboard, setClipboard] = useState(null);
  
  // Multiple Calendar Selection State
  const [calendarList, setCalendarList] = useState([]);
  const [selectedCalendars, setSelectedCalendars] = useState([]);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState(null); // 'add' or 'remove'
  const [dragStartDay, setDragStartDay] = useState(null);
  const gridRef = useRef(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    async function load() {
      const isAuthSuccess = new URLSearchParams(window.location.search).get('auth') === 'success';
      try {
        const s = await api.getSchedule(scheduleId);
        setSchedule(s);
        const p = (s.participants || []).find(pp => pp.id === participantId);
        setParticipant(p || null);

        if (p && isAuthSuccess) {
          setLoadingCalendar(true);
          try {
            const list = await api.getCalendarList(participantId);
            setCalendarList(list);
            // Default to selecting the primary calendar
            const primary = list.find(c => c.primary);
            if (primary) {
              setSelectedCalendars([primary.id]);
            } else if (list.length > 0) {
              setSelectedCalendars([list[0].id]);
            }
            setShowCalendarModal(true);
            
            // Re-write URL to remove auth=success so a page refresh doesn't trigger modal again
            window.history.replaceState({}, '', window.location.pathname);
          } catch (err) {
            console.error('Calendar list error:', err);
            showToast('カレンダーの取得に失敗しました', 'error');
            window.history.replaceState({}, '', window.location.pathname);
          } finally {
            setLoadingCalendar(false);
          }
        } else if (p && p.responded) {
          try {
            const blocks = await api.getAvailability(participantId);
            const days = generateDays(s.startDate, s.endDate);
            const ngMap = {};
            blocks.forEach(block => {
              const blockStart = new Date(block.start);
              days.forEach((day, dayIdx) => {
                if (blockStart.toDateString() === day.toDateString()) {
                  const slotIdx = TIME_SLOTS.findIndex(
                    ts => ts.hour === blockStart.getHours() && ts.minute === blockStart.getMinutes()
                  );
                  if (slotIdx >= 0) {
                    if (!ngMap[dayIdx]) ngMap[dayIdx] = new Set();
                    ngMap[dayIdx].add(slotIdx);
                  }
                }
              });
            });
            setNgBlocks(ngMap);
          } catch { /* no existing data */ }
        }
      } catch {
        navigate('/');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scheduleId, participantId]);

  const days = schedule ? generateDays(schedule.startDate, schedule.endDate) : [];

  // Toggle a single cell
  const toggleCell = (dayIdx, slotIdx) => {
    setNgBlocks(prev => {
      const next = { ...prev };
      if (!next[dayIdx]) next[dayIdx] = new Set();
      else next[dayIdx] = new Set(next[dayIdx]);
      if (next[dayIdx].has(slotIdx)) {
        next[dayIdx].delete(slotIdx);
      } else {
        next[dayIdx].add(slotIdx);
      }
      return next;
    });
  };

  // Set cell to specific state during drag
  const setCellState = (dayIdx, slotIdx, busy) => {
    setNgBlocks(prev => {
      const next = { ...prev };
      if (!next[dayIdx]) next[dayIdx] = new Set();
      else next[dayIdx] = new Set(next[dayIdx]);
      if (busy) {
        next[dayIdx].add(slotIdx);
      } else {
        next[dayIdx].delete(slotIdx);
      }
      return next;
    });
  };

  // Mouse handlers for drag selection
  const handleMouseDown = (dayIdx, slotIdx) => {
    const currentlyBusy = ngBlocks[dayIdx]?.has(slotIdx);
    setIsDragging(true);
    setDragMode(currentlyBusy ? 'remove' : 'add');
    setDragStartDay(dayIdx);
    setCellState(dayIdx, slotIdx, !currentlyBusy);
  };

  const handleMouseEnter = (dayIdx, slotIdx) => {
    if (!isDragging) return;
    if (dayIdx !== dragStartDay) return; // Only drag within same day
    setCellState(dayIdx, slotIdx, dragMode === 'add');
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragMode(null);
    setDragStartDay(null);
  };

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // Copy day pattern
  const copyDay = (dayIdx) => {
    const slots = ngBlocks[dayIdx] ? new Set(ngBlocks[dayIdx]) : new Set();
    setClipboard(slots);
    showToast(`${formatDayLabel(days[dayIdx])} のパターンをコピーしました`, 'info');
  };

  // Paste to a day
  const pasteDay = (dayIdx) => {
    if (!clipboard) {
      showToast('先にコピーしてください', 'error');
      return;
    }
    setNgBlocks(prev => ({ ...prev, [dayIdx]: new Set(clipboard) }));
    showToast(`${formatDayLabel(days[dayIdx])} にペーストしました`);
  };

  // Weekly repeat: apply first 7 days' pattern to the rest
  const applyWeeklyRepeat = () => {
    if (days.length <= 7) {
      showToast('候補日が1週間以内のため繰り返し不要です', 'info');
      return;
    }
    setNgBlocks(prev => {
      const next = { ...prev };
      for (let i = 7; i < days.length; i++) {
        const sourceIdx = i % 7;
        if (prev[sourceIdx]) {
          next[i] = new Set(prev[sourceIdx]);
        } else {
          next[i] = new Set();
        }
      }
      return next;
    });
    showToast('最初の1週間のパターンを残りの週に適用しました');
  };

  // Clear all
  const clearAll = () => {
    setNgBlocks({});
    showToast('すべてクリアしました', 'info');
  };

  const handleGoogleAuth = () => {
    // API_BASE is imported from '../api', which handles the environment variable
    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';
    window.location.href = `${apiBase}/auth/google?pid=${participantId}`;
  };

  // Handle FreeBusy fetch after calendar selection
  const handleSyncCalendars = async () => {
    if (selectedCalendars.length === 0) {
      showToast('少なくとも1つのカレンダーを選択してください', 'error');
      return;
    }
    
    setLoadingCalendar(true);
    setShowCalendarModal(false);
    
    try {
      const res = await api.getFreeBusy(participantId, schedule.startDate, schedule.endDate, selectedCalendars);
      const calendarDays = generateDays(schedule.startDate, schedule.endDate);
      const ngMap = { ...ngBlocks }; // Merge with existing manual blocks or start fresh
      
      res.busy.forEach(block => {
        const blockStart = new Date(block.start);
        const blockEnd = new Date(block.end);
        let current = new Date(blockStart);
        current.setMinutes(0, 0, 0);

        while(current < blockEnd) {
          calendarDays.forEach((day, dayIdx) => {
            if (current.toDateString() === day.toDateString()) {
              const slotIdx = TIME_SLOTS.findIndex(ts => ts.hour === current.getHours());
              if (slotIdx >= 0) {
                if (!ngMap[dayIdx]) ngMap[dayIdx] = new Set();
                ngMap[dayIdx].add(slotIdx);
              }
            }
          });
          current.setHours(current.getHours() + 1);
        }
      });
      setNgBlocks(ngMap);
      showToast('Googleカレンダーから予定を読み込んて反映しました🎉', 'success');
    } catch (err) {
      console.error('Calendar sync error:', err);
      showToast('予定の同期に失敗しました', 'error');
    } finally {
      setLoadingCalendar(false);
    }
  };

  // Submit
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const blocks = [];
      Object.entries(ngBlocks).forEach(([dayIdxStr, slotSet]) => {
        const dayIdx = Number(dayIdxStr);
        if (!days[dayIdx]) return;
        slotSet.forEach(slotIdx => {
          const slot = TIME_SLOTS[slotIdx];
          if (!slot) return;
          const start = new Date(days[dayIdx]);
          start.setHours(slot.hour, slot.minute, 0, 0);
          const end = new Date(start);
          end.setMinutes(end.getMinutes() + 60);
          blocks.push({ start: start.toISOString(), end: end.toISOString() });
        });
      });
      await api.submitAvailability(participantId, { blocks, inputMethod: 'manual' });
      showToast('回答を送信しました！ 🎉');
      setTimeout(() => navigate(`/schedule/${scheduleId}`), 1500);
    } catch (err) {
      showToast('送信に失敗しました: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDayLabel = (d) => {
    return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`;
  };

  const getNgCount = (dayIdx) => {
    return ngBlocks[dayIdx] ? ngBlocks[dayIdx].size : 0;
  };

  if (loading) {
    return <div className="empty-state"><div className="empty-state-icon">⏳</div><div className="empty-state-title">読み込み中...</div></div>;
  }

  if (!schedule || !participant) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <div className="empty-state-title">スケジュールが見つかりません</div>
        <p className="empty-state-desc">リンクが正しいか確認してください</p>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <div>
          <h1 className="section-title">{schedule.title}</h1>
          <p className="section-subtitle">
            {participant.name} さんの回答 · {schedule.durationMinutes}分の予定を調整中
          </p>
        </div>
      </div>

      <div className="glass-card-static mb-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div className="badge badge-danger" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
            🔴 赤 = NG（空いていない時間）
          </div>
          <div className="badge badge-success" style={{ fontSize: '0.875rem', padding: '0.375rem 0.75rem' }}>
            🟢 緑 = OK（空いている時間）
          </div>
          <span className="text-sm text-muted">→ 空いて<strong>いない</strong>時間をクリック/ドラッグで選択してください</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="ng-toolbar">
        <button className="btn btn-secondary btn-sm" onClick={clearAll}>🗑 全クリア</button>
        <button 
          className="btn btn-outline btn-sm" 
          onClick={handleGoogleAuth}
          disabled={loadingCalendar}
        >
          {loadingCalendar ? '読込中...' : '📅 Googleカレンダー連携'}
        </button>
        <div className="ng-toolbar-divider" />
        {clipboard && <span className="text-sm text-muted">📋 コピー中</span>}
        {days.length > 7 && (
          <>
            <div className="ng-toolbar-divider" />
            <button className="btn btn-accent btn-sm" onClick={applyWeeklyRepeat}>
              🔁 週単位で繰り返し
            </button>
            <span className="text-sm text-muted">（最初の1週間のパターンを残りの週に適用）</span>
          </>
        )}
      </div>

      {/* NG Time Grid */}
      <div className="glass-card-static" style={{ overflow: 'hidden' }}>
        <div className="ng-grid-container" ref={gridRef}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `60px repeat(${days.length}, minmax(60px, 1fr))`,
            gap: '2px',
            userSelect: 'none',
          }}>
            {/* Header row: day labels */}
            <div /> {/* empty corner */}
            {days.map((day, dayIdx) => (
              <div key={dayIdx} style={{ textAlign: 'center' }}>
                <div className="ng-day-label">{formatDayLabel(day)}</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '2px', marginTop: 2 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 4px', fontSize: '0.6875rem' }}
                    title="この日のパターンをコピー"
                    onClick={() => copyDay(dayIdx)}
                  >📋</button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 4px', fontSize: '0.6875rem' }}
                    title="ペースト"
                    onClick={() => pasteDay(dayIdx)}
                  >📌</button>
                </div>
              </div>
            ))}

            {/* Time rows */}
            {TIME_SLOTS.map((slot, slotIdx) => (
              <>
                <div key={`label-${slotIdx}`} className="ng-time-label">{slot.label}</div>
                {days.map((_day, dayIdx) => {
                  const isBusy = ngBlocks[dayIdx]?.has(slotIdx);
                  return (
                    <div
                      key={`${dayIdx}-${slotIdx}`}
                      className={`ng-grid-cell ${isBusy ? 'busy' : 'free'}`}
                      onMouseDown={() => handleMouseDown(dayIdx, slotIdx)}
                      onMouseEnter={() => handleMouseEnter(dayIdx, slotIdx)}
                    />
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* Summary & Submit */}
      <div className="glass-card-static mt-2" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="text-sm text-muted">
            NG スロット数: {Object.values(ngBlocks).reduce((sum, set) => sum + set.size, 0)} / {days.length * TIME_SLOTS.length} スロット
          </span>
        </div>
        <button
          className="btn btn-primary btn-lg"
          onClick={handleSubmit}
          disabled={submitting}
        >
          {submitting ? '送信中...' : '✅ 回答を送信'}
        </button>
      </div>

      {/* Calendar Selection Modal */}
      {showCalendarModal && (
        <div className="modal-overlay">
          <div className="modal-content glass-card p-4">
            <h2 className="mb-2">同期するカレンダーの選択</h2>
            <p className="text-sm text-muted mb-3">GoogleカレンダーからNG時間として読み込むカレンダーを選択してください。</p>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '1rem' }}>
              {calendarList.length === 0 ? (
                <div className="text-muted text-sm text-center">カレンダーが見つかりません。</div>
              ) : (
                calendarList.map(cal => (
                  <label key={cal.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedCalendars.includes(cal.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedCalendars(prev => [...prev, cal.id]);
                        } else {
                          setSelectedCalendars(prev => prev.filter(id => id !== cal.id));
                        }
                      }}
                      style={{ accentColor: cal.backgroundColor || '#0284c7' }}
                    />
                    <div style={{
                      width: '12px', height: '12px', borderRadius: '50%', backgroundColor: cal.backgroundColor || '#ccc'
                    }} />
                    <span>{cal.summary} {cal.primary && <span className="badge badge-success" style={{fontSize: '0.7rem'}}>メイン</span>}</span>
                  </label>
                ))
              )}
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn btn-outline" onClick={() => setShowCalendarModal(false)}>キャンセル</button>
              <button className="btn btn-primary" onClick={handleSyncCalendars} disabled={selectedCalendars.length === 0}>
                同期する
              </button>
            </div>
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
