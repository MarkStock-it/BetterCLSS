/**
 * external-tools.js
 * External tool detection registry.
 *
 * Maintains a list of external software/tools that assignments may require.
 * Each entry includes detection patterns (keywords, file extensions, context clues)
 * and whether Agentic Helper has any capability for that tool.
 *
 * This is NOT a keyword blacklist. It is a structured representation of
 * external tools that can be extended without rewriting the analyzer.
 */

const EXTERNAL_TOOLS = [
  {
    toolId: 'cisco_packet_tracer',
    name: 'Cisco Packet Tracer',
    detectionPatterns: [
      /\bpacket\s*tracer\b/i,
      /\.pkt\b/i,
      /\bcisco\b.*\b(packet|trac|network)\b/i,
      /\bnetwork\s*(topology|config|simulat)/i,
      /\brouter\b.*\b(config|interface|ospf|eigrp|rip)\b/i,
      /\bswitch\b.*\b(vlan|trunk|port)\b/i,
    ],
    requiredCapabilities: ['packet_tracer_project_generation', 'packet_tracer_project_validation'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.pkt', '.pkz'],
  },
  {
    toolId: 'matlab',
    name: 'MATLAB',
    detectionPatterns: [
      /\bmatlab\b/i,
      /\b\.m\b\s*(script|file|code)/i,
      /\bsimulink\b/i,
      /\bmatlab\s*assignment/i,
    ],
    requiredCapabilities: ['matlab_execution', 'matlab_script_generation'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.m', '.mat', '.slx', '.mdl'],
  },
  {
    toolId: 'autocad',
    name: 'AutoCAD',
    detectionPatterns: [
      /\bautocad\b/i,
      /\b\.dwg\b/i,
      /\b\.dxf\b/i,
      /\bcad\s*(drawing|draft|design)/i,
    ],
    requiredCapabilities: ['cad_drawing_generation'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.dwg', '.dxf'],
  },
  {
    toolId: 'solidworks',
    name: 'SolidWorks',
    detectionPatterns: [
      /\bsolidworks\b/i,
      /\b\.sldprt\b/i,
      /\b\.sldasm\b/i,
      /\b3d\s*(model|design|print)/i,
    ],
    requiredCapabilities: ['3d_model_generation'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.sldprt', '.sldasm', '.slddrw'],
  },
  {
    toolId: 'wireshark',
    name: 'Wireshark',
    detectionPatterns: [
      /\bwireshark\b/i,
      /\bpacket\s*capture\b/i,
      /\bpcap\b/i,
      /\bnetwork\s*(analy|capture|sniff)/i,
    ],
    requiredCapabilities: ['packet_capture_analysis'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.pcap', '.pcapng'],
  },
  {
    toolId: 'vmware',
    name: 'VMware',
    detectionPatterns: [
      /\bvmware\b/i,
      /\bvirtual\s*machine\b/i,
      /\bvm\s*(image|snapshot|setup)/i,
      /\bvmware\s*workstation/i,
    ],
    requiredCapabilities: ['vm_setup_and_configuration'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.vmx', '.vmdk'],
  },
  {
    toolId: 'virtualbox',
    name: 'VirtualBox',
    detectionPatterns: [
      /\bvirtualbox\b/i,
      /\bvirtual\s*box\b/i,
    ],
    requiredCapabilities: ['vm_setup_and_configuration'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.vbox', '.vdi'],
  },
  {
    toolId: 'android_studio',
    name: 'Android Studio',
    detectionPatterns: [
      /\bandroid\s*studio\b/i,
      /\bandroid\s*(app|develop)/i,
      /\bapk\b/i,
      /\bgradle\b.*\bandroid\b/i,
    ],
    requiredCapabilities: ['android_app_development'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.apk', '.gradle'],
  },
  {
    toolId: 'blender',
    name: 'Blender',
    detectionPatterns: [
      /\bblender\b(?!\s*(smoothie|mixer))/i,
      /\b\.blend\b/i,
      /\b3d\s*(render|animation|model)/i,
    ],
    requiredCapabilities: ['3d_rendering'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.blend'],
  },
  {
    toolId: 'photoshop',
    name: 'Adobe Photoshop',
    detectionPatterns: [
      /\bphotoshop\b/i,
      /\badobe\s*photoshop\b/i,
      /\b\.psd\b/i,
      /\bimage\s*(edit|manipulat|retouch)/i,
    ],
    requiredCapabilities: ['image_editing'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.psd'],
  },
  {
    toolId: 'spss',
    name: 'SPSS',
    detectionPatterns: [
      /\bspss\b/i,
      /\bstatistical\s*(package|analysis|software)/i,
      /\b\.sav\b/i,
    ],
    requiredCapabilities: ['statistical_analysis'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.sav', '.spss'],
  },
  {
    toolId: 'labview',
    name: 'LabVIEW',
    detectionPatterns: [
      /\blabview\b/i,
      /\b\.vi\b\s*(file|project)/i,
      /\bnational\s*instruments\b/i,
    ],
    requiredCapabilities: ['instrument_control'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.vi'],
  },
  {
    toolId: 'r_studio',
    name: 'R / RStudio',
    detectionPatterns: [
      /\brstudio\b/i,
      /\br\s*programming\b/i,
      /\br\s*script\b/i,
      /\b\.rmd\b/i,
      /\brmarkdown\b/i,
    ],
    requiredCapabilities: ['r_code_execution'],
    executionAvailable: false,
    validationAvailable: false,
    fileExtensions: ['.R', '.Rmd', '.r'],
  },
];

/**
 * Detect external tools referenced in assignment text.
 * @param {string} text - Assignment name + description
 * @param {string[]} fileExtensions - Allowed file extensions from Canvas
 * @returns {object[]} Detected external tools with match details
 */
function detectExternalTools(text, fileExtensions = []) {
  const combinedText = String(text || '');
  const extensions = fileExtensions.map((ext) => ext.toLowerCase());
  const detected = [];

  for (const tool of EXTERNAL_TOOLS) {
    let matched = false;
    const matchReasons = [];

    // Check text patterns
    for (const pattern of tool.detectionPatterns) {
      if (pattern.test(combinedText)) {
        matched = true;
        matchReasons.push(`text pattern: ${pattern.source}`);
        break;
      }
    }

    // Check file extensions
    if (!matched && extensions.length > 0) {
      for (const ext of tool.fileExtensions) {
        if (extensions.includes(ext)) {
          matched = true;
          matchReasons.push(`file extension: ${ext}`);
          break;
        }
      }
    }

    if (matched) {
      detected.push({
        toolId: tool.toolId,
        name: tool.name,
        matchReasons,
        executionAvailable: tool.executionAvailable,
        validationAvailable: tool.validationAvailable,
        requiredCapabilities: tool.requiredCapabilities,
      });
    }
  }

  return detected;
}

module.exports = {
  EXTERNAL_TOOLS,
  detectExternalTools,
};
