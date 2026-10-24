import { config } from '../config/env';
import { UpstreamError, UpstreamPayloadError, UpstreamUnavailableError } from '../utils/errors';

export interface XmltvValidators {
  etag?: string;
  lastModified?: string;
}

export interface XmltvFetchResult {
  notModified: boolean;
  body?: string;
  etag?: string;
  lastModified?: string;
}

/**
 * Fetches the whole XMLTV document. The feed is a few megabytes, so the
 * conditional request matters: an unchanged feed costs a 304, not a download.
 */
export class XmltvClient {
  async fetch(validators: XmltvValidators = {}): Promise<XmltvFetchResult> {
    const headers: Record<string, string> = {
      Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8',
    };

    if (validators.etag) {
      headers['If-None-Match'] = validators.etag;
    }
    if (validators.lastModified) {
      headers['If-Modified-Since'] = validators.lastModified;
    }

    let response: Response;

    try {
      response = await fetch(config.xmltv.url, {
        headers,
        signal: AbortSignal.timeout(config.xmltv.timeoutMs),
      });
    } catch (error) {
      throw new UpstreamUnavailableError(
        error instanceof Error ? error.message : 'request failed',
        { cause: error },
      );
    }

    if (response.status === 304) {
      await response.body?.cancel().catch(() => undefined);
      return {
        notModified: true,
        etag: validators.etag,
        lastModified: validators.lastModified,
      };
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new UpstreamError(response.status, response.statusText);
    }

    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > config.xmltv.maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new UpstreamPayloadError(
        `XMLTV document is larger than ${config.xmltv.maxBytes} bytes`,
      );
    }

    const body = await response.text();

    // content-length is the compressed size, so the decoded body is checked too.
    if (body.length > config.xmltv.maxBytes) {
      throw new UpstreamPayloadError(
        `XMLTV document is larger than ${config.xmltv.maxBytes} bytes after decoding`,
      );
    }

    if (body.trim().length === 0) {
      throw new UpstreamPayloadError('XMLTV document is empty');
    }

    return {
      notModified: false,
      body,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    };
  }
}
