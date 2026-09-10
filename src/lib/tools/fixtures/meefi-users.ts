export type MeefiUserFlags = {
  password_reset_locked: boolean;
  has_2fa: boolean;
  passkey_registered: boolean;
  identity_verified: boolean;
  kyc_status: 'pending' | 'approved' | 'rejected';
};

export type MeefiUser = {
  user_id: string;
  email: string;
  name: string;
  status: 'active' | 'suspended' | 'closed';
  flags: MeefiUserFlags;
};

export const MEEFI_USERS: MeefiUser[] = [
  {
    user_id: 'usr_001',
    email: 'demo1@meefi.io',
    name: 'Carlos Ramírez',
    status: 'active',
    flags: {
      password_reset_locked: true,
      has_2fa: true,
      passkey_registered: false,
      identity_verified: false,
      kyc_status: 'pending',
    },
  },
  {
    user_id: 'usr_002',
    email: 'demo2@meefi.io',
    name: 'María Fernández',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: true,
      passkey_registered: true,
      identity_verified: true,
      kyc_status: 'approved',
    },
  },
  {
    user_id: 'usr_003',
    email: 'demo3@meefi.io',
    name: 'Jorge Villarreal',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: true,
      passkey_registered: false,
      identity_verified: true,
      kyc_status: 'approved',
    },
  },
  {
    user_id: 'usr_004',
    email: 'demo4@meefi.io',
    name: 'Ana Sofía Guajardo',
    status: 'suspended',
    flags: {
      password_reset_locked: true,
      has_2fa: false,
      passkey_registered: false,
      identity_verified: true,
      kyc_status: 'rejected',
    },
  },
  {
    user_id: 'usr_005',
    email: 'demo5@meefi.io',
    name: 'Luis Enrique Cepeda',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: false,
      passkey_registered: false,
      identity_verified: false,
      kyc_status: 'pending',
    },
  },
  {
    user_id: 'usr_006',
    email: 'demo6@meefi.io',
    name: 'Regina Martínez',
    status: 'active',
    flags: {
      password_reset_locked: false,
      has_2fa: true,
      passkey_registered: true,
      identity_verified: true,
      kyc_status: 'approved',
    },
  },
];

export function getMeefiUser(email: string): MeefiUser | undefined {
  return MEEFI_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
}
