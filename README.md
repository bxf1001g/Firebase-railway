# 🚂 Firebase Railway TCP Proxy

TCP proxy server that converts HTTPS Firebase RTDB SSE streams to plain TCP, bypassing SSL/TLS handshake issues with Airtel M2M SIM cards.

## 🎯 Purpose

Airtel M2M SIM cards have SSL/TLS handshake issues with Firebase HTTPS endpoints. This proxy:
- Receives plain TCP connections from ESP32 (via EC200U modem)
- Connects to Firebase RTDB using HTTPS
- Streams data back over TCP using SSE format

## 🏗️ Architecture

```
ESP32 → EC200U 4G Modem → Railway Proxy (TCP) → Firebase RTDB (HTTPS)
```

## 📦 Deployment

### Deploy to Railway

1. **Push to GitHub:**
   ```bash
   cd railway-proxy
   git add .
   git commit -m "Update server.js for relay control"
   git push origin main
   ```

2. **Railway Auto-Deploy:**
   - Railway will automatically detect changes
   - Build and deploy within 1-2 minutes
   - Check logs in Railway dashboard

3. **Verify Deployment:**
   ```bash
   curl http://yamabiko.proxy.rlwy.net:45343/test
   ```

   Expected response:
   ```
   ✅ Firebase Railway Proxy Running!
   Server Time: 2025-11-16T...
   Firebase: relay-test1001-default-rtdb.asia-southeast1.firebasedatabase.app
   Usage: GET /relay/{DEVICE_ID}
   ```

## 🔌 API Endpoints

### Health Check
```
GET /test
GET /

Response: Server status and info
```

### Relay State Stream
```
GET /relay/{DEVICE_ID}

Response: SSE stream of relay state changes
Format: data: ON\n\n or data: OFF\n\n
```

## 🧪 Testing

### Test with curl
```bash
# Health check
curl http://yamabiko.proxy.rlwy.net:45343/test

# Stream relay state for device
curl http://yamabiko.proxy.rlwy.net:45343/relay/dev_mhlj9n2msbwqu6bno
```

### Test with ESP32
1. Flash `esp32-firmware/relay_control_railway_proxy.ino`
2. Open Serial Monitor (115200 baud)
3. Wait for connection confirmation
4. Change relay state in Firebase:
   - Path: `/devices/dev_mhlj9n2msbwqu6bno/relay`
   - Value: `"ON"` or `"OFF"`
5. ESP32 should respond within 1-2 seconds

## 📊 Firebase Structure

```json
{
  "devices": {
    "dev_mhlj9n2msbwqu6bno": {
      "relay": "OFF",
      "status": {
        "lastSeen": 1700000000000,
        "online": true
      }
    }
  }
}
```

## 🔧 Configuration

### Environment Variables (Railway)
- `PORT`: Server port (auto-set by Railway)
- `DEBUG`: Enable debug logging (default: true)

### Server Configuration (server.js)
- `FIREBASE_URL`: Firebase RTDB URL
- `TCP_HOST`: Railway proxy hostname
- `TCP_PORT`: Railway TCP port (45343)

## 📝 Logs

Railway automatically captures logs. To view:
1. Go to Railway dashboard
2. Select your project
3. Click on "Logs" tab
4. See real-time server logs

## 🐛 Troubleshooting

### Connection Issues

**Problem:** ESP32 can't connect to proxy

**Solutions:**
1. Check Railway proxy status (should show "Active")
2. Verify Railway TCP port is 45343
3. Check Airtel SIM has data connection
4. Try health check: `curl http://yamabiko.proxy.rlwy.net:45343/test`

### No Data Received

**Problem:** Connected but no relay state updates

**Solutions:**
1. Verify Firebase path: `/devices/{DEVICE_ID}/relay`
2. Check Firebase rules allow read access
3. Update relay value in Firebase console
4. Check Railway logs for errors

### Connection Drops

**Problem:** Connection drops after few minutes

**Solutions:**
1. Check keep-alive interval (default: 30s)
2. Verify modem doesn't timeout TCP connections
3. Check Railway server logs for disconnections

## 🚀 Next Steps

### Phase 1: Basic Relay Control ✅
- [x] Deploy Railway proxy
- [x] Test relay ON/OFF via SSE
- [x] Verify ESP32 connection

### Phase 2: Schedule Support 🔄
- [ ] Add schedule streaming endpoint
- [ ] Update ESP32 to handle schedules
- [ ] Test schedule execution

### Phase 3: Power Telemetry 📊
- [ ] Add bidirectional communication
- [ ] Stream power data to Firebase
- [ ] Display in Flutter app

## 📄 License

MIT

## 👥 Contributors

- Relay Control Team
