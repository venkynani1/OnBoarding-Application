'use client';
import { useEffect, useRef, useState } from 'react';

interface View {
  status: 'pending' | 'collected' | 'not_found';
  employee_id: string; name: string | null; location?: string | null; onboarded_on?: string | null;
  collected_at?: string | null; token?: string | null;
}
const KEY = 'og-collect';
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

/** Participant: scan the desk QR, enter employee ID, show this screen to the distributor. */
export default function CollectPage() {
  const [emp, setEmp] = useState('');
  const [view, setView] = useState<View | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const polling = useRef(false);

  async function checkin(id: string) {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/collect/checkin', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employee_id: id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message ?? 'Something went wrong');
      setView(j); setToken(j.token ?? null);
      try { if (j.token) localStorage.setItem(KEY, JSON.stringify({ e: j.employee_id })); } catch { /* */ }
    } catch (e) { setErr(e instanceof Error ? e.message : 'Network problem — try again'); } finally { setBusy(false); }
  }

  // reopened the page: resume where they were
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (s?.e) { setEmp(s.e); checkin(s.e); } } catch { /* */ } }, []);

  // waiting at the desk: flip to "Collected" as soon as a distributor taps it
  useEffect(() => {
    if (view?.status !== 'pending' || !token) return;
    const t = setInterval(async () => {
      if (polling.current || document.visibilityState !== 'visible') return;
      polling.current = true;
      try {
        const r = await fetch(`/api/collect/status?emp=${encodeURIComponent(view.employee_id)}&t=${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (r.ok) setView(await r.json());
      } catch { /* retry */ } finally { polling.current = false; }
    }, 3000);
    return () => clearInterval(t);
  }, [view, token]);

  const reset = () => { try { localStorage.removeItem(KEY); } catch { /* */ } setView(null); setToken(null); setEmp(''); setErr(''); };
  const first = view?.name?.split(' ')[0] ?? '';

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 px-4 pb-14 pt-8 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-white/70">Welcome aboard</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Collect your goodies 🎁</h1>
        </div>
      </header>
      <div className="mx-auto -mt-8 max-w-md px-4 pb-10">
        {!view && (
          <form onSubmit={(e) => { e.preventDefault(); if (emp.trim().length >= 2) checkin(emp.trim()); }} className="rounded-3xl bg-white p-6 shadow-lg ring-1 ring-slate-200">
            <label htmlFor="emp" className="block text-xs font-bold uppercase tracking-wide text-slate-500">Your employee ID</label>
            <input id="emp" className="input mt-1 h-14 text-xl font-semibold tracking-wide" value={emp} autoFocus
              onChange={(e) => setEmp(e.target.value.toUpperCase().replace(/\s/g, ''))} maxLength={40} autoComplete="off" inputMode="text" placeholder="e.g. 1000***" />
            {err && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">{err}</p>}
            <button disabled={busy || emp.trim().length < 2} className="mt-4 w-full rounded-xl bg-brand-600 py-3.5 text-lg font-bold text-white disabled:opacity-50">
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        {view?.status === 'pending' && (
          <section className="overflow-hidden rounded-3xl bg-white text-center shadow-lg ring-4 ring-amber-400">
            <div className="bg-amber-400 px-4 py-2 text-sm font-black uppercase tracking-widest text-amber-950">Show this at the desk</div>
            <div className="p-6">
              <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-slate-100 text-5xl">🎁</div>
              <p className="mt-4 text-3xl font-black leading-tight">{view.name}</p>
              <p className="mt-1 font-mono text-sm text-slate-500">{view.employee_id}{view.location ? ` · ${view.location}` : ''}</p>
              <p className="mt-5 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-lg font-black text-amber-900 ring-1 ring-amber-300">Collection pending</p>
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" /> Waiting for the desk to hand over your goodies…</p>
            </div>
          </section>
        )}

        {view?.status === 'collected' && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-lg ring-4 ring-emerald-500">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700">✓</div>
            <p className="mt-4 text-2xl font-black">Collected!</p>
            <p className="mt-1 text-slate-600">{view.name} · <span className="font-mono">{view.employee_id}</span></p>
            {view.collected_at && <p className="mt-1 text-sm text-slate-500">at {time(view.collected_at)}</p>}
            <p className="mt-4 text-sm text-slate-500">Welcome aboard, {first}! 🎉</p>
          </section>
        )}

        {view?.status === 'not_found' && (
          <section className="rounded-3xl bg-white p-8 text-center shadow-lg ring-2 ring-rose-300">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-3xl">⚠️</div>
            <p className="mt-4 font-mono text-xl font-black">{view.employee_id}</p>
            <p className="mt-2 text-slate-700">This employee ID is not on the onboarding list.</p>
            <p className="mt-1 text-sm text-slate-500">Check the ID and try again, or speak to the organizers at the desk.</p>
            <button onClick={reset} className="mt-5 w-full rounded-xl bg-brand-600 py-3 font-bold text-white">Try again</button>
          </section>
        )}

        {view && view.status !== 'not_found' && <button onClick={reset} className="mx-auto mt-6 block text-xs text-slate-400 underline">Not you? Enter a different employee ID</button>}
      </div>
    </main>
  );
}
