import { describe, it, expect } from 'vitest';
import { socialPublishingEnabled, agencyModeEnabled } from '../social-publishing';

describe('socialPublishingEnabled', () => {
  it('true cuando features.social_publishing.enabled === true', () => {
    expect(socialPublishingEnabled({ social_publishing: { enabled: true } })).toBe(true);
  });

  it('false cuando falta el campo', () => {
    expect(socialPublishingEnabled({})).toBe(false);
    expect(socialPublishingEnabled(null)).toBe(false);
  });

  it('false cuando enabled === false', () => {
    expect(socialPublishingEnabled({ social_publishing: { enabled: false } })).toBe(false);
  });

  it('false cuando social_publishing existe pero sin propiedad enabled', () => {
    expect(socialPublishingEnabled({ social_publishing: {} })).toBe(false);
  });

  it('false cuando features es undefined', () => {
    expect(socialPublishingEnabled(undefined)).toBe(false);
  });

  it('false cuando features es un string', () => {
    expect(socialPublishingEnabled('social_publishing')).toBe(false);
  });

  it('false cuando social_publishing es null', () => {
    expect(socialPublishingEnabled({ social_publishing: null })).toBe(false);
  });
});

describe('agencyModeEnabled', () => {
  it('true cuando enabled=true Y agency_mode=true', () => {
    expect(agencyModeEnabled({ social_publishing: { enabled: true, agency_mode: true } })).toBe(true);
  });

  it('false cuando enabled=false aunque agency_mode=true', () => {
    expect(agencyModeEnabled({ social_publishing: { enabled: false, agency_mode: true } })).toBe(false);
  });

  it('false cuando enabled=true pero agency_mode=false', () => {
    expect(agencyModeEnabled({ social_publishing: { enabled: true, agency_mode: false } })).toBe(false);
  });

  it('false cuando no hay features', () => {
    expect(agencyModeEnabled(null)).toBe(false);
    expect(agencyModeEnabled({})).toBe(false);
  });

  it('false cuando enabled=true y agency_mode no existe', () => {
    expect(agencyModeEnabled({ social_publishing: { enabled: true } })).toBe(false);
  });
});
