export function appendHashtags(caption, hashtags) {
  const tags = (hashtags || '').trim();
  if (!tags) return caption || '';
  const base = (caption || '').trim();
  if (!base) return tags;

  const lines = base.split(/\r?\n/);
  let i = lines.length - 1;
  while (i >= 0 && lines[i].trim() === '') i--;

  if (i >= 0 && lines[i].trim().startsWith('#')) {
    lines[i] = `${tags} ${lines[i].trim()}`;
    return lines.slice(0, i + 1).join('\n');
  }

  return `${base}\n${tags}`;
}
