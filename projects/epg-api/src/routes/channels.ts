import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, sendError } from '../utils/http-error';

const ChannelParamsSchema = z.object({ channelId: z.string().min(1).max(64) });

export async function channelsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/channels', async () => app.epgService.getChannels());

  app.get('/api/channels/:channelId/programs', async (request, reply) => {
    const parsed = ChannelParamsSchema.safeParse(request.params);

    if (!parsed.success) {
      return sendError(reply, parsed.error);
    }

    const programs = await app.epgService.getChannelSchedule(parsed.data.channelId);

    if (!programs) {
      return sendError(reply, new AppError(404, 'not_found', 'Channel not found'));
    }

    return reply.send(programs);
  });
}
