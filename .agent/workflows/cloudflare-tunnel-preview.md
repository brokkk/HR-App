# HR App Preview via Cloudflare Tunnel + Supabase Magic Link

## 1. Install cloudflared

### Windows (PowerShell)
```powershell
# Option A: via npm (global)
npm install -g cloudflared

# Option B: via winget (recommended)
winget install Cloudflare.cloudflared

# Option C: direct download
# https://github.com/cloudflare/cloudflared/releases
# Download cloudflared-windows-amd64.exe → rename to cloudflared.exe → add to PATH
```

### macOS
```bash
brew install cloudflared
```

### Linux
```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/
```

---

## 2. Start Next.js Dev Server

```powershell
# Bind to all interfaces so tunnel can access
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Verify: http://localhost:3000 loads the app.

---

## 3. Start Cloudflare Tunnel

Open a **new terminal** (keep dev server running):

```powershell
cloudflared tunnel --url http://localhost:3000
```

### Find your public URL:
Look for output like:
```
+--------------------------------------------------------------------------------------------+
|  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable): |
|  https://random-words-here.trycloudflare.com                                               |
+--------------------------------------------------------------------------------------------+
```

**Copy** the `https://xxxxx.trycloudflare.com` URL.

> ⚠️ **Note**: This URL changes every time you run the tunnel!

---

## 4. Configure Supabase Redirect URLs

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Authentication** → **URL Configuration**
3. In **Redirect URLs**, add:
   ```
   https://xxxxx.trycloudflare.com/auth/callback
   ```
4. Keep existing localhost entry:
   ```
   http://localhost:3000/auth/callback
   ```
5. Click **Save**

> ⚠️ **Important**: Update the redirect URL every time you restart the tunnel (URL changes).

---

## 5. Test End-to-End

### Checklist:
- [ ] Open tunnel URL from office laptop: `https://xxxxx.trycloudflare.com`
- [ ] Click login, enter email
- [ ] Check inbox, click magic link
- [ ] Should redirect to `/home` after auth

### Troubleshooting:

| Issue | Solution |
|-------|----------|
| "Invalid redirect" after clicking link | Add tunnel URL to Supabase Redirect URLs |
| Stuck on /auth/callback | Check path is exactly `/auth/callback` |
| Not logged in after redirect | Browser privacy mode blocking cookies |
| Page not loading | Dev server not running or wrong port |
| 502 Bad Gateway | Dev server crashed, restart it |

---

## 6. (Optional) Stable URL with Named Tunnel

For permanent URL that doesn't change:

1. **Login to Cloudflare**: `cloudflared tunnel login`
2. **Create named tunnel**: `cloudflared tunnel create hr-app`
3. **Configure custom domain** in Cloudflare Dashboard → Zero Trust → Tunnels
4. **Add DNS CNAME** pointing to tunnel

Benefits:
- Stable URL: `https://hr-preview.yourdomain.com`
- No need to update Supabase redirect every run
- Can run as background service

---

## Quick Reference

```powershell
# Terminal 1: Dev server
cd "c:\Web and App\HR App"
npm run dev -- --hostname 0.0.0.0 --port 3000

# Terminal 2: Tunnel
cloudflared tunnel --url http://localhost:3000
```

Then update Supabase redirect URL with the tunnel URL.
