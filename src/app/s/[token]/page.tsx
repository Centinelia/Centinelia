export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { verifySurveyToken } from '@/lib/ops/survey-dispatch';
import { createAdminClient } from '@/lib/supabase/admin';
import SurveyForm from './SurveyForm';

interface Q { id: string; orden: number; texto: string; tipo: string; opciones: string[] | null }
interface Survey { id: string; nombre: string; descripcion: string | null; questions: Q[]; businessName: string; brandColor: string }

export default async function PublicSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifySurveyToken(token);
  if (!verified) return notFound();

  const supabase = createAdminClient();
  const { data: s } = await supabase
    .from('surveys')
    .select('id, nombre, descripcion, agent_id, survey_questions(id, orden, texto, tipo, opciones)')
    .eq('id', verified.surveyId)
    .single();
  if (!s) return notFound();

  const { data: agent } = await supabase
    .from('voice_agents')
    .select('business_name, brand_color')
    .eq('id', s.agent_id as string)
    .single();

  const questions = ((s.survey_questions ?? []) as Q[]).sort((a, b) => a.orden - b.orden);
  const survey: Survey = {
    id:           s.id as string,
    nombre:       s.nombre as string,
    descripcion:  (s.descripcion as string | null) ?? null,
    questions,
    businessName: (agent?.business_name as string | null) ?? 'Centinelia',
    brandColor:   (agent?.brand_color as string | null) ?? '#6C3BFF',
  };

  return (
    <main style={{ minHeight: '100vh', background: '#fafbff', padding: '32px 16px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 32, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{survey.businessName}</div>
        <h1 style={{ margin: '4px 0 8px', fontSize: 22, color: '#1a0a3b' }}>{survey.nombre}</h1>
        {survey.descripcion && <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 14 }}>{survey.descripcion}</p>}
        <SurveyForm token={token} questions={questions} brandColor={survey.brandColor} />
      </div>
    </main>
  );
}
