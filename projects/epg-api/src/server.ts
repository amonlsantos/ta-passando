import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { ZodError } from 'zod';
import { config } from './config/env';
import { channelsRoutes } from './routes/channels';
import { programsRoutes } from './routes/programs';
import { EpgService } from './services/epg.service';
import { toErrorBody } from './utils/http-error';

export function buildServer(epgService = new EpgService()): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'info' : 'warn',
    },
  });

  app.decorate('epgService', epgService);

  app.register(cors, {
    origin: config.nodeEnv === 'development' ? true : false,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      request.log.info({ issues: error.issues }, 'request validation failed');
    } else {
      request.log.error({ err: error }, 'unhandled request error');
    }

    const { statusCode, body } = toErrorBody(error);
    return reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.status(404).send({ error: 'not_found', message: 'Route not found' }),
  );

  app.get('/health', async () => ({ status: 'ok', xmltv: app.epgService.getStatus() }));

  app.register(channelsRoutes);
  app.register(programsRoutes);

  return app;
}

async function start(): Promise<void> {
  const app = buildServer();

  try {
    await app.listen({ port: config.server.port, host: config.server.host });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void start();
