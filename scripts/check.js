const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function checkScript(relativePath) {
  new vm.Script(read(relativePath), { filename: relativePath });
}

[
  'server.js',
  'user-auth.js',
  'user-storage.js',
  'canvas-api.js',
  'push-notifications.js',
  'service-worker.js'
].forEach(checkScript);

const html = read('index.html');
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((script) => script.trim());

inlineScripts.forEach((script, index) => {
  new vm.Script(script, { filename: `index.html:inline-${index + 1}` });
});

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
assert(duplicates.length === 0, `Duplicate HTML id(s): ${[...new Set(duplicates)].join(', ')}`);

[
  'page-dashboard',
  'dashboardGreeting',
  'dashboardDate',
  'connectBanner',
  'modalOverlay',
  'notificationEnableBtn',
  'mobileMoreTab',
  'badgePendingMobile',
  'assignResultCount',
  'assignSortSelect'
].forEach((id) => assert(ids.includes(id), `Missing required element #${id}`));

assert(
  [...html.matchAll(/data-study-panel="([^"]+)"/g)].length === 4,
  'The mobile Study workspace must expose four focused panels'
);

assert(
  html.includes("switchPage('dashboard');"),
  'Startup must explicitly open the dashboard'
);
assert(
  !html.includes('if (fromStartup) openTutorialModal();'),
  'Startup sync failures must not cover the dashboard with a modal'
);
assert(
  read('service-worker.js').includes("'./user-auth.js?v=6'"),
  'The offline cache must include user-auth.js'
);
assert(
  read('service-worker.js').includes("requestUrl.pathname.includes('/api/')"),
  'The service worker must bypass its cache for API requests'
);
assert(
  html.includes("assignSort: 'smart'"),
  'Assignments must default to smart priority sorting'
);

const studentHubRedirect = read('StudentHub.html');
const studentHubSource = read('studenthub-app/src/StudentHubMobileDashboard.jsx');
const packageConfig = JSON.parse(read('package.json'));
const pagesWorkflow = read('.github/workflows/deploy-pages.yml');
const manifest = JSON.parse(read('manifest.json'));
const studentHubManifest = JSON.parse(read('studenthub-app/public/manifest.json'));

assert(
  studentHubRedirect.includes('./studenthub/index.html'),
  'StudentHub.html must launch the React mobile dashboard'
);
assert(
  studentHubSource.includes('../index.html?connect=1&returnTo=studenthub#dashboard'),
  'StudentHub Canvas setup must preserve StudentHub as the post-authentication destination'
);
assert(
  studentHubSource.includes('const TASKS_PER_PAGE = 5;') &&
    studentHubSource.includes('className="task-pagination"') &&
    studentHubSource.includes('aria-label="Task pages"'),
  'StudentHub task management must show five assignments per page'
);
assert(
  html.includes("launchParams.get('returnTo') === 'studenthub'") &&
    html.includes('window.location.replace(returnUrl)'),
  'Canvas authentication must return mobile users to StudentHub'
);
assert(
  studentHubSource.includes('handleEdgeMove') &&
    studentHubSource.includes('function ViewModeTabs') &&
    !studentHubSource.includes('BottomLaunchpad'),
  'StudentHub must use the swipe drawer and page-level controls without a floating launchpad'
);
assert(
  studentHubSource.includes("from 'motion/react'"),
  'StudentHub gestures must use Motion for React'
);
assert(
  studentHubSource.includes('function StudySheet') && studentHubSource.includes('timer-primary-control'),
  'The Study area must include bottom sheets and a focused timer workspace'
);
assert(
  studentHubSource.includes('bclss_study_durations') && studentHubSource.includes('STUDY_DURATION_PROFILES'),
  'Study duration profiles must be selectable and persisted'
);
assert(
  !studentHubSource.includes('type="range"'),
  'The simplified Study settings must not expose multiple duration sliders'
);
assert(
  packageConfig.scripts['studenthub:build'],
  'package.json must expose the StudentHub production build'
);
assert(
  fs.existsSync(path.join(root, 'studenthub', 'index.html')),
  'The built StudentHub entrypoint is missing; run npm run studenthub:build'
);
assert(
  manifest.start_url === './StudentHub.html' &&
    manifest.icons.every((icon) => icon.type === 'image/png') &&
    studentHubManifest.start_url === '../StudentHub.html',
  'The PWA must launch StudentHub and use iOS-compatible PNG icons'
);
[
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
].forEach((iconPath) => {
  assert(fs.existsSync(path.join(root, iconPath)), `Missing PWA icon ${iconPath}`);
});
assert(
  pagesWorkflow.includes('npm run studenthub:build'),
  'GitHub Pages must build StudentHub before creating the deployment artifact'
);
assert(
  pagesWorkflow.includes('cp -R icons studenthub _site/'),
  'GitHub Pages must publish the compiled StudentHub and icon directories'
);
[
  'user-auth.js',
  'push-notifications.js',
  'service-worker.js',
  'manifest.json'
].forEach((asset) => {
  assert(
    pagesWorkflow.includes(asset),
    `GitHub Pages deployment is missing required static asset ${asset}`
  );
});

console.log(`Checks passed: 6 JavaScript files, ${inlineScripts.length} inline script, ${ids.length} unique HTML ids, React StudentHub build.`);
