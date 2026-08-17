import { describe, it, expect } from 'vitest';
import {
  getAgentIndustry,
  getIndustryLabel,
  INDUSTRIES_WITH_DAILY_AVAILABILITY,
} from '../industry';

describe('getAgentIndustry', () => {
  it('returns null when features is missing', () => {
    expect(getAgentIndustry({})).toBeNull();
  });

  it('returns null when industry is not in whitelist', () => {
    expect(getAgentIndustry({ features: { industry: 'petshop' } })).toBeNull();
  });

  it('returns the industry when whitelisted', () => {
    expect(getAgentIndustry({ features: { industry: 'restaurante' } })).toBe('restaurante');
  });
});

describe('getIndustryLabel', () => {
  it('returns tailored restaurant label for daily availability title', () => {
    expect(getIndustryLabel('restaurante', 'daily_availability_title')).toBe('Disponibilidad del menú');
  });

  it('returns retail label for daily availability title', () => {
    expect(getIndustryLabel('retail', 'daily_availability_title')).toBe('Disponibilidad del día');
  });

  it('returns item word for restaurante', () => {
    expect(getIndustryLabel('restaurante', 'daily_availability_item_word')).toBe('platillo');
  });
});

describe('INDUSTRIES_WITH_DAILY_AVAILABILITY', () => {
  it('includes restaurante', () => {
    expect(INDUSTRIES_WITH_DAILY_AVAILABILITY).toContain('restaurante');
  });
});
