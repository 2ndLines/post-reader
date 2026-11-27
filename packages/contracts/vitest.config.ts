import { sharedConfig } from '@post-reader/tooling/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(sharedConfig, defineConfig({}));
