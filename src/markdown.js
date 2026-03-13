const escapeHtml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const renderInlineMarkdown = (value) => {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
  );
  return html;
};

export const renderMarkdownLine = (source) => {
  if (!source.trim()) {
    return "<span class=\"note-line-placeholder\">&nbsp;</span>";
  }

  const headingMatch = source.match(/^(#{1,3})\s+(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    return `<span class="note-line-heading note-line-heading-${level}">${renderInlineMarkdown(headingMatch[2])}</span>`;
  }

  const listMatch = source.match(/^[-*]\s+(.*)$/);
  if (listMatch) {
    return `<span class="note-line-bullet">•</span><span>${renderInlineMarkdown(listMatch[1])}</span>`;
  }

  return `<span>${renderInlineMarkdown(source)}</span>`;
};

export const renderMarkdown = (source) => {
  const lines = source.split("\n");
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    blocks.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      listItems.push(`<li>${renderInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    flushList();
    blocks.push(`<p>${renderInlineMarkdown(line)}</p>`);
  }

  flushList();
  return blocks.join("") || "<p class=\"empty-note\">No notes yet.</p>";
};
