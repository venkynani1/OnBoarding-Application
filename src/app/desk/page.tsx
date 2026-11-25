'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface Person { employee_id: string; name: string; location: string | null; onboarded_on: string | null; checked_in_at: string }
interface Done { employee_id: string; name: string; location: string | null; collected_at: string; collected_by: string | null }
interface Queue { queue: Person[]; recent: Done[]; collected: number; total: number; waiting: number; locations: string[]; at: string }
interface Lookup { status: 'pending' | 'collected' | 'not_found'; employee_id: string; name: string | null; location?: string | null; onboarded_on?: string | null; collected_at?: string | null; collected_by?: string | null }
interface Me { signed_in: boolean; name: string | null; finished?: boolean }

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const day = (d: string | null | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' }) : d ?? '');

async function call<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(j?.error?.message ?? 'Something went wrong') as Error & { status?: number }; e.status = r.status; throw e; }
  return j as T;
}

function SignIn({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200" onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr('');
        try { await call('/api/desk/unlock', { name, pin }); onDone(); } catch (x) { setErr(x instanceof Error ? x.message : 'Failed'); } finally { setBusy(false); }
      }}>
        <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Onboard Goodies</p>
        <h1 className="mt-1 text-2xl font-black">Distribution desk</h1>
        <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">Your name</label>
        <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus placeholder="e.g. Priya" />
        <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-slate-500">Desk PIN</label>
        <input className="input mt-1 font-mono tracking-widest" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} inputMode="numeric" type="password" />
        {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
        <button disabled={busy || name.trim().length < 2 || pin.length < 4} className="mt-5 w-full rounded-xl bg-brand-600 py-3 font-bold text-white disabled:opacity-50">{busy ? 'Signing in…' : 'Start distributing'}</button>
      </form>
    </main>
  );
}

export default function DeskPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [q, setQ] = useState<Queue | null>(null);
  const [svg, setSvg] = useState('');
  const [url, setUrl] = useState('');
  const [showQr, setShowQr] = useState(true);
  const [loc, setLoc] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [find, setFind] = useState('');
  const [found, setFound] = useState<Lookup | null>(null);
  const inFlight = useRef(false);

  const loadMe = useCallback(() => call<Me>('/api/desk/unlock').then(setMe).catch(() => setMe({ signed_in: false, name: null })), []);
  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => { try { setLoc(localStorage.getItem('og-desk-loc') ?? ''); } catch { /* */ } }, []);

  useEffect(() => {
    const u = `${window.location.origin}/collect`;
    setUrl(u);
    QRCode.toString(u, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }).then(setSvg).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try { setQ(await call<Queue>(`/api/desk/queue${loc ? `?location=${encodeURIComponent(loc)}` : ''}`)); }
    catch (e) { if ((e as { status?: number }).status === 401 || (e as { status?: number }).status === 403) loadMe(); }
    finally { inFlight.current = false; }
  }, [loadMe, loc]);
  useEffect(() => {
    if (!me?.signed_in || me.finished) return;
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 3000);
    return () => clearInterval(t);
  }, [me, load]);

  function say(tone: 'ok' | 'err', text: string) { setToast({ tone, text }); setTimeout(() => setToast(null), 4000); }

  async function mark(emp: string, action: 'collect' | 'undo' | 'skip', label: string) {
    setBusy(emp + action);
    try {
      await call('/api/desk/mark', { employee_id: emp, action });
      say('ok', label);
      if (found?.employee_id === emp) setFound(null);
      await load();
    } catch (e) { say('err', e instanceof Error ? e.message : 'Failed'); await load(); }
    finally { setBusy(null); }
  }

  if (!me) return <p className="p-10 text-center text-slate-400">Loading…</p>;
  if (!me.signed_in) return <SignIn onDone={loadMe} />;
  if (me.finished) return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-lg ring-1 ring-slate-200">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
        <h1 className="mt-4 text-2xl font-black">Thanks, {me.name}!</h1>
        <p className="mt-1 text-slate-600">You’ve finished distributing. Other desks can carry on.</p>
        <a href="/api/admin/report" className="mt-6 block rounded-xl bg-brand-600 py-3 font-bold text-white">Download report (Excel)</a>
        <p className="mt-2 text-xs text-slate-500">Collected and pending, by location and onboarded date — as of now.</p>
        <button className="mt-6 text-xs font-semibold text-slate-500 underline" onClick={async () => { await call('/api/desk/logout', {}); loadMe(); }}>Sign in again to keep distributing</button>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="flex flex-wrap items-center gap-3 bg-white px-4 py-3 shadow-sm">
        <div className="mr-auto">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">Onboard Goodies</p>
          <h1 className="text-lg font-black leading-tight">Goodie distribution</h1>
        </div>
        {q && <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-800 ring-1 ring-emerald-200">{q.collected} / {q.total} collected</p>}
        {!!q?.locations.length && (
          <select className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm" value={loc} title="Show only this onboarded location"
            onChange={(e) => { setLoc(e.target.value); try { localStorage.setItem('og-desk-loc', e.target.value); } catch { /* */ } }}>
            <option value="">All locations</option>
            {q.locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        <span className="text-sm text-slate-500">Desk: <strong className="text-slate-800">{me.name}</strong></span>
        <a href="/api/admin/report" className="rounded-lg px-3 py-1.5 text-sm font-bold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-50">Report</a>
        <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white" onClick={async () => {
          if (!window.confirm('Finish distributing? You can then download the report. Other desks carry on.')) return;
          try { await call('/api/desk/finish', {}); loadMe(); } catch (e) { say('err', e instanceof Error ? e.message : 'Failed'); }
        }}>Finish</button>
        <button className="text-xs font-semibold text-slate-500 underline" onClick={async () => { await call('/api/desk/logout', {}); loadMe(); }}>Sign out</button>
      </header>

      {toast && <div className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${toast.tone === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{toast.text}</div>}

      <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* the single shared QR */}
        <section className="h-fit rounded-3xl bg-white p-5 text-center shadow-sm ring-1 ring-slate-200 lg:sticky lg:top-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">Scan to collect</h2>
            <button className="text-xs font-semibold text-brand-700 lg:hidden" onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide QR' : 'Show QR'}</button>
          </div>
          {showQr && <>
            <div className="mx-auto mt-3 w-full max-w-[18rem] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
            <p className="mt-2 text-sm text-slate-600">Scan → enter employee ID → show your phone</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-400">{url.replace(/^https?:\/\//, '')}</p>
            <button className="mt-3 text-xs font-semibold text-slate-500 underline" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)}>Full screen</button>
          </>}
          {/* for people without a phone */}
          <form className="mt-5 border-t border-slate-100 pt-4 text-left" onSubmit={async (e) => {
            e.preventDefault(); setFound(null);
            try { const r = await call<{ person: Lookup }>(`/api/desk/queue?emp=${encodeURIComponent(find.trim())}`); setFound(r.person); } catch (x) { say('err', x instanceof Error ? x.message : 'Failed'); }
          }}>
            <label className="text-xs font-bold uppercase tracking-wide text-slate-500">No phone? Look up by employee ID</label>
            <div className="mt-1 flex gap-2">
              <input className="input" value={find} onChange={(e) => setFind(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="e.g. 1000***" maxLength={40} />
              <button disabled={find.trim().length < 2} className="rounded-xl bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-40">Find</button>
            </div>
            {found && (
              <div className="mt-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                {found.status === 'not_found'
                  ? <p className="text-sm text-rose-700"><strong className="font-mono">{found.employee_id}</strong> is not on the onboarding list.</p>
                  : <>
                    <p className="font-bold">{found.name} <span className="font-mono text-xs text-slate-500">{found.employee_id}</span></p>
                    <p className="text-xs text-slate-500">{[found.location, day(found.onboarded_on)].filter(Boolean).join(' · ')}</p>
                    {found.status === 'pending' && (
                      <button disabled={busy === found.employee_id + 'collect'} onClick={() => mark(found.employee_id, 'collect', `${found.name} — collected`)}
                        className="mt-2 w-full rounded-xl bg-emerald-600 py-2.5 font-bold text-white disabled:opacity-50">✓ Collected</button>
                    )}
                    {found.status === 'collected' && <p className="mt-1 text-sm font-semibold text-emerald-700">Already collected{found.collected_at ? ` at ${time(found.collected_at)}` : ''}{found.collected_by ? ` by ${found.collected_by}` : ''}</p>}
                  </>}
              </div>
            )}
          </form>
        </section>

        {/* the shared live queue */}
        <section className="space-y-4">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Collection pending — at the desk ({q?.queue.length ?? 0})
            </h2>
            {q && q.queue.length === 0 && <p className="rounded-3xl bg-white p-10 text-center text-slate-400 ring-1 ring-slate-200">Nobody waiting. People appear here as soon as they scan and enter their employee ID.</p>}
            <div className="grid gap-3 sm:grid-cols-2">
              {q?.queue.map((p) => (
                <div key={p.employee_id} className="flex gap-3 rounded-3xl bg-white p-4 shadow-sm ring-2 ring-amber-300">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-3xl">🎁</div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-black leading-tight">{p.name}</p>
                    <p className="font-mono text-xs text-slate-500">{p.employee_id} · since {time(p.checked_in_at)}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{[p.location, p.onboarded_on && `Onboarded ${day(p.onboarded_on)}`].filter(Boolean).join(' · ')}</p>
                    <p className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">Collection pending</p>
                    <div className="mt-2 flex gap-2">
                      <button disabled={!!busy} onClick={() => mark(p.employee_id, 'collect', `${p.name} — collected`)}
                        className="flex-1 rounded-xl bg-emerald-600 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
                        {busy === p.employee_id + 'collect' ? '…' : '✓ Collected'}
                      </button>
                      <button disabled={!!busy} onClick={() => mark(p.employee_id, 'skip', `${p.name} removed from the queue`)} title="Remove from queue (not collected)"
                        className="rounded-xl px-3 text-sm font-semibold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50">Skip</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!!q?.recent.length && (
            <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Just collected</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {q.recent.map((d) => (
                  <li key={d.employee_id} className="flex items-center gap-3 py-2">
                    <span className="text-emerald-600">✓</span>
                    <span className="min-w-0 flex-1 truncate"><strong>{d.name}</strong> <span className="font-mono text-xs text-slate-500">{d.employee_id}</span></span>
                    <span className="text-xs text-slate-400">{time(d.collected_at)}{d.collected_by ? ` · ${d.collected_by}` : ''}</span>
                    {Date.now() - Date.parse(d.collected_at) < 15 * 60 * 1000 && (
                      <button disabled={!!busy} onClick={() => mark(d.employee_id, 'undo', `Undone — ${d.name} is back in the queue`)} className="text-xs font-semibold text-rose-700 hover:underline">Undo</button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
