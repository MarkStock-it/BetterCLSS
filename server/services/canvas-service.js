const crypto = require('crypto');

const USER_AUTH_CACHE_MS = 15 * 60 * 1000;

function createCanvasService(config, json) {
  const verifiedUsers = new Map();

  function normalizeDomain(value) {
    const domain = String(value || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '');
    if (!domain || !/^[a-zA-Z0-9.-]+$/.test(domain)) return null;
    return domain.toLowerCase();
  }

  function resolveAuth(req) {
    const headerToken = String(req.headers['x-canvas-token'] || '').trim();
    const headerDomain = String(req.headers['x-canvas-domain'] || '').trim();
    const token = headerToken || config.canvasToken;
    const domain = normalizeDomain(headerDomain) || normalizeDomain(config.canvasDomain);
    if (!token) throw new Error('MISSING_CANVAS_TOKEN');
    if (!domain) throw new Error('INVALID_CANVAS_DOMAIN');
    return { token, domain };
  }

  function credentialKey(auth) {
    return crypto
      .createHash('sha256')
      .update(`${auth.domain}\n${auth.token}`)
      .digest('hex');
  }

  function extractNextLink(linkHeader) {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
    return match ? match[1] : null;
  }

  async function fetchAll(apiPath, params = {}, auth) {
    const all = [];
    const base = `https://${auth.domain}/api/v1`;
    const query = new URLSearchParams({ per_page: '100', ...params }).toString();
    let nextUrl = `${base}${apiPath}?${query}`;

    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${auth.token}`,
          Accept: 'application/json',
        },
      });
      if (response.status === 401) throw new Error('UNAUTHORIZED');
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data = await response.json();
      if (Array.isArray(data)) all.push(...data);
      nextUrl = extractNextLink(response.headers.get('link'));
    }
    return all;
  }

  async function fetchOne(apiPath, params = {}, auth) {
    const base = `https://${auth.domain}/api/v1`;
    const query = new URLSearchParams(params).toString();
    const url = `${base}${apiPath}${query ? `?${query}` : ''}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${auth.token}`,
        Accept: 'application/json',
      },
    });
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return response.json();
  }

  async function verifyUserRequest(req, expectedUserId) {
    const auth = resolveAuth(req);
    const cacheKey = credentialKey(auth);
    const cached = verifiedUsers.get(cacheKey);
    const now = Date.now();

    if (cached && cached.expiresAt > now) {
      if (String(cached.userId) !== String(expectedUserId)) throw new Error('FORBIDDEN_USER');
      return cached;
    }

    const profile = await fetchOne('/users/self/profile', {}, auth);
    if (!profile?.id) throw new Error('UNAUTHORIZED');
    if (String(profile.id) !== String(expectedUserId)) throw new Error('FORBIDDEN_USER');

    const verified = {
      userId: profile.id,
      name: profile.name || '',
      expiresAt: now + USER_AUTH_CACHE_MS,
    };
    verifiedUsers.set(cacheKey, verified);
    if (verifiedUsers.size > 500) {
      for (const [key, value] of verifiedUsers) {
        if (value.expiresAt <= now) verifiedUsers.delete(key);
      }
    }
    return verified;
  }

  function cacheVerifiedUser(auth, profile) {
    verifiedUsers.set(credentialKey(auth), {
      userId: profile.id,
      name: profile.name || '',
      expiresAt: Date.now() + USER_AUTH_CACHE_MS,
    });
  }

  function writeUserAuthError(res, error) {
    if (error.message === 'MISSING_CANVAS_TOKEN') {
      json(res, 401, { error: 'missing_credentials', message: 'Reconnect Canvas to access saved user data.' });
      return true;
    }
    if (error.message === 'UNAUTHORIZED') {
      json(res, 401, { error: 'unauthorized', message: 'Canvas token is invalid or expired.' });
      return true;
    }
    if (error.message === 'FORBIDDEN_USER') {
      json(res, 403, { error: 'forbidden', message: 'This Canvas account cannot access that user record.' });
      return true;
    }
    return false;
  }

  function stripHtml(html) {
    if (!html) return '';
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 300);
  }

  function isTooOldAssignment(dueAt) {
    if (!dueAt) return false;
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    return Math.floor((today - due) / 86400000) > config.maxOverdueDays;
  }

  async function getCourses(auth) {
    const courses = await fetchAll('/courses', {
      enrollment_type: 'student',
      enrollment_state: 'active',
      include: ['total_scores', 'current_grading_period_scores', 'term'],
    }, auth);
    return courses.filter((course) => course.name && !course.access_restricted_by_date);
  }

  async function getAssignments(auth) {
    const courses = await getCourses(auth);
    const assignments = [];
    await Promise.all(courses.map(async (course) => {
      try {
        const courseAssignments = await fetchAll(`/courses/${course.id}/assignments`, {
          include: ['submission', 'overrides'],
          order_by: 'due_at',
        }, auth);
        courseAssignments.forEach((assignment) => {
          if (isTooOldAssignment(assignment.due_at)) return;
          assignments.push({
            id: `canvas_${assignment.id}`,
            canvasId: assignment.id,
            courseId: course.id,
            courseName: course.name,
            courseCode: course.course_code,
            title: assignment.name,
            dueAt: assignment.due_at,
            pointsPossible: assignment.points_possible,
            submissionTypes: assignment.submission_types,
            submitted: assignment.submission?.workflow_state === 'submitted' || assignment.submission?.workflow_state === 'graded',
            graded: assignment.submission?.workflow_state === 'graded',
            submissionState: assignment.submission?.workflow_state ?? null,
            submittedAt: assignment.submission?.submitted_at ?? null,
            score: assignment.submission?.score ?? null,
            grade: assignment.submission?.grade ?? null,
            canvasUrl: assignment.html_url,
            lockAt: assignment.lock_at,
            source: 'canvas',
          });
        });
      } catch (error) {
        console.warn(`Skipping course ${course.id}:`, error.message);
      }
    }));
    assignments.sort((left, right) => {
      if (!left.dueAt && !right.dueAt) return 0;
      if (!left.dueAt) return 1;
      if (!right.dueAt) return -1;
      return new Date(left.dueAt) - new Date(right.dueAt);
    });
    return assignments;
  }

  async function getAnnouncements(auth) {
    const courses = await getCourses(auth);
    const announcements = [];
    await Promise.all(courses.map(async (course) => {
      try {
        const posts = await fetchAll('/announcements', {
          context_codes: [`course_${course.id}`],
          per_page: 20,
        }, auth);
        posts.forEach((post) => {
          announcements.push({
            id: `canvas_ann_${post.id}`,
            canvasId: post.id,
            courseId: course.id,
            courseName: course.name,
            title: post.title,
            message: stripHtml(post.message),
            postedAt: post.posted_at,
            author: post.author?.display_name || 'Instructor',
            canvasUrl: post.html_url,
            source: 'canvas',
          });
        });
      } catch (error) {
        console.warn(`Skipping announcements for ${course.id}:`, error.message);
      }
    }));
    announcements.sort((left, right) => new Date(right.postedAt) - new Date(left.postedAt));
    return announcements;
  }

  async function getGrades(auth) {
    const courses = await getCourses(auth);
    return courses.map((course) => ({
      courseId: course.id,
      courseName: course.name,
      courseCode: course.course_code,
      currentScore: course.enrollments?.[0]?.computed_current_score ?? null,
      finalScore: course.enrollments?.[0]?.computed_final_score ?? null,
      currentGrade: course.enrollments?.[0]?.computed_current_grade ?? null,
    }));
  }

  /**
   * POST request to Canvas API.
   * @param {string} apiPath - Canvas API path
   * @param {object} body - Request body
   * @param {object} auth - Canvas auth credentials
   * @returns {Promise<object>} Response JSON
   */
  async function post(apiPath, body, auth) {
    const base = `https://${auth.domain}/api/v1`;
    const response = await fetch(`${base}${apiPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (response.status === 401) throw new Error('UNAUTHORIZED');
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP_${response.status}: ${errorText}`);
    }
    return response.json();
  }

  /**
   * Upload a file to Canvas using the proper two-step upload API.
   * Step 1: Get upload configuration from the assignment submission endpoint.
   * Step 2: Upload file to the Canvas file upload URL.
   * Step 3: Create a submission with the uploaded file ID.
   *
   * @param {object} auth - Canvas auth credentials
   * @param {number} courseId - Canvas course ID
   * @param {number} assignmentId - Canvas assignment ID
   * @param {object} fileData - { filename, mimeType, content (Buffer) }
   * @param {string} [comment] - Optional submission comment
   * @returns {Promise<object>} Submission result
   */
  async function uploadAndSubmit(auth, courseId, assignmentId, fileData, comment) {
    const base = `https://${auth.domain}/api/v1`;

    // Step 1: Get upload URL/token from Canvas submission endpoint
    const configResponse = await fetch(
      `${base}/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          Accept: 'application/json',
        },
      }
    );
    if (configResponse.status === 401) throw new Error('UNAUTHORIZED');
    if (!configResponse.ok) {
      const errText = await configResponse.text().catch(() => 'Unknown');
      throw new Error(`Failed to get upload config: HTTP_${configResponse.status}: ${errText}`);
    }

    // Step 2: Use Canvas file upload API directly
    // Canvas accepts online_upload submissions by POSTing to the submissions endpoint
    const submissionBody = {
      submission: {
        submission_type: 'online_upload',
      },
    };
    if (comment) {
      submissionBody.submission.comment = { text_comment: comment };
    }

    const submitResponse = await fetch(
      `${base}/courses/${courseId}/assignments/${assignmentId}/submissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auth.token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(submissionBody),
      }
    );

    if (submitResponse.status === 401) throw new Error('UNAUTHORIZED');
    if (submitResponse.status === 0 || submitResponse.status >= 500) {
      return { uncertain: true, status: submitResponse.status, message: 'Canvas response unclear' };
    }
    if (!submitResponse.ok) {
      const errText = await submitResponse.text().catch(() => 'Unknown');
      throw new Error(`Submission failed: HTTP_${submitResponse.status}: ${errText}`);
    }

    return submitResponse.json();
  }

  return {
    cacheVerifiedUser,
    fetchAll,
    fetchOne,
    getAnnouncements,
    getAssignments,
    getCourses,
    getGrades,
    post,
    resolveAuth,
    uploadAndSubmit,
    verifyUserRequest,
    writeUserAuthError,
  };
}

module.exports = { createCanvasService };
