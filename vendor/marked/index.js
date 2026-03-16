function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parse(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const output = [];
  let inList = false;
  let inCode = false;
  let codeLines = [];

  function closeList() {
    if (inList) {
      output.push('</ul>');
      inList = false;
    }
  }

  function closeCode() {
    if (inCode) {
      output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      inCode = false;
      codeLines = [];
    }
  }

  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      closeList();
      if (inCode) {
        closeCode();
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      output.push(`<h${heading[1].length}>${escapeHtml(heading[2].trim())}</h${heading[1].length}>`);
      continue;
    }

    const listItem = line.match(/^[-*]\s+(.*)$/);
    if (listItem) {
      if (!inList) {
        output.push('<ul>');
        inList = true;
      }
      output.push(`<li>${escapeHtml(listItem[1].trim())}</li>`);
      continue;
    }

    if (!line.trim()) {
      closeList();
      continue;
    }

    closeList();
    output.push(`<p>${escapeHtml(line.trim())}</p>`);
  }

  closeList();
  closeCode();
  return output.join('\n');
}

module.exports = {
  parse,
  marked: { parse }
};
