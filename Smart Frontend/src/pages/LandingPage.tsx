import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const DEMO_BLOCKS = [
  {
    title: 'Smart Suggestion',
    content: 'Pay ₹500 to Rahul',
  },
  {
    title: 'Best Strategy',
    content: 'Collect ₹3000 from Arjun',
  },
  {
    title: 'After this',
    lines: ["You'll owe nothing", 'Arjun will still owe you ₹3500'],
  },
];

const HOW_IT_WORKS = [
  'Always know your next best move',
  'No confusion, no calculations',
  "Just follow the step and you’re done",
];

export default function LandingPage() {
  const navigate = useNavigate();
  const demoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    document.title = 'Smart Expense';
  }, []);

  function scrollToDemo() {
    demoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="min-h-screen bg-stone-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">

        {/* Hero */}
        <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-10 text-center shadow-sm sm:px-10 sm:py-14">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
              Stop tracking. Start deciding.
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
              {'We tell you exactly who to pay (or collect from) next — and what happens after.'}
            </p>
            <p className="mt-3 text-sm text-slate-500">
              Group expense coordination, intelligently simplified.
            </p>
          </div>

          {/* CTA pair */}
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="inline-flex h-[50px] w-full items-center justify-center rounded-xl bg-slate-950 px-7 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
            >
              Open Smart Expense
            </button>
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="inline-flex h-[50px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-7 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Create account
            </button>
          </div>

          {/* Tertiary anchor */}
          <button
            type="button"
            onClick={scrollToDemo}
            className="mt-5 text-xs text-slate-400 transition hover:text-slate-600"
          >
            See how it works &darr;
          </button>
        </section>

        {/* Product demo */}
        <section ref={demoRef} className="mt-10">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">What Smart Expense does</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600 sm:text-base">
              The product shows the next move, the best strategy, and the outcome before you act.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-slate-500">Trip with friends</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {DEMO_BLOCKS.map(block => (
              <div key={block.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{block.title}</p>
                {'content' in block ? (
                  <p className="mt-3 text-lg font-semibold text-slate-950">{block.content}</p>
                ) : (
                  <div className="mt-3 space-y-2 text-sm text-slate-700">
                    {block.lines.map(line => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-950">How it works</h2>
          </div>
          <ul className="mx-auto mt-6 max-w-xl space-y-3 text-center text-sm text-slate-700 sm:text-base">
            {HOW_IT_WORKS.map(point => (
              <li key={point}>{`• ${point}`}</li>
            ))}
          </ul>
        </section>

        {/* Bottom CTA */}
        <section className="mt-10 text-center">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Open Smart Expense
          </button>
        </section>

      </div>
    </main>
  );
}
