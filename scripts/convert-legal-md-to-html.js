const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'assets', 'legal');

const FILES = [
  ['birabuddy-terms-en.md', 'terms-en.html'],
  ['birabuddy-privacy-en.md', 'privacy-en.html'],
  ['birabuddy-kullanim-kosullari-tr.md', 'terms-tr.html'],
  ['birabuddy-gizlilik-politikasi-tr.md', 'privacy-tr.html'],
];

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const parts = [];
  let inList = false;
  let inTable = false;
  let tableRows = [];

  const closeList = () => {
    if (inList) {
      parts.push('</ul>');
      inList = false;
    }
  };

  const flushTable = () => {
    if (!inTable || tableRows.length === 0) return;
    const [header, ...body] = tableRows;
    parts.push('<table>');
    parts.push('<thead><tr>');
    header.forEach((cell) => parts.push(`<th>${inlineFormat(cell.trim())}</th>`));
    parts.push('</tr></thead><tbody>');
    body.forEach((row) => {
      parts.push('<tr>');
      row.forEach((cell) => parts.push(`<td>${inlineFormat(cell.trim())}</td>`));
      parts.push('</tr>');
    });
    parts.push('</tbody></table>');
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      closeList();
      const cells = trimmed
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim());
      if (cells.every((cell) => /^-+$/.test(cell))) continue;
      tableRows.push(cells);
      inTable = true;
      continue;
    }

    flushTable();

    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed === '---') {
      closeList();
      parts.push('<hr />');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      closeList();
      parts.push(`<h3>${inlineFormat(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith('## ')) {
      closeList();
      parts.push(`<h2>${inlineFormat(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith('# ')) {
      closeList();
      parts.push(`<h1>${inlineFormat(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith('- ')) {
      if (!inList) {
        parts.push('<ul>');
        inList = true;
      }
      parts.push(`<li>${inlineFormat(trimmed.slice(2))}</li>`);
      continue;
    }

    closeList();
    parts.push(`<p>${inlineFormat(trimmed)}</p>`);
  }

  closeList();
  flushTable();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Legal Document</title>
</head>
<body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;">
  ${parts.join('\n  ')}
</body>
</html>
`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [source, target] of FILES) {
  const md = fs.readFileSync(path.join(ROOT, source), 'utf8');
  const html = markdownToHtml(md);
  fs.writeFileSync(path.join(OUT_DIR, target), html, 'utf8');
  console.log(`Wrote ${target}`);
}
