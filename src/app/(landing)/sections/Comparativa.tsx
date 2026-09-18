const ROWS: { label: string; humano: string; centinelia: string }[] = [
  { label: 'Arranca en',                humano: '2 a 4 semanas',       centinelia: 'El siguiente lunes' },
  { label: 'Sueldo mensual',            humano: '$12,000 a $25,000',   centinelia: 'Desde $2,997' },
  { label: 'IMSS y prestaciones',       humano: '+30% del sueldo',     centinelia: 'Incluido en tu plan' },
  { label: 'Aguinaldo',                 humano: '15 días',              centinelia: 'No aplica' },
  { label: 'Vacaciones (crecen anual)', humano: 'Sí',                   centinelia: 'No aplica' },
  { label: 'Utilidades (PTU)',          humano: 'Sí',                   centinelia: 'No aplica' },
  { label: 'Faltas y llegadas tarde',   humano: 'Sí',                   centinelia: 'Nunca falta' },
  { label: 'Capacitación',              humano: 'Semanas',              centinelia: '30 minutos' },
  { label: 'Trabaja 24/7',              humano: 'No',                   centinelia: 'Sí' },
  { label: 'Contesta teléfono',         humano: 'Sí',                   centinelia: 'Sí' },
  { label: 'Manda correos',             humano: 'Sí',                   centinelia: 'Sí' },
  { label: 'Usa tus sistemas',          humano: 'Después de entrenarlo', centinelia: 'Desde el día 1' },
  { label: 'Cotiza y factura',          humano: 'Sí',                   centinelia: 'Sí' },
];

export default function Comparativa() {
  return (
    <section className="py-24 px-6 bg-[#FAFBFF]">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Un empleado humano vs. un empleado digital
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b-2 border-[#6C3BFF]">
                <th className="py-4 pr-4"></th>
                <th className="py-4 px-4 text-gray-700">Contratar humano</th>
                <th className="py-4 px-4 text-[#6C3BFF]">Empleado digital Centinelia</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.label} className="border-b border-gray-200">
                  <td className="py-3 pr-4 font-medium text-[#1A0A3B]">{r.label}</td>
                  <td className="py-3 px-4 text-gray-600">{r.humano}</td>
                  <td className="py-3 px-4 text-[#1A0A3B] font-medium">{r.centinelia}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8 text-sm text-gray-600 max-w-3xl mx-auto text-center">
          Un empleado humano en tu negocio, con sueldo y carga laboral completa, cuesta entre $200,000 y $450,000 al año. Un empleado digital de Centinelia arranca desde $35,964 al año.
        </p>
      </div>
    </section>
  );
}
