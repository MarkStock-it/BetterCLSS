function createCanvasRoutes({ canvasService, json }) {
  return async function handleCanvasRoute(req, res, pathname) {
    try {
      const canvasAuth = canvasService.resolveAuth(req);
      if (pathname === '/api/canvas/test') {
        json(res, 200, await canvasService.fetchOne('/users/self/profile', {}, canvasAuth));
        return;
      }
      if (pathname === '/api/canvas/assignments') {
        json(res, 200, await canvasService.getAssignments(canvasAuth));
        return;
      }
      if (pathname === '/api/canvas/announcements') {
        json(res, 200, await canvasService.getAnnouncements(canvasAuth));
        return;
      }
      if (pathname === '/api/canvas/grades') {
        json(res, 200, await canvasService.getGrades(canvasAuth));
        return;
      }
      json(res, 404, { error: 'not_found' });
    } catch (error) {
      if (error.message === 'MISSING_CANVAS_TOKEN') {
        json(res, 400, {
          error: 'missing_canvas_token',
          message: 'Provide Canvas token from website settings.',
        });
        return;
      }
      if (error.message === 'INVALID_CANVAS_DOMAIN') {
        json(res, 400, { error: 'invalid_canvas_domain', message: 'Canvas domain is invalid.' });
        return;
      }
      if (error.message === 'UNAUTHORIZED') {
        json(res, 401, { error: 'unauthorized', message: 'Canvas token is invalid or expired.' });
        return;
      }
      json(res, 502, { error: 'canvas_error', message: error.message });
    }
  };
}

module.exports = { createCanvasRoutes };
