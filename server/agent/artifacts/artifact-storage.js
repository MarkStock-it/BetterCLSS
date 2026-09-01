/**
 * artifact-storage.js
 * Artifact Storage Service.
 *
 * Manages filesystem storage for generated artifacts.
 * Each user's artifacts are stored in an isolated directory.
 *
 * Structure:
 *   .betterclss_data/artifacts/{userId}/{artifactId}_{filename}
 */

const fs = require('fs');
const path = require('path');

// ─── Storage Configuration ─────────────────────────────────────────

const ARTIFACTS_SUBDIR = 'artifacts';
const MAX_ARTIFACT_SIZE_MB = 50;

// ─── Storage Service ───────────────────────────────────────────────

/**
 * Create an artifact storage service.
 *
 * @param {string} dataDir - Base data directory (e.g., .betterclss_data)
 * @returns {object} Storage API
 */
function createArtifactStorage(dataDir) {
  const artifactsRoot = path.join(dataDir, ARTIFACTS_SUBDIR);

  /**
   * Ensure the user's artifact directory exists.
   * @param {number} userId
   * @returns {string} User's artifact directory path
   */
  function ensureUserDir(userId) {
    const userDir = path.join(artifactsRoot, String(userId));
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    return userDir;
  }

  /**
   * Save a generated artifact to storage.
   *
   * @param {number} userId
   * @param {string} artifactId
   * @param {string} filename
   * @param {Buffer} content - File content
   * @returns {{ storagePath: string, size: number }}
   * @throws {Error} If file is too large or save fails
   */
  function saveArtifact(userId, artifactId, filename, content) {
    if (!Buffer.isBuffer(content)) {
      throw new Error('Artifact content must be a Buffer');
    }

    const sizeMB = content.length / (1024 * 1024);
    if (sizeMB > MAX_ARTIFACT_SIZE_MB) {
      throw new Error(`Artifact exceeds maximum size of ${MAX_ARTIFACT_SIZE_MB}MB`);
    }

    const userDir = ensureUserDir(userId);
    const safeFilename = `${artifactId}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const filePath = path.join(userDir, safeFilename);

    fs.writeFileSync(filePath, content);

    return {
      storagePath: path.relative(dataDir, filePath),
      size: content.length,
    };
  }

  /**
   * Read an artifact from storage.
   *
   * @param {number} userId
   * @param {string} storagePath - Relative path from data directory
   * @returns {Buffer|null} File content or null if not found
   */
  function readArtifact(userId, storagePath) {
    const fullPath = path.join(dataDir, storagePath);

    // Security: verify the path is within the user's artifact directory
    const userDir = path.join(artifactsRoot, String(userId));
    const resolved = path.resolve(fullPath);
    const resolvedUserDir = path.resolve(userDir);

    if (!resolved.startsWith(resolvedUserDir)) {
      return null; // Path traversal attempt
    }

    if (!fs.existsSync(resolved)) {
      return null;
    }

    return fs.readFileSync(resolved);
  }

  /**
   * Delete an artifact from storage.
   *
   * @param {number} userId
   * @param {string} storagePath - Relative path from data directory
   * @returns {boolean} Whether deletion succeeded
   */
  function deleteArtifact(userId, storagePath) {
    const fullPath = path.join(dataDir, storagePath);

    // Security: verify the path is within the user's artifact directory
    const userDir = path.join(artifactsRoot, String(userId));
    const resolved = path.resolve(fullPath);
    const resolvedUserDir = path.resolve(userDir);

    if (!resolved.startsWith(resolvedUserDir)) {
      return false;
    }

    if (!fs.existsSync(resolved)) {
      return false;
    }

    try {
      fs.unlinkSync(resolved);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if an artifact exists in storage.
   *
   * @param {number} userId
   * @param {string} storagePath
   * @returns {boolean}
   */
  function artifactExists(userId, storagePath) {
    const fullPath = path.join(dataDir, storagePath);
    const userDir = path.join(artifactsRoot, String(userId));
    const resolved = path.resolve(fullPath);
    const resolvedUserDir = path.resolve(userDir);

    if (!resolved.startsWith(resolvedUserDir)) return false;
    return fs.existsSync(resolved);
  }

  /**
   * Get artifact file info (size, etc.) without reading content.
   *
   * @param {number} userId
   * @param {string} storagePath
   * @returns {{ exists: boolean, size: number }}
   */
  function getArtifactInfo(userId, storagePath) {
    const fullPath = path.join(dataDir, storagePath);
    const userDir = path.join(artifactsRoot, String(userId));
    const resolved = path.resolve(fullPath);
    const resolvedUserDir = path.resolve(userDir);

    if (!resolved.startsWith(resolvedUserDir)) {
      return { exists: false, size: 0 };
    }

    try {
      const stat = fs.statSync(resolved);
      return { exists: true, size: stat.size };
    } catch {
      return { exists: false, size: 0 };
    }
  }

  return {
    saveArtifact,
    readArtifact,
    deleteArtifact,
    artifactExists,
    getArtifactInfo,
    ensureUserDir,
  };
}

module.exports = { createArtifactStorage };
