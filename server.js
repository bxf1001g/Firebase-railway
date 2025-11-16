/**
 * Firebase Railway TCP Proxy
 * 
 * This proxy server converts HTTPS Firebase RTDB SSE streams to plain TCP
 * to bypass SSL/TLS handshake issues with Airtel M2M SIM cards.
 * 
 * Architecture:
 * ESP32 → Railway Proxy (TCP) → Firebase RTDB (HTTPS SSE)
 * 
 * Endpoints:
 * - GET /relay/{DEVICE_ID} - Stream relay state changes for a device
 * - GET /test - Health check endpoint
 * - GET / - Server info
 */

const http = require('http');
const https = require('https');

// Firebase RTDB Configuration
const FIREBASE_URL = 'relay-test1001-default-rtdb.asia-southeast1.firebasedatabase.app';

// Server Configuration
const PORT = process.env.PORT || 8080;
const DEBUG = process.env.DEBUG === 'true' || true;

// Logging helper
function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  log(`📥 Request from ${clientIp}: ${req.method} ${req.url}`);
  
  // Health check endpoint
  if (req.url === '/' || req.url === '/test') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('✅ Firebase Railway Proxy Running!\n' +
            `Server Time: ${new Date().toISOString()}\n` +
            `Firebase: ${FIREBASE_URL}\n` +
            `Usage: GET /relay/{DEVICE_ID}/{RELAY_NUM}\n` +
            `Example: GET /relay/dev_mhlj9n2msbwqu6bno/1\n`);
    log(`✅ Health check OK`);
    return;
  }
  
  // Parse URL - expecting /relay/{DEVICE_ID}
  const urlParts = req.url.split('/').filter(Boolean);
  
  if (urlParts[0] !== 'relay' || !urlParts[1]) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('❌ 404 Not Found\n' +
            'Usage: GET /relay/{DEVICE_ID}/{RELAY_NUM}\n' +
            'Example: GET /relay/dev_mhlj9n2msbwqu6bno/1\n' +
            'Relay numbers: 1, 2, 3, 4 (default: 1)\n');
    log(`❌ Invalid URL: ${req.url}`);
    return;
  }
  
  const deviceId = urlParts[1];
  
  // Get relay number from query param (default: relay_1)
  const relayNum = urlParts[2] || '1';
  
  // Firebase path for relay state
  // Structure: /devices/{DEVICE_ID}/relays/relay_X/state
  const firebasePath = `/devices/${deviceId}/relays/relay_${relayNum}/state.json`;
  
  log(`🔥 Proxying to Firebase: ${firebasePath}`);
  log(`   Device: ${deviceId}, Relay: ${relayNum}`);
  
  // First, fetch the current value (non-SSE)
  const currentValuePath = firebasePath;
  https.get({
    hostname: FIREBASE_URL,
    path: currentValuePath,
    method: 'GET'
  }, (currentRes) => {
    let currentData = '';
    currentRes.on('data', (chunk) => {
      currentData += chunk.toString();
    });
    currentRes.on('end', () => {
      // Send current value immediately
      try {
        const currentValue = JSON.parse(currentData);
        let initialState = null;
        
        if (typeof currentValue === 'boolean') {
          initialState = currentValue ? 'ON' : 'OFF';
        } else if (typeof currentValue === 'string') {
          initialState = currentValue.toUpperCase();
        }
        
        if (initialState) {
          log(`📤 Sending initial state: ${initialState}`);
          res.write(`data: ${initialState}\n\n`);
        }
      } catch (e) {
        log(`⚠️  Could not parse initial value: ${currentData}`);
      }
    });
  }).on('error', (err) => {
    log(`❌ Error fetching initial value: ${err.message}`);
  });
  
  // Set SSE headers for the client (ESP32)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial connection message
  res.write('data: {"status":"connected","device":"' + deviceId + '"}\n\n');
  
  // Connect to Firebase RTDB with SSE
  const options = {
    hostname: FIREBASE_URL,
    path: firebasePath,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  };
  
  log(`🚀 Connecting to Firebase...`);
  
  const firebaseReq = https.get(options, (firebaseRes) => {
    log(`✅ Firebase connected, status: ${firebaseRes.statusCode}`);
    
    if (firebaseRes.statusCode !== 200) {
      log(`❌ Firebase error: ${firebaseRes.statusCode}`);
      res.write(`data: {"error":"Firebase returned ${firebaseRes.statusCode}"}\n\n`);
      res.end();
      return;
    }
    
    // Track last state to avoid duplicate sends
    let lastState = null;
    let dataBuffer = '';
    
    // Forward Firebase SSE data to client
    firebaseRes.on('data', (chunk) => {
      const data = chunk.toString();
      dataBuffer += data;
      
      // Process complete lines
      const lines = dataBuffer.split('\n');
      dataBuffer = lines.pop() || ''; // Keep incomplete line in buffer
      
      lines.forEach((line) => {
        if (!line.trim()) {
          // Empty line - send to client
          res.write('\n');
          return;
        }
        
        if (DEBUG) {
          log(`📨 Firebase: ${line.substring(0, 100)}${line.length > 100 ? '...' : ''}`);
        }
        
        // Parse Firebase SSE format
        if (line.startsWith('event:')) {
          res.write(line + '\n');
        } else if (line.startsWith('data:')) {
          try {
            // Extract the JSON data
            const jsonStr = line.substring(5).trim();
            
            if (!jsonStr || jsonStr === 'null') {
              // Skip null/empty data
              return;
            }
            
            const firebaseData = JSON.parse(jsonStr);
            
            // Extract relay state
            let relayState = null;
            
            if (firebaseData.path === '/') {
              // Initial data or full update
              relayState = firebaseData.data;
            } else if (firebaseData.path === '' || firebaseData.path === undefined) {
              // Direct value update
              relayState = firebaseData.data || firebaseData;
            } else {
              // Nested path update
              relayState = firebaseData.data;
            }
            
            // Normalize state to "ON" or "OFF"
            if (typeof relayState === 'string') {
              relayState = relayState.toUpperCase();
            } else if (typeof relayState === 'boolean') {
              relayState = relayState ? 'ON' : 'OFF';
            } else if (typeof relayState === 'number') {
              relayState = relayState === 1 ? 'ON' : 'OFF';
            }
            
            // Only send if state changed
            if (relayState && (relayState === 'ON' || relayState === 'OFF') && relayState !== lastState) {
              lastState = relayState;
              
              // Send simplified format to ESP32
              const sseMessage = `data: ${relayState}\n\n`;
              res.write(sseMessage);
              
              log(`🔌 Relay state: ${relayState}`);
            }
            
          } catch (e) {
            // If not JSON, just forward as-is
            res.write(line + '\n');
            if (DEBUG) {
              log(`⚠️  JSON parse failed: ${e.message}`);
            }
          }
        } else {
          // Other SSE fields (keep-alive, etc)
          res.write(line + '\n');
        }
      });
    });
    
    firebaseRes.on('end', () => {
      log(`🔌 Firebase connection ended for ${deviceId}`);
      res.write('data: {"status":"disconnected"}\n\n');
      res.end();
    });
    
    firebaseRes.on('error', (err) => {
      log(`❌ Firebase stream error: ${err.message}`);
      res.write(`data: {"error":"${err.message}"}\n\n`);
      res.end();
    });
  });
  
  firebaseReq.on('error', (err) => {
    log(`❌ Firebase connection error: ${err.message}`);
    res.write(`data: {"error":"Connection failed: ${err.message}"}\n\n`);
    res.end();
  });
  
  // Handle client disconnect
  req.on('close', () => {
    log(`🔌 Client disconnected: ${deviceId}`);
    firebaseReq.destroy();
  });
  
  // Keep-alive ping every 30 seconds
  const keepAliveInterval = setInterval(() => {
    if (res.writable) {
      res.write(': keep-alive\n\n');
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 30000);
  
  req.on('close', () => {
    clearInterval(keepAliveInterval);
  });
});

// Start server
server.listen(PORT, () => {
  log('========================================');
  log('🚀 Firebase Railway Proxy Server Started');
  log('========================================');
  log(`📡 Port: ${PORT}`);
  log(`🔥 Firebase: ${FIREBASE_URL}`);
  log(`🌐 Endpoints:`);
  log(`   GET /test - Health check`);
  log(`   GET /relay/{DEVICE_ID} - Stream relay state`);
  log('========================================');
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  log('📴 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  log('📴 SIGINT received, shutting down gracefully...');
  server.close(() => {
    log('✅ Server closed');
    process.exit(0);
  });
});
