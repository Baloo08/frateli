import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

export function renderSafeMarkdown(markdown: string): string {
  const rawHtml = marked.parse(markdown || "", { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "h3", "pre", "code", "table", "thead", "tbody", "tr", "th", "td"]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "target", "rel"],
      code: ["class"],
    },
  });
}
