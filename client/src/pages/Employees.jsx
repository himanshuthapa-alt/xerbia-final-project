import { useCallback, useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const HR_ROLES = ['HR', 'ORG_ADMIN', 'SUPER_ADMIN'];

const EMPTY_FORM = {
  name: '', email: '', mobile: '', department: '', designation: '',
  joiningDate: '', basicSalary: '', manager: '',
};

export default function Employees() {
  const { user } = useAuth();
  const canEdit = HR_ROLES.includes(user.role);

  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [msg, setMsg] = useState(null); // {type:'ok'|'err', text}

  const load = useCallback(() => {
    api
      .get('/employees', { params: search ? { search } : {} })
      .then(({ data }) => setRows(data.employees))
      .catch((err) => setMsg({ type: 'err', text: err.response?.data?.message || 'Load failed' }));
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get('/org/departments').then(({ data }) => setDepartments(data.departments)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    try {
      const payload = { ...form, basicSalary: Number(form.basicSalary) || 0 };
      if (!payload.manager) delete payload.manager;
      const { data } = await api.post('/employees', payload);
      const pwdNote = data.login?.initialPassword ? ` Initial password: ${data.login.initialPassword}` : '';
      setMsg({ type: 'ok', text: `Created ${data.employee.employeeId}.${pwdNote}` });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Create failed' });
    }
  }

  async function archive(id, label) {
    if (!window.confirm(`Archive ${label}? Their login will be disabled.`)) return;
    try {
      await api.delete(`/employees/${id}`);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Archive failed' });
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Employees</h2>
        {canEdit && (
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : '+ Add employee'}
          </button>
        )}
      </div>

      {msg && <div className={msg.type === 'ok' ? 'alert ok' : 'alert'}>{msg.text}</div>}

      {showForm && (
        <form className="card form-grid" onSubmit={submit}>
          <label>Name<input value={form.name} onChange={set('name')} required /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
          <label>Mobile<input value={form.mobile} onChange={set('mobile')} pattern="\d{10}" title="10 digits" /></label>
          <label>Department
            <select value={form.department} onChange={set('department')} required>
              <option value="">Select…</option>
              {departments.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </label>
          <label>Designation<input value={form.designation} onChange={set('designation')} required /></label>
          <label>Joining date<input type="date" value={form.joiningDate} onChange={set('joiningDate')} max={new Date().toISOString().slice(0, 10)} required /></label>
          <label>Basic salary<input type="number" min="0" value={form.basicSalary} onChange={set('basicSalary')} /></label>
          <label>Manager (employee)
            <select value={form.manager} onChange={set('manager')}>
              <option value="">None</option>
              {rows.map((r) => <option key={r._id} value={r._id}>{r.name} ({r.employeeId})</option>)}
            </select>
          </label>
          <button className="btn primary">Create employee + login</button>
        </form>
      )}

      <div className="card">
        <input
          className="search"
          placeholder="Search by name, EMP id or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <table>
          <thead>
            <tr>
              <th>ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Status</th>
              {canEdit && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan="6" className="muted">No employees found.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r._id}>
                <td>{r.employeeId}</td>
                <td>{r.name}</td>
                <td>{r.department?.name || '—'}</td>
                <td>{r.designation}</td>
                <td><span className={`chip ${r.status === 'Active' ? 'green' : ''}`}>{r.status}</span></td>
                {canEdit && (
                  <td>
                    <button className="btn ghost small" onClick={() => archive(r._id, r.name)}>Archive</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
