import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const MONEY_ROLES = ['HR', 'FINANCE', 'ORG_ADMIN', 'SUPER_ADMIN', 'AUDITOR'];
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function Payroll() {
  const { user } = useAuth();
  const canManage = MONEY_ROLES.includes(user.role);

  const [myslips, setMyslips] = useState([]);
  const [all, setAll] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [genForm, setGenForm] = useState({ employeeId: '', month: '' });
  const [explain, setExplain] = useState(null); // AI payroll explainer output
  const [msg, setMsg] = useState(null);

  function loadAll() {
    if (user.employeeId) api.get('/payroll/me').then(({ data }) => setMyslips(data.payslips)).catch(() => {});
    if (canManage) {
      api.get('/payroll').then(({ data }) => setAll(data.payrolls)).catch(() => {});
      api.get('/employees', { params: { limit: 100 } }).then(({ data }) => setEmployees(data.employees)).catch(() => {});
    }
  }

  useEffect(() => { loadAll(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function generate(e) {
    e.preventDefault();
    setMsg(null);
    try {
      const { data } = await api.post('/payroll/generate', genForm);
      setMsg({ type: 'ok', text: `Generated draft payslip: net ${rupees(data.payroll.netSalary)}` });
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Generation failed' });
    }
  }

  async function approve(id) {
    try {
      await api.patch(`/payroll/${id}/approve`);
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Approve failed (Finance role required)' });
    }
  }

  async function explainMyPay() {
    setExplain({ loading: true });
    try {
      const { data } = await api.post('/ai/payroll-explain', {});
      setExplain({ month: data.month, text: data.reply });
    } catch (err) {
      setExplain({ text: `⚠️ ${err.response?.data?.message || 'Explainer unavailable'}` });
    }
  }

  return (
    <>
      <h2>Payroll</h2>
      {msg && <div className={msg.type === 'ok' ? 'alert ok' : 'alert'}>{msg.text}</div>}

      {canManage && (
        <form className="card row-form" onSubmit={generate}>
          <select
            value={genForm.employeeId}
            onChange={(e) => setGenForm((f) => ({ ...f, employeeId: e.target.value }))}
            required
          >
            <option value="">Select employee…</option>
            {employees.map((e2) => (
              <option key={e2._id} value={e2._id}>{e2.name} ({e2.employeeId})</option>
            ))}
          </select>
          <input
            type="month"
            value={genForm.month}
            onChange={(e) => setGenForm((f) => ({ ...f, month: e.target.value }))}
            required
          />
          <button className="btn primary">Generate payroll</button>
        </form>
      )}

      {canManage && (
        <div className="card">
          <h3>All payslips</h3>
          <table>
            <thead>
              <tr><th>Employee</th><th>Month</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {all.length === 0 && <tr><td colSpan="7" className="muted">No payroll generated yet.</td></tr>}
              {all.map((p) => (
                <tr key={p._id}>
                  <td>{p.employee?.name} ({p.employee?.employeeId})</td>
                  <td>{p.month}</td>
                  <td className="num">{rupees(p.grossSalary)}</td>
                  <td className="num">{rupees(p.totalDeductions)}</td>
                  <td className="num"><strong>{rupees(p.netSalary)}</strong></td>
                  <td><span className={`chip ${p.status === 'Approved' ? 'green' : 'amber'}`}>{p.status}</span></td>
                  <td>
                    {p.status === 'Draft' && ['FINANCE', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(user.role) && (
                      <button className="btn small primary" onClick={() => approve(p._id)}>Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {user.employeeId && (
        <div className="card">
          <div className="page-head">
            <h3>My payslips</h3>
            <button className="btn ghost small" onClick={explainMyPay}>✦ Explain my latest payslip</button>
          </div>
          {explain && (
            <div className="ai-explain">
              {explain.loading ? 'Asking the assistant…' : (
                <>
                  {explain.month && <strong>Payslip {explain.month}</strong>}
                  <p style={{ whiteSpace: 'pre-wrap' }}>{explain.text}</p>
                </>
              )}
            </div>
          )}
          <table>
            <thead>
              <tr><th>Month</th><th>Basic</th><th>HRA</th><th>OT pay</th><th>Deductions</th><th>Net</th></tr>
            </thead>
            <tbody>
              {myslips.length === 0 && <tr><td colSpan="6" className="muted">No approved payslips yet.</td></tr>}
              {myslips.map((p) => (
                <tr key={p._id}>
                  <td>{p.month}</td>
                  <td className="num">{rupees(p.basicSalary)}</td>
                  <td className="num">{rupees(p.hra)}</td>
                  <td className="num">{rupees(p.overtimePay)}</td>
                  <td className="num">{rupees(p.totalDeductions)}</td>
                  <td className="num"><strong>{rupees(p.netSalary)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
