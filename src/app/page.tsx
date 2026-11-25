import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-500 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-700">Onboarding</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Onboard Goodies 🎁</h1>
        <p className="mt-2 text-slate-600">Welcome kits for newly onboarded employees.</p>
        <div className="mt-6 grid gap-3">
          <Link href="/collect" className="rounded-xl bg-brand-600 py-3 text-center font-bold text-white">I’m collecting my goodies</Link>
          <Link href="/desk" className="rounded-xl bg-slate-900 py-3 text-center font-bold text-white">Distribution desk</Link>
          <Link href="/admin" className="rounded-xl py-3 text-center font-semibold text-slate-600 ring-1 ring-slate-200">Organizer console</Link>
        </div>
      </div>
    </main>
  );
}
