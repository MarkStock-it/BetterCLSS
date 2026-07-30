const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const BLOCKED_ROOT_FILES = new Set([
  'server.js',
  'package.json',
  'package-lock.json',
  'README.md',
]);

function createStaticHandler(rootDir, json) {
  return function serveStatic(req, res) {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === '/') pathname = '/index.html';

    const segments = pathname.split('/').filter(Boolean);
    const hasDotfileSegment = segments.some((segment) => segment.startsWith('.'));
    const isServerModule = segments[0] === 'server';
    if (hasDotfileSegment || isServerModule || (segments.length === 1 && BLOCKED_ROOT_FILES.has(segments[0]))) {
      json(res, 403, { error: 'forbidden' });
      return;
    }

    const filePath = path.resolve(rootDir, `.${pathname}`);
    if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
      json(res, 403, { error: 'forbidden' });
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        json(res, 404, { error: 'not_found' });
        return;
      }

      const extension = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[extension] || 'application/octet-stream';
      const range = req.headers.range;
      const isVideo = contentType.startsWith('video/');

      if (isVideo && range) {
        const match = range.match(/bytes=(\d*)-(\d*)/);
        if (!match) {
          res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
          res.end();
          return;
        }

        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : stats.size - 1;
        const invalidRange = (
          !Number.isFinite(start)
          || !Number.isFinite(end)
          || start < 0
          || end >= stats.size
          || start > end
        );
        if (invalidRange) {
          res.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
          res.end();
          return;
        }

        res.writeHead(206, {
          'Content-Type': contentType,
          'Content-Length': end - start + 1,
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      const headers = {
        'Content-Type': contentType,
        'Content-Length': stats.size,
      };
      if (isVideo) headers['Accept-Ranges'] = 'bytes';
      res.writeHead(200, headers);
      fs.createReadStream(filePath).pipe(res);
    });
  };
}

module.exports = { createStaticHandler };
