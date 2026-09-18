export default function ComoFunciona() {
  return (
    <section className="py-24 px-6 bg-[#FAFBFF]">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold text-[#1A0A3B] mb-12 text-center">
          Cómo funciona
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#6C3BFF] text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold">1</div>
            <p className="text-lg font-medium text-[#1A0A3B]">Eliges qué empleado necesitas.</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#6C3BFF] text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold">2</div>
            <p className="text-lg font-medium text-[#1A0A3B]">En una llamada de 30 minutos lo capacitamos con tu info.</p>
          </div>
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-[#6C3BFF] text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold">3</div>
            <p className="text-lg font-medium text-[#1A0A3B]">Empieza a trabajar el próximo lunes.</p>
          </div>
        </div>
        <p className="text-center text-gray-600 mt-12">Sin instalar nada. Sin cambiar tus sistemas.</p>
      </div>
    </section>
  );
}
