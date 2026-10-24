import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, sendError } from '../utils/http-error';

const NowQuerySchema = z.object({
  channelIds: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    )
    .optional(),
});

const ProgramParamsSchema = z.object({ programId: z.string().min(1).max(128) });

export async function programsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/programs/now', async (request, reply) => {
    const parsed = NowQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(reply, parsed.error);
    }

    return reply.send(await app.epgService.getNowPlaying(parsed.data.channelIds));
  });

  app.get('/api/programs/:programId', async (request, reply) => {
    const parsed = ProgramParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendError(reply, parsed.error);
    }

    const program = await app.epgService.getProgramById(parsed.data.programId);
    if (!program) {
      return sendError(reply, new AppError(404, 'not_found', 'Program not found'));
    }

    return reply.send(program);
  });
}
