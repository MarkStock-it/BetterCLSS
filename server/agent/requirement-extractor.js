/**
 * requirement-extractor.js
 * Extracts requirements from assignment text using deterministic heuristics.
 *
 * This module analyzes the assignment name, description, and metadata
 * to identify requirement categories and specific requirements.
 *
 * It does NOT use an LLM. It uses structured pattern matching and
 * keyword analysis against known requirement categories.
 */

const { normalizeText } = require('./utils');
const { detectExternalTools } = require('./external-tools');

// ─── Requirement Category Patterns ──────────────────────────────────

const TEXT_PATTERNS = [
  /\b(write|essay|response|answer|explain|discuss|describe|analyze|analyze|reflect|summary|summarize|report|paper|composition|review|critique|argument|position\s*statement)\b/i,
  /\b(word\s*(count|limit|requirement))\b/i,
  /\b(\d+[\s-]*(?:word|page|paragraph))\b/i,
  /\b(double|single)\s*space/i,
  /\b(apa|mla|chicago|turabian|harvard)\s*(format|style|citation)/i,
  /\b(reference|bibliography|works?\s*cited)\b/i,
  /\b(short\s*answer|brief\s*response)\b/i,
  /\b(paragraph|reflection|journal|diary|log)\b/i,
];

const FILE_PATTERNS = [
  /\b(submit|upload|attach|provide|include)\b.*\b(file|document|pdf|docx|pptx|xlsx|csv|txt|image|screenshot|photo)\b/i,
  /\b(file|document|pdf|docx|pptx|xlsx|csv|txt)\s*(format|submission|upload)/i,
  /\b(save|export|convert)\b.*\b(as|to)\b.*\b(pdf|docx|pptx|xlsx|csv|txt)\b/i,
];

const MEDIA_PATTERNS = [
  /\b(video|recording|film|record|recorded)\b.*\b(presentation|presentation|speech|talk|demonstrat)/i,
  /\b(audio|voice|sound|podcast|narrat)/i,
  /\b(screenshot|screen\s*shot|screen\s*capture|screen\s*record)/i,
  /\b(photo|photograph|picture|image)\b.*\b(of|your|the)\b/i,
  /\b(take|capture|record)\b.*\b(photo|image|screenshot|video)/i,
];

const PHYSICAL_PATTERNS = [
  /\b(build|construct|assemble|fabricate|manufacture)\b.*\b(circuit|device| apparatus| prototype|model|board|setup|system)\b/i,
  /\b(perform|conduct|execute|carry\s*out)\b.*\b(experiment|lab|laboratory|test|measurement|procedure)\b/i,
  /\b(measure|record|observe|test|measure)\b.*\b(voltage|current|resistance|temperature|pressure|signal|data)\b/i,
  /\b(hardware|physical|hands[\s-]*on|in[\s-]*person|in[\s-]*lab)\b/i,
  /\b(demonstrat|present\s*(live|in[\s-]*person|to\s*class))\b/i,
  /\b(bring|bring\s*in|submit\s*a?\s*(photo|picture|image)\s*of\s*(your|the)\s*(setup|circuit|experiment|lab))\b/i,
];

const CODE_PATTERNS = [
  /\b(code|program|script|function|class|method|algorithm|implementation)\b/i,
  /\b(python|java|javascript|c\+\+|ruby|go|rust|swift|kotlin|html|css|sql|r|matlab|php)\b/i,
  /\b(compile|run|execute|debug|test)\b.*\b(code|program|script)\b/i,
  /\b(git|github|gitlab|repository|repo|commit|push|pull\s*request)\b/i,
  /\b(ide|visual\s*studio|eclipse|intellij|pycharm|xcode)\b/i,
  /\b(\.(py|js|ts|java|cpp|c|rb|go|rs|swift|kt|html|css|sql|r))\b/i,
];

const DATA_ANALYSIS_PATTERNS = [
  /\b(data|dataset|data\s*set|spreadsheet|table|chart|graph|visualization)\b/i,
  /\b(analyze|analyse|statistical|statistics|regression|correlation)\b/i,
  /\b(excel|spreadsheet|csv|xlsx)\b.*\b(analysis|chart|graph|pivot|formula)\b/i,
  /\b(pivot\s*table|vlookup|conditional\s*formatting)\b/i,
];

const PRESENTATION_PATTERNS = [
  /\b(presentation|slides|slide\s*deck|powerpoint|pptx)\b/i,
  /\b(speaking|present|oral\s*presentation|presentation\s*skills)\b/i,
  /\b(slide|bullet\s*point|speaker\s*notes)\b/i,
];

const CANVAS_SUBMISSION_PATTERNS = [
  /\b(submit|submission|turn\s*in|hand\s*in|upload)\b/i,
  /\b(canvas|blackboard|moodle|lms)\b.*\b(submit|upload)\b/i,
];

const COMMENT_PATTERNS = [
  /\b(comment|reply|respond\s*to|discuss|post\s*in)\b.*\b(forum|thread|discussion|board)\b/i,
  /\b(peer\s*review|peer\s*feedback|classmate)\b/i,
];

/**
 * Check if text matches a pattern list.
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {boolean}
 */
function matchesPatterns(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

/**
 * Check for physical activity indicators.
 * Uses contextual analysis - not just keyword matching.
 * @param {string} text
 * @returns {{ detected: boolean, confidence: number, reason: string }}
 */
function detectPhysicalActivity(text) {
  const normalized = normalizeText(text);

  // Strong indicators
  const strongPatterns = [
    /\b(build|construct|assemble)\b.*\b(circuit|apparatus|prototype|board)\b/i,
    /\b(perform|conduct)\b.*\b(experiment|lab|laboratory)\b/i,
    /\b(measure|record)\b.*\b(voltage|current|resistance|temperature|pressure)\b/i,
    /\b(take|capture)\b.*\b(photo|picture|image)\b.*\b(of|your|the)\b.*(setup|circuit|experiment|lab)/i,
    /\b(hands[\s-]*on)\b/i,
    /\b(in[\s-]*lab|in[\s-]*person)\b.*\b(due|submit|complete|perform)\b/i,
  ];

  for (const pattern of strongPatterns) {
    if (pattern.test(text)) {
      return {
        detected: true,
        confidence: 0.9,
        reason: `Strong physical activity indicator: ${pattern.source.slice(0, 60)}`,
      };
    }
  }

  // Moderate indicators - need context to confirm
  const moderatePatterns = [
    /\b(build|construct|assemble|fabricate)\b/i,
    /\b(experiment|laboratory|lab\s*work)\b/i,
    /\b(measure|observe|test)\b.*\b(equipment|apparatus|device)\b/i,
  ];

  let moderateCount = 0;
  for (const pattern of moderatePatterns) {
    if (pattern.test(text)) {
      moderateCount++;
    }
  }

  if (moderateCount >= 2) {
    return {
      detected: true,
      confidence: 0.7,
      reason: 'Multiple moderate physical activity indicators found',
    };
  }

  return { detected: false, confidence: 0, reason: '' };
}

/**
 * Extract requirements from a normalized assignment.
 *
 * @param {object} assignment - Normalized AssignmentInput
 * @returns {object} Extracted requirements
 */
function extractRequirements(assignment) {
  const text = assignment.combinedText || '';
  const submissionTypes = assignment.submissionTypes || [];
  const fileExtensions = assignment.fileExtensions || [];

  const requirements = [];
  const detectedExternalTools = [];

  // ─── Detect external tools first (highest priority) ──────────────
  const externalTools = detectExternalTools(text, fileExtensions);
  for (const tool of externalTools) {
    detectedExternalTools.push(tool);
    requirements.push({
      type: 'EXTERNAL_SOFTWARE',
      description: `Requires ${tool.name}`,
      required: true,
      toolId: tool.toolId,
      toolName: tool.name,
      executionAvailable: tool.executionAvailable,
    });
  }

  // ─── Detect physical activity ────────────────────────────────────
  const physicalResult = detectPhysicalActivity(text);
  if (physicalResult.detected) {
    requirements.push({
      type: 'PHYSICAL_ACTIVITY',
      description: 'Requires physical activity or in-person work',
      required: true,
      confidence: physicalResult.confidence,
      reason: physicalResult.reason,
    });
  }

  // ─── Detect text requirements ────────────────────────────────────
  if (matchesPatterns(text, TEXT_PATTERNS) || assignment.isTextEntry) {
    requirements.push({
      type: 'TEXT',
      description: 'Requires written text response',
      required: true,
    });
  }

  // ─── Detect file requirements ────────────────────────────────────
  if (assignment.isFileUpload || matchesPatterns(text, FILE_PATTERNS)) {
    const formats = [];
    if (fileExtensions.length > 0) {
      formats.push(...fileExtensions);
    }

    requirements.push({
      type: 'FILE',
      description: formats.length > 0
        ? `Requires file upload (${formats.join(', ')})`
        : 'Requires file upload',
      required: true,
      formats: formats,
    });
  }

  // ─── Detect media requirements ───────────────────────────────────
  if (matchesPatterns(text, MEDIA_PATTERNS)) {
    const mediaTypes = [];
    if (/\b(video|recording|film|record)\b/i.test(text)) mediaTypes.push('video');
    if (/\b(audio|voice|sound|podcast)\b/i.test(text)) mediaTypes.push('audio');
    if (/\b(screenshot|screen\s*shot|screen\s*capture)\b/i.test(text)) mediaTypes.push('screenshot');
    if (/\b(photo|photograph|picture|image)\b/i.test(text)) mediaTypes.push('image');

    requirements.push({
      type: 'MEDIA',
      description: `Requires media content (${mediaTypes.join(', ') || 'unspecified'})`,
      required: true,
      mediaTypes: mediaTypes,
    });
  }

  // ─── Detect code requirements ────────────────────────────────────
  if (matchesPatterns(text, CODE_PATTERNS)) {
    requirements.push({
      type: 'CODE',
      description: 'Requires programming or code submission',
      required: true,
    });
  }

  // ─── Detect data analysis requirements ───────────────────────────
  if (matchesPatterns(text, DATA_ANALYSIS_PATTERNS)) {
    requirements.push({
      type: 'DATA_ANALYSIS',
      description: 'Requires data analysis or spreadsheet work',
      required: true,
    });
  }

  // ─── Detect presentation requirements ────────────────────────────
  if (matchesPatterns(text, PRESENTATION_PATTERNS)) {
    requirements.push({
      type: 'PRESENTATION',
      description: 'Requires presentation or slide deck',
      required: true,
    });
  }

  // ─── Detect Canvas submission requirement ────────────────────────
  if (matchesPatterns(text, CANVAS_SUBMISSION_PATTERNS) || assignment.isFileUpload || assignment.isTextEntry) {
    requirements.push({
      type: 'CANVAS_SUBMISSION',
      description: 'Requires submission through Canvas',
      required: true,
    });
  }

  // ─── Detect comment/discussion requirements ──────────────────────
  if (matchesPatterns(text, COMMENT_PATTERNS)) {
    requirements.push({
      type: 'COMMENT',
      description: 'Requires discussion post or comment',
      required: true,
    });
  }

  // ─── Rubric requirements ─────────────────────────────────────────
  if (assignment.rubric && Array.isArray(assignment.rubric.data)) {
    for (const criterion of assignment.rubric.data) {
      const desc = normalizeText(criterion.description || criterion.long_description || '');
      if (desc.includes('screenshot') || desc.includes('screen shot')) {
        if (!requirements.find((r) => r.type === 'MEDIA')) {
          requirements.push({
            type: 'MEDIA',
            description: 'Rubric requires screenshot',
            required: criterion.mriterion === 'rating', // Assume required unless optional
            source: 'rubric',
          });
        }
      }
    }
  }

  // ─── Deduplicate ─────────────────────────────────────────────────
  const seen = new Set();
  const deduplicated = requirements.filter((req) => {
    const key = req.type;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    requirements: deduplicated,
    externalTools: detectedExternalTools,
    hasExternalTools: detectedExternalTools.length > 0,
    hasPhysicalActivity: physicalResult.detected,
    requirementCategories: deduplicated.map((r) => r.type),
  };
}

module.exports = {
  extractRequirements,
  detectPhysicalActivity,
  matchesPatterns,
  TEXT_PATTERNS,
  FILE_PATTERNS,
  MEDIA_PATTERNS,
  PHYSICAL_PATTERNS,
  CODE_PATTERNS,
  DATA_ANALYSIS_PATTERNS,
  PRESENTATION_PATTERNS,
  CANVAS_SUBMISSION_PATTERNS,
  COMMENT_PATTERNS,
};
