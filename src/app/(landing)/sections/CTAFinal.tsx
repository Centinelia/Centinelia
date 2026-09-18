'use client';

interface Props {
  onCallbackClick: () => void;
}

export default function CTAFinal({ onCallbackClick }: Props) {
  return (
    <section className="py-24 px-6 bg-[#1A0A3B] text-white text-center">
      <h2 className="text-3xl md:text-5xl font-bold mb-8 max-w-2xl mx-auto">
        Contrata a tu primer empleado digital hoy.
      </h2>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onCallbackClick}
          className="px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] transition"
        >
          Deja que Nia te llame
        </button>
        <a
          href="/cotizar"
          className="px-8 py-4 bg-transparent text-white font-semibold rounded-lg border-2 border-white hover:bg-white/10 transition inline-block"
        >
          Agenda una llamada humana
        </a>
      </div>
    </section>
  );
}
