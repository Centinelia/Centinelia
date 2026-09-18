import { INTEGRACIONES } from '../lib/integraciones-catalog';

export default function Integraciones() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-4">
          Se conecta con lo que ya usas.
        </h2>
        <p className="text-gray-600 mb-12">
          El empleado trabaja con tus sistemas actuales. No cambia nada.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {INTEGRACIONES.map((i) => (
            <div key={i.key} className="bg-[#FAFBFF] rounded-lg p-6 flex items-center justify-center text-gray-700 font-medium">
              {i.label}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
