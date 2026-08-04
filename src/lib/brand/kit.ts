export interface BrandKit {
  businessName:   string;
  logoUrl:        string | null;
  color:          string;
  colorSecondary: string | null;
  phone:          string | null;
  website:        string | null;
  address:        string | null;
  footerText:     string | null;
}

/**
 * Los campos de branding (colores, footer, website, address, email_footer_text)
 * viven en la tabla `organizations` — se movieron desde voice_agents en el
 * commit e372013. Leerlos desde el objeto agent devuelve undefined y todos los
 * PDFs quedaban en morado Centinelia por default.
 *
 * Uso preferido:
 *   const org = await supabase.from('organizations').select('email_brand_color, ...').eq(...).maybeSingle();
 *   const brand = brandKitFromAgent(agent, org);
 *
 * Sin `org` para retro-compat, cae a defaults sensatos.
 */
export function brandKitFromAgent(
  agent: Record<string, unknown>,
  org?:  Record<string, unknown> | null,
): BrandKit {
  const orgColor = org?.email_brand_color as string | null | undefined;
  const orgSecondary = org?.brand_color_secondary as string | null | undefined;
  const orgWebsite = org?.brand_website as string | null | undefined;
  const orgAddress = org?.brand_address as string | null | undefined;
  const orgFooter = org?.email_footer_text as string | null | undefined;
  const orgLogoUrl = org?.logo_url as string | null | undefined;

  return {
    businessName:   (agent.business_name          as string)      ?? '',
    // logo_url ahora vive en organizations (single source of truth).
    // Fallback a voice_agents.logo_url (legacy) + email_logo_url override.
    logoUrl:        (orgLogoUrl                   ?? null) ?? (agent.logo_url as string|null) ?? (agent.email_logo_url as string|null) ?? null,
    color:          (orgColor      ?? null) ?? '#6C3BFF',
    colorSecondary: (orgSecondary  ?? null) ?? null,
    phone:          (agent.phone_number            as string|null) ?? null,
    website:        (orgWebsite    ?? null) ?? null,
    address:        (orgAddress    ?? null) ?? null,
    footerText:     (orgFooter     ?? null) ?? null,
  };
}
