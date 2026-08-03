'use client';

/**
 * TODO(nazre): implementación real del form + submit endpoint pendiente.
 * Este stub existe para que el build de Next.js no falle mientras terminas
 * la feature. Cuando la subas, reemplaza este archivo con tu implementación.
 */

interface Question { id: string; orden: number; texto: string; tipo: string; opciones: string[] | null }

export default function SurveyForm({ questions, brandColor }: {
  token: string;
  questions: Question[];
  brandColor: string;
}) {
  return (
    <div>
      <ol style={{ padding: 0, listStylePosition: 'inside', color: '#1a0a3b' }}>
        {questions.map(q => (
          <li key={q.id} style={{ margin: '12px 0', fontSize: 14 }}>
            {q.texto}
          </li>
        ))}
      </ol>
      <div style={{ marginTop: 24, padding: 16, background: '#fafbff', borderRadius: 8, borderLeft: `3px solid ${brandColor}`, color: '#6b7280', fontSize: 13 }}>
        Encuesta en preparación. Podrás responder pronto.
      </div>
    </div>
  );
}
