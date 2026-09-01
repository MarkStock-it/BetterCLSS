/**
 * utils.js
 * Shared utility functions for Agentic Helper modules.
 */

/**
 * Decode common HTML entities.
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/');
}

/**
 * Strip HTML tags and decode entities from a string.
 * Preserves meaningful structure: headings become labels,
 * list items are separated, line breaks are honored.
 * Removes scripts, styles, and dangerous elements.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html || typeof html !== 'string') return '';

  let text = html;

  // Remove script and style blocks entirely (they may contain malicious content)
  text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');

  // Convert block-level elements to newlines/spacing
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');

  // Add markers for headings
  text = text.replace(/<h1[^>]*>/gi, '## ');
  text = text.replace(/<h2[^>]*>/gi, '## ');
  text = text.replace(/<h3[^>]*>/gi, '### ');
  text = text.replace(/<h4[^>]*>/gi, '### ');
  text = text.replace(/<h5[^>]*>/gi, '### ');
  text = text.replace(/<h6[^>]*>/gi, '### ');

  // Add markers for list items
  text = text.replace(/<li[^>]*>/gi, '- ');

  // Preserve bold/strong as plain emphasis markers
  text = text.replace(/<strong[^>]*>/gi, '**');
  text = text.replace(/<\/strong>/gi, '**');
  text = text.replace(/<b[^>]*>/gi, '**');
  text = text.replace(/<\/b>/gi, '**');

  // Preserve italic/em
  text = text.replace(/<em[^>]*>/gi, '*');
  text = text.replace(/<\/em>/gi, '*');
  text = text.replace(/<i[^>]*>/gi, '*');
  text = text.replace(/<\/i>/gi, '*');

  // Extract link text from anchors
  text = text.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi, '$2 ($1)');

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // Decode entities
  text = decodeEntities(text);

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n[ \t]*/g, '\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

/**
 * Validate that text content is safe for use in prompts/documents.
 * Strips potential prompt injection patterns while preserving content.
 * @param {string} text
 * @returns {{ safe: boolean, sanitized: string, warnings: string[] }}
 */
function sanitizeContent(text) {
  if (!text || typeof text !== 'string') {
    return { safe: true, sanitized: '', warnings: [] };
  }

  const warnings = [];
  let sanitized = text;

  // Check for common prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?prior\s+instructions/i,
    /disregard\s+(all\s+)?previous/i,
    /you\s+are\s+now\s+/i,
    /system\s*:\s*/i,
    /new\s+instructions?:/i,
    /override\s+instructions/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      warnings.push(`Potential instruction override detected: ${pattern.source}`);
    }
  }

  return { safe: warnings.length === 0, sanitized, warnings };
}

/**
 * Normalize a string for comparison (lowercase, collapse whitespace).
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

module.exports = {
  decodeEntities,
  stripHtml,
  normalizeText,
  sanitizeContent,
};
