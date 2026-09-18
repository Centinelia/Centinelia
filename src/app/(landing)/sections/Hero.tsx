'use client';

interface HeroProps {
  onCallbackClick: () => void;
  onElencoClick: () => void;
}

export default function Hero({ onCallbackClick, onElencoClick }: HeroProps) {
  return (
    <section className="relative min-h-[80vh] flex flex-col justify-center items-center px-6 py-24 bg-white text-center">
      <p className="text-sm uppercase tracking-wider text-[#6C3BFF] mb-6">
        Empleados digitales para tu negocio
      </p>
      <h1 className="text-5xl md:text-6xl font-bold leading-tight text-[#1A0A3B] mb-6 max-w-3xl">
        Contesta el teléfono. Cotiza.
        <br />
        Factura. Cobra. Agenda.
      </h1>
      <p className="text-2xl md:text-3xl font-medium text-[#1A0A3B] mb-4">
        Sin contratar a nadie.
      </p>
      <p className="text-lg text-gray-600 mb-10 max-w-xl">
        Empleados digitales que empiezan a trabajar el próximo lunes.
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={onCallbackClick}
          className="px-8 py-4 bg-[#6C3BFF] text-white font-semibold rounded-lg hover:bg-[#5A2FD9] transition"
        >
          Deja que Nia te llame
        </button>
        <button
          onClick={onElencoClick}
          className="px-8 py-4 bg-transparent text-[#6C3BFF] font-semibold rounded-lg border-2 border-[#6C3BFF] hover:bg-[#6C3BFF]/5 transition"
        >
          Conoce al equipo
        </button>
      </div>
    </section>
  );
}
