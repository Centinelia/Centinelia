import { CASOS } from '../lib/casos-reales';

export default function CasosReales() {
  const visibles = CASOS.filter((c) => c.permiso);
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Ya está trabajando en negocios como el tuyo.
        </h2>
        <div className="grid gap-8">
          {visibles.map((c) => (
            <div key={c.slug} data-testid="caso-real" className="bg-[#FAFBFF] rounded-xl p-8">
              <p className="text-sm text-gray-500 mb-2">{c.empresa}</p>
              <p className="text-2xl font-bold text-[#1A0A3B] mb-3">{c.metricaPrincipal}</p>
              <p className="text-gray-600">{c.contexto}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
