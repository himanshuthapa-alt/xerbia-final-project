import { useRef, useState, useEffect } from 'react';
import api from '../api/client.js';

/**
 * Floating AI Operations Assistant. Lives on every page (Layout mounts it).
 * Talks to POST /api/ai/chat — the server injects the user's own HR context.
 */
export default function AiWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { from: 'ai', text: 'Hi! Ask me about your leave balance, attendance, payslip or company policy.' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;

    setMessages((m) => [...m, { from: 'me', text }]);
    setInput('');
    setBusy(true);
    try {
      const { data } = await api.post('/ai/chat', { message: text });
      setMessages((m) => [...m, { from: 'ai', text: data.reply }]);
    } catch (err) {
      const msg = err.response?.data?.message || 'The assistant is unavailable right now.';
      setMessages((m) => [...m, { from: 'ai', text: `⚠️ ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="ai-fab" onClick={() => setOpen(true)} title="AI Assistant">
        ✦ AI
      </button>
    );
  }

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <span>AI Operations Assistant</span>
        <button onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="ai-body">
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ${m.from}`}>{m.text}</div>
        ))}
        {busy && <div className="ai-msg ai typing">thinking…</div>}
        <div ref={bottomRef} />
      </div>
      <form className="ai-input" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="How many casual leaves do I have left?"
          maxLength={2000}
        />
        <button className="btn" disabled={busy || !input.trim()}>Send</button>
      </form>
    </div>
  );
}
