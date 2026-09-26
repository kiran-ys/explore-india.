import { readFile, writeFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile('frontend/images/commons/manifest.json', 'utf8'));
const lines = [
  '# Wikimedia Commons image attributions',
  '',
  'The photographs below are credited to their named creators. Follow each source link for the full licence and attribution details.',
  '',
  ...manifest.flatMap(item => [
    `## ${item.slug}`,
    '',
    `- File: \`${item.file}\``,
    `- Title: ${item.title}`,
    `- Creator: ${item.creator}`,
    `- License: ${item.license}`,
    `- Source: ${item.source}`,
    ''
  ])
];
await writeFile('IMAGE_ATTRIBUTIONS.md', `${lines.join('\n').trimEnd()}\n`);
