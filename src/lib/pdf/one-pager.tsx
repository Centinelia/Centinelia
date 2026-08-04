import { View, Text } from '@react-pdf/renderer';
import { BrandedDoc, S } from './doc';
import { renderMarkdown } from './markdown';
import type { BrandKit } from '@/lib/brand/kit';

/**
 * One-pager: layout ejecutivo con secciones en cajas de color sutil.
 * Diferente de GenericDocPDF (que es texto plano). Diseñado para dar
 * "vibe" comercial atractiva en 1 página.
 */
export function OnePagerPdf({ brand, title, sections, cta }: {
  brand:    BrandKit;
  title:    string;
  sections: Array<{ heading: string; body: string; bullets?: string[] }>;
  cta?:     string | null;
}) {
  const accent    = brand.color || '#6C3BFF';
  const accentBg  = `${accent}0D`;  // 5% opacity del accent
  const today     = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <BrandedDoc brand={brand} docType={title} subtitle={today}>

      {/* Secciones en cajas de color sutil — compactas para caber en 1 página */}
      {sections.map((section, i) => (
        <View key={i} wrap={false} style={{
          backgroundColor: accentBg,
          borderRadius:    6,
          padding:         10,
          marginBottom:    7,
          borderLeftWidth: 2,
          borderLeftColor: accent,
        }}>
          <Text style={{
            fontSize:      12,
            fontFamily:    'Helvetica-Bold',
            color:         accent,
            marginBottom:  4,
          }}>
            {section.heading}
          </Text>
          {section.body && (
            <Text style={{ fontSize: 9.5, color: '#1A0A3B', lineHeight: 1.4, marginBottom: section.bullets?.length ? 5 : 0 }}>
              {section.body}
            </Text>
          )}
          {section.bullets && section.bullets.length > 0 && (
            <View>
              {section.bullets.map((bullet, bi) => (
                <View key={bi} style={{ flexDirection: 'row', marginBottom: 2 }}>
                  <Text style={{ width: 10, color: accent, fontFamily: 'Helvetica-Bold', fontSize: 9.5 }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 9.5, color: '#1A0A3B', lineHeight: 1.4 }}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      {/* CTA destacado al final — compacto */}
      {cta && (
        <View wrap={false} style={{
          backgroundColor: accent,
          borderRadius:    6,
          padding:         11,
          marginTop:       4,
        }}>
          <Text style={{ fontSize: 10.5, color: '#fff', lineHeight: 1.4, fontFamily: 'Helvetica-Bold' }}>
            {cta}
          </Text>
        </View>
      )}

    </BrandedDoc>
  );
}
