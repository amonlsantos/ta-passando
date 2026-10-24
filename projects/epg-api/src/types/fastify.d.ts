import 'fastify';
import type { EpgService } from '../services/epg.service';

declare module 'fastify' {
  interface FastifyInstance {
    epgService: EpgService;
  }
}
