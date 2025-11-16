const http = require('http');
const https = require('https');

const FIREBASE_URL = 'relay-eu-b9be5.europe-west1.firebasedatabase.app';
const FIREBASE_AUTH = 'QVtFVG4EWjMp4RJ52a8VPxwOJ20tuSYziWjTwhm2';

const server = http.createServer((req, res) => {
  console.log('Request:', req.method, req.url);
  
  // Test endpoint
  if (req.url === '/test' || req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Firebase Proxy Server Running! Use /relay/DEVICE_ID');
    return;
  }
  
  // Parse relay request - FIXED REGEX
  const match = req.url.match(/^/relay/([^/?]+)/);
  if (!match) {
    res.writeHead(404, {'Content-Type': 'text/plain'});
    res.end('Not found. Use /relay/DEVICE_ID');
    return;
  }
  
  const deviceId = match[1];
  const path = `/devices/${deviceId}/relay.json?auth=${FIREBASE_AUTH}`;
  
  console.log('Proxying to Firebase:', path);
  
  const options = {
    hostname: FIREBASE_URL,
    path: path,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  };
  
  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const proxyReq = https.request(options, (proxyRes) => {
    console.log('Firebase status:', proxyRes.statusCode);
    
    proxyRes.on('data', (chunk) => {
      console.log('Data:', chunk.toString().substring(0, 100));
      res.write(chunk);
    });
    
    proxyRes.on('end', () => {
      console.log('Firebase connection ended');
      res.end();
    });
    
    proxyRes.on('error', (err) => {
      console.error('Firebase response error:', err);
      res.end();
    });
  });
  
  proxyReq.on('error', (err) => {
    console.error('Proxy request error:', err);
    res.writeHead(500, {'Content-Type': 'text/plain'});
    res.end('Proxy error: ' + err.message);
  });
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Client disconnected');
    proxyReq.destroy();
  });
  
  proxyReq.end();
});

// Use Railway's PORT
const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ HTTP Proxy server running on port ${PORT}`);
  console.log(`Firebase: ${FIREBASE_URL}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

setInterval(() => {
  console.log('Server alive, memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB');
}, 60000);