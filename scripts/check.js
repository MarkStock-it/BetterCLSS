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

const checkedScripts = [
  'server.js',
  'server/app.js',
  'server/config.js',
  'server/lib/http.js',
  'server/middleware/cors.js',
  'server/routes/api.js',
  'server/routes/assistant-route.js',
  'server/routes/canvas-routes.js',
  'server/routes/notification-routes.js',
  'server/routes/user-routes.js',
  'server/services/assistant-service.js',
  'server/services/canvas-service.js',
  'server/services/notification-service.js',
  'server/services/static-service.js',
  'user-auth.js',
  'user-storage.js',
  'canvas-api.js',
  'push-notifications.js',
  'service-worker.js',
  'desktop-app/state-and-shell.js',
  'desktop-app/assistant.js',
  'desktop-app/canvas-and-navigation.js',
  'desktop-app/coursework-views.js',
  'desktop-app/study-area.js',
  'desktop-app/bootstrap.js'
];
checkedScripts.forEach(checkScript);

const html = read('index.html');
const desktopSource = [
  'desktop-app/state-and-shell.js',
  'desktop-app/assistant.js',
  'desktop-app/canvas-and-navigation.js',
  'desktop-app/coursework-views.js',
  'desktop-app/study-area.js',
  'desktop-app/bootstrap.js'
].map(read).join('\n');
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
  desktopSource.includes("switchPage('dashboard');"),
  'Startup must explicitly open the dashboard'
);
assert(
  !desktopSource.includes('if (fromStartup) openTutorialModal();'),
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
  read('service-worker.js').includes("'./desktop-app/bootstrap.js?v=7'") &&
    read('service-worker.js').includes("'./styles/dashboard.css'"),
  'The offline cache must include the modular desktop scripts and imported styles'
);
assert(
  html.includes('desktop-app/state-and-shell.js?v=7') &&
    html.includes('desktop-app/bootstrap.js?v=7') &&
    read('styles.css').includes('@import "styles/dashboard.css";'),
  'The desktop entrypoint must load the modular application and stylesheet boundaries'
);
assert(
  desktopSource.includes("assignSort: 'smart'"),
  'Assignments must default to smart priority sorting'
);

const studentHubRedirect = read('StudentHub.html');
const studentHubSource = read('studenthub-app/src/StudentHubMobileDashboard.jsx');
const studentHubFiles = [
  'studenthub-app/src/StudentHubMobileDashboard.jsx',
  'studenthub-app/src/components/assistant/AssistantDrawer.jsx',
  'studenthub-app/src/components/calendar/CalendarView.jsx',
  'studenthub-app/src/components/cards/CardsStudySection.jsx',
  'studenthub-app/src/components/home/HomeOverview.jsx',
  'studenthub-app/src/components/navigation/SidebarDrawer.jsx',
  'studenthub-app/src/components/secondary/SecondaryView.jsx',
  'studenthub-app/src/components/study/StudyBlobTabs.jsx',
  'studenthub-app/src/components/study/StudySheet.jsx',
  'studenthub-app/src/components/study/StudyView.jsx',
  'studenthub-app/src/components/study/timer/GestureTimerRing.jsx',
  'studenthub-app/src/components/study/timer/TimerModeCarousel.jsx',
  'studenthub-app/src/components/study/timer/timer-config.js',
  'studenthub-app/src/components/tasks/TasksView.jsx',
  'studenthub-app/src/components/ui/Icons.jsx',
  'studenthub-app/src/components/ui/ViewControls.jsx',
  'studenthub-app/src/lib/dashboard-data.js'
];
const studentHubImplementation = studentHubFiles.map(read).join('\n');
const backendSource = checkedScripts
  .filter((file) => file === 'server.js' || file.startsWith('server/'))
  .map(read)
  .join('\n');
const packageConfig = JSON.parse(read('package.json'));
const pagesWorkflow = read('.github/workflows/deploy-pages.yml');
const manifest = JSON.parse(read('manifest.json'));
const studentHubManifest = JSON.parse(read('studenthub-app/public/manifest.json'));

assert(
  studentHubRedirect.includes('./studenthub/index.html'),
  'StudentHub.html must launch the React mobile dashboard'
);
assert(
  studentHubSource.includes("localStorage.setItem('bclss_connect_return', 'studenthub')") &&
    studentHubSource.includes('../index.html?connect=1&returnTo=studenthub#dashboard'),
  'StudentHub Canvas setup must preserve StudentHub as the post-authentication destination'
);
assert(
  studentHubImplementation.includes('const TASKS_PER_PAGE = 5;') &&
    studentHubImplementation.includes('className="task-pagination"') &&
    studentHubImplementation.includes('aria-label="Task pages"'),
  'StudentHub task management must show five assignments per page'
);
assert(
  desktopSource.includes("launchParams.get('returnTo') === 'studenthub'") &&
    desktopSource.includes("storedReturn === 'studenthub'") &&
    desktopSource.includes("localStorage.removeItem('bclss_connect_return')") &&
    desktopSource.includes('window.location.replace(returnUrl)'),
  'Canvas authentication must return mobile users to StudentHub across Safari tabs'
);
assert(
  studentHubImplementation.includes('handleEdgeMove') &&
    studentHubImplementation.includes('function ViewModeTabs') &&
    !studentHubImplementation.includes('BottomLaunchpad'),
  'StudentHub must use the swipe drawer and page-level controls without a floating launchpad'
);
assert(
  studentHubImplementation.includes("{ id: 'cards', label: 'Cards', icon: 'cards' }") &&
    studentHubImplementation.includes("{ id: 'cards', label: 'Cards', icon: 'cards', section: 'Main' }") &&
    studentHubImplementation.includes('function CardsStudySection') &&
    !studentHubImplementation.includes("{ value: 'focus', label: 'Focus' }") &&
    !studentHubImplementation.includes("{ value: 'database'") &&
    !studentHubImplementation.includes("{ value: 'algorithms'"),
  'StudentHub must expose Cards as a peer in the five-option Study Area picker'
);
assert(
  studentHubImplementation.includes('buildCourseDecks(assignments, savedDecks)') &&
    studentHubImplementation.includes('className="deck-selection-list"') &&
    studentHubImplementation.includes('const DECKS_PER_PAGE = 5;') &&
    studentHubImplementation.includes('aria-label="Deck pages"') &&
    studentHubImplementation.includes("activeTab !== 'cards' && <StudyBlobTabs") &&
    studentHubImplementation.includes("markCard('again')") &&
    studentHubImplementation.includes("markCard('got-it')") &&
    studentHubImplementation.includes('drag="x"') &&
    studentHubImplementation.includes('onDragEnd={(_, info) => {'),
  'StudentHub card review must use paginated coursework decks with accessible review actions and horizontal swiping'
);
assert(
  studentHubImplementation.includes('function CalendarView({ calendarView, onViewChange, assignments, savedEvents, onToggleDone })') &&
    studentHubImplementation.includes('className="calendar-task-dot"') &&
    studentHubImplementation.includes('className="calendar-task-count"') &&
    studentHubImplementation.includes('className="calendar-day-task-list"') &&
    studentHubImplementation.includes('Nothing due') &&
    studentHubImplementation.includes('onToggleDone={toggleAssignmentDone}'),
  'StudentHub calendar dates must expose unfinished-task indicators and inline completion controls'
);
assert(
  !studentHubImplementation.includes('function CanvasBanner') &&
    studentHubImplementation.includes('function AssistantDrawer') &&
    studentHubImplementation.includes("local.studyDecks = next") &&
    studentHubImplementation.includes('/api/assistant/chat'),
  'StudentHub must replace the dashboard Canvas banner with a backend-connected AI deck helper'
);
assert(
  backendSource.includes('<betterclss_action>') &&
    backendSource.includes("type: 'create_deck'") &&
    backendSource.includes("replace(/\\*\\*([^*]+)\\*\\*/g, '$1')") &&
    backendSource.includes('generativelanguage.googleapis.com') &&
    backendSource.includes("'x-goog-api-key': callerApiKey"),
  'The AI backend must support Gemini keys, validated deck actions, and normalized Markdown'
);
assert(
  !studentHubImplementation.includes('Course progress') &&
    !studentHubImplementation.includes('What-if scores') &&
    !studentHubImplementation.includes('All caught up') &&
    !studentHubImplementation.includes('Study workspace'),
  'StudentHub secondary pages must not render hard-coded demo cards'
);
assert(
  studentHubImplementation.includes("from 'motion/react'"),
  'StudentHub gestures must use Motion for React'
);
assert(
  studentHubImplementation.includes('function StudySheet') && studentHubImplementation.includes('timer-primary-control'),
  'The Study area must include bottom sheets and a focused timer workspace'
);
assert(
  studentHubImplementation.includes('bclss_study_durations') && studentHubImplementation.includes('STUDY_DURATION_PROFILES'),
  'Study duration profiles must be selectable and persisted'
);
assert(
  !studentHubImplementation.includes('type="range"'),
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
  manifest.start_url === './studenthub/index.html' &&
    manifest.icons.every((icon) => icon.type === 'image/png') &&
    studentHubManifest.start_url === './index.html',
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
  pagesWorkflow.includes('cp -R desktop-app icons studenthub styles _site/'),
  'GitHub Pages must publish the modular desktop app, styles, StudentHub, and icon directories'
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

console.log(`Checks passed: ${checkedScripts.length} JavaScript modules, ${inlineScripts.length} inline scripts, ${ids.length} unique HTML ids, React StudentHub build.`);
