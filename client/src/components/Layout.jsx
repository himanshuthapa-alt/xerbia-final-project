import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api from '../api/client.js';
import AiWidget from './AiWidget.jsx';

// route → roles allowed to see the nav item (server enforces the real rules)
const NAV = [
  { to: '/', label: 'Dashboard', roles: null },
  { to: '/employees', label: 'Employees', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'MANAGER', 'TEAM_LEAD', 'FINANCE', 'AUDITOR'] },
  { to: '/departments', label: 'Departments', roles: null },
  { to: '/attendance', label: 'Attendance', roles: null },
  { to: '/leave', label: 'Leave', roles: null },
  { to: '/payroll', label: 'Payroll', roles: null },
  { to: '/recruitment', label: 'Recruitment', roles: ['SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'MANAGER'] },
  { to: '/projects', label: 'Projects', roles: null },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState({ notifications: [], unread: 0 });
  const [showNotifs, setShowNotifs] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get('/notifications')
        .then(({ data }) => alive && setNotifs(data))
        .catch(() => {});
    load();
    const t = setInterval(load, 30000); // light polling; websockets are a v2 thing
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function openNotifs() {
    setShowNotifs((s) => !s);
    if (!showNotifs && notifs.unread > 0) {
      try {
        await api.patch('/notifications/read-all');
        setNotifs((n) => ({ ...n, unread: 0 }));
      } catch {}
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Workforce</div>
        <nav>
          {NAV.filter((item) => !item.roles || item.roles.includes(user.role)).map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="whoami">
            <strong>{user.name}</strong>
            <span className="role-chip">{user.role}</span>
          </div>
          <button className="btn ghost" onClick={() => { logout(); navigate('/login'); }}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <span />
          <div className="topbar-right">
            <button className="bell" onClick={openNotifs} title="Notifications">
              🔔{notifs.unread > 0 && <em className="badge">{notifs.unread}</em>}
            </button>
          </div>
          {showNotifs && (
            <div className="notif-panel">
              {notifs.notifications.length === 0 && <p className="muted">No notifications yet.</p>}
              {notifs.notifications.map((n) => (
                <div key={n._id} className={`notif ${n.read ? '' : 'unread'}`}>
                  <span className="notif-type">{n.type.replaceAll('_', ' ')}</span>
                  <p>{n.message}</p>
                  <time>{new Date(n.createdAt).toLocaleString()}</time>
                </div>
              ))}
            </div>
          )}
        </header>
        <main className="content">{children}</main>
      </div>

      {/* Spec §14: assistant accessible from every page */}
      <AiWidget />
    </div>
  );
}
