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

export function brandKitFromAgent(agent: Record<string, unknown>): BrandKit {
  return {
    businessName:   (agent.business_name          as string)      ?? '',
    logoUrl:        (agent.logo_url               as string|null) ?? (agent.email_logo_url as string|null) ?? null,
    color:          (agent.email_brand_color       as string|null) ?? '#6C3BFF',
    colorSecondary: (agent.brand_color_secondary   as string|null) ?? null,
    phone:          (agent.phone_number            as string|null) ?? null,
    website:        (agent.brand_website           as string|null) ?? null,
    address:        (agent.brand_address           as string|null) ?? null,
    footerText:     (agent.email_footer_text       as string|null) ?? null,
  };
}
