# BetterCLSS User Authentication - Quick Start Guide

## What Changed?

Your BetterCLSS app now has a complete user authentication and data persistence system. Here's what's new:

### ✅ New Features

1. **Canvas User Identity** - Users identified by their Canvas ID
2. **Automatic Data Persistence** - All notes, tasks, grades, settings saved automatically
3. **One-Click Connection** - Connect Canvas, data loads automatically
4. **Returning User Support** - Come back anytime, your data is there
5. **Cross-Device Sync Ready** - Use same Canvas account on different devices
6. **Safe Disconnect** - Clear the device session without deleting saved user data

### 📁 New Files

```
/workspaces/BetterCLSS/
├── user-storage.js              ← Backend user data storage
├── user-auth.js                 ← Frontend authentication module
├── USER_AUTHENTICATION_GUIDE.md  ← Detailed technical documentation
└── .betterclss_data/            ← Auto-created, stores user JSON files
    └── user_12345.json          ← One file per Canvas user
```

### 🔄 Modified Files

```
server.js        ← Added 5 new API endpoints for user management
index.html       ← Updated connect/logout, added auto-save
```

## How It Works

### For Users

**First Time:**
1. Click "Connect Canvas"
2. Paste Canvas token
3. Click "Save & Test"
4. Data loads automatically
5. Click "Sync" to pull assignments
6. All changes auto-save

**Next Time:**
1. Click "Connect Canvas"
2. Paste **same** Canvas token
3. **All your previous data loads automatically!**
4. Continue where you left off

**Logout:**
1. Click "Disconnect Canvas"
2. The token and local authenticated session are cleared
3. Saved backend data remains available when the same Canvas account reconnects

### For Backend

**New API Endpoints:**

```
POST /api/user/authenticate      → Verify token, create/load user
GET  /api/user/data/:userId      → Load user's data
POST /api/user/data/:userId      → Save local app data
POST /api/user/sync/:userId      → Save Canvas sync results
POST /api/user/logout/:userId    → End the session without deleting saved data
```

**Data Storage:**

- Files saved in `.betterclss_data/` directory
- One JSON file per Canvas user
- Filename: `user_<CANVAS_USER_ID>.json`
- Includes all user settings, notes, tasks, Canvas data

## Testing Locally

### 1. Start Your Backend
```bash
npm start
# or
npm run dev
```

### 2. Test New User
- Open http://localhost:5500 (or your dev URL)
- Click "Connect Canvas"
- Enter your Canvas API token
- Click "Save & Test"
- App loads with empty data structure
- Click "Sync" to fetch assignments
- Add some notes/tasks
- Refresh page - data should persist!

### 3. Test Returning User
- Disconnect Canvas
- Reconnect with same Canvas token
- Your data should reload automatically
- Try adding more data

### 4. Verify Data Storage
```bash
# Check that user file was created
ls -la .betterclss_data/

# View a user's data (formatted)
cat .betterclss_data/user_12345.json | jq
```

### 5. Test Logout
- Disconnect Canvas
- Check that the user file is still present:
  ```bash
  ls -la .betterclss_data/
  ```
- Reconnect with same Canvas token
- Saved data should be restored

## API Examples

### Authenticate User
```bash
curl -X POST http://localhost:5500/api/user/authenticate \
  -H "x-canvas-token: your-canvas-token" \
  -H "x-canvas-domain: usc.instructure.com" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "userId": 12345,
  "name": "John Doe",
  "email": "john@example.com",
  "isNewUser": false,
  "localData": { /* user's saved data */ },
  "canvasData": { /* last sync */ }
}
```

### Save User Data
```bash
curl -X POST http://localhost:5500/api/user/data/12345 \
  -H "Content-Type: application/json" \
  -d '{
    "local": {
      "assignments": [...],
      "notes": [...],
      "studyTasks": [...]
    }
  }'
```

### Logout
```bash
curl -X POST http://localhost:5500/api/user/logout/12345 \
  -H "x-canvas-token: your-canvas-token" \
  -H "x-canvas-domain: usc.instructure.com"
```

## Code Overview

### user-auth.js (Frontend)
Handles all user authentication and API calls from the browser:
- `UserAuth.authenticateUser()` - Connect with Canvas token
- `UserAuth.saveUserData()` - Save notes/tasks/settings
- `UserAuth.saveCanvasSync()` - Save Canvas assignments
- `UserAuth.logoutUser()` - End the authenticated session
- `UserAuth.getCurrentUser()` - Get logged-in user info

### user-storage.js (Backend)
File-based user data storage on server:
- `loadOrCreateUser()` - Create or load user from disk
- `saveUserData()` - Write user data to JSON file
- `updateUserLocalData()` - Update just local data
- `updateUserCanvasData()` - Update just Canvas sync
- `deleteUserData()` - Administrative storage helper; not called by disconnect

### Updated Functions (index.html)
- `connectCanvas()` - Now uses UserAuth module
- `disconnectCanvas()` - Clears the device credential and in-memory session
- `syncCanvas()` - Now saves to backend after sync
- `save()` - Now also saves to backend automatically

## Key Design Decisions

### Why Canvas User ID?
- No account creation needed
- Canvas is source of truth for user identity
- Same account = same data across devices (future)
- Secure - Canvas already verifies tokens

### Why File-Based Storage?
- No database configuration needed
- Works on Render.com, Heroku, etc.
- Simple to understand and debug
- Can migrate to database later

### Why Non-Blocking Saves?
- User doesn't wait for backend
- Works offline (data saved locally)
- Better UX - no lag
- Robust - failures don't break the app

### Why Auto-Save?
- Users don't need to click save
- Data protected automatically
- Familiar pattern (like Google Docs)
- Less data loss

## Important Notes

⚠️ **Before Deploying:**

1. Add `.betterclss_data/` to `.gitignore`:
   ```
   .betterclss_data/
   .env
   node_modules/
   ```

2. For production, consider:
   - HTTPS for token security
   - Database backend (vs file-based)
   - User data backups
   - GDPR compliance if needed

ℹ️ **Data Integrity:**
- Writes use temp files (atomic writes)
- No data loss even if server crashes
- Each user isolated
- Can delete individual users

## Troubleshooting

### Canvas Connection Fails
- Check token is valid: `Canvas Settings → Account → Tokens`
- Verify Canvas domain is correct (e.g., `usc.instructure.com`)
- Ensure backend can reach Canvas API

### Data Not Saving
- Check `.betterclss_data/` directory exists
- Verify user file created: `ls -la .betterclss_data/user_*.json`
- Check backend logs for errors

### Data Not Loading on Return
- Make sure you're using the **same Canvas token**
- Different token = different Canvas user = new account
- Check user file hasn't been deleted

### Port Already in Use
```bash
# Find process on port 5500
lsof -i :5500

# Kill it
kill -9 <PID>
```

## Next Steps

1. **Test locally** - Follow testing guide above
2. **Review documentation** - Read `USER_AUTHENTICATION_GUIDE.md`
3. **Deploy** - Push to your hosting (Render, Heroku, etc.)
4. **Verify** - Test new user and returning user flows
5. **Monitor** - Check `.betterclss_data/` to see user files being created

## Need Help?

- Check `USER_AUTHENTICATION_GUIDE.md` for detailed docs
- Look for `// ===== USER IDENTITY FLOW =====` comments in code
- Check backend logs: `npm run dev` shows all API calls
- User data stored as JSON - easy to inspect and debug

## Summary

Your BetterCLSS app now has:
- ✅ Canvas-based user identity
- ✅ Automatic data backup to backend
- ✅ Returning user support
- ✅ One-click disconnect with data preservation
- ✅ Existing UI completely preserved
- ✅ No database required
- ✅ Ready for production

Start testing and let the auto-save handle the rest! 🎉
