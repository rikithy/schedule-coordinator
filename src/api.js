const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

async function request(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Schedules
  getSchedules: () => request('/schedules'),
  getSchedule: (id) => request(`/schedules/${id}`),
  createSchedule: (data) => request('/schedules', { method: 'POST', body: JSON.stringify(data) }),
  deleteSchedule: (id) => request(`/schedules/${id}`, { method: 'DELETE' }),
  updateSchedule: (id, data) => request(`/schedules/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Participants
  getParticipants: (scheduleId) => request(`/schedules/${scheduleId}/participants`),
  addParticipant: (scheduleId, data) => request(`/schedules/${scheduleId}/participants`, { method: 'POST', body: JSON.stringify(data) }),
  remindParticipant: (scheduleId, pid) => request(`/schedules/${scheduleId}/participants/${pid}/remind`, { method: 'POST' }),
  remindAll: (scheduleId) => request(`/schedules/${scheduleId}/remind-all`, { method: 'POST' }),

  // Availability
  submitAvailability: (pid, data) => request(`/participants/${pid}/availability`, { method: 'POST', body: JSON.stringify(data) }),
  getAvailability: (pid) => request(`/participants/${pid}/availability`),
  getCalendarList: (participantId) => request(`/participants/${participantId}/calendar/list`),
  getFreeBusy: (pid, start, end, calendarIds = ['primary']) => request(`/participants/${pid}/calendar/freebusy`, { method: 'POST', body: JSON.stringify({ start, end, calendarIds }) }),

  // Slots
  getSlots: (scheduleId) => request(`/schedules/${scheduleId}/slots`),
  getAvailabilityOverview: (scheduleId) => request(`/schedules/${scheduleId}/availability-overview`),

  // Finalize
  finalizeSchedule: (scheduleId, data) => request(`/schedules/${scheduleId}/finalize`, { method: 'POST', body: JSON.stringify(data) }),
};
