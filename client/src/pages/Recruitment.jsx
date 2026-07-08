import { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const STAGES = ['Applied', 'Screening', 'Technical Interview', 'HR Interview', 'Offer', 'Joined', 'Rejected'];

export default function Recruitment() {
  const { user } = useAuth();
  const isHR = ['HR', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(user.role);

  const [candidates, setCandidates] = useState([]);
  const [funnel, setFunnel] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ candidateName: '', email: '', position: '', experience: '', skills: '', resumeText: '' });
  const [analysis, setAnalysis] = useState({}); // id -> {loading} | result
  const [msg, setMsg] = useState(null);

  function load() {
    api.get('/recruitment/candidates').then(({ data }) => setCandidates(data.candidates)).catch(() => {});
    api.get('/recruitment/dashboard').then(({ data }) => setFunnel(data.funnel)).catch(() => {});
  }
  useEffect(() => { load(); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function addCandidate(e) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.post('/recruitment/candidates', {
        ...form,
        experience: Number(form.experience) || 0,
        skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setForm({ candidateName: '', email: '', position: '', experience: '', skills: '', resumeText: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Failed to add candidate' });
    }
  }

  async function analyze(id) {
    setAnalysis((a) => ({ ...a, [id]: { loading: true } }));
    try {
      const { data } = await api.post(`/recruitment/candidates/${id}/analyze`);
      setAnalysis((a) => ({ ...a, [id]: data.aiAnalysis }));
      load();
    } catch (err) {
      setAnalysis((a) => ({ ...a, [id]: { error: err.response?.data?.message || 'Analysis failed' } }));
    }
  }

  async function moveTo(id, status) {
    setMsg(null);
    try {
      const body = { status };
      if (status === 'Offer') body.hrApproved = true; // UI shortcut: moving to Offer implies HR approval
      await api.patch(`/recruitment/candidates/${id}/status`, body);
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Status change failed' });
    }
  }

  return (
    <>
      <div className="page-head">
        <h2>Recruitment</h2>
        {isHR && (
          <button className="btn primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? 'Close' : '+ Add candidate'}
          </button>
        )}
      </div>

      {msg && <div className="alert">{msg.text}</div>}

      {funnel && (
        <div className="grid stats">
          {Object.entries(funnel).map(([stage, n]) => (
            <div className="card stat" key={stage}>
              <span className="stat-value">{n}</span>
              <span className="stat-label" style={{ textTransform: 'capitalize' }}>{stage}</span>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form className="card form-grid" onSubmit={addCandidate}>
          <label>Name<input value={form.candidateName} onChange={set('candidateName')} required /></label>
          <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
          <label>Position<input value={form.position} onChange={set('position')} required /></label>
          <label>Experience (years)<input type="number" min="0" value={form.experience} onChange={set('experience')} /></label>
          <label>Skills (comma separated)<input value={form.skills} onChange={set('skills')} placeholder="React, NodeJS, MongoDB" /></label>
          <label className="span2">Resume text (paste — used by the AI analyzer)
            <textarea rows={5} value={form.resumeText} onChange={set('resumeText')} />
          </label>
          <button className="btn primary">Add candidate</button>
        </form>
      )}

      {candidates.map((c) => {
        const a = analysis[c._id] || c.aiAnalysis;
        const nextStages = STAGES.filter(
          (s) => s !== c.status && (s === 'Rejected' || STAGES.indexOf(s) > STAGES.indexOf(c.status))
        );
        return (
          <div className="card" key={c._id}>
            <div className="page-head">
              <div>
                <strong>{c.candidateName}</strong> <span className="muted">({c.candidateId})</span>
                <p className="muted small">{c.position} · {c.experience} yr · {c.email}</p>
              </div>
              <span className={`chip ${c.status === 'Joined' ? 'green' : c.status === 'Rejected' ? 'red' : 'amber'}`}>{c.status}</span>
            </div>

            {c.skills?.length > 0 && (
              <p className="small">{c.skills.map((s) => <span className="chip" key={s} style={{ marginRight: 6 }}>{s}</span>)}</p>
            )}

            {a && !a.loading && !a.error && (
              <div className="ai-explain">
                <strong>AI score: {a.score}%</strong>
                {a.matchedSkills?.length > 0 && <p className="small">✓ {a.matchedSkills.join(', ')}</p>}
                {a.missingSkills?.length > 0 && <p className="small muted">Missing: {a.missingSkills.join(', ')}</p>}
                <p className="small">{a.summary}</p>
              </div>
            )}
            {a?.loading && <p className="muted small">Analyzing resume with AI…</p>}
            {a?.error && <div className="alert">{a.error}</div>}

            {isHR && (
              <div className="btn-row">
                <button className="btn ghost small" onClick={() => analyze(c._id)} disabled={a?.loading}>
                  ✦ AI analyze resume
                </button>
                {nextStages.map((s) => (
                  <button className="btn small" key={s} onClick={() => moveTo(c._id, s)}>→ {s}</button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {candidates.length === 0 && <p className="muted">No candidates in the pipeline.</p>}
    </>
  );
}
