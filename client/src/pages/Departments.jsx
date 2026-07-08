import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Departments() {
  const { user } = useAuth();
  const canEdit = ['HR', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(user.role);

  const [departments, setDepartments] = useState([]);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const load = () =>
    api.get('/org/departments').then(({ data }) => setDepartments(data.departments)).catch(() => {});

  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/org/departments', { name, code });
      setName(''); setCode('');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create department');
    }
  }

  return (
    <>
      <h2>Departments</h2>
      {error && <div className="alert">{error}</div>}

      {canEdit && (
        <form className="card row-form" onSubmit={add}>
          <input placeholder="Department name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input placeholder="Code (e.g. ENG)" value={code} onChange={(e) => setCode(e.target.value)} required style={{ maxWidth: 140 }} />
          <button className="btn primary">Add</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr><th>Code</th><th>Name</th><th>Manager</th><th>Parent</th></tr>
          </thead>
          <tbody>
            {departments.length === 0 && <tr><td colSpan="4" className="muted">No departments yet.</td></tr>}
            {departments.map((d) => (
              <tr key={d._id}>
                <td><span className="chip">{d.code}</span></td>
                <td>{d.name}</td>
                <td>{d.manager ? `${d.manager.name} (${d.manager.employeeId})` : '—'}</td>
                <td>{d.parent?.name || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
