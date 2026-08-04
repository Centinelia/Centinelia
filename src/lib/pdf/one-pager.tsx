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

      {/* Secciones en cajas de color sutil */}
      {sections.map((section, i) => (
        <View key={i} wrap={false} style={{
          backgroundColor: accentBg,
          borderRadius:    8,
          padding:         14,
          marginBottom:    12,
          borderLeftWidth: 3,
          borderLeftColor: accent,
        }}>
          <Text style={{
            fontSize:      13,
            fontFamily:    'Helvetica-Bold',
            color:         accent,
            marginBottom:  6,
          }}>
            {section.heading}
          </Text>
          {section.body && (
            <Text style={{ fontSize: 10, color: '#1A0A3B', lineHeight: 1.5, marginBottom: section.bullets?.length ? 8 : 0 }}>
              {section.body}
            </Text>
          )}
          {section.bullets && section.bullets.length > 0 && (
            <View>
              {section.bullets.map((bullet, bi) => (
                <View key={bi} style={{ flexDirection: 'row', marginBottom: 3 }}>
                  <Text style={{ width: 12, color: accent, fontFamily: 'Helvetica-Bold' }}>•</Text>
                  <Text style={{ flex: 1, fontSize: 10, color: '#1A0A3B', lineHeight: 1.5 }}>
                    {bullet}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      ))}

      {/* CTA destacado al final */}
      {cta && (
        <View wrap={false} style={{
          backgroundColor: accent,
          borderRadius:    8,
          padding:         16,
          marginTop:       8,
        }}>
          <Text style={{ fontSize: 11, color: '#fff', lineHeight: 1.5, fontFamily: 'Helvetica-Bold' }}>
            {cta}
          </Text>
        </View>
      )}

    </BrandedDoc>
  );
}
