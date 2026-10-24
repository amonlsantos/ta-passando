import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { UpstreamError, UpstreamPayloadError, UpstreamUnavailableError } from './errors';

export interface ApiErrorBody {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toErrorBody(error: unknown): { statusCode: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return { statusCode: error.statusCode, body: { error: error.code, message: error.message } };
  }

  if (error instanceof z.ZodError) {
    return {
      statusCode: 400,
      body: {
        error: 'invalid_request',
        message: 'Invalid request parameters',
        issues: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    };
  }

  if (error instanceof UpstreamError) {
    const statusCode = error.status === 404 ? 404 : 502;
    return {
      statusCode,
      body: {
        error: error.status === 404 ? 'not_found' : 'upstream_error',
        message:
          error.status === 404
            ? 'Channel or program not found'
            : 'The EPG provider is unavailable or rejected the request',
      },
    };
  }

  if (error instanceof UpstreamPayloadError || error instanceof UpstreamUnavailableError) {
    return {
      statusCode: 502,
      body: {
        error: 'upstream_error',
        message: 'The EPG provider is unavailable or returned an unexpected response',
      },
    };
  }

  return {
    statusCode: 500,
    body: { error: 'internal_error', message: 'Unexpected error' },
  };
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  const { statusCode, body } = toErrorBody(error);
  return reply.status(statusCode).send(body);
}
