import { z } from 'zod';

/**
 * XMLTV is loose: the same tag may appear once or many times, and text nodes
 * gain a `#text` key when the tag carries attributes (`<title lang="pt">...`).
 * `asArray` normalises both shapes before validation.
 */
const asArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]),
    z.array(schema),
  );

export const XmltvChannelSchema = z
  .object({
    '@_id': z.string().min(1),
    'display-name': z.unknown().optional(),
  })
  .passthrough();

export const XmltvProgrammeSchema = z
  .object({
    '@_channel': z.string().min(1),
    '@_start': z.string().min(1),
    '@_stop': z.string().min(1),
    title: z.unknown().optional(),
    'sub-title': z.unknown().optional(),
    desc: z.unknown().optional(),
    category: z.unknown().optional(),
    date: z.unknown().optional(),
  })
  .passthrough();

export const XmltvDocumentSchema = z.object({
  tv: z
    .object({
      '@_date': z.string().optional(),
      channel: asArray(XmltvChannelSchema),
      programme: asArray(XmltvProgrammeSchema),
    })
    .passthrough(),
});

export type XmltvChannel = z.infer<typeof XmltvChannelSchema>;
export type XmltvProgramme = z.infer<typeof XmltvProgrammeSchema>;
export type XmltvDocument = z.infer<typeof XmltvDocumentSchema>;
