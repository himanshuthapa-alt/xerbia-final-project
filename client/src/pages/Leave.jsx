import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const APPROVER_ROLES = ['MANAGER', 'TEAM_LEAD', 'HR', 'ORG_ADMIN', 'SUPER_ADMIN'];

export default function Leave() {
  const { user } = useAuth();
  const isApprover = APPROVER_ROLES.includes(user.role);

  const [balances, setBalances] = useState(null);
  const [mine, setMine] = useState([]);
  const [pending, setPending] = useState([]);
  const [form, setForm] = useState({ leaveType: 'Casual Leave', startDate: '', endDate: '', reason: '' });
  const [msg, setMsg] = useState(null);

  function loadAll() {
    if (user.employeeId) {
      api.get('/leave/balance').then(({ data }) => setBalances(data)).catch(() => {});
      api.get('/leave/me').then(({ data }) => setMine(data.leaves)).catch(() => {});
    }
    if (isApprover) {
      api.get('/leave/pending').then(({ data }) => setPending(data.leaves)).catch(() => {});
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function apply(e) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/leave', form);
      setMsg({ type: 'ok', text: 'Leave request submitted — your manager has been notified.' });
      setForm({ leaveType: 'Casual Leave', startDate: '', endDate: '', reason: '' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Could not submit request' });
    }
  }

  async function decide(id, decision) {
    try {
      await api.patch(`/leave/${id}/decide`, { decision });
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Decision failed' });
    }
  }

  async function cancel(id) {
    try {
      await api.patch(`/leave/${id}/cancel`);
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Cancel failed' });
    }
  }

  const chipFor = (s) =>
    s === 'Approved' ? 'green' : s === 'Rejected' ? 'red' : s === 'Cancelled' ? '' : 'amber';

  return (
    <>
      <h2>Leave</h2>
      {msg && <div className={msg.type === 'ok' ? 'alert ok' : 'alert'}>{msg.text}</div>}

      {balances && (
        <div className="grid stats">
          {Object.entries(balances.balances).map(([type, left]) => (
            <div className="card stat" key={type}>
              <span className="stat-value">{left}</span>
              <span className="stat-label">{type}</span>
              <span className="muted small">of {balances.allocations[type]} / year</span>
            </div>
          ))}
        </div>
      )}

      {user.employeeId && (
        <form className="card form-grid" onSubmit={apply}>
          <label>Type
            <select value={form.leaveType} onChange={set('leaveType')}>
              {balances
                ? Object.keys(balances.allocations).map((t) => <option key={t}>{t}</option>)
                : <option>Casual Leave</option>}
            </select>
          </label>
          <label>From<input type="date" value={form.startDate} onChange={set('startDate')} min={new Date().toISOString().slice(0, 10)} required /></label>
          <label>To<input type="date" value={form.endDate} onChange={set('endDate')} min={form.startDate} required /></label>
          <label>Reason<input value={form.reason} onChange={set('reason')} maxLength={500} required /></label>
          <button className="btn primary">Apply for leave</button>
        </form>
      )}

      {user.employeeId && (
        <div className="card">
          <h3>My requests</h3>
          <table>
            <thead><tr><th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th /></tr></thead>
            <tbody>
              {mine.length === 0 && <tr><td colSpan="5" className="muted">No leave requests yet.</td></tr>}
              {mine.map((l) => (
                <tr key={l._id}>
                  <td>{l.leaveType}</td>
                  <td>{l.startDate} → {l.endDate}</td>
                  <td className="num">{l.days}</td>
                  <td><span className={`chip ${chipFor(l.status)}`}>{l.status}</span></td>
                  <td>
                    {l.status === 'Pending' && (
                      <button className="btn ghost small" onClick={() => cancel(l._id)}>Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isApprover && (
        <div className="card">
          <h3>Approval queue</h3>
          <table>
            <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th /></tr></thead>
            <tbody>
              {pending.length === 0 && <tr><td colSpan="6" className="muted">Nothing waiting for you. 🎉</td></tr>}
              {pending.map((l) => (
                <tr key={l._id}>
                  <td>{l.employee?.name} ({l.employee?.employeeId})</td>
                  <td>{l.leaveType}</td>
                  <td>{l.startDate} → {l.endDate}</td>
                  <td className="num">{l.days}</td>
                  <td className="muted">{l.reason}</td>
                  <td className="btn-row">
                    <button className="btn small primary" onClick={() => decide(l._id, 'Approved')}>Approve</button>
                    <button className="btn small ghost" onClick={() => decide(l._id, 'Rejected')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
