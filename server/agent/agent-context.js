/**
 * agent-context.js
 * Focused Agent Context Builder for Agentic Helper.
 *
 * Constructs the information the AI actually needs:
 *   - Assignment understanding (objective, requirements, constraints, deliverables)
 *   - Available capabilities
 *   - Available tools
 *   - Current execution step
 *   - Relevant previous results
 *   - Artifact requirements
 *   - Validation constraints
 *
 * Does NOT expose:
 *   - API keys
 *   - Canvas tokens
 *   - Internal database structures
 *   - Chain-of-thought from previous steps
 *   - User's private data beyond what's needed
 */

const { sanitizeContent, stripHtml } = require('./utils');

// ─── Assignment Understanding ─────────────────────────────────────

/**
 * Build a structured AssignmentUnderstanding from a manifest.
 * This is the AI's canonical view of what the assignment requires.
 *
 * @param {object} manifest - AssignmentManifest
 * @param {object} options - Additional context
 * @param {object[]} [options.stepResults] - Results from previous execution steps
 * @param {object} [options.plan] - Current execution plan
 * @returns {object} AssignmentUnderstanding
 */
function buildAssignmentUnderstanding(manifest, options = {}) {
  const meta = manifest?.metadata || {};
  const identity = manifest?.identity || {};
  const requirements = manifest?.requirements || {};
  const caps = manifest?.capabilities || {};
  const capResult = manifest?.capabilityResult || {};

  // Extract structured requirements from manifest
  const extracted = extractDetailedRequirements(manifest);

  return {
    // ─── Identity ──────────────────────────────────────────────
    title: meta.title || 'Untitled Assignment',
    course: identity.courseName || 'Unknown Course',
    courseCode: identity.courseCode || '',
    courseId: identity.courseId || null,
    assignmentId: identity.assignmentId || null,

    // ─── Objective ─────────────────────────────────────────────
    objective: buildObjective(manifest),

    // ─── Requirements ──────────────────────────────────────────
    requirements: extracted.requirements,

    // ─── Constraints ───────────────────────────────────────────
    constraints: extracted.constraints,

    // ─── Deliverables ──────────────────────────────────────────
    deliverables: extracted.deliverables,

    // ─── Submission ────────────────────────────────────────────
    submissionType: (meta.submissionTypes || [])[0] || 'unknown',
    allowedExtensions: meta.allowedExtensions || [],
    pointsPossible: meta.pointsPossible || null,

    // ─── Due Date ──────────────────────────────────────────────
    dueDate: meta.dueDate || null,
    lockDate: meta.lockAt || null,

    // ─── Capabilities ──────────────────────────────────────────
    capabilityStatus: capResult.status || 'UNKNOWN',
    supportedCapabilities: caps.supported || [],
    unsupportedCapabilities: caps.unsupported || [],

    // ─── Personal Information ──────────────────────────────────
    personalInfoRequired: extracted.personalInfoRequired,
    personalInfoQuestions: extracted.personalInfoQuestions,

    // ─── References ────────────────────────────────────────────
    referencesRequired: extracted.referencesRequired,
    referencesNote: extracted.referencesNote,

    // ─── Uncertainties ─────────────────────────────────────────
    uncertainties: extracted.uncertainties,
  };
}

/**
 * Build a concise objective statement for the AI.
 */
function buildObjective(manifest) {
  const meta = manifest?.metadata || {};
  const requirements = manifest?.requirements || {};
  const categories = requirements.categories || [];

  const parts = [];

  if (categories.includes('TEXT') || categories.length === 0) {
    parts.push('Generate written content');
  }
  if (categories.includes('FILE')) {
    const extensions = meta.allowedExtensions || meta.fileExtensions || [];
    if (extensions.includes('.docx')) parts.push('Create a DOCX document');
    if (extensions.includes('.txt')) parts.push('Create a plain text file');
    if (extensions.length > 0 && !extensions.includes('.docx') && !extensions.includes('.txt')) {
      parts.push(`Create a ${extensions[0]} file`);
    }
  }

  if (parts.length === 0) {
    parts.push('Complete the assignment requirements');
  }

  return parts.join(' and ');
}

/**
 * Extract detailed requirements, constraints, deliverables from the manifest.
 */
function extractDetailedRequirements(manifest) {
  const meta = manifest?.metadata || {};
  const requirements = manifest?.requirements || {};
  const details = requirements.details || [];
  const description = meta.plainDescription || meta.description || '';

  const result = {
    requirements: [],
    constraints: [],
    deliverables: [],
    personalInfoRequired: false,
    personalInfoQuestions: [],
    referencesRequired: false,
    referencesNote: '',
    uncertainties: [],
  };

  // ─── Extract from requirement details ────────────────────────
  for (const detail of details) {
    if (detail.type === 'text' || detail.type === 'content') {
      result.requirements.push({
        id: detail.id || `req_${result.requirements.length}`,
        description: detail.description || detail.text || '',
        type: 'content',
        priority: detail.priority || 'required',
      });
    } else if (detail.type === 'format' || detail.type === 'file') {
      result.deliverables.push({
        id: detail.id || `del_${result.deliverables.length}`,
        description: detail.description || '',
        format: detail.format || detail.extension || 'unknown',
      });
    }
  }

  // ─── Extract from description text ───────────────────────────
  const descLower = description.toLowerCase();

  // Word count constraints
  const wordCountMatch = description.match(/(\d+)[\s-]*(?:word|page)/i);
  if (wordCountMatch) {
    const num = parseInt(wordCountMatch[1], 10);
    if (descLower.includes('page')) {
      result.constraints.push({
        type: 'page_count',
        value: num,
        description: `Assignment is approximately ${num} page${num !== 1 ? 's' : ''}`,
      });
    } else {
      result.constraints.push({
        type: 'word_count',
        value: num,
        description: `Assignment requires approximately ${num} words`,
      });
    }
  }

  // Section requirements (e.g., "include introduction", "must have conclusion")
  const requiredSections = new Set();
  const sectionKeywords = ['introduction', 'conclusion', 'abstract', 'summary', 'methodology', 'analysis', 'discussion', 'results', 'findings', 'recommendations', 'bibliography', 'references', 'works cited'];

  for (const section of sectionKeywords) {
    // Check if section keyword appears in a context that implies it's required
    // Simple heuristic: if section appears after include/have/contain/require/must/must have
    const idx = descLower.indexOf(section);
    if (idx < 0) continue;

    // Look at text before the section keyword (up to 50 chars)
    const before = descLower.slice(Math.max(0, idx - 50), idx);
    const requiredMarkers = ['include', 'have', 'contain', 'need', 'require', 'must', 'and'];
    for (const marker of requiredMarkers) {
      if (before.includes(marker)) {
        requiredSections.add(section);
        break;
      }
    }
  }

  if (requiredSections.size > 0) {
    result.constraints.push({
      type: 'sections',
      value: [...requiredSections],
      description: `Required sections: ${[...requiredSections].join(', ')}`,
    });
  }

  // Reference requirements
  if (descLower.match(/(?:reference|citation|source|bibliography|works cited)/i)) {
    result.referencesRequired = true;
    const refMatch = description.match(/(\d+)\s*(?:reference|citation|source)/i);
    if (refMatch) {
      result.referencesNote = `Requires ${refMatch[1]} references/citations`;
      result.constraints.push({
        type: 'references',
        value: parseInt(refMatch[1], 10),
        description: `Must include ${refMatch[1]} references`,
      });
    } else {
      result.referencesNote = 'References/citations are required';
      result.constraints.push({
        type: 'references',
        value: null,
        description: 'References are required (count not specified)',
      });
    }
  }

  // Personal information detection
  const personalPatterns = [
    /(?:your|my|his|her|their)\s+(?:own|personal|individual)\s+(?:experience|opinion|observation|reflection|thought|feeling)/gi,
    /(?:personal\s+(?:experience|reflection|opinion|statement))/gi,
    /(?:reflect\s+on|think\s+about|share\s+your)/gi,
    /(?:what\s+do\s+you\s+think|how\s+do\s+you\s+feel|what\s+is\s+your\s+opinion)/gi,
    /(?:describe\s+your\s+(?:own|personal|experience))/gi,
  ];

  for (const pattern of personalPatterns) {
    if (pattern.test(description)) {
      result.personalInfoRequired = true;
      break;
    }
  }

  if (result.personalInfoRequired) {
    result.personalInfoQuestions.push(
      'This assignment appears to require personal experiences or opinions.',
      'Agentic Helper cannot fabricate personal information.',
      'Please provide your personal perspective before the agent can continue.'
    );
  }

  // Format requirements
  if (descLower.match(/\b(?:apa|mla|chicago|harvard|ieee)\b/i)) {
    const formatMatch = description.match(/\b(apa|mla|chicago|harvard|ieee)\b/i);
    result.constraints.push({
      type: 'citation_format',
      value: formatMatch[1].toUpperCase(),
      description: `Must use ${formatMatch[1].toUpperCase()} citation format`,
    });
  }

  // Deliverables from submission types
  const submissionTypes = meta.submissionTypes || [];
  const allowedExtensions = meta.allowedExtensions || [];

  if (submissionTypes.includes('online_upload')) {
    for (const ext of allowedExtensions) {
      if (ext === '.docx') {
        result.deliverables.push({ id: 'del_docx', description: 'Microsoft Word document', format: 'docx' });
      } else if (ext === '.pdf') {
        result.deliverables.push({ id: 'del_pdf', description: 'PDF document', format: 'pdf' });
      } else if (ext === '.txt') {
        result.deliverables.push({ id: 'del_txt', description: 'Plain text file', format: 'txt' });
      } else {
        result.deliverables.push({ id: `del_${ext}`, description: `File (${ext})`, format: ext });
      }
    }
  }

  if (submissionTypes.includes('online_text_entry')) {
    result.deliverables.push({ id: 'del_text', description: 'Text entry in Canvas', format: 'text_entry' });
  }

  // Default deliverable if nothing else identified
  if (result.deliverables.length === 0 && result.requirements.length > 0) {
    result.deliverables.push({ id: 'del_default', description: 'Written response', format: 'text' });
  }

  // Uncertainties
  if (!description || description.trim().length < 20) {
    result.uncertainties.push('Assignment instructions are very brief or missing');
  }
  if (requiredSections.size === 0 && !wordCountMatch) {
    result.uncertainties.push('No specific structure requirements detected in instructions');
  }

  return result;
}

// ─── Context for Specific Steps ──────────────────────────────────

/**
 * Build context for the ANALYZE step.
 * Focuses on understanding the assignment.
 *
 * @param {object} understanding - AssignmentUnderstanding
 * @param {object} manifest - Original manifest
 * @returns {string} Focused prompt for analysis
 */
function buildAnalyzeContext(understanding, manifest) {
  const parts = [
    `# Assignment: ${understanding.title}`,
    `Course: ${understanding.course}${understanding.courseCode ? ` (${understanding.courseCode})` : ''}`,
  ];

  if (understanding.dueDate) parts.push(`Due: ${understanding.dueDate}`);
  if (understanding.pointsPossible) parts.push(`Points: ${understanding.pointsPossible}`);

  parts.push('');
  parts.push('## Instructions');
  parts.push(manifest?.metadata?.plainDescription || manifest?.metadata?.description || 'No instructions provided.');

  if (understanding.constraints.length > 0) {
    parts.push('');
    parts.push('## Detected Constraints');
    for (const c of understanding.constraints) {
      parts.push(`- ${c.description}`);
    }
  }

  if (understanding.uncertainties.length > 0) {
    parts.push('');
    parts.push('## Uncertainties');
    for (const u of understanding.uncertainties) {
      parts.push(`- ${u}`);
    }
  }

  parts.push('');
  parts.push('## Your Task');
  parts.push('Analyze this assignment and provide a clear summary of:');
  parts.push('1. What the assignment requires');
  parts.push('2. What content needs to be generated');
  parts.push('3. What format/deliverable is expected');
  parts.push('4. Any constraints or special requirements');
  parts.push('');
  parts.push('Return a final_response with your analysis.');

  return parts.join('\n');
}

/**
 * Build context for the GENERATE step.
 * Provides everything needed for content creation.
 *
 * @param {object} understanding - AssignmentUnderstanding
 * @param {object} manifest - Original manifest
 * @param {object[]} [stepResults] - Results from previous steps
 * @returns {string} Focused prompt for generation
 */
function buildGenerateContext(understanding, manifest, stepResults = []) {
  const parts = [
    `# Generate Content for: ${understanding.title}`,
    `Course: ${understanding.course}${understanding.courseCode ? ` (${understanding.courseCode})` : ''}`,
    '',
    '## Assignment Instructions',
    manifest?.metadata?.plainDescription || manifest?.metadata?.description || 'No instructions provided.',
  ];

  // Requirements
  if (understanding.requirements.length > 0) {
    parts.push('');
    parts.push('## Requirements');
    for (const r of understanding.requirements) {
      parts.push(`- [${r.priority}] ${r.description}`);
    }
  }

  // Constraints
  if (understanding.constraints.length > 0) {
    parts.push('');
    parts.push('## Constraints');
    for (const c of understanding.constraints) {
      parts.push(`- ${c.description}`);
    }
  }

  // Deliverables
  if (understanding.deliverables.length > 0) {
    parts.push('');
    parts.push('## Expected Deliverables');
    for (const d of understanding.deliverables) {
      parts.push(`- ${d.description} (${d.format})`);
    }
  }

  // Personal info
  if (understanding.personalInfoRequired) {
    parts.push('');
    parts.push('## ⚠ Personal Information Required');
    parts.push('This assignment requires personal experiences or opinions.');
    parts.push('Do NOT fabricate personal experiences.');
    parts.push('If you need personal information, use needs_input to ask the user.');
  }

  // References
  if (understanding.referencesRequired) {
    parts.push('');
    parts.push('## ⚠ References Required');
    parts.push(understanding.referencesNote);
    parts.push('Do NOT fabricate citations, URLs, or author names.');
    parts.push('If you cannot verify a source, mark it as needing user review.');
  }

  // Previous analysis (if available)
  const analyzeResult = stepResults.find(r => r.type === 'analyze' || r.analysis);
  if (analyzeResult) {
    parts.push('');
    parts.push('## Previous Analysis');
    parts.push(analyzeResult.analysis || analyzeResult.result?.content || 'No analysis available');
  }

  parts.push('');
  parts.push('## Your Task');
  parts.push('Generate complete, well-structured content that fulfills all requirements above.');
  parts.push('Use available tools to read assignment details or create artifacts as needed.');
  parts.push('When content generation is complete, return a final_response with the full content.');

  return parts.join('\n');
}

/**
 * Build context for the REFINE step.
 * Provides the generated content and refinement instructions.
 *
 * @param {string} generatedContent - Content from generate step
 * @param {object} understanding - AssignmentUnderstanding
 * @returns {string} Focused prompt for refinement
 */
function buildRefineContext(generatedContent, understanding) {
  const parts = [
    `# Refine Content for: ${understanding.title}`,
    '',
    '## Generated Content',
    generatedContent || 'No content to refine.',
    '',
    '## Refinement Goals',
    '- Improve clarity and readability',
    '- Ensure natural flow and structure',
    '- Verify all requirements are addressed',
    '- Fix any grammatical or stylistic issues',
    '- Maintain factual accuracy',
    '',
    '## Constraints',
  ];

  for (const c of understanding.constraints) {
    parts.push(`- ${c.description}`);
  }

  if (understanding.personalInfoRequired) {
    parts.push('- Preserve personal experiences/opinions exactly as written');
  }

  parts.push('');
  parts.push('## Your Task');
  parts.push('Refine the content above. Return the improved version as a final_response.');

  return parts.join('\n');
}

// ─── Validation Context ──────────────────────────────────────────

/**
 * Build validation context for checking generated content.
 *
 * @param {string} content - Generated content
 * @param {object} understanding - AssignmentUnderstanding
 * @returns {object} Validation constraints for deterministic checking
 */
function buildValidationConstraints(understanding) {
  const constraints = [];

  for (const c of understanding.constraints) {
    if (c.type === 'word_count') {
      constraints.push({
        type: 'word_count',
        target: c.value,
        tolerance: Math.ceil(c.value * 0.15), // 15% tolerance
        description: c.description,
      });
    } else if (c.type === 'sections') {
      constraints.push({
        type: 'sections',
        required: c.value,
        description: c.description,
      });
    } else if (c.type === 'references') {
      constraints.push({
        type: 'references',
        minCount: c.value || 1,
        description: c.description,
      });
    } else if (c.type === 'citation_format') {
      constraints.push({
        type: 'citation_format',
        format: c.value,
        description: c.description,
      });
    }
  }

  return constraints;
}

/**
 * Validate content against constraints.
 *
 * @param {string} content - Generated content
 * @param {object[]} constraints - Validation constraints
 * @returns {{ valid: boolean, passed: object[], failed: object[], warnings: string[] }}
 */
function validateContent(content, constraints) {
  const passed = [];
  const failed = [];
  const warnings = [];

  if (!content || typeof content !== 'string') {
    return { valid: false, passed: [], failed: [{ type: 'content', description: 'No content provided' }], warnings: [] };
  }

  for (const constraint of constraints) {
    switch (constraint.type) {
      case 'word_count': {
        const words = content.split(/\s+/).filter(w => w.length > 0).length;
        const target = constraint.target;
        const tolerance = constraint.tolerance || Math.ceil(target * 0.15);
        if (words >= target - tolerance && words <= target + tolerance) {
          passed.push({ ...constraint, actual: words });
        } else if (words < target - tolerance) {
          failed.push({ ...constraint, actual: words, reason: `Content has ${words} words, target is ${target}` });
        } else {
          warnings.push(`Content has ${words} words, exceeding target of ${target} by ${words - target}`);
          passed.push({ ...constraint, actual: words });
        }
        break;
      }
      case 'sections': {
        const contentLower = content.toLowerCase();
        const missing = constraint.required.filter(s => !contentLower.includes(s));
        if (missing.length === 0) {
          passed.push({ ...constraint, actual: constraint.required });
        } else {
          failed.push({ ...constraint, missing, reason: `Missing sections: ${missing.join(', ')}` });
        }
        break;
      }
      case 'references': {
        // Check for citation-like patterns
        const citationPatterns = [
          /\(\w+\s+et\s+al\.?,?\s*\d{4}\)/g,  // (Author et al., 2024)
          /\(\w+,?\s*\d{4}\)/g,                   // (Author, 2024)
          /\[\d+\]/g,                              // [1]
          /https?:\/\/[^\s]+/g,                    // URLs
        ];
        let citationCount = 0;
        for (const pattern of citationPatterns) {
          const matches = content.match(pattern);
          if (matches) citationCount += matches.length;
        }
        if (citationCount >= (constraint.minCount || 1)) {
          passed.push({ ...constraint, actual: citationCount });
        } else {
          warnings.push(`Found ${citationCount} potential citations, expected at least ${constraint.minCount || 1}`);
          // Don't fail on references — the user may need to add them manually
          passed.push({ ...constraint, actual: citationCount, note: 'Citations may need manual verification' });
        }
        break;
      }
      case 'citation_format': {
        // Basic format check
        passed.push({ ...constraint, note: 'Citation format requires manual verification' });
        break;
      }
      default:
        passed.push(constraint);
    }
  }

  return {
    valid: failed.length === 0,
    passed,
    failed,
    warnings,
  };
}

// ─── System Instruction Builder ──────────────────────────────────

/**
 * Build the system instruction for the AI.
 * This is the overarching behavioral guide.
 *
 * @param {object} understanding - AssignmentUnderstanding
 * @param {object} plan - ExecutionPlan
 * @returns {string} System instruction
 */
function buildSystemInstruction(understanding, plan) {
  const steps = plan?.steps || [];
  const activeSteps = steps.filter(s => s.state !== 'BLOCKED');
  const stepDescriptions = activeSteps.map(s => `- ${s.label}: ${s.description}`).join('\n');

  const toolDefs = []; // Will be set by the orchestrator

  const parts = [
    'You are an internal planning component of BetterCLSS Agentic Helper.',
    '',
    'You operate within a controlled runtime. You can ONLY request registered tools.',
    'You CANNOT perform external actions directly.',
    'You must NEVER claim an action was completed unless the tool result confirms it.',
    '',
    '## Your Current Task',
    `Assignment: ${understanding.title}`,
    `Course: ${understanding.course}`,
    `Objective: ${understanding.objective}`,
    `Capability Status: ${understanding.capabilityStatus}`,
    '',
    '## Requirements',
  ];

  for (const r of understanding.requirements) {
    parts.push(`- [${r.priority}] ${r.description}`);
  }

  if (understanding.constraints.length > 0) {
    parts.push('');
    parts.push('## Constraints');
    for (const c of understanding.constraints) {
      parts.push(`- ${c.description}`);
    }
  }

  if (understanding.deliverables.length > 0) {
    parts.push('');
    parts.push('## Expected Deliverables');
    for (const d of understanding.deliverables) {
      parts.push(`- ${d.description} (${d.format})`);
    }
  }

  parts.push('');
  parts.push('## Execution Plan');
  parts.push(stepDescriptions || 'No steps defined');

  parts.push('');
  parts.push('## Available Tools');
  parts.push('You may request tool calls for read-only Canvas operations and artifact generation.');
  parts.push('Tool results are authoritative — never override them.');

  if (understanding.referencesRequired) {
    parts.push('');
    parts.push('## ⚠ Reference Policy');
    parts.push('DO NOT fabricate citations, URLs, authors, or statistics.');
    parts.push('If you cannot verify a source, mark it for user review.');
    parts.push('Use placeholder markers like [Citation needed] rather than inventing sources.');
  }

  if (understanding.personalInfoRequired) {
    parts.push('');
    parts.push('## ⚠ Personal Information Policy');
    parts.push('DO NOT fabricate personal experiences, opinions, or observations.');
    parts.push('If the assignment requires personal input, use needs_input to ask the user.');
  }

  parts.push('');
  parts.push('## Response Format');
  parts.push('Always respond with a JSON object containing:');
  parts.push('- "action": one of "tool_call", "final_response", or "needs_input"');
  parts.push('- For tool_call: "tool_calls" array with { tool, arguments, callId }');
  parts.push('- For final_response: "content" with your response');
  parts.push('- For needs_input: "content" and "input_prompt"');
  parts.push('- "reasoning": brief explanation of your chosen action');
  parts.push('');
  parts.push('## Critical Rules');
  parts.push('1. Never hallucinate tool results.');
  parts.push('2. If a tool fails, report the failure honestly.');
  parts.push('3. If you cannot complete the task, say so.');
  parts.push('4. Never claim file uploads, submissions, or Canvas mutations occurred.');
  parts.push('5. The application controls what happens — not you.');
  parts.push('6. Do not fabricate personal experiences or opinions.');
  parts.push('7. Do not fabricate citations, URLs, or sources.');

  return parts.join('\n');
}

// ─── Step-Aware Context (Phase 27) ──────────────────────────────

/**
 * Categories of tools by step type.
 * Only tools in the relevant category are exposed to each step.
 */
const STEP_TOOL_CATEGORIES = {
  analyze: ['canvas', 'read'],           // READ tools + Canvas read
  generate: ['canvas', 'read', 'generate', 'artifact'], // READ + GENERATE + artifact
  refine: [],                            // No tools needed (deterministic)
  validate: [],                          // No tools needed (deterministic)
  artifact: ['artifact'],                // Only artifact generators
  artifact_validate: [],                 // No tools needed (deterministic)
};

/**
 * Maximum output tokens per step type.
 * Keeps AI responses focused and avoids unnecessary token spend.
 */
const STEP_OUTPUT_LIMITS = {
  analyze: 1024,            // Analysis is short — just structured summary
  generate: 8192,           // Content generation needs full output
  refine: 2048,             // Refinement returns modified content
  validate: 512,            // Validation is mostly deterministic
  artifact: 1024,           // Artifact tool call is a JSON action
  artifact_validate: 512,   // Validation result is small JSON
};

/**
 * Build a compact, step-aware system instruction.
 * Keeps the stable prefix identical across all steps (for Gemini cache reuse)
 * and appends only the variable context relevant to the current step.
 *
 * @param {object} understanding - AssignmentUnderstanding
 * @param {object} plan - ExecutionPlan
 * @param {string} currentStepType - Current step type (analyze, generate, etc.)
 * @returns {string} Compact system instruction
 */
function buildStepSystemInstruction(understanding, plan, currentStepType) {
  const parts = [
    // ─── STABLE PREFIX (identical across all steps — Gemini cache target) ─
    'You are BetterCLSS Agentic Helper, an internal planning component.',
    'You operate within a controlled runtime. You can ONLY request registered tools.',
    'You CANNOT perform external actions directly.',
    'You must NEVER claim an action was completed unless the tool result confirms it.',
    '',
    // ─── STABLE: Assignment identity (never changes during a job) ───────
    `Assignment: ${understanding.title}`,
    `Course: ${understanding.course}`,
    `Objective: ${understanding.objective}`,
    `Capability: ${understanding.capabilityStatus}`,
  ];

  // ─── STABLE: Requirements (never change during a job) ───────────────
  if (understanding.requirements.length > 0) {
    parts.push('');
    parts.push('Requirements:');
    for (const r of understanding.requirements) {
      parts.push(`- [${r.priority}] ${r.description}`);
    }
  }

  // ─── STABLE: Constraints ───────────────────────────────────────────
  if (understanding.constraints.length > 0) {
    parts.push('');
    parts.push('Constraints:');
    for (const c of understanding.constraints) {
      parts.push(`- ${c.description}`);
    }
  }

  // ─── STABLE: Deliverables ──────────────────────────────────────────
  if (understanding.deliverables.length > 0) {
    parts.push('');
    parts.push('Deliverables:');
    for (const d of understanding.deliverables) {
      parts.push(`- ${d.description} (${d.format})`);
    }
  }

  // ─── STABLE: Safety policies ───────────────────────────────────────
  parts.push('');
  parts.push('## Safety Rules');
  parts.push('1. Never hallucinate tool results.');
  parts.push('2. If a tool fails, report honestly.');
  parts.push('3. Never claim file uploads or Canvas mutations occurred.');
  parts.push('4. The application controls what happens — not you.');
  if (understanding.referencesRequired) {
    parts.push('5. Do not fabricate citations, URLs, or sources.');
  }
  if (understanding.personalInfoRequired) {
    parts.push('6. Do not fabricate personal experiences — use needs_input.');
  }

  // ─── VARIABLE: Step-specific context (changes per step) ────────────
  parts.push('');
  parts.push(`## Current Step: ${currentStepType.toUpperCase()}`);

  switch (currentStepType) {
    case 'analyze':
      parts.push('Analyze this assignment. Provide a concise structured summary.');
      parts.push('Return a final_response with: title, objective, requirements, constraints, deliverables.');
      break;
    case 'generate':
      parts.push('Generate complete, well-structured content that fulfills all requirements.');
      parts.push('Use available tools to read assignment details or create artifacts.');
      parts.push('When complete, return a final_response with the full content.');
      break;
    case 'refine':
      parts.push('Refine the content for clarity, naturalness, and requirement alignment.');
      parts.push('Do NOT invent facts, citations, or personal experiences.');
      parts.push('Return the improved version as a final_response.');
      break;
    default:
      parts.push('Complete this step using the available tools and context.');
  }

  // ─── VARIABLE: Response format ─────────────────────────────────────
  parts.push('');
  parts.push('Response format: JSON with "action" (tool_call|final_response|needs_input).');
  if (currentStepType === 'generate') {
    parts.push('For tool_call: include "tool_calls" array with { tool, arguments, callId }.');
    parts.push('For final_response: include "content" with your response.');
  }

  return parts.join('\n');
}

/**
 * Filter tool definitions to only those relevant for a given step type.
 * Reduces schema size and focuses the AI on applicable tools.
 *
 * @param {object[]} allTools - All registered tool definitions
 * @param {string} stepType - Current step type
 * @returns {object[]} Filtered tool definitions
 */
function filterToolsForStep(allTools, stepType) {
  if (!allTools || allTools.length === 0) return [];

  const allowedCategories = STEP_TOOL_CATEGORIES[stepType] || [];
  if (allowedCategories.length === 0) return []; // Step doesn't need tools

  // Permission exclusions per step type
  const excludePermissions = {
    analyze: ['WRITE', 'SUBMIT'],   // Analyze never writes or submits
    generate: ['SUBMIT'],           // Generate never submits
    artifact: ['WRITE', 'SUBMIT'],  // Artifact only generates locally
  };
  const excluded = excludePermissions[stepType] || [];

  return allTools.filter(tool => {
    const toolCat = (tool.category || '').toLowerCase();
    const matchesCategory = allowedCategories.some(cat => toolCat.includes(cat));
    if (!matchesCategory) return false;

    // Exclude tools with forbidden permissions
    const toolPerms = tool.permissions || [];
    if (excluded.some(perm => toolPerms.includes(perm))) return false;

    return true;
  });
}

/**
 * Build compact step context (what the AI needs for this specific step).
 * Avoids sending the full assignment text when the system instruction already has it.
 *
 * @param {string} stepType - Current step type
 * @param {object} understanding - AssignmentUnderstanding
 * @param {object} manifest - Original manifest
 * @param {object} stepResults - Results from previous steps
 * @param {object} plan - Current execution plan
 * @returns {string} Minimal prompt for this step
 */
function buildStepPrompt(stepType, understanding, manifest, stepResults, plan) {
  switch (stepType) {
    case 'analyze':
      // Minimal — system instruction already has requirements
      return 'Analyze this assignment. Return a final_response with structured analysis.';

    case 'generate':
      return buildCompactGeneratePrompt(understanding, manifest, stepResults);

    case 'refine':
      return buildCompactRefinePrompt(stepResults);

    default:
      return 'Complete this step.';
  }
}

/**
 * Build a compact generate prompt that avoids repeating assignment text.
 * The system instruction already contains requirements and constraints.
 * This prompt only provides the instruction text (the actual Canvas description).
 *
 * @param {object} understanding
 * @param {object} manifest
 * @param {object} stepResults
 * @returns {string}
 */
function buildCompactGeneratePrompt(understanding, manifest, stepResults) {
  const parts = [];

  // Only include the actual instruction text (not the requirements — those are in system instruction)
  const description = manifest?.metadata?.plainDescription || manifest?.metadata?.description || '';
  if (description) {
    parts.push('## Assignment Instructions');
    parts.push(description);
  }

  // Only include personal info warnings if applicable
  if (understanding.personalInfoRequired) {
    parts.push('');
    parts.push('⚠ This assignment requires personal experiences. Use needs_input to ask the user.');
  }

  if (understanding.referencesRequired) {
    parts.push('');
    parts.push('⚠ Do not fabricate citations. Mark unverifiable sources for user review.');
  }

  // Include previous analysis summary (not full analysis)
  const analyzeResult = stepResults?.analyze;
  if (analyzeResult?.analysis) {
    const summary = analyzeResult.analysis.length > 300
      ? analyzeResult.analysis.slice(0, 300) + '...'
      : analyzeResult.analysis;
    parts.push('');
    parts.push('## Previous Analysis Summary');
    parts.push(summary);
  }

  parts.push('');
  parts.push('Generate complete, well-structured content fulfilling all requirements.');

  return parts.join('\n');
}

/**
 * Build a compact refine prompt.
 * Only sends the content to refine — requirements are in system instruction.
 *
 * @param {object} stepResults
 * @returns {string}
 */
function buildCompactRefinePrompt(stepResults) {
  const generateStep = stepResults?.generate;
  const content = generateStep?.generatedContent || '';

  if (!content) return 'No content to refine.';

  // Truncate very long content to save tokens (refinement doesn't need full text for short checks)
  const maxContentLength = 6000;
  const truncated = content.length > maxContentLength
    ? content.slice(0, maxContentLength) + '\n\n[Content truncated for refinement analysis]'
    : content;

  return `## Content to Refine\n\n${truncated}\n\nRefine for clarity, naturalness, and structure. Return the improved version.`;
}

/**
 * Get the output token limit for a given step type.
 *
 * @param {string} stepType
 * @returns {number}
 */
function getStepOutputLimit(stepType) {
  return STEP_OUTPUT_LIMITS[stepType] || 4096;
}

module.exports = {
  buildAssignmentUnderstanding,
  buildAnalyzeContext,
  buildGenerateContext,
  buildRefineContext,
  buildValidationConstraints,
  buildSystemInstruction,
  validateContent,
  extractDetailedRequirements,
  // Phase 27: Token-efficient architecture
  buildStepSystemInstruction,
  filterToolsForStep,
  buildStepPrompt,
  getStepOutputLimit,
  STEP_TOOL_CATEGORIES,
  STEP_OUTPUT_LIMITS,
};
