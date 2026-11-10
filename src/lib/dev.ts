import { dev } from '$app/env';
import { PUBLIC_DEV_MODE } from '$app/env/public';

/** Admin and debug tools are only available when this is true. Never enabled in player builds. */
export const devMode = dev || PUBLIC_DEV_MODE;
