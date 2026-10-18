# Deploying DJJS Nurmahal on the office PC

This guide sets the app up on a Windows PC at the office so that:

- **staff in the office** open it over the office network, and
- **everyone else** (branch coordinators, phones on mobile data) opens it on the internet over HTTPS, through a **Cloudflare Tunnel**.

With the tunnel, the router needs no changes and the PC is never exposed to the internet directly. The database stays on this PC and is reachable only from the PC itself.

```
 Phones / branches ──HTTPS──► Cloudflare ──tunnel──► cloudflared ─┐
                                                                  ├─► DJJS-Nurmahal service (port 5000) ─► MongoDB (this PC only)
 Office computers ─────────────── http://10.40.40.63:5000 ────────┘
```

---

## 0. Before you start

| Need | Why |
|---|---|
| The PC stays **on 24/7**, ideally on a **UPS** | If the PC is off, nobody can use the app |
| **Wired** network connection | Wi-Fi drops make the app unreachable |
| A **fixed address** for the PC | Ask whoever manages the office router to *reserve* the PC's current IP (`10.40.40.63`) in DHCP, so the office address never changes |
| Node.js and MongoDB installed | Already done on this PC |

---

## 1. One-time setup (about 10 minutes)

Open **PowerShell as administrator** (Start → type *PowerShell* → right-click → *Run as administrator*), then run:

```powershell
cd "C:\Users\varinderpal\Downloads\visitor managment"
powershell -ExecutionPolicy Bypass -File deploy\setup.ps1
```

The script:

1. installs the tools it needs: NSSM (runs the app as a Windows service), MongoDB Database Tools (for backups) and cloudflared (for public access)
2. sets `server\.env` for production: a strong random secret, and no sample data loaded
3. builds the app
4. installs the **DJJS-Nurmahal** Windows service, which starts with Windows and restarts itself after a crash
5. opens port 5000 to the **office network only**
6. schedules a **daily database backup at 02:00** and takes the first one
7. stops the PC from sleeping while it's plugged in

When it finishes, it prints the office address, for example **http://10.40.40.63:5000**.

> If it warns that the network is marked **Public**, office devices can't connect yet. If this is the office network, run the command it shows (`Set-NetConnectionProfile … -NetworkCategory Private`).

**Tip:** for a permanent installation, copy the project to a fixed location such as `C:\DJJS-Nurmahal` first and run the setup from there. Keep it out of Downloads.

---

## 2. Secure the accounts (do this before going public)

1. Open the app and sign in as `admin` with the demo password. Because the server is now in production mode, it **makes you choose a new password** before you can continue. The same happens to every demo account.
2. In **Admin → Users**, create a real account for each person, with their own username and role. A password you set for someone is temporary: they must choose their own when they first sign in.
3. **Delete the demo accounts** you don't use (`manager`, `coord.ludhiana`, `reception`, …).
4. The database still contains the **sample data** from testing. When you're ready to start using real data, go to **Admin → Data → Delete everything (empty system)**, then add your real branches, departments and buildings. Download a JSON backup first if you want to keep anything.

Other protections already built in:
- After 8 wrong passwords for one username, sign-in from that address pauses for 15 minutes.
- Security headers block the app from being embedded in other sites.
- The server **refuses to start** in production with a weak secret, or if sample data could be loaded.

---

## 3. Office access

Staff in the office open **http://10.40.40.63:5000** in any browser.

On phones and tablets, use the **public HTTPS address** from step 4, even inside the office. Two features only work over HTTPS:
- the **live camera** for member photos (over plain http it falls back to the phone's camera app)
- **"Add to Home Screen"** to install it like an app

---

## 4. Public access through Cloudflare

### 4A. Try it now (temporary link, no domain needed)

```powershell
powershell -ExecutionPolicy Bypass -File deploy\public-test-link.ps1
```

This prints an address like `https://quiet-river-1234.trycloudflare.com` that opens from any phone, anywhere. The link **changes every time** and stops when you close the window, so use it only for testing and showing the app.

### 4B. Permanent address (needs a domain)

1. **Get a domain.** Two options:
   - **Recommended:** ask whoever manages **djjs.org** to create a subdomain such as **nurmahal.djjs.org**. It costs nothing and is clearly official. If djjs.org uses Cloudflare, they can create the tunnel hostname for you in step 3. Otherwise they add a CNAME record that Cloudflare gives you.
   - Or buy your own domain (about ₹700–1,000 per year), for example at Cloudflare Registrar, GoDaddy or Hostinger, and add it to a free Cloudflare account. Cloudflare will ask you to change the domain's *nameservers* at the registrar.
2. In the Cloudflare dashboard go to **Zero Trust → Networks → Tunnels → Create a tunnel** → choose **Cloudflared** → name it `djjs-nurmahal`. Pick **Windows** and **copy the token**: the long text after `cloudflared.exe service install`.
3. Under **Public hostname**, add:
   - Subdomain: `nurmahal` (or whatever you chose)
   - Domain: your domain
   - Service: **HTTP** and `localhost:5000`
4. On the office PC, in an administrator PowerShell, run:

   ```powershell
   powershell -ExecutionPolicy Bypass -File deploy\public-permanent.ps1 -Token <paste the token>
   ```

5. Open `https://nurmahal.<your-domain>` on a phone using mobile data. It should show the sign-in page with a padlock.

**Recommended extra lock (free for up to 50 users).** This app holds personal details: mobile numbers, addresses and photos. In Cloudflare **Zero Trust → Access → Applications**, add the hostname and allow only your staff's email addresses (one-time code by email). The public internet then can't even reach the sign-in page.

---

## 5. Day-to-day

| Task | How |
|---|---|
| Is it running? | `Get-Service DJJS-Nurmahal, cloudflared, MongoDB` |
| Restart the app | `Restart-Service DJJS-Nurmahal` (administrator) |
| See errors | `deploy\logs\server.log` |
| Backups | Every night into `deploy\backups` (last 30 days kept). **Copy this folder to a USB drive or Google Drive every week**: a backup on the same PC is lost if the disk fails. |
| Back up right now | `powershell -ExecutionPolicy Bypass -File deploy\backup.ps1` |
| Restore a backup | `powershell -ExecutionPolicy Bypass -File deploy\restore.ps1 -File deploy\backups\nurmahal-YYYY-MM-DD_0200.archive.gz` (takes a safety backup first, then asks you to type YES) |
| Install a new version | Copy the new project files over the old ones (keep `server\.env`), then run `powershell -ExecutionPolicy Bypass -File deploy\update.ps1`. It backs up, rebuilds and restarts. |

## 6. Troubleshooting

| Problem | Check |
|---|---|
| Office PCs can't open the address | The PC is on and the service is running. The network is *Private* (step 1 note). The IP hasn't changed (`ipconfig`). |
| Public address shows a Cloudflare error 1033 / 502 | The `cloudflared` service is running, and `http://localhost:5000` opens on the office PC itself. |
| "Too many failed sign-in attempts" | Wait 15 minutes, or have an admin reset the password in Admin → Users. |
| Forgot the admin password | Ask another Super Admin to set a temporary one in Admin → Users. |
| Service won't start | Read `deploy\logs\server.log`. "Refusing to start" means `server\.env` needs fixing (run `setup.ps1` again). |
