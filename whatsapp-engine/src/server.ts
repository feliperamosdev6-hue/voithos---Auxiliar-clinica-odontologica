import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { instanceService } from './services/instance/instanceService';

logger.info({ port: env.port }, 'whatsapp-engine api booting');

const server = app.listen(env.port, () => {
  logger.info({ port: env.port }, 'whatsapp-engine api started');
  setImmediate(() => {
    void instanceService.recoverRuntimeSessions()
      .then(() => {
        logger.info('runtime session recovery finished');
      })
      .catch((error) => {
        logger.error({ error }, 'runtime session recovery failed');
      });
  });
});

server.on('error', (error) => {
  logger.error({ error, port: env.port }, 'whatsapp-engine api failed to start');
});
