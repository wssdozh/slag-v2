// One template for every release page entry. Two entries per build are normal on a prerelease
// channel (the build itself and the channel that serves its manifest), so their names must never
// look like a copy: the build is named by its version, the channel by the word `канал`.

/** Where a client of this channel reads `latest.json`. */
export function manifestUrl(repo, channel) {
  return channel === 'release'
    ? `https://github.com/${repo}/releases/latest/download/latest.json`
    : `https://github.com/${repo}/releases/download/${channel}/latest.json`;
}

/** A build is identified by its version; the channel is a property of the build, not its name. */
export function releaseTitle(version) {
  return `SLAG ${version}`;
}

/** The rolling release is not a build: it is the channel that always serves the newest one. */
export function channelTitle(channel) {
  return `канал ${channel}`;
}

function header({ channel, version, previousVersion }) {
  const parts = [`**версия** \`${version}\``, `**канал** \`${channel}\``];
  if (previousVersion && previousVersion !== version) parts.push(`**до** \`${previousVersion}\``);
  return `${parts.join(' · ')}\n`;
}

/** Body of the build's own release: what changed, and where the channel reads it from. */
export function buildReleaseBody({ channel, version, previousVersion, notes, repo }) {
  return [
    header({ channel, version, previousVersion }),
    '',
    (notes || '').trim() || '_без заметок_',
    '',
    '---',
    `канал читает манифест: ${manifestUrl(repo, channel)}`,
    channel === 'release'
      ? 'этот релиз — `latest`, его видят все клиенты на канале `release`.'
      : `клиенты на канале \`${channel}\` видят его через тег \`${channel}\`, этот релиз — история сборки.`,
    '',
  ].join('\n');
}

/** Body of the rolling channel release: no changelog of its own, just which build it serves now. */
export function channelReleaseBody({ channel, version, repo }) {
  return [
    `**канал** \`${channel}\` · сейчас раздаёт \`${version}\``,
    '',
    `манифест: ${manifestUrl(repo, channel)}`,
    `файлы сборки: [SLAG ${version}](https://github.com/${repo}/releases/tag/v${version})`,
    '',
    '_этот релиз перезаписывается каждой сборкой канала; сюда попадает только `latest.json`._',
    '',
  ].join('\n');
}
