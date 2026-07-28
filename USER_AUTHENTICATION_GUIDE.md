# BetterCLSS User Authentication & Data Persistence System

## Overview

This document explains how the new user authentication and data persistence system works. Users are now identified by their Canvas user ID, and all their BetterCLSS data (notes, tasks, assignments, settings) is automatically saved to the backend.

> Current behavior: disconnecting clears the browser credential and session but preserves the user's saved backend data. All user-data endpoints require Canvas credentials and verify that the Canvas account matches the requested user ID.

## Architecture

### User Identity Flow

```
1. User provides Canvas token
        ↓
2. Frontend sends token to POST /api/user/authenticate
        ↓
3. Backend verifies token with Canvas API
        ↓
4. Backend fetches Canvas user profile (including user ID)
        ↓
5. Backend creates/loads user record keyed by Canvas user ID
        ↓
6. Frontend receives userId and previously saved BetterCLSS data
        ↓
7. App UI loads with user's data and auto-syncs Canvas
```

### Data Flow Diagram

```
FRONTEND                          BACKEND                    CANVAS
=========                         =======                    ======

User input (token)
    |
    v
localStorage                      
    + (user-auth.js)
    |
    +-------> POST /api/user/authenticate -----> Verify token + Fetch profile
                                                          |
                                                          v
                                                    Create/Load user record
                                                    (in .betterclss_data/)
                                                          |
                                                          v
                    <------ Return userId + saved data -----
                     |
                     v
                  App.local = ...previous data
                  App.canvas = ...previous canvas sync
                     |
    +------------ Auto-sync Canvas -----------> GET /api/canvas/assignments
    |                                              GET /api/canvas/announcements
    |                                              GET /api/canvas/grades
    |                                                      |
    |                                          <----- Canvas API responses
    |                                                      |
    v                                                      v
App.canvas = [new assignments, announcements, grades]
    |
    v
User saves data (notes, tasks, etc.)
    |
    v
save() function
    |
    +---> localStorage.setItem('bclss_local')
    |
    +---> (async) POST /api/user/data/:userId -----> Update user record
                                                          |
                                                          v
                                                   File-based JSON storage
```

## Key Components

### 1. Backend: `user-storage.js`

Handles persistent user data storage using the file system.

**Data Structure:**
```javascript
{
  userId: 12345,                    // Canvas user ID (primary key)
  name: "John Doe",                 // User's full name from Canvas
  email: "john@example.com",        // User's email from Canvas
  createdAt: "2026-05-18T...",      // Account creation timestamp
  lastSyncAt: "2026-05-18T...",     // Last backend sync time
  
  local: {                          // All BetterCLSS user data
    assignments: [...],
    grades: [...],
    notes: [...],
    studyTasks: [...],
    studySettings: {...},
    // ... all other user preferences and data
  },
  
  canvas: {                         // Latest Canvas sync results
    assignments: [...],
    announcements: [...],
    grades: [...],
    courses: [...]
  },
  
  ui: {                             // UI state (theme, colors, etc.)
    theme: 'dark',
    accentColor: '#6080ff'
  }
}
```

**Storage Location:**
- Files are stored in `.betterclss_data/` directory
- One file per user: `user_<CANVAS_USER_ID>.json`
- Example: `.betterclss_data/user_12345.json`

**Functions:**
- `loadOrCreateUser(canvasUserId, canvasProfile)` - Create new or load existing user
- `saveUserData(userId, userData)` - Save full user record
- `updateUserLocalData(userId, localData)` - Update just local data
- `updateUserCanvasData(userId, canvasData)` - Update Canvas sync results
- `deleteUserData(userId)` - Delete everything (on logout)
- `getUserLocalData(userId)` - Load local data only

### 2. Backend: `server.js` - User Endpoints

Added new endpoints to handle user authentication and data persistence.

#### POST /api/user/authenticate
**Purpose:** Authenticate user with Canvas token and return their profile

**Request:**
```
Headers:
  x-canvas-token: "user-canvas-token"
  x-canvas-domain: "usc.instructure.com"
```

**Response:**
```json
{
  "success": true,
  "userId": 12345,
  "name": "John Doe",
  "email": "john@example.com",
  "isNewUser": false,
  "localData": { /* all saved BetterCLSS data */ },
  "canvasData": { /* last Canvas sync */ }
}
```

#### GET /api/user/data/:userId
**Purpose:** Load user's saved data

**Response:**
```json
{
  "success": true,
  "localData": { /* BetterCLSS data */ },
  "canvasData": { /* Canvas sync */ },
  "uiData": { /* UI state */ }
}
```

#### POST /api/user/data/:userId
**Purpose:** Save user's local BetterCLSS data

**Request Body:**
```json
{
  "local": {
    "assignments": [...],
    "notes": [...],
    "studyTasks": [...],
    // ... all local app data
  },
  "ui": {
    "theme": "dark",
    "accentColor": "#6080ff"
  }
}
```

#### POST /api/user/sync/:userId
**Purpose:** Save Canvas sync results

**Request Body:**
```json
{
  "assignments": [...],
  "announcements": [...],
  "grades": [...],
  "courses": [...]
}
```

#### POST /api/user/logout/:userId
**Purpose:** End the authenticated session without deleting saved data

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

### 3. Frontend: `user-auth.js`

Client-side module that manages user authentication and API calls.

**Key Functions:**

```javascript
// Check if user is authenticated
UserAuth.isAuthenticated()  // returns boolean

// Get current authenticated user
UserAuth.getCurrentUser()   // returns { id, name, email, isNewUser }

// Authenticate with Canvas token
await UserAuth.authenticateUser(token, domain, apiBase)
// Returns: { success, userId, name, email, isNewUser, localData, canvasData }

// Save local BetterCLSS data
await UserAuth.saveUserData(userId, localData, apiBase)

// Save Canvas sync results
await UserAuth.saveCanvasSync(userId, canvasData, apiBase)

// End the session without deleting saved data
await UserAuth.logoutUser(userId, apiBase)

// Load user's data
await UserAuth.loadUserData(userId, apiBase)
```

### 4. Frontend: Updated `index.html`

Modified key functions to integrate with the user authentication system:

#### `connectCanvas()` - Updated
- Authenticates user via Canvas token
- Calls `UserAuth.authenticateUser()` to verify token and load user data
- Auto-syncs Canvas after successful connection
- User's previous data is restored from backend

#### `disconnectCanvas()` - Updated
- Clears local Canvas credentials and the in-memory session
- Preserves backend data for a future reconnect

#### `syncCanvas()` - Updated
- After syncing Canvas data, calls `UserAuth.saveCanvasSync()`
- Persists assignments, announcements, grades to user's backend record

#### `save()` - Enhanced
- Always saves to localStorage
- Also saves to backend asynchronously if user is authenticated
- Non-blocking - continues even if backend save fails

## Data Synchronization

### What Gets Saved

**Always Saved:**
- All assignment data (local + Canvas)
- All notes
- All study tasks and history
- Study settings
- Custom grades log
- Events
- Announcements
- Quick links
- Pomodoro progress
- Theme preferences

**Synced from Canvas:**
- Active course assignments
- Assignment submissions status
- Grades
- Announcements
- Course list

### Sync Strategy

1. **On Login:** Frontend loads user's previous data from backend
2. **On Sync Click:** Frontend fetches fresh data from Canvas and saves to backend
3. **On Any Change:** Enhanced `save()` function persists to both localStorage AND backend
4. **On Disconnect:** Browser credentials are cleared and backend data is preserved

## User Experience

### New User Flow

1. User visits app for first time (no Canvas connection)
2. Clicks "Connect Canvas"
3. Enters Canvas token
4. Frontend authenticates with backend
5. Backend creates new user record
6. Frontend loads empty/default data
7. User clicks "Sync" to pull assignments from Canvas
8. All data automatically saved to backend
9. If user visits again from same account, all data is restored

### Returning User Flow

1. User visits app (has Canvas token from before)
2. Clicks "Connect Canvas"
3. Enters Canvas token
4. Frontend authenticates
5. Backend loads user's previous data
6. **All previously saved notes, tasks, and settings are restored!**
7. Can click "Sync" to update Canvas assignments
8. Continues from where they left off

### Logout Flow

1. User clicks "Disconnect Canvas"
2. Canvas token and the in-memory session are cleared
3. Backend data remains on disk
4. User can reconnect with the same Canvas account and restore saved data

## Important Implementation Details

### Canvas User ID as Primary Key

- User identification is based on **Canvas user ID**, not session tokens
- This means the same Canvas account will always have the same data
- User can access from multiple devices if they use the same Canvas account
- No account creation needed - automatic on first Canvas connection

### File-Based Storage

- User data stored in `.betterclss_data/` directory
- One JSON file per Canvas user
- Simple, reliable, no database required
- Works well for small to medium deployments
- For scaling: can replace with MongoDB, PostgreSQL, etc.

### Atomic Writes

- User data writes use temp files for atomicity
- Prevents corruption if server crashes during write
- Data integrity is maintained

### Error Handling

- Backend save failures are non-blocking
- If backend save fails, user data still exists locally
- User can continue working
- Data will sync next successful save attempt
- No data loss occurs

### Privacy & Security

- Each user's data is isolated (separate file)
- Canvas credentials are verified for authentication and user-data access
- Tokens not stored on backend (kept in browser only)
- Disconnect does not delete saved data
- HTTPS recommended for production

## Testing

### Manual Testing

1. **Test New User:**
   - Open app
   - Enter Canvas token
   - Click Sync
   - Add assignments, notes, tasks
   - Refresh page - data should load from backend
   - Add more data - should auto-save

2. **Test Returning User:**
   - Disconnect Canvas
   - Reconnect with same token
   - All previous data should load
   - Can continue from where you left off

3. **Test Logout:**
   - Disconnect Canvas
   - Check that `.betterclss_data/user_*.json` is preserved
   - Reconnect with same Canvas account
   - Previous data should be restored

### API Testing

```bash
# Test authentication
curl -X POST http://localhost:5500/api/user/authenticate \
  -H "x-canvas-token: your-token" \
  -H "x-canvas-domain: usc.instructure.com"

# Test save data
curl -X POST http://localhost:5500/api/user/data/12345 \
  -H "Content-Type: application/json" \
  -H "x-canvas-token: your-token" \
  -H "x-canvas-domain: usc.instructure.com" \
  -d '{"local": {"assignments": [...]}}'

# Test logout
curl -X POST http://localhost:5500/api/user/logout/12345 \
  -H "x-canvas-token: your-token" \
  -H "x-canvas-domain: usc.instructure.com"
```

## Deployment Notes

- `user-storage.js` is required in root directory
- `.betterclss_data/` directory will be created automatically
- No database configuration needed
- Add `.betterclss_data/` to `.gitignore` (user data, shouldn't be in git)
- Works with Render.com, Heroku, and other file-based deployments
- For stateless scaling, migrate to a database backend

## Future Enhancements

- **Database Persistence:** Replace file-based storage with MongoDB/PostgreSQL
- **Cloud Sync:** Enable cross-device sync
- **Data Backup:** Automatic backup of user data
- **Export/Import:** Allow users to export their data
- **Analytics:** Track usage patterns (if desired)
- **Offline Mode:** Progressive offline support
- **Password Accounts:** Alternative authentication method

## Code Comments

All new code includes detailed comments explaining:
- User identity flow
- Data save/load operations
- Logout procedures
- Backend API usage

Look for comments starting with `=====` for major sections.

## Summary

The new system provides:
- ✅ User identity based on Canvas user ID
- ✅ Automatic data persistence to backend
- ✅ One-click sync with Canvas
- ✅ Returning users' data restored automatically
- ✅ Complete logout with data deletion
- ✅ No database required (file-based)
- ✅ Non-blocking async saves
- ✅ Existing UI/architecture preserved
- ✅ Comprehensive comments for understanding
