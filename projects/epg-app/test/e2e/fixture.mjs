const pad = (value) => String(value).padStart(2, '0');

const xmltvDate = (unixSeconds) => {
  const date = new Date(unixSeconds * 1000);
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    ' +0000',
  ].join('');
};

const escapeXml = (value) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const CHANNELS = [
  { id: 'alpha', name: 'Alpha' },
  { id: 'gamma', name: 'Gamma' },
  { id: 'delta', name: 'Delta' },
];

const programme = (channel, start, stop, title, desc) => {
  const synopsis = desc ? `<desc lang="pt">${escapeXml(desc)}</desc>` : '';
  return (
    `  <programme channel="${channel}" start="${xmltvDate(start)}" stop="${xmltvDate(stop)}">` +
    `<title lang="pt">${escapeXml(title)}</title>${synopsis}</programme>`
  );
};

export function buildFixtureXml(now = Math.floor(Date.now() / 1000)) {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', `<tv date="${xmltvDate(now)}">`];

  for (const channel of CHANNELS) {
    lines.push(`  <channel id="${channel.id}"><display-name>${escapeXml(channel.name)}</display-name></channel>`);
  }

  for (const channel of CHANNELS) {
    lines.push(
      programme(
        channel.id,
        now - 1800,
        now + 1800,
        `Programa atual ${channel.name}`,
        `Sinopse do programa atual de ${channel.name}.`,
      ),
    );
    lines.push(programme(channel.id, now + 1800, now + 5400, `Próximo ${channel.name}`));
    lines.push(
      programme(
        channel.id,
        now + 86400,
        now + 90000,
        `Programa de amanhã ${channel.name}`,
        'Sinopse do programa de amanhã.',
      ),
    );
  }

  lines.push('</tv>');
  return lines.join('\n');
}
