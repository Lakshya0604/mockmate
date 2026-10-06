import { useEffect, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#/, '') || '/';
}
const go = (p) => { window.location.hash = p; };

function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const data = await api(`/auth/${mode}`, { method: 'POST', body: f });
      setToken(data.token);
      onAuth(data.user);
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  return (
    <div className="card auth">
      <h2>{mode === 'login' ? 'Log in' : 'Create your account'}</h2>
      <form onSubmit={submit}>
        {mode === 'signup' && <label>Name<input value={f.name} onChange={set('name')} autoComplete="name" /></label>}
        <label>Email<input type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></label>
        <label>Password<input type="password" required minLength={8} value={f.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="At least 8 characters" /></label>
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
      </form>
      <p className="muted">
        {mode === 'login' ? 'New here? ' : 'Already have an account? '}
        <a href="#/" onClick={(e) => { e.preventDefault(); setMode(mode === 'login' ? 'signup' : 'login'); setErr(''); }}>{mode === 'login' ? 'Create an account' : 'Log in'}</a>
      </p>
    </div>
  );
}

function Landing({ onAuth }) {
  return (
    <div className="hero">
      <div>
        <h1>Practice the interview before the real one.</h1>
        <p className="lead">Pick a role and level. An AI interviewer asks 5 questions. Type or speak your answers and get a score, specific feedback and a stronger sample answer after each one, then a final report.</p>
        <ul className="points">
          <li>Questions are written for your role and level</li>
          <li>Honest 0 to 10 scoring with reasons, not flattery</li>
          <li>Voice input in supported browsers</li>
          <li>Every session is saved so you can see progress</li>
        </ul>
      </div>
      <AuthForm onAuth={onAuth} />
    </div>
  );
}

function Start() {
  const [f, setF] = useState({ role: '', level: 'Fresher', focus: 'Mixed' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const doc = await api('/interviews', { method: 'POST', body: f });
      go(`/interview/${doc._id}`);
    } catch (e2) {
      if (e2.status === 401) { setToken(null); window.location.reload(); }
      setErr(e2.message);
    }
    setBusy(false);
  }
  return (
    <form className="card" onSubmit={submit}>
      <h2>Start a mock interview</h2>
      <label>Role<input required minLength={3} maxLength={100} value={f.role} onChange={set('role')} placeholder="e.g. MERN Stack Developer, Data Analyst, HR Executive" /></label>
      <label>Level
        <select value={f.level} onChange={set('level')}>{['Intern', 'Fresher', 'Junior', 'Mid-level', 'Senior'].map((l) => <option key={l}>{l}</option>)}</select>
      </label>
      <label>Focus
        <select value={f.focus} onChange={set('focus')}>{['Technical', 'Behavioral', 'Mixed'].map((l) => <option key={l}>{l}</option>)}</select>
      </label>
      {err && <p className="error">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Preparing your questions...' : 'Begin interview (5 questions)'}</button>
    </form>
  );
}

function useSpeech(onText) {
  const rec = useRef(null);
  const [on, setOn] = useState(false);
  const Sr = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  function toggle() {
    if (!Sr) return;
    if (on) { rec.current?.stop(); return; }
    const r = new Sr();
    r.lang = 'en-IN'; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript + ' ';
      if (t) onText(t);
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r; r.start(); setOn(true);
  }
  useEffect(() => () => rec.current?.stop(), []);
  return { supported: Boolean(Sr), on, toggle };
}

function Feedback({ q }) {
  return (
    <div className="fb">
      <div><span className="score">{q.score}/10</span></div>
      <p>{q.feedback}</p>
      {q.strengths?.length > 0 && <><strong>Good</strong><ul>{q.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
      {q.improvements?.length > 0 && <><strong>Improve</strong><ul>{q.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
      {q.betterAnswer && <><strong>A stronger answer</strong><p className="sample">{q.betterAnswer}</p></>}
    </div>
  );
}

function Report({ d }) {
  const r = d.report || {};
  const color = d.overall >= 70 ? '#16a34a' : d.overall >= 50 ? '#d97706' : '#dc2626';
  return (
    <div className="stack">
      <div className="card row">
        <div className="ring" style={{ '--p': d.overall, '--c': color }}><div className="ring-inner"><strong>{d.overall}</strong><span>{d.verdict}</span></div></div>
        <div>
          <h2>{d.role} ({d.level})</h2>
          <p className="muted">{d.focus} interview - {new Date(d.createdAt).toLocaleString()}</p>
          <p>{r.summary}</p>
          <p className="muted small">Overall = average of your five answer scores, calculated in code.</p>
        </div>
      </div>
      <div className="grid2">
        <div className="card"><h3>Strengths</h3><ul>{(r.strengths || []).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
        <div className="card"><h3>Work on</h3><ul>{(r.weaknesses || []).map((t, i) => <li key={i}>{t}</li>)}</ul></div>
      </div>
      <div className="card"><h3>Next steps</h3><ol>{(r.next_steps || []).map((t, i) => <li key={i}>{t}</li>)}</ol></div>
      <div className="card">
        <h3>Question by question</h3>
        {d.questions.map((q, i) => (
          <div className="qa" key={i}>
            <span className="tag">{q.topic || `Q${i + 1}`}</span>
            <p className="qtext" style={{ fontSize: '1.05rem' }}>{i + 1}. {q.question}</p>
            <p className="you">{q.answer}</p>
            <Feedback q={q} />
          </div>
        ))}
      </div>
      <p><a href="#/new" className="btn">Practice again</a></p>
    </div>
  );
}

function Interview({ id }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(null);
  const speech = useSpeech((t) => setAnswer((a) => (a ? a.trimEnd() + ' ' : '') + t.trim()));
  useEffect(() => { api(`/interviews/${id}`).then(setD).catch((e) => setErr(e.message)); }, [id]);
  if (err && !d) return <div className="card"><p className="error">{err}</p></div>;
  if (!d) return <div className="card"><p>Loading...</p></div>;
  const total = d.questions.length;
  const q = d.questions[d.current] || {};
  async function submit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const next = await api(`/interviews/${id}/answer`, { method: 'POST', body: { answer } });
      const answered = next.questions[d.current];
      setShown({ q: answered, done: next.status === 'completed' });
      setD(next);
      setAnswer('');
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  if (shown) {
    return (
      <div className="card">
        <span className="tag">{shown.q.topic}</span>
        <p className="qtext">{shown.q.question}</p>
        <p className="you">{shown.q.answer}</p>
        <Feedback q={shown.q} />
        <p style={{ marginTop: 16 }}>
          <button className="btn" onClick={() => setShown(null)}>{shown.done ? 'See final report' : 'Next question'}</button>
        </p>
      </div>
    );
  }
  if (d.status === 'completed') return <Report d={d} />;
  return (
    <form className="card" onSubmit={submit}>
      <p className="muted small">Question {d.current + 1} of {total} - {d.role} ({d.level})</p>
      <div className="progress"><div style={{ width: `${(d.current / total) * 100}%` }} /></div>
      <span className="tag">{q.topic}</span>
      <p className="qtext">{q.question}</p>
      <textarea rows={8} value={answer} maxLength={3000} onChange={(e) => setAnswer(e.target.value)} placeholder="Type your answer, or press Speak and talk..." />
      <p className="muted small">{answer.trim().split(/\s+/).filter(Boolean).length} words</p>
      {err && <p className="error">{err}</p>}
      <button className="btn" disabled={busy || speech.on}>{busy ? 'Scoring your answer...' : 'Submit answer'}</button>
      {speech.supported && <button type="button" className="btn alt" onClick={speech.toggle}>{speech.on ? 'Stop recording' : 'Speak'}</button>}
    </form>
  );
}

function History() {
  const [items, setItems] = useState(null);
  const load = () => api('/interviews').then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  async function del(id) {
    if (!window.confirm('Delete this interview?')) return;
    await api(`/interviews/${id}`, { method: 'DELETE' });
    load();
  }
  if (!items) return <div className="card"><p>Loading...</p></div>;
  return (
    <div className="card">
      <h2>Your interviews</h2>
      {items.length === 0 && <p className="muted">Nothing yet. <a href="#/new">Start your first one.</a></p>}
      <ul className="history">
        {items.map((i) => (
          <li key={i._id}>
            <a href={`#/interview/${i._id}`}>
              <strong>{i.status === 'completed' ? i.overall : `${i.current}/5`}</strong>
              <span>{i.role} ({i.level}) {i.status !== 'completed' && '- in progress'}</span>
              <em>{new Date(i.createdAt).toLocaleDateString()}</em>
            </a>
            <button className="link" onClick={() => del(i._id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function App() {
  const route = useHashRoute();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  function logout() { setToken(null); setUser(null); go('/'); }
  if (!ready) return <div className="wrap"><p>Loading...</p></div>;
  let page;
  if (!user) page = <Landing onAuth={(u) => { setUser(u); go('/new'); }} />;
  else if (route.startsWith('/interview/')) page = <Interview key={route} id={route.split('/')[2]} />;
  else if (route === '/history') page = <History />;
  else page = <Start />;
  return (
    <>
      <header className="nav">
        <a className="brand" href="#/">Mock<span>Mate</span></a>
        {user && (
          <nav>
            <a href="#/new">New</a>
            <a href="#/history">History</a>
            <button className="link" onClick={logout}>Log out ({user.name || user.email})</button>
          </nav>
        )}
      </header>
      <main className="wrap">{page}</main>
      <footer className="foot">MockMate - built by Lakshya Yadav. Your answers are stored in your account only. AI feedback can be wrong: use it as practice, not a verdict.</footer>
    </>
  );
}
