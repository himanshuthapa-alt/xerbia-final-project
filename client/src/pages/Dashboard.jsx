import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function StatCard({ label, value, hint }) {
  return (
    <div className="card stat">
      <span className="stat-value">{value ?? '—'}</span>
      <span className="stat-label">{label}</span>
      {hint && <span className="muted small">{hint}</span>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/analytics/summary')
      .then(({ data }) => setSummary(data.summary))
      .catch((err) => setError(err.response?.data?.message || 'Could not load dashboard'));
  }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!summary) return <p className="muted">Loading dashboard…</p>;

  const rec = summary.recruitment || {};

  return (
    <>
      <h2>Dashboard</h2>
      <p className="muted">Welcome back, {user.name}.</p>

      <div className="grid stats">
        <StatCard label="Employees" value={summary.totalEmployees} />
        <StatCard label="Present today" value={summary.presentToday} />
        <StatCard label="Pending leaves" value={summary.pendingLeaves} />
        <StatCard label="Active projects" value={summary.activeProjects} hint={`${summary.openTasks} open tasks`} />
        {summary.payrollThisMonth && (
          <StatCard
            label="Payroll this month"
            value={`₹${summary.payrollThisMonth.totalNet.toLocaleString()}`}
            hint={`${summary.payrollThisMonth.slips} payslip(s)`}
          />
        )}
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Headcount by department</h3>
          {summary.byDepartment.length === 0 && <p className="muted">No employees yet.</p>}
          <table>
            <tbody>
              {summary.byDepartment.map((d) => (
                <tr key={d.department}>
                  <td>{d.department}</td>
                  <td className="num">{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Recruitment funnel</h3>
          <table>
            <tbody>
              {['Applied', 'Screening', 'Technical Interview', 'HR Interview', 'Offer', 'Joined', 'Rejected'].map((s) => (
                <tr key={s}>
                  <td>{s}</td>
                  <td className="num">{rec[s] || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
