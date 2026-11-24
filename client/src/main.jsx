import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'The request could not be completed.');
  return payload;
}

function App() {
  const [user, setUser] = useState(undefined);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    api('/me').then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setBusy(false));
  }, []);

  async function signOut() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }

  if (busy || user === undefined) return <div className="loading-screen"><div className="tea-mark">Ｔ</div><p>Preparing the tea table…</p></div>;
  if (!user) return <AuthPanel onSignedIn={setUser} />;
  return user.role === 'admin'
    ? <AdminPanel user={user} onSignOut={signOut} />
    : <ParticipantPanel user={user} onSignOut={signOut} />;
}

function AuthPanel({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', displayName: '', password: '', competitionCode: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function update(key, value) { setForm((old) => ({ ...old, [key]: value })); }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const payload = mode === 'login'
        ? { username: form.username, password: form.password }
        : form;
      const data = await api(endpoint, { method: 'POST', body: payload });
      onSignedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration">✳</div>
      <section className="auth-card">
        <div className="eyebrow">A little daily mystery</div>
        <div className="brand-emblem">Ｔ</div>
        <h1>Tea Advent<br /><span>Competition</span></h1>
        <p className="auth-intro">Taste, guess, and see who knows their tea best.</p>
        <div className="auth-switch" role="tablist" aria-label="Account access">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError(''); }}>Join competition</button>
        </div>
        <form onSubmit={submit} className="form-stack">
          <label>Username<input value={form.username} onChange={(e) => update('username', e.target.value)} autoComplete="username" required minLength={3} maxLength={32} /></label>
          {mode === 'register' && <label>Display name<input value={form.displayName} onChange={(e) => update('displayName', e.target.value)} required minLength={2} maxLength={32} placeholder="What should appear on the leaderboard?" /></label>}
          <label>Password<input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} /></label>
          {mode === 'register' && <label>Competition invitation code<input value={form.competitionCode} onChange={(e) => update('competitionCode', e.target.value)} required autoComplete="off" /></label>}
          {error && <div className="alert error">{error}</div>}
          <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create my account'}</button>
        </form>
        <p className="auth-footnote">Your guesses are private until the answers are revealed.</p>
      </section>
    </main>
  );
}

function AppHeader({ user, onSignOut, admin = false }) {
  return (
    <header className="topbar">
      <div className="topbar-brand"><span className="mini-mark">Ｔ</span><span>Tea Advent <b>Competition</b></span></div>
      <div className="topbar-user"><span>{user.displayName}{admin && <em className="admin-pill">Host</em>}</span><button className="text-button" onClick={onSignOut}>Sign out</button></div>
    </header>
  );
}

function ParticipantPanel({ user, onSignOut }) {
  const [days, setDays] = useState([]);
  const [leaderboard, setLeaderboard] = useState({ days: [], participants: [] });
  const [selectedId, setSelectedId] = useState(null);
  const [answers, setAnswers] = useState({});
  const [tab, setTab] = useState('calendar');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [dayData, boardData] = await Promise.all([api('/days'), api('/leaderboard')]);
    setDays(dayData.days);
    setLeaderboard(boardData);
    setSelectedId((current) => current && dayData.days.some((day) => day.id === current) ? current : dayData.days[0]?.id ?? null);
  }

  useEffect(() => { refresh().catch((err) => setError(err.message)); }, []);

  const selectedDay = days.find((day) => day.id === selectedId) || null;
  useEffect(() => {
    if (!selectedDay) { setAnswers({}); return; }
    setAnswers(selectedDay.submission?.answers || {});
    setError('');
    setNotice('');
  }, [selectedId, days.length, selectedDay?.submission?.submittedAt]);

  const myStanding = leaderboard.participants.find((person) => person.userId === user.id);
  const completedCount = leaderboard.days.filter((day) => myStanding?.days?.[day.id] !== null && myStanding?.days?.[day.id] !== undefined).length;

  function choose(ingredientId, choice) {
    setAnswers((old) => ({ ...old, [String(ingredientId)]: choice }));
  }

  async function saveGuesses(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!selectedDay) return;
    if (selectedDay.ingredients.some((ingredient) => !answers[String(ingredient.id)])) {
      setError('Please choose an option for all six ingredients.');
      return;
    }
    setBusy(true);
    try {
      await api(`/days/${selectedDay.id}/submission`, { method: 'POST', body: { answers } });
      await refresh();
      setNotice('Your guesses have been saved. You can change them until the host closes this day.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <AppHeader user={user} onSignOut={onSignOut} />
      <main className="main-content">
        <section className="welcome-row">
          <div><div className="eyebrow">Welcome to the tasting table</div><h1>Make your daily <span>predictions.</span></h1><p>Six clues. Three choices each. How well do you know what’s in the cup?</p></div>
          <div className="score-summary"><span className="summary-label">Your total score</span><strong>{myStanding?.total ?? 0}</strong><span className="summary-foot">{completedCount} revealed {completedCount === 1 ? 'day' : 'days'} scored</span></div>
        </section>

        <nav className="main-tabs" aria-label="Competition sections">
          <button className={tab === 'calendar' ? 'selected' : ''} onClick={async () => { await refresh().catch((err) => setError(err.message)); setTab('calendar'); }}>Advent calendar</button>
          <button className={tab === 'leaderboard' ? 'selected' : ''} onClick={async () => { await refresh().catch((err) => setError(err.message)); setTab('leaderboard'); }}>Leaderboard</button>
        </nav>

        {tab === 'calendar' ? (
          <div className="calendar-layout">
            <aside className="day-sidebar">
              <div className="section-kicker">Your calendar</div>
              {days.length === 0 ? <p className="muted small">The host has not added any tea days yet.</p> : <div className="day-grid">
                {days.map((day) => <button key={day.id} className={`day-tile ${selectedId === day.id ? 'current' : ''} ${day.status.toLowerCase()}`} onClick={() => setSelectedId(day.id)}>
                  <span className="day-number">{day.day_number}</span><span className="day-state">{day.status === 'REVEALED' ? '✓' : day.status === 'CLOSED' ? 'Ⅱ' : '•'}</span>
                </button>)}
              </div>}
              <div className="legend"><span><i className="dot open-dot" /> Open</span><span><i className="dot closed-dot" /> Closed</span><span><i className="dot revealed-dot" /> Revealed</span></div>
            </aside>

            <section className="content-card tea-card">
              {!selectedDay ? <div className="empty-state"><span>☕</span><h2>The calendar is waiting</h2><p>Once the host adds the teas, your daily clues will appear here.</p></div> : <>
                <div className="tea-card-heading">
                  <div><div className="eyebrow">Day {selectedDay.day_number}{selectedDay.tasting_date ? ` · ${formatDate(selectedDay.tasting_date)}` : ''}</div><h2>{selectedDay.title}</h2></div>
                  <StatusPill status={selectedDay.status} />
                </div>
                {selectedDay.status === 'OPEN' && <p className="instruction">For each ingredient, choose whether you think it is <b>in</b> the brew, <b>not in</b> the brew, or you have <b>no decision</b>.</p>}
                {selectedDay.status === 'CLOSED' && <div className="notice-banner">Submissions are closed for this day. The host will reveal the answers soon.</div>}
                {selectedDay.status === 'REVEALED' && <div className="result-banner"><div><span className="result-label">Your score for this tea</span><strong>{selectedDay.submission ? `${formatPoints(myStanding?.days?.[selectedDay.id] ?? 0)} points` : 'No submission'}</strong></div><span className="result-range">Possible: −6 to +6</span></div>}
                <form onSubmit={saveGuesses}>
                  <div className="ingredient-list">
                    {selectedDay.ingredients.map((ingredient, index) => {
                      const choice = answers[String(ingredient.id)] || '';
                      const correct = selectedDay.status === 'REVEALED' ? ingredient.isPresent : undefined;
                      const point = selectedDay.status === 'REVEALED' && choice
                        ? choice === 'NO_DECISION' ? 0 : (choice === 'IN') === correct ? 1 : -1
                        : null;
                      return <div className={`ingredient-row ${selectedDay.status === 'REVEALED' ? 'scored' : ''}`} key={ingredient.id}>
                        <div className="ingredient-meta"><span className="ingredient-index">{String(index + 1).padStart(2, '0')}</span><span className="ingredient-name">{ingredient.name}</span></div>
                        <div className="choice-group" role="radiogroup" aria-label={`Your prediction for ${ingredient.name}`}>
                          {[
                            ['IN', 'In'], ['NOT_IN', 'Not in'], ['NO_DECISION', 'No decision'],
                          ].map(([value, label]) => <label key={value} className={`choice-option ${choice === value ? 'chosen' : ''}`}>
                            <input type="radio" name={`ingredient-${ingredient.id}`} value={value} checked={choice === value} disabled={selectedDay.status !== 'OPEN'} onChange={() => choose(ingredient.id, value)} />
                            <span>{label}</span>
                          </label>)}
                        </div>
                        {selectedDay.status === 'REVEALED' && <div className="answer-mark"><span className={correct ? 'answer-in' : 'answer-out'}>{correct ? 'In brew' : 'Not in'}</span><b className={point > 0 ? 'positive' : point < 0 ? 'negative' : 'neutral'}>{point === null ? '—' : point > 0 ? '+1' : point < 0 ? '−1' : '0'}</b></div>}
                      </div>;
                    })}
                  </div>
                  {selectedDay.status === 'OPEN' && <div className="submit-area">
                    <div className="muted small">{selectedDay.submission ? 'You have already submitted. You can update your choices while this day is open.' : 'Your choices are private and can be updated until submissions close.'}</div>
                    <button type="submit" className="primary-button" disabled={busy}>{busy ? 'Saving…' : selectedDay.submission ? 'Update my guesses' : 'Submit my guesses'}</button>
                  </div>}
                </form>
                {error && <div className="alert error inline-alert">{error}</div>}
                {notice && <div className="alert success inline-alert">{notice}</div>}
                {selectedDay.status === 'REVEALED' && <div className="scoring-note"><b>Scoring:</b> correct = +1 · incorrect = −1 · no decision = 0. Your day score is the sum of all six ingredient results.</div>}
              </>}
            </section>
          </div>
        ) : <Leaderboard data={leaderboard} currentUserId={user.id} />}
      </main>
      <footer className="site-footer">A little curiosity makes every cup more interesting.</footer>
    </div>
  );
}

function Leaderboard({ data, currentUserId }) {
  if (!data.participants.length) return <div className="content-card empty-state leaderboard-empty"><span>🏆</span><h2>No scores yet</h2><p>The leaderboard will take shape as participants join and teas are revealed.</p></div>;
  return <section className="content-card leaderboard-card">
    <div className="leaderboard-heading"><div><div className="eyebrow">The competition so far</div><h2>Leaderboard</h2><p>Only revealed tea days count toward the standings.</p></div><span className="trophy">♜</span></div>
    <div className="table-wrap"><table className="score-table"><thead><tr><th>Rank</th><th>Participant</th>{data.days.map((day) => <th key={day.id}>Day {day.day_number}</th>)}<th>Total</th></tr></thead><tbody>
      {data.participants.map((person, index) => <tr key={person.userId} className={person.userId === currentUserId ? 'me-row' : ''}><td><span className={`rank rank-${index + 1}`}>{index + 1}</span></td><td className="participant-name">{person.displayName}{person.userId === currentUserId && <span className="you-tag">You</span>}</td>{data.days.map((day) => <td key={day.id} className="points-cell">{person.days[day.id] === null ? '—' : formatPoints(person.days[day.id])}</td>)}<td className="total-cell">{formatPoints(person.total)}</td></tr>)}
    </tbody></table></div>
    <p className="table-caption">A dash means no guess was submitted for that revealed day. Unsubmitted days do not add or subtract points.</p>
  </section>;
}

function AdminPanel({ user, onSignOut }) {
  const emptyIngredients = () => Array.from({ length: 6 }, () => ({ name: '', isPresent: false }));
  const [days, setDays] = useState([]);
  const [leaderboard, setLeaderboard] = useState({ days: [], participants: [] });
  const [tab, setTab] = useState('manage');
  const [form, setForm] = useState({ dayNumber: '', title: '', tastingDate: '', ingredients: emptyIngredients() });
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [dayData, boardData] = await Promise.all([api('/admin/days'), api('/leaderboard')]);
    setDays(dayData.days);
    setLeaderboard(boardData);
  }
  useEffect(() => { refresh().catch((err) => setError(err.message)); }, []);

  function updateIngredient(index, key, value) {
    setForm((old) => ({ ...old, ingredients: old.ingredients.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item) }));
  }

  async function createDay(event) {
    event.preventDefault();
    setError(''); setNotice(''); setBusy(true);
    try {
      await api('/admin/days', { method: 'POST', body: form });
      setForm({ dayNumber: '', title: '', tastingDate: '', ingredients: emptyIngredients() });
      await refresh();
      setNotice('Tea day created. Participants can now submit their guesses.');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function changeStatus(day, status) {
    const prompt = status === 'CLOSED'
      ? 'Close submissions for this day? Participants will no longer be able to change their guesses.'
      : 'Reveal the correct answers? This will publish the results and permanently lock submissions.';
    if (!window.confirm(prompt)) return;
    setError(''); setNotice('');
    try {
      await api(`/admin/days/${day.id}/status`, { method: 'POST', body: { status } });
      await refresh();
      if (selectedDetails?.day?.id === day.id) await loadDetails(day.id);
      setNotice(status === 'CLOSED' ? 'Submissions have been closed.' : 'Answers revealed and scores calculated.');
    } catch (err) { setError(err.message); }
  }

  async function loadDetails(dayId) {
    try { setSelectedDetails(await api(`/admin/days/${dayId}/submissions`)); }
    catch (err) { setError(err.message); }
  }

  return (
    <div className="app-shell">
      <AppHeader user={user} onSignOut={onSignOut} admin />
      <main className="main-content">
        <section className="welcome-row admin-welcome"><div><div className="eyebrow">Competition control room</div><h1>Welcome, <span>host.</span></h1><p>Add each tea, manage submissions, and reveal the results.</p></div><div className="admin-counter"><strong>{days.length}</strong><span>tea days created</span></div></section>
        <nav className="main-tabs"><button className={tab === 'manage' ? 'selected' : ''} onClick={() => { refresh().catch((err) => setError(err.message)); setTab('manage'); }}>Manage tea days</button><button className={tab === 'leaderboard' ? 'selected' : ''} onClick={async () => { await refresh().catch((err) => setError(err.message)); setTab('leaderboard'); }}>Leaderboard</button></nav>
        {error && <div className="alert error global-alert">{error}</div>}
        {notice && <div className="alert success global-alert">{notice}</div>}
        {tab === 'leaderboard' ? <Leaderboard data={leaderboard} currentUserId={null} /> : <div className="admin-layout">
          <section className="content-card create-card">
            <div className="section-heading"><div><div className="eyebrow">Set up a tasting</div><h2>Add a tea day</h2></div><span className="leaf-icon">❧</span></div>
            <p className="muted">Enter the six ingredients participants will evaluate, and privately mark whether each one is actually in the brew.</p>
            <form onSubmit={createDay} className="form-stack admin-form">
              <div className="two-fields"><label>Day number<input type="number" min="1" max="366" value={form.dayNumber} onChange={(e) => setForm((old) => ({ ...old, dayNumber: e.target.value }))} placeholder="1" required /></label><label>Tasting date<input type="date" value={form.tastingDate} onChange={(e) => setForm((old) => ({ ...old, tastingDate: e.target.value }))} /></label></div>
              <label>Tea title<input value={form.title} onChange={(e) => setForm((old) => ({ ...old, title: e.target.value }))} placeholder="e.g. Winter Orchard" maxLength={80} /></label>
              <div className="form-divider" />
              <div className="ingredient-editor-heading"><b>Ingredient clues</b><span>Six required</span></div>
              {form.ingredients.map((ingredient, index) => <div className="ingredient-editor" key={index}><span className="editor-number">{index + 1}</span><input aria-label={`Ingredient ${index + 1}`} value={ingredient.name} onChange={(e) => updateIngredient(index, 'name', e.target.value)} placeholder={`Ingredient ${index + 1}`} required maxLength={60} /><label className="check-label"><input type="checkbox" checked={ingredient.isPresent} onChange={(e) => updateIngredient(index, 'isPresent', e.target.checked)} /><span>In brew</span></label></div>)}
              <div className="admin-private-note">Only you can see the correct answers before the reveal.</div>
              <button className="primary-button full-button" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create tea day'}</button>
            </form>
          </section>

          <section className="content-card days-admin-card">
            <div className="section-heading"><div><div className="eyebrow">Calendar overview</div><h2>Your tea days</h2></div><span className="calendar-icon">▦</span></div>
            {days.length === 0 ? <div className="empty-state compact"><span>☕</span><p>No tea days yet. Add the first one to get started.</p></div> : <div className="admin-day-list">
              {days.map((day) => <div className="admin-day" key={day.id}>
                <div className="admin-day-main"><span className="admin-day-number">{day.day_number}</span><div className="admin-day-info"><b>{day.title}</b><span>{day.submissionCount} {day.submissionCount === 1 ? 'submission' : 'submissions'}{day.tasting_date ? ` · ${formatDate(day.tasting_date)}` : ''}</span></div><StatusPill status={day.status} /></div>
                <div className="admin-day-actions">
                  <button className="subtle-button" onClick={() => loadDetails(day.id)}>View guesses</button>
                  {day.status === 'OPEN' && <button className="subtle-button warning-button" onClick={() => changeStatus(day, 'CLOSED')}>Close submissions</button>}
                  {day.status === 'CLOSED' && <button className="subtle-button reveal-button" onClick={() => changeStatus(day, 'REVEALED')}>Reveal answers</button>}
                </div>
              </div>)}
            </div>}
            {selectedDetails && <div className="details-panel">
              <div className="details-heading"><div><div className="eyebrow">Day {selectedDetails.day.day_number}</div><h3>{selectedDetails.day.title}: results</h3></div><button className="icon-button" onClick={() => setSelectedDetails(null)} aria-label="Close results">×</button></div>
              <div className="answer-key"><b>Answer key</b>{selectedDetails.ingredients.map((ingredient) => <span key={ingredient.id}>{ingredient.name}: <strong>{ingredient.isPresent ? 'In brew' : 'Not in'}</strong></span>)}</div>
              {selectedDetails.submissions.length === 0 ? <p className="muted small">No participants have submitted guesses yet.</p> : <div className="submission-list">{selectedDetails.submissions.map((submission) => <div className="submission-row" key={submission.userId}><div><b>{submission.displayName}</b><span>{submission.breakdown.map((answer) => `${answer.ingredientName}: ${answer.choice === 'IN' ? 'In' : answer.choice === 'NOT_IN' ? 'Not in' : 'No decision'} (${answer.points > 0 ? '+1' : answer.points < 0 ? '−1' : '0'})`).join(' · ')}</span></div><strong className={submission.score > 0 ? 'positive' : submission.score < 0 ? 'negative' : 'neutral'}>{formatPoints(submission.score)}</strong></div>)}</div>}
              {selectedDetails.day.status !== 'REVEALED' && <p className="muted small">Scores above are a host preview and are not visible to participants until you reveal the day.</p>}
            </div>}
          </section>
        </div>}
      </main>
      <footer className="site-footer">Host view · Correct answers remain private until revealed.</footer>
    </div>
  );
}

function StatusPill({ status }) {
  const label = status === 'OPEN' ? 'Open' : status === 'CLOSED' ? 'Closed' : 'Revealed';
  return <span className={`status-pill ${status.toLowerCase()}`}>{label}</span>;
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatPoints(value) {
  return value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '0';
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
