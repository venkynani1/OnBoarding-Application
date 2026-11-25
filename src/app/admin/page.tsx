'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Summary {
  total: number; collected: number; waiting: number; desk_pin: string | null;
  by_location: { location: string | null; total: number; collected: number }[];
  by_date: { d: string | null; total: number; collected: number }[];
  activity: { at: string; emp_id: string | null; action: string; actor: string | null; detail: string | null }[];
}
interface P { emp_id: string; emp_name: string; onboarded_on: string | null; onboarded_raw: string | null; location: string | null; checked_in_at: string | null; collected_at: string | null; collected_by: string | null }
interface List { rows: P[]; total: number; page: number; locations: string[] }
interface ImportResult { dry: boolean; mode: string; file: string; columns: Record<string, string>; rows: number; added: number; updated: number; unchanged: number; removed: number; kept_collected: number; total: number; problems: { row: number; reason: string }[]; problem_count: number }

const dt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
const day = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }) : d ?? '');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const ACTION: Record<string, string> = { collected: 'Collected', undo: 'Undo', skip: 'Skipped', import: 'Import', add: 'Added', delete: 'Deleted', desk_sign_in: 'Desk sign-in', desk_finished: 'Desk finished', desk_pin_changed: 'Desk PIN changed', clear_all: 'List cleared' };

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error?.message ?? 'Something went wrong') as Error & { status?: number }; e.status = r.status; throw e; }
  return j as T;
}

function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try { await call('/api/admin/login', { password: pw }); onDone(); } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); } finally { setBusy(false); }
      }}>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Onboard Goodies</p>
        <h1 className="mt-1 text-2xl font-black">Organizer console</h1>
        <label className="label mt-5">Password</label>
        <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
        <button disabled={busy || !pw} className="mt-5 w-full rounded-xl bg-brand-600 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex items-center gap-2"><h2 className="mr-auto text-sm font-bold uppercase tracking-wide text-slate-500">{title}</h2>{right}</div>
      {children}
    </section>
  );
}

function Importer({ onDone, say }: { onDone: () => void; say: (t: 'ok' | 'err', s: string) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);

  async function send(dry: boolean) {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.set('file', file); fd.set('mode', mode); if (dry) fd.set('dry', '1');
      const r = await fetch('/api/admin/import', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? 'Import failed');
      if (dry) setPreview(j); else { setDone(j); setPreview(null); setFile(null); if (input.current) input.current.value = ''; say('ok', `Imported — ${j.added} new, ${j.updated} updated`); onDone(); }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Import failed'); } finally { setBusy(false); }
  }

  const R = preview ?? done;
  return (
    <Card title="Import onboarded list (Excel)" right={<a href="/api/admin/template" className="text-xs font-semibold text-brand-700 underline">Download template</a>}>
      <p className="text-sm text-slate-600">Columns: <strong>Emp ID, Emp Name, Onboarded Date, Onboarded Location</strong>. .xlsx or .csv. Header names can vary a little (e.g. “Employee ID”, “Date of Joining”, “Location”).</p>
      <input ref={input} type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setDone(null); setErr(''); }}
        className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700" />
      <div className="mt-3 space-y-1.5 text-sm">
        <label className="flex items-start gap-2"><input type="radio" checked={mode === 'merge'} onChange={() => { setMode('merge'); setPreview(null); }} className="mt-1" />
          <span><strong>Add / update</strong> — add new people, update existing ones. Nobody is removed. (Use this for each new batch.)</span></label>
        <label className="flex items-start gap-2"><input type="radio" checked={mode === 'replace'} onChange={() => { setMode('replace'); setPreview(null); }} className="mt-1" />
          <span><strong>Replace list</strong> — also remove people not in this file. People who already collected are always kept.</span></label>
      </div>
      {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button disabled={!file || busy} onClick={() => send(true)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-brand-700 ring-1 ring-brand-500 disabled:opacity-40">{busy && !preview ? 'Checking…' : 'Check file'}</button>
        <button disabled={!file || busy || !preview} onClick={() => send(false)} className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">
          {busy && preview ? 'Importing…' : preview ? `Import ${preview.rows} rows` : 'Import (check file first)'}</button>
      </div>
      {R && (
        <div className={`mt-4 rounded-2xl p-4 text-sm ring-1 ${R.dry ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
          <p className="font-bold">{R.dry ? `Preview of ${R.file} — nothing saved yet` : `Imported ${R.file}`}</p>
          <p className="mt-1 text-xs text-slate-500">Columns used: {Object.entries(R.columns).map(([k, v]) => `${v} → ${({ emp_id: 'Emp ID', emp_name: 'Name', onboarded_on: 'Date', location: 'Location' } as Record<string, string>)[k]}`).join(', ')}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat n={R.rows} label="rows read" /><Stat n={R.added} label="new" /><Stat n={R.updated} label="updated" />
            {R.mode === 'replace' ? <Stat n={R.removed} label="removed" /> : <Stat n={R.unchanged} label="unchanged" />}
          </div>
          <p className="mt-2">List total after import: <strong>{R.total}</strong>{R.mode === 'replace' && R.kept_collected ? ` (kept ${R.kept_collected} not in file who already collected)` : ''}</p>
          {R.problem_count > 0 && (
            <details className="mt-2" open={R.problem_count <= 10}>
              <summary className="cursor-pointer font-semibold text-amber-800">{R.problem_count} row{R.problem_count > 1 ? 's' : ''} need attention</summary>
              <ul className="mt-1 max-h-48 list-disc overflow-auto pl-5 text-xs text-slate-700">{R.problems.map((p, i) => <li key={i}>Row {p.row}: {p.reason}</li>)}</ul>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
const Stat = ({ n, label }: { n: number; label: string }) => <div className="rounded-xl bg-white p-2 text-center ring-1 ring-slate-200"><p className="text-xl font-black">{n}</p><p className="text-xs text-slate-500">{label}</p></div>;

export default function AdminPage() {
  const [signed, setSigned] = useState<boolean | null>(null);
  const [s, setS] = useState<Summary | null>(null);
  const [list, setList] = useState<List | null>(null);
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [loc, setLoc] = useState(''); const [page, setPage] = useState(0);
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [origin, setOrigin] = useState('');
  const [pin, setPin] = useState('');
  const [add, setAdd] = useState<{ employee_id: string; name: string; date: string; location: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const say = useCallback((tone: 'ok' | 'err', text: string) => { setToast({ tone, text }); setTimeout(() => setToast(null), 4000); }, []);
  useEffect(() => { setOrigin(window.location.origin); call<{ signed_in: boolean }>('/api/admin/login').then((r) => setSigned(r.signed_in)).catch(() => setSigned(false)); }, []);

  const loadSummary = useCallback(async () => {
    try { setS(await call<Summary>('/api/admin/summary')); } catch (e) { if ((e as { status?: number }).status === 401) setSigned(false); }
  }, []);
  const loadList = useCallback(async () => {
    const p = new URLSearchParams({ q: search, status, page: String(page) }); if (loc) p.set('location', loc);
    try { setList(await call<List>(`/api/admin/participants?${p}`)); } catch (e) { if ((e as { status?: number }).status === 401) setSigned(false); }
  }, [search, status, loc, page]);
  const reload = useCallback(() => { loadSummary(); loadList(); }, [loadSummary, loadList]);

  useEffect(() => { if (!signed) return; loadSummary(); const t = setInterval(() => { if (document.visibilityState === 'visible') loadSummary(); }, 10000); return () => clearInterval(t); }, [signed, loadSummary]);
  useEffect(() => { if (!signed) return; const t = setTimeout(loadList, 250); return () => clearTimeout(t); }, [signed, loadList]);

  async function act(url: string, b: unknown, ok: string, key: string) {
    setBusy(key);
    try { await call(url, b); say('ok', ok); reload(); } catch (e) { say('err', e instanceof Error ? e.message : 'Failed'); } finally { setBusy(null); }
  }

  if (signed === null) return <p className="p-10 text-center text-slate-400">Loading…</p>;
  if (!signed) return <Login onDone={() => setSigned(true)} />;

  return (
    <main className="min-h-screen bg-slate-100 pb-16">
      <header className="flex flex-wrap items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <div className="mr-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Onboard Goodies</p>
          <h1 className="text-lg font-black leading-tight">Organizer console</h1>
        </div>
        <a href="/api/admin/report" className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-bold text-white">Download report</a>
        <button className="text-xs font-semibold text-slate-500 underline" onClick={async () => { await call('/api/admin/logout', {}); setSigned(false); }}>Sign out</button>
      </header>
      {toast && <div className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.tone === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{toast.text}</div>}

      <div className="mx-auto max-w-6xl space-y-4 p-4">
        {s && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[['On the list', s.total, 'text-slate-900'], ['Collected', s.collected, 'text-emerald-700'], ['Pending', s.total - s.collected, 'text-amber-700'], ['At the desk now', s.waiting, 'text-brand-700']].map(([l, n, c]) => (
              <div key={l as string} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{l}</p>
                <p className={`text-3xl font-black ${c}`}>{n as number}</p>
                {l === 'Collected' && <div className="mt-2 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct(s.collected, s.total)}%` }} /></div>}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          <Importer onDone={reload} say={say} />
          <Card title="Distribution desk">
            <p className="text-sm text-slate-600">Send distributors the desk link and PIN. Each signs in with their name; one device shows the QR and everyone shares the live queue.</p>
            <div className="mt-3 space-y-2 text-sm">
              <p>Desk link: <a className="font-mono font-semibold text-brand-700 underline" href="/desk" target="_blank">{origin.replace(/^https?:\/\//, '')}/desk</a></p>
              <p>Participant QR opens: <span className="font-mono">{origin.replace(/^https?:\/\//, '')}/collect</span></p>
              <p>Desk PIN: <strong className="font-mono text-lg tracking-widest">{s?.desk_pin ?? '…'}</strong></p>
            </div>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); act('/api/admin/pin', { pin }, 'Desk PIN changed — distributors must sign in again', 'pin').then(() => setPin('')); }}>
              <input className="input font-mono tracking-widest" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="New PIN (4–8 digits)" inputMode="numeric" />
              <button disabled={pin.length < 4 || busy === 'pin'} className="whitespace-nowrap rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">Change PIN</button>
            </form>
            <p className="mt-1 text-xs text-slate-500">Changing the PIN signs every distributor out.</p>
          </Card>
        </div>

        {s && (s.by_location.length > 0 || s.by_date.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            {[['By onboarded location', s.by_location.map((r) => ({ k: r.location ?? '(no location)', ...r }))], ['By onboarded date', s.by_date.map((r) => ({ k: day(r.d) || '(no date)', ...r }))]].map(([title, rows]) => (
              <Card key={title as string} title={title as string}>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1">{(title as string).replace('By onboarded ', '')}</th><th className="text-right">Total</th><th className="text-right">Collected</th><th className="text-right">Pending</th><th className="w-24"></th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(rows as { k: string; total: number; collected: number }[]).map((r) => (
                      <tr key={r.k}><td className="py-1.5 font-semibold">{r.k}</td><td className="text-right">{r.total}</td><td className="text-right text-emerald-700">{r.collected}</td><td className="text-right text-amber-700">{r.total - r.collected}</td>
                        <td className="pl-3"><div className="h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct(r.collected, r.total)}%` }} /></div></td></tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            ))}
          </div>
        )}

        <Card title={`Participants${list ? ` (${list.total})` : ''}`} right={<button onClick={() => setAdd(add ? null : { employee_id: '', name: '', date: '', location: '' })} className="text-xs font-semibold text-brand-700 underline">{add ? 'Close' : '+ Add one person'}</button>}>
          {add && (
            <form className="mb-4 grid gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-5" onSubmit={(e) => { e.preventDefault(); act('/api/admin/participant', add, `${add.name} added`, 'add').then(() => setAdd(null)); }}>
              <input className="input" placeholder="Emp ID" value={add.employee_id} onChange={(e) => setAdd({ ...add, employee_id: e.target.value.toUpperCase().replace(/\s/g, '') })} />
              <input className="input" placeholder="Emp name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
              <input className="input" type="date" value={add.date} onChange={(e) => setAdd({ ...add, date: e.target.value })} />
              <input className="input" placeholder="Location" value={add.location} onChange={(e) => setAdd({ ...add, location: e.target.value })} list="locs" />
              <button disabled={!add.employee_id || add.name.trim().length < 2 || busy === 'add'} className="rounded-xl bg-brand-600 py-2 text-sm font-bold text-white disabled:opacity-40">Add / update</button>
              <datalist id="locs">{list?.locations.map((l) => <option key={l} value={l} />)}</datalist>
            </form>
          )}
          <div className="flex flex-wrap gap-2">
            <input className="input max-w-xs" placeholder="Search ID or name" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
            <select className="rounded-lg border border-slate-300 bg-white px-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
              <option value="all">All</option><option value="pending">Pending</option><option value="waiting">At the desk now</option><option value="collected">Collected</option>
            </select>
            <select className="rounded-lg border border-slate-300 bg-white px-2 text-sm" value={loc} onChange={(e) => { setLoc(e.target.value); setPage(0); }}>
              <option value="">All locations</option>{list?.locations.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead><tr className="text-left text-xs uppercase text-slate-500"><th className="py-1.5">Emp ID</th><th>Name</th><th>Onboarded</th><th>Location</th><th>Status</th><th></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {list?.rows.map((p) => (
                  <tr key={p.emp_id}>
                    <td className="py-2 font-mono text-xs">{p.emp_id}</td>
                    <td className="font-semibold">{p.emp_name}</td>
                    <td className="text-slate-600">{p.onboarded_on ? day(p.onboarded_on) : <span className="text-amber-700">{p.onboarded_raw}</span>}</td>
                    <td className="text-slate-600">{p.location}</td>
                    <td>{p.collected_at
                      ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-200" title={p.collected_by ?? ''}>Collected {dt(p.collected_at)}{p.collected_by ? ` · ${p.collected_by}` : ''}</span>
                      : p.checked_in_at ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 ring-1 ring-brand-100">At the desk</span>
                      : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-200">Pending</span>}</td>
                    <td className="whitespace-nowrap text-right text-xs">
                      {p.collected_at
                        ? <button disabled={!!busy} onClick={() => { if (confirm(`Undo collection for ${p.emp_name}?`)) act('/api/admin/mark', { employee_id: p.emp_id, action: 'undo' }, 'Undone', p.emp_id); }} className="font-semibold text-rose-700 hover:underline">Undo</button>
                        : <>
                          <button disabled={!!busy} onClick={() => act('/api/admin/mark', { employee_id: p.emp_id, action: 'collect' }, `${p.emp_name} marked collected`, p.emp_id)} className="font-semibold text-emerald-700 hover:underline">Mark collected</button>
                          <button disabled={!!busy} onClick={() => { if (confirm(`Remove ${p.emp_name} from the list?`)) act('/api/admin/participant', { action: 'delete', employee_id: p.emp_id }, 'Removed', p.emp_id); }} className="ml-3 font-semibold text-slate-400 hover:text-rose-700">Remove</button>
                        </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list && list.rows.length === 0 && <p className="p-8 text-center text-slate-400">{list.total === 0 && !search && status === 'all' && !loc ? 'No one yet — import your Excel sheet above.' : 'No matches.'}</p>}
          </div>
          {list && list.total > 50 && (
            <div className="mt-3 flex items-center justify-end gap-3 text-sm">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="font-semibold text-brand-700 disabled:opacity-30">← Prev</button>
              <span className="text-slate-500">{page * 50 + 1}–{Math.min((page + 1) * 50, list.total)} of {list.total}</span>
              <button disabled={(page + 1) * 50 >= list.total} onClick={() => setPage(page + 1)} className="font-semibold text-brand-700 disabled:opacity-30">Next →</button>
            </div>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Recent activity">
            <ul className="divide-y divide-slate-100 text-sm">
              {s?.activity.map((a, i) => (
                <li key={i} className="flex gap-3 py-1.5"><span className="w-28 shrink-0 text-xs text-slate-400">{dt(a.at)}</span>
                  <span className="min-w-0 flex-1 truncate"><strong>{ACTION[a.action] ?? a.action}</strong>{a.emp_id ? <span className="font-mono text-xs"> {a.emp_id}</span> : ''}{a.detail ? ` — ${a.detail}` : ''}</span>
                  <span className="text-xs text-slate-500">{a.actor}</span></li>
              ))}
              {s && !s.activity.length && <li className="py-3 text-slate-400">Nothing yet.</li>}
            </ul>
          </Card>
          <Card title="Start over">
            <p className="text-sm text-slate-600">Delete the whole list, including collection records. Download the report first.</p>
            <button className="mt-3 rounded-xl px-4 py-2 text-sm font-bold text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50" onClick={() => {
              const c = prompt('This deletes everyone on the list. Type DELETE to confirm.');
              if (c) act('/api/admin/clear', { confirm: c }, 'List cleared', 'clear');
            }}>Delete all participants…</button>
          </Card>
        </div>
      </div>
    </main>
  );
}
