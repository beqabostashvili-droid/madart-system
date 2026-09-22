import { config } from 'dotenv';
import path from 'node:path';

config({ path: [path.resolve(__dirname, '../../../.env'), path.resolve(__dirname, '../.env.test')] });
process.env.NODE_ENV = 'test';
process.env.MOCK_TERMINAL_DELAY_MS = '0'; // tests need synchronous mock settlement
