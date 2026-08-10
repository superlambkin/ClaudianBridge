import type { ObjectInfo } from './inspector';

export function formatObject(info: ObjectInfo): string {
  const lines: string[] = [];
  lines.push(`@object[${info.type}]`);
  lines.push(`name: ${info.name}`);
  lines.push(`type: ${info.type}`);
  if (info.context && info.context !== 'unknown') {
    lines.push(`context: ${info.context}`);
  }
  lines.push(`selector: ${info.selector}`);
  lines.push(`path: ${info.path}`);
  if (info.attributes && Object.keys(info.attributes).length > 0) {
    const attrs = Object.entries(info.attributes)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(', ');
    lines.push(`attributes: ${attrs}`);
  }
  return lines.join('\n');
}