import { vi } from 'vitest';
import { log } from '../log.ts';

// The game server logs every join, tick problem and admin command: keep test output readable.
vi.spyOn(log, 'info').mockImplementation(() => {});
vi.spyOn(log, 'warn').mockImplementation(() => {});
vi.spyOn(log, 'error').mockImplementation(() => {});
