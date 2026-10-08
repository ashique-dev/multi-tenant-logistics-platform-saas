import 'reflect-metadata';
import { ApiModule } from '../app/api.module.js';
import { bootstrap } from '../common/http/bootstrap.js';

bootstrap('api', ApiModule).catch((error: unknown) => {
  // Logger may not exist yet (config/DI failure): stderr is the only safe sink here.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
