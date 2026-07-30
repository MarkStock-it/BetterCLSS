const fs = require('fs');
const path = require('path');

function createUserRoutes({
  canvasService,
  json,
  parseRequestBody,
  rootDir,
  userStorage,
}) {
  return async function handleUserRoute(req, res, pathname) {
    if (pathname === '/api/user/authenticate' && req.method === 'POST') {
      try {
        const canvasAuth = canvasService.resolveAuth(req);
        const profile = await canvasService.fetchOne('/users/self/profile', {}, canvasAuth);
        if (!profile.id) {
          json(res, 401, { error: 'invalid_profile', message: 'Canvas profile not found' });
          return true;
        }

        const userId = profile.id;
        const filePath = path.join(rootDir, '.betterclss_data', `user_${userId}.json`);
        const isNewUser = !fs.existsSync(filePath);
        const userData = userStorage.loadOrCreateUser(userId, {
          name: profile.name,
          email: profile.primary_email || profile.email,
        });
        canvasService.cacheVerifiedUser(canvasAuth, profile);
        json(res, 200, {
          success: true,
          userId,
          name: profile.name,
          email: profile.primary_email || profile.email,
          isNewUser,
          localData: userData.local,
          canvasData: userData.canvas,
        });
      } catch (error) {
        if (error.message === 'MISSING_CANVAS_TOKEN') {
          json(res, 400, { error: 'missing_canvas_token', message: 'Provide Canvas token.' });
        } else if (error.message === 'UNAUTHORIZED') {
          json(res, 401, { error: 'unauthorized', message: 'Canvas token is invalid or expired.' });
        } else {
          json(res, 502, { error: 'auth_error', message: error.message });
        }
      }
      return true;
    }

    const dataMatch = pathname.match(/^\/api\/user\/data\/(\d+)$/);
    if (dataMatch && req.method === 'GET') {
      const userId = parseInt(dataMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const userData = userStorage.loadOrCreateUser(userId);
        json(res, 200, {
          success: true,
          userId,
          localData: userData.local,
          canvasData: userData.canvas,
          uiData: userData.ui,
        });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 502, { error: 'load_error', message: error.message });
        }
      }
      return true;
    }

    if (dataMatch && req.method === 'POST') {
      const userId = parseInt(dataMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req);
        if (body.local && typeof body.local === 'object') {
          userStorage.updateUserLocalData(userId, body.local);
        }
        if (body.ui && typeof body.ui === 'object') {
          const userData = userStorage.loadOrCreateUser(userId);
          userData.ui = { ...userData.ui, ...body.ui };
          userStorage.saveUserData(userId, userData);
        }
        json(res, 200, { success: true, userId });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 502, { error: 'save_error', message: error.message });
        }
      }
      return true;
    }

    const syncMatch = pathname.match(/^\/api\/user\/sync\/(\d+)$/);
    if (syncMatch && req.method === 'POST') {
      const userId = parseInt(syncMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        const body = await parseRequestBody(req);
        userStorage.updateUserCanvasData(userId, {
          assignments: Array.isArray(body.assignments) ? body.assignments : [],
          announcements: Array.isArray(body.announcements) ? body.announcements : [],
          grades: Array.isArray(body.grades) ? body.grades : [],
          courses: Array.isArray(body.courses) ? body.courses : [],
        });
        json(res, 200, { success: true, userId });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 502, { error: 'sync_error', message: error.message });
        }
      }
      return true;
    }

    const logoutMatch = pathname.match(/^\/api\/user\/logout\/(\d+)$/);
    if (logoutMatch && req.method === 'POST') {
      const userId = parseInt(logoutMatch[1]);
      try {
        await canvasService.verifyUserRequest(req, userId);
        json(res, 200, {
          success: true,
          message: 'Logged out successfully',
        });
      } catch (error) {
        if (!canvasService.writeUserAuthError(res, error)) {
          json(res, 502, { error: 'logout_error', message: error.message });
        }
      }
      return true;
    }

    return false;
  };
}

module.exports = { createUserRoutes };
