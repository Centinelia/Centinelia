import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount after each test para evitar duplicados de nodos en el DOM entre tests.
afterEach(() => { cleanup(); });
