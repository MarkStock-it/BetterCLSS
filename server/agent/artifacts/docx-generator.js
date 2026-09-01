/**
 * docx-generator.js
 * DOCX Generator using Node.js built-in zlib.
 *
 * DOCX files are ZIP archives containing XML files following the
 * Office Open XML (OOXML) standard. This generator creates valid
 * DOCX files without external dependencies.
 *
 * Structure of a DOCX file:
 *   [Content_Types].xml
 *   _rels/.rels
 *   word/document.xml
 *   word/_rels/document.xml.rels
 */

const zlib = require('zlib');
const { createArtifact, markArtifactReady, markArtifactFailed } = require('./artifact-model');

// ─── DOCX XML Templates ───────────────────────────────────────────

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const WORD_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

// ─── Content Building ──────────────────────────────────────────────

/**
 * Escape XML special characters.
 * @param {string} text
 * @returns {string}
 */
function escapeXml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Build document.xml body content from structured content.
 *
 * Content structure:
 * {
 *   title: string,
 *   paragraphs: [
 *     { text: string, style?: 'heading1'|'heading2'|'heading3'|'normal', bold?: boolean }
 *   ]
 * }
 *
 * @param {object} content
 * @returns {string} XML body content
 */
function buildDocumentBody(content) {
  if (!content) return '';

  const parts = [];

  // Title
  if (content.title) {
    parts.push(`
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Title"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="48"/>
        </w:rPr>
        <w:t>${escapeXml(content.title)}</w:t>
      </w:r>
    </w:p>`);
  }

  // Paragraphs
  const paragraphs = content.paragraphs || content.text
    ? (typeof content.text === 'string'
      ? content.text.split('\n').filter(Boolean).map((p) => ({ text: p }))
      : content.paragraphs || [])
    : [];

  for (const para of paragraphs) {
    const styleVal = para.style || 'normal';
    const isHeading = styleVal.startsWith('heading');

    let pPr = '';
    if (isHeading) {
      pPr = `<w:pPr><w:pStyle w:val="${escapeXml(styleVal)}"/></w:pPr>`;
    }

    let rPr = '';
    const rPrParts = [];
    if (para.bold) rPrParts.push('<w:b/>');
    if (para.italic) rPrParts.push('<w:i/>');
    if (para.size) rPrParts.push(`<w:sz w:val="${para.size}"/>`);
    if (rPrParts.length > 0) {
      rPr = `<w:rPr>${rPrParts.join('')}</w:rPr>`;
    }

    parts.push(`
    <w:p>
      ${pPr}
      <w:r>
        ${rPr}
        <w:t xml:space="preserve">${escapeXml(para.text)}</w:t>
      </w:r>
    </w:p>`);
  }

  // If no structured content, use raw text
  if (parts.length === 0 && content.rawText) {
    const lines = content.rawText.split('\n').filter(Boolean);
    for (const line of lines) {
      parts.push(`
    <w:p>
      <w:r>
        <w:t xml:space="preserve">${escapeXml(line)}</w:t>
      </w:r>
    </w:p>`);
    }
  }

  return parts.join('\n');
}

/**
 * Build the complete document.xml.
 * @param {object} content
 * @returns {string}
 */
function buildDocumentXml(content) {
  const body = buildDocumentBody(content);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ─── ZIP Creation ──────────────────────────────────────────────────

/**
 * Create a DOCX ZIP archive from XML content parts.
 *
 * @param {Array<{ name: string, content: string }>} files
 * @returns {Promise<Buffer>} ZIP buffer
 */
function createDocxZip(files) {
  return new Promise((resolve, reject) => {
    // Build local file headers and data
    const entries = [];

    for (const file of files) {
      const nameBuffer = Buffer.from(file.name, 'utf8');
      const dataBuffer = Buffer.from(file.content, 'utf8');
      const compressed = zlib.deflateRawSync(dataBuffer);

      entries.push({
        name: nameBuffer,
        uncompressedSize: dataBuffer.length,
        compressedSize: compressed.length,
        compressedData: compressed,
        crc32: crc32(dataBuffer),
      });
    }

    // Build the ZIP
    const localHeaders = [];
    const centralHeaders = [];
    let offset = 0;

    for (const entry of entries) {
      // Local file header
      const localHeader = Buffer.alloc(30 + entry.name.length);
      localHeader.writeUInt32LE(0x04034b50, 0);  // signature
      localHeader.writeUInt16LE(20, 4);            // version needed
      localHeader.writeUInt16LE(0, 6);             // flags
      localHeader.writeUInt16LE(8, 8);             // compression (deflate)
      localHeader.writeUInt16LE(0, 10);            // mod time
      localHeader.writeUInt16LE(0, 12);            // mod date
      localHeader.writeUInt32LE(entry.crc32, 14); // CRC-32
      localHeader.writeUInt32LE(entry.compressedSize, 18);
      localHeader.writeUInt32LE(entry.uncompressedSize, 22);
      localHeader.writeUInt16LE(entry.name.length, 26);
      localHeader.writeUInt16LE(0, 28);            // extra field length
      entry.name.copy(localHeader, 30);

      localHeaders.push(localHeader);

      // Central directory header
      const centralHeader = Buffer.alloc(46 + entry.name.length);
      centralHeader.writeUInt32LE(0x02014b50, 0);  // signature
      centralHeader.writeUInt16LE(20, 4);            // version made by
      centralHeader.writeUInt16LE(20, 6);            // version needed
      centralHeader.writeUInt16LE(0, 8);             // flags
      centralHeader.writeUInt16LE(8, 10);            // compression
      centralHeader.writeUInt16LE(0, 12);            // mod time
      centralHeader.writeUInt16LE(0, 14);            // mod date
      centralHeader.writeUInt32LE(entry.crc32, 16);
      centralHeader.writeUInt32LE(entry.compressedSize, 20);
      centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
      centralHeader.writeUInt16LE(entry.name.length, 28);
      centralHeader.writeUInt16LE(0, 30);            // extra field length
      centralHeader.writeUInt16LE(0, 32);            // file comment length
      centralHeader.writeUInt16LE(0, 34);            // disk number start
      centralHeader.writeUInt16LE(0, 36);            // internal file attributes
      centralHeader.writeUInt32LE(0, 38);            // external file attributes
      centralHeader.writeUInt32LE(offset, 42);       // local header offset
      entry.name.copy(centralHeader, 46);

      centralHeaders.push(centralHeader);

      offset += localHeader.length + entry.compressedSize;
    }

    // End of central directory
    const centralDirOffset = offset;
    const centralDirSize = centralHeaders.reduce((sum, h) => sum + h.length, 0);

    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);               // signature
    endRecord.writeUInt16LE(0, 4);                          // disk number
    endRecord.writeUInt16LE(0, 6);                          // disk with central dir
    endRecord.writeUInt16LE(entries.length, 8);             // entries on this disk
    endRecord.writeUInt16LE(entries.length, 10);            // total entries
    endRecord.writeUInt32LE(centralDirSize, 12);            // central dir size
    endRecord.writeUInt32LE(centralDirOffset, 16);          // central dir offset
    endRecord.writeUInt16LE(0, 20);                         // comment length

    // Assemble the ZIP: interleaved local headers + data, then central dir
    const parts = [];
    for (let i = 0; i < entries.length; i++) {
      parts.push(localHeaders[i]);
      parts.push(entries[i].compressedData);
    }
    parts.push(...centralHeaders);
    parts.push(endRecord);

    resolve(Buffer.concat(parts));
  });
}

/**
 * CRC-32 implementation.
 * @param {Buffer} buf
 * @returns {number}
 */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── Generator Interface ───────────────────────────────────────────

/**
 * Create a DOCX generator.
 *
 * @param {object} options
 * @param {object} options.artifactStorage - Artifact storage service
 * @returns {object} Generator API
 */
function createDocxGenerator({ artifactStorage }) {
  /**
   * Generate a DOCX file from structured content.
   *
   * @param {object} params
   * @param {string} params.jobId
   * @param {number} params.userId
   * @param {string} params.filename - Desired filename
   * @param {object} params.content - Structured content
   * @param {string} [params.content.title]
   * @param {Array} [params.content.paragraphs]
   * @param {string} [params.content.text] - Plain text (split by newlines)
   * @param {string} [params.content.rawText]
   * @returns {Promise<object>} Artifact record
   */
  async function generate({ jobId, userId, filename, content }) {
    const artifact = createArtifact({
      jobId,
      userId,
      type: 'docx',
      filename: filename || 'document.docx',
    });

    try {
      // Build the DOCX content
      const files = [
        { name: '[Content_Types].xml', content: CONTENT_TYPES_XML },
        { name: '_rels/.rels', content: RELS_XML },
        { name: 'word/document.xml', content: buildDocumentXml(content || {}) },
        { name: 'word/_rels/document.xml.rels', content: WORD_RELS_XML },
      ];

      // Create the ZIP archive
      const zipBuffer = await createDocxZip(files);

      // Validate: must be non-empty and start with ZIP signature
      if (zipBuffer.length === 0) {
        throw new Error('Generated DOCX is empty');
      }
      if (zipBuffer[0] !== 0x50 || zipBuffer[1] !== 0x4B) {
        throw new Error('Generated DOCX has invalid ZIP signature');
      }

      // Store the artifact
      const { storagePath, size } = artifactStorage.saveArtifact(
        userId,
        artifact.id,
        artifact.filename,
        zipBuffer
      );

      return markArtifactReady(artifact, storagePath, size);

    } catch (error) {
      return markArtifactFailed(artifact, error.message);
    }
  }

  return { generate };
}

module.exports = {
  createDocxGenerator,
  buildDocumentXml,
  buildDocumentBody,
  escapeXml,
  createDocxZip,
};
