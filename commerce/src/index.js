import catalog from '../catalog.json' with { type: 'json' };
import { createWorker } from './worker.js';

export default createWorker({ catalog });
