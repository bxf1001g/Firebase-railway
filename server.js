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

/**
 * Handle multiplexed SSE stream for a device
 * Streams 5 types of events:
 * 1. relay - All 16 relay states
 * 2. schedule - Schedule updates
 * 3. power - PZEM 3-phase power data
 * 4. auth_numbers - Authorized phone numbers for alerts
 * 5. enabled - Subscription status
 */
function handleMultiplexedStream(req, res, deviceId) {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  log(`🌐 Multiplexed stream requested by ${clientIp} for device: ${deviceId}`);
  log(`📋 Creating fresh Firebase connections at ${new Date().toISOString()}`);
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({type: 'connected', device: deviceId})}\n\n`);
  
  // Firebase paths for this device
  const paths = {
    relays: `/devices/${deviceId}/relays.json`,
    schedules: `/devices/${deviceId}/schedules.json`,
    power: `/devices/${deviceId}/power.json`,
    authorized_numbers: `/devices/${deviceId}/authorized_numbers.json`,
    enabled: `/devices/${deviceId}/enabled.json`
  };
  
  // Track active connections
  const connections = [];
  let isActive = true;
  
  /**
   * Create SSE connection to Firebase path
   */
  function createFirebaseStream(path, eventType) {
    log(`🔥 Connecting to ${eventType}: ${path}`);
    
    const options = {
      hostname: FIREBASE_URL,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    };
    
    const firebaseReq = https.get(options, (firebaseRes) => {
      if (firebaseRes.statusCode !== 200) {
        log(`❌ Firebase ${eventType} error: ${firebaseRes.statusCode}`);
        return;
      }
      
      log(`✅ Firebase ${eventType} connected`);
      
      let dataBuffer = '';
      
      firebaseRes.on('data', (chunk) => {
        if (!isActive) return;
        
        dataBuffer += chunk.toString();
        const lines = dataBuffer.split('\n');
        dataBuffer = lines.pop() || '';
        
        lines.forEach((line) => {
          if (!line.trim() || !line.startsWith('data:')) return;
          
          try {
            const jsonStr = line.substring(5).trim();
            if (!jsonStr || jsonStr === 'null') return;
            
            const firebaseData = JSON.parse(jsonStr);
            const data = firebaseData.data;
            
            if (data === null || data === undefined) return;
            
            // Format based on event type
            let multiplexedEvent;
            
            if (eventType === 'relays') {
              // Handle relay updates
              // Firebase structure: {relay_1: {state: true}, relay_2: {state: false}, ...}
              if (firebaseData.path === '/') {
                // Initial snapshot - send all relays
                log(`🔥 Firebase snapshot: ${JSON.stringify(data)}`);
                Object.keys(data).forEach((relayKey) => {
                  const match = relayKey.match(/relay_(\d+)/);
                  if (match && data[relayKey].state !== undefined) {
                    const relayNum = parseInt(match[1]);
                    multiplexedEvent = {
                      type: 'relay',
                      relay: relayNum,
                      state: data[relayKey].state
                    };
                    const eventStr = JSON.stringify(multiplexedEvent);
                    res.write(`data: ${eventStr}\n\n`);
                    log(`📤 Sent to ESP32: ${eventStr}`);
                  }
                });
              } else {
                // Individual relay update
                log(`🔥 Firebase update: path=${firebaseData.path}, state=${data}`);
                // Firebase sends paths like: /relay_1 or /relay_1/state
                const pathMatch = firebaseData.path.match(/^\/relay_(\d+)/);
                if (pathMatch) {
                  const relayNum = parseInt(pathMatch[1]);
                  // Extract actual state value
                  const relayState = (data && typeof data === 'object' && data.state !== undefined) 
                    ? data.state 
                    : data;
                  multiplexedEvent = {
                    type: 'relay',
                    relay: relayNum,
                    state: relayState
                  };
                  const eventStr = JSON.stringify(multiplexedEvent);
                  res.write(`data: ${eventStr}\n\n`);
                  log(`📤 Sent to ESP32: ${eventStr}`);
                }
              }
            } else if (eventType === 'schedules') {
              // Send full schedule data
              multiplexedEvent = {
                type: 'schedule',
                schedules: data
              };
              res.write(`data: ${JSON.stringify(multiplexedEvent)}\n\n`);
              log(`📅 Schedules updated`);
              
            } else if (eventType === 'power') {
              // Send power data for all phases
              multiplexedEvent = {
                type: 'power',
                power: data
              };
              res.write(`data: ${JSON.stringify(multiplexedEvent)}\n\n`);
              log(`⚡ Power data updated`);
              
            } else if (eventType === 'authorized_numbers') {
              // Send authorized numbers array
              const numbers = Array.isArray(data) ? data : [];
              multiplexedEvent = {
                type: 'auth_numbers',
                numbers: numbers
              };
              res.write(`data: ${JSON.stringify(multiplexedEvent)}\n\n`);
              log(`📞 Authorized numbers: ${numbers.length} entries`);
              
            } else if (eventType === 'enabled') {
              // Send subscription status
              multiplexedEvent = {
                type: 'enabled',
                enabled: data === true
              };
              res.write(`data: ${JSON.stringify(multiplexedEvent)}\n\n`);
              log(`🔓 Subscription enabled: ${data}`);
            }
            
          } catch (e) {
            if (DEBUG) {
              log(`⚠️  ${eventType} parse error: ${e.message}`);
            }
          }
        });
      });
      
      firebaseRes.on('end', () => {
        log(`🔌 Firebase ${eventType} ended`);
      });
      
      firebaseRes.on('error', (err) => {
        log(`❌ Firebase ${eventType} error: ${err.message}`);
      });
    });
    
    firebaseReq.on('error', (err) => {
      log(`❌ Firebase ${eventType} connection error: ${err.message}`);
    });
    
    connections.push(firebaseReq);
  }
  
  // Create streams for all 5 data types
  createFirebaseStream(paths.relays, 'relays');
  createFirebaseStream(paths.schedules, 'schedules');
  createFirebaseStream(paths.power, 'power');
  createFirebaseStream(paths.authorized_numbers, 'authorized_numbers');
  createFirebaseStream(paths.enabled, 'enabled');
  
  // Keep-alive ping every 10 seconds (Railway kills idle connections at ~30s)
  const keepAliveInterval = setInterval(() => {
    if (res.writable) {
      res.write(': keep-alive\n\n');
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 10000);
  
  // Handle client disconnect
  req.on('close', () => {
    log(`🔌 Client disconnected: ${deviceId}`);
    isActive = false;
    clearInterval(keepAliveInterval);
    connections.forEach(conn => conn.destroy());
  });
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
            `Firebase: ${FIREBASE_URL}\n\n` +
            `Endpoints:\n` +
            `  GET /device/{DEVICE_ID} - Multiplexed SSE stream (recommended)\n` +
            `    Streams: relays (x16), schedules, power, auth_numbers, enabled\n\n` +
            `  GET /relay/{DEVICE_ID}/{RELAY_NUM} - Single relay stream (legacy)\n\n` +
            `Examples:\n` +
            `  GET /device/dev_abc123xyz\n` +
            `  GET /relay/dev_abc123xyz/1\n` +
            `\n` +
            `Note: Device IDs are generated via the relay_admin panel\n`);
    log(`✅ Health check OK`);
    return;
  }
  
  // Parse URL - supporting two endpoints:
  // 1. /device/{DEVICE_ID} - Multiplexed stream (relays, schedules, power, auth_numbers, enabled)
  // 2. /relay/{DEVICE_ID}/{RELAY_NUM} - Single relay stream (legacy)
  const urlParts = req.url.split('/').filter(Boolean);
  
  // Handle multiplexed endpoint
  if (urlParts[0] === 'device' && urlParts[1]) {
    handleMultiplexedStream(req, res, urlParts[1]);
    return;
  }
  
  // Handle single relay endpoint (legacy)
  if (urlParts[0] !== 'relay' || !urlParts[1]) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('❌ 404 Not Found\n' +
            'Usage:\n' +
            '  GET /device/{DEVICE_ID} - Multiplexed stream (recommended)\n' +
            '  GET /relay/{DEVICE_ID}/{RELAY_NUM} - Single relay stream\n' +
            'Examples:\n' +
            '  GET /device/dev_abc123xyz\n' +
            '  GET /relay/dev_abc123xyz/1\n' +
            '\n' +
            'Device IDs are created in the relay_admin panel\n');
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
  
  // Keep-alive ping every 10 seconds (Railway kills idle connections at ~30s)
  const keepAliveInterval = setInterval(() => {
    if (res.writable) {
      res.write(': keep-alive\n\n');
    } else {
      clearInterval(keepAliveInterval);
    }
  }, 10000);
  
  req.on('close', () => {
    clearInterval(keepAliveInterval);
  });
});

// Start server
server.listen(PORT, () => {
  log('========================================');
  log('🚀 Firebase Railway Proxy Server Started');
  log('   Multiplexed SSE Support v3.0');
  log('========================================');
  log(`📡 Port: ${PORT}`);
  log(`🔥 Firebase: ${FIREBASE_URL}`);
  log(`🌐 Endpoints:`);
  log(`   GET /test - Health check`);
  log(`   GET /device/{DEVICE_ID} - Multiplexed stream (NEW)`);
  log(`     • Streams: relays (x16), schedules, power, auth_numbers, enabled`);
  log(`   GET /relay/{DEVICE_ID}/{RELAY_NUM} - Single relay stream (legacy)`);
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
