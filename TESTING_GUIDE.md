# 🧪 Railway Proxy - Testing Guide

## Quick Start Testing

### Step 1: Deploy to Railway (2 minutes)

**Option A: Using PowerShell Script (Recommended)**
```powershell
cd d:\Git\relay_control_app\railway-proxy
.\deploy.ps1
```

**Option B: Manual Git Push**
```bash
cd railway-proxy
git add .
git commit -m "Update server.js for relay control"
git push origin main
```

### Step 2: Verify Deployment (1 minute)

Wait for Railway to deploy (check dashboard), then test:

```bash
curl http://yamabiko.proxy.rlwy.net:45343/test
```

**Expected Output:**
```
✅ Firebase Railway Proxy Running!
Server Time: 2025-11-16T...
Firebase: relay-test1001-default-rtdb.asia-southeast1.firebasedatabase.app
Usage: GET /relay/{DEVICE_ID}
```

### Step 3: Test SSE Stream (1 minute)

Open terminal and run:
```bash
curl http://yamabiko.proxy.rlwy.net:45343/relay/dev_mhlj9n2msbwqu6bno
```

You should see:
```
data: {"status":"connected","device":"dev_mhlj9n2msbwqu6bno"}

: keep-alive

data: OFF
```

### Step 4: Test Relay Control (2 minutes)

**Keep the curl command running**, then in another window:

1. Go to Firebase Console: https://console.firebase.google.com/
2. Navigate to: Realtime Database → `relay-test1001`
3. Find path: `/devices/dev_mhlj9n2msbwqu6bno/relay`
4. Change value to: `"ON"`
5. Watch curl terminal - should show: `data: ON`
6. Change back to: `"OFF"`
7. Should show: `data: OFF`

---

## ESP32 Testing

### Step 1: Flash Firmware (5 minutes)

1. **Copy firmware to Arduino:**
   ```powershell
   cd d:\Git\relay_control_app
   .\copy_to_arduino.ps1
   ```

2. **Open Arduino IDE:**
   - File → Open → Select `relay_control_railway_proxy.ino`
   - Tools → Board → ESP32 Dev Module
   - Tools → Port → (Select your COM port)
   - Upload ⬆️

### Step 2: Monitor Serial Output (1 minute)

Open Serial Monitor (115200 baud), you should see:

```
========================================
  ESP32 FIREBASE RAILWAY PROXY
========================================

[1/5] Power cycling modem...
[2/5] Testing modem communication...
[3/5] Configuring network...
[4/5] Activating network...
[5/5] Checking IP address...

✅ Modem initialized!

========================================
  CONNECTING TO RAILWAY PROXY
========================================

[1/3] Closing old connections...
[2/3] Opening TCP connection...
✅ TCP Connected!
[3/3] Sending SSE request...

========================================
✅ CONNECTED! Listening for SSE...
========================================
```

### Step 3: Test Relay Control (2 minutes)

With Serial Monitor open:

1. Go to Firebase Console
2. Change `/devices/dev_mhlj9n2msbwqu6bno/relay` to `"ON"`
3. ESP32 Serial Monitor should show:
   ```
   📥 SSE Data: ON
   
   🔌 RELAY: ON ✅
   ```
4. Change to `"OFF"`
5. Should show:
   ```
   📥 SSE Data: OFF
   
   🔌 RELAY: OFF ❌
   ```

---

## Troubleshooting

### Issue: Curl shows connection refused

**Problem:** Railway proxy not running

**Solution:**
1. Check Railway dashboard for deployment status
2. View logs for errors
3. Verify Railway TCP port is 45343
4. Wait 1-2 minutes after push for deployment

### Issue: Curl connects but no data

**Problem:** Firebase path incorrect or no relay value

**Solution:**
1. Check Firebase path: `/devices/dev_mhlj9n2msbwqu6bno/relay`
2. Ensure relay value is `"ON"` or `"OFF"` (with quotes in Firebase)
3. Check Railway logs for Firebase connection errors

### Issue: ESP32 won't connect

**Problem:** Modem not configured or TCP connection fails

**Solution:**
1. Check modem power (LED blinking)
2. Verify SIM card has data
3. Check Serial Monitor for AT command responses
4. Test modem with: `AT+QIACT?` (should show IP address)
5. Verify Railway proxy is accessible from internet

### Issue: ESP32 connects but relay doesn't toggle

**Problem:** SSE parsing or relay control issue

**Solution:**
1. Check Serial Monitor for "📥 SSE Data:" messages
2. Verify GPIO 5 is connected to relay correctly
3. Test relay manually: `digitalWrite(5, HIGH);`
4. Check Firebase value format (should be string "ON" or "OFF")

---

## Performance Testing

### Latency Test

Measure time from Firebase write to ESP32 relay toggle:

1. Note time when changing Firebase value
2. Note time when ESP32 shows relay change
3. Calculate difference

**Expected:** < 2 seconds end-to-end

### Stability Test

Leave ESP32 running for 24 hours:

1. Check Serial Monitor for disconnections
2. Verify relay responds after long idle periods
3. Check Railway logs for errors
4. Monitor memory usage (ESP32 should not leak)

### Load Test

Test multiple devices:

1. Deploy to multiple ESP32s with different device IDs
2. Toggle all relays simultaneously
3. Verify no cross-device issues
4. Check Railway CPU/memory usage

---

## Success Criteria

✅ Railway proxy deploys successfully  
✅ Health check endpoint responds  
✅ curl can connect to SSE stream  
✅ Firebase changes trigger SSE events  
✅ ESP32 connects to proxy via TCP  
✅ ESP32 receives relay state changes  
✅ Physical relay toggles within 2 seconds  
✅ Connection stable for 24+ hours  
✅ No memory leaks on ESP32  
✅ Railway logs show no errors  

---

## Next Steps After Success

1. ✅ **Phase 1 Complete:** Basic relay control working
2. 🔄 **Phase 2:** Add schedule support
3. 📊 **Phase 3:** Add power telemetry
4. 📱 **Phase 4:** Update Flutter app to use proxy
5. 🚀 **Phase 5:** Production deployment

---

## Quick Reference

**Railway Proxy URL:** `yamabiko.proxy.rlwy.net:45343`

**Firebase Path:** `/devices/{DEVICE_ID}/relay`

**Device ID:** `dev_mhlj9n2msbwqu6bno`

**Test Commands:**
```bash
# Health check
curl http://yamabiko.proxy.rlwy.net:45343/test

# Stream relay state
curl http://yamabiko.proxy.rlwy.net:45343/relay/dev_mhlj9n2msbwqu6bno
```

**Firebase Console:** https://console.firebase.google.com/

**Railway Dashboard:** https://railway.app/dashboard
