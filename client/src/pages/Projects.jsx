import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const TASK_FLOW = ['To Do', 'In Progress', 'Review', 'Completed', 'Blocked'];

export default function Projects() {
  const { user } = useAuth();
  const isManager = ['MANAGER', 'TEAM_LEAD', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(user.role);

  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState({}); // projectId -> tasks[]
  const [openId, setOpenId] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = () => api.get('/projects').then(({ data }) => setProjects(data.projects)).catch(() => {});
  useEffect(() => { load(); }, []);

  async function toggle(projectId) {
    if (openId === projectId) return setOpenId(null);
    setOpenId(projectId);
    try {
      const { data } = await api.get(`/projects/${projectId}/tasks`);
      setTasks((t) => ({ ...t, [projectId]: data.tasks }));
    } catch {}
  }

  async function setTaskStatus(projectId, taskId, status) {
    setMsg(null);
    try {
      await api.patch(`/projects/tasks/${taskId}`, { status });
      const { data } = await api.get(`/projects/${projectId}/tasks`);
      setTasks((t) => ({ ...t, [projectId]: data.tasks }));
    } catch (err) {
      setMsg(err.response?.data?.message || 'Update failed');
    }
  }

  return (
    <>
      <h2>Projects</h2>
      {msg && <div className="alert">{msg}</div>}
      {projects.length === 0 && <p className="muted">No projects yet.</p>}

      {projects.map((p) => (
        <div className="card" key={p._id}>
          <div className="page-head" style={{ cursor: 'pointer' }} onClick={() => toggle(p._id)}>
            <div>
              <strong>{p.name}</strong>
              <p className="muted small">
                Due {p.deadline} · Owner {p.owner?.name || '—'} · {p.members?.length || 0} member(s)
              </p>
            </div>
            <span className={`chip ${p.status === 'Completed' ? 'green' : p.status === 'Active' ? 'amber' : ''}`}>
              {p.status}
            </span>
          </div>

          {openId === p._id && (
            <table>
              <thead>
                <tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Deadline</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(tasks[p._id] || []).length === 0 && (
                  <tr><td colSpan="5" className="muted">No tasks visible to you in this project.</td></tr>
                )}
                {(tasks[p._id] || []).map((t) => {
                  const canMove =
                    t.status !== 'Completed' &&
                    (isManager || String(t.assignedTo?._id) === String(user.employeeId));
                  return (
                    <tr key={t._id}>
                      <td>{t.title}</td>
                      <td>{t.assignedTo?.name || '—'}</td>
                      <td><span className={`chip ${t.priority === 'High' ? 'red' : ''}`}>{t.priority}</span></td>
                      <td>{t.deadline}</td>
                      <td>
                        {canMove ? (
                          <select
                            value={t.status}
                            onChange={(e) => setTaskStatus(p._id, t._id, e.target.value)}
                          >
                            {TASK_FLOW.map((s) => (
                              // employees can't jump straight to Completed — server enforces Review first
                              <option key={s} value={s} disabled={s === 'Completed' && !isManager}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="chip">{t.status}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ))}
    </>
  );
}
