import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_COLORS = { Present: 'green', Late: 'amber', 'Half Day': 'amber', Absent: 'red' };

export default function Attendance() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [msg, setMsg] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const todayRec = records.find((r) => r.date === today);

  const load = () =>
    api.get('/attendance/me').then(({ data }) => setRecords(data.records)).catch((err) => {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Load failed' });
    });

  useEffect(() => { load(); }, []);

  async function clock(direction) {
    setMsg(null);
    try {
      await api.post(`/attendance/${direction}`);
      setMsg({ type: 'ok', text: direction === 'clock-in' ? 'Clocked in. Have a good day!' : 'Clocked out.' });
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Failed' });
    }
  }

  const canClockIn = !todayRec?.clockIn;
  const canClockOut = todayRec?.clockIn && !todayRec?.clockOut;

  return (
    <>
      <h2>Attendance</h2>
      {msg && <div className={msg.type === 'ok' ? 'alert ok' : 'alert'}>{msg.text}</div>}

      {user.employeeId ? (
        <div className="card clock-card">
          <div>
            <h3>{today}</h3>
            <p className="muted">
              {todayRec?.clockIn ? `In: ${todayRec.clockIn}` : 'Not clocked in yet'}
              {todayRec?.clockOut ? ` · Out: ${todayRec.clockOut} · ${todayRec.workingHours}h` : ''}
              {todayRec?.overtime > 0 ? ` · OT: ${todayRec.overtime}h` : ''}
            </p>
          </div>
          <div className="btn-row">
            <button className="btn primary" disabled={!canClockIn} onClick={() => clock('clock-in')}>Clock In</button>
            <button className="btn" disabled={!canClockOut} onClick={() => clock('clock-out')}>Clock Out</button>
          </div>
        </div>
      ) : (
        <p className="muted">This account has no employee profile (platform admin).</p>
      )}

      <div className="card">
        <h3>This month</h3>
        <table>
          <thead>
            <tr><th>Date</th><th>In</th><th>Out</th><th>Hours</th><th>OT</th><th>Status</th></tr>
          </thead>
          <tbody>
            {records.length === 0 && <tr><td colSpan="6" className="muted">No records yet — clock in to get started.</td></tr>}
            {records.map((r) => (
              <tr key={r._id}>
                <td>{r.date}</td>
                <td>{r.clockIn || '—'}</td>
                <td>{r.clockOut || '—'}</td>
                <td className="num">{r.workingHours || 0}</td>
                <td className="num">{r.overtime || 0}</td>
                <td><span className={`chip ${STATUS_COLORS[r.status] || ''}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
