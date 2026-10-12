// Envío real del correo correctivo a Tortillería por el bug "28 días restantes"
// + proyección exagerada 2026-10-12.
//
// Billing: NO cobra ops a la org (correo correctivo nuestro, no operación del
// negocio) — se manda vía sendEmail directo sin tocar consumeAiOp.
// Ver policy billing-bypass-from-claude-code.

import { config } from 'dotenv';
config({ path: '.env.local' });

import { sendEmail, shell, heading, badge, infoCard, sectionLabel } from '../src/lib/email/send';

const TO           = 'servicioalcliente@tortillasestrella.com.mx';
const businessName = 'Tortillas Estrella';
const resetHuman   = '1 de noviembre de 2026';
const subject      = `Aclaración sobre el aviso del lunes, ${businessName}`;

const body = [
  heading(`Una aclaración sobre el aviso del lunes`, businessName),
  badge(`Aviso corregido`, '#9B6DFF'),
  infoCard(
    `<p style="color:#F1EEFF;font-size:14px;line-height:1.7;margin:0 0 12px">Buen día,</p>` +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 12px">El sistema les mandó un correo diciendo que su plan iba a quedar corto este mes y mostrando "28 días restantes en el ciclo". Ambos datos estaban mal: el aviso se calculó contra una fecha de ciclo vieja.</p>` +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0">Ya lo arreglamos. Esta es la información correcta.</p>`
  ),
  sectionLabel('Cómo va su ciclo real'),
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;border:1px solid #3D2E6A;border-radius:12px;margin-bottom:16px">
    <tr><td bgcolor="#2A1B5C" style="background:#2A1B5C;background-color:#2A1B5C;padding:20px">
      <p style="color:#F1EEFF;font-size:15px;line-height:1.8;margin:0 0 10px"><strong style="color:#F1EEFF">Su ciclo renueva el ${resetHuman}</strong>, no antes.</p>
      <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 10px">Van <strong style="color:#F1EEFF">331 minutos</strong> consumidos en lo que va del mes.</p>
      <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 10px">El ritmo actual es <strong style="color:#F1EEFF">~30 minutos por día</strong> (no 110 como decía el correo anterior).</p>
      <p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0">Su plan es suficiente para cubrir el consumo de su operación.</p>
    </td></tr>
  </table>`,
  sectionLabel('Qué pasó'),
  infoCard(
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0 0 10px">El correo del lunes calculó el ciclo contra una fecha de hace tres días en vez de contra el inicio real del mes. Eso infló la proyección a 3,420 minutos cuando la realidad va en 930.</p>` +
    `<p style="color:#C8BEE8;font-size:14px;line-height:1.7;margin:0">Ya arreglamos el cálculo y agregamos una validación para que esto no vuelva a mandarse mal.</p>`
  ),
  `<p style="color:#C8BEE8;font-size:12px;margin:24px 0 0;text-align:center;line-height:1.7">¿Dudas? Escríbanos a <a href="mailto:hola@centinelia.mx" style="color:#9B6DFF;text-decoration:none">hola@centinelia.mx</a>.</p>`,
].join('');

const html = shell(body);

(async () => {
  console.log(`Enviando a: ${TO}`);
  console.log(`Subject: ${subject}`);
  const result = await sendEmail({ to: TO, subject, html });
  console.log(`\nResultado:`, result);
})().catch(err => { console.error('Error:', err); process.exit(1); });
