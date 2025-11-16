const http = require('http');
const https = require('https');

const FIREBASE_URL = 'relay-eu-b9be5.europe-west1.firebasedatabase.app';
const FIREBASE_AUTH = 'QVtFVG4EWjMp4RJ52a8VPxwOJ20tuSYziWjTwhm2';

const server = http.createServer((req, res) => {
  console.log('Request:', req.url);
  
  if (req.url === '/test') {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Proxy server is running!');
    return;
  }
  
  const match = req.url.match(/^/relay/(.+)$/);
  if (!match) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  
  const deviceId = match[1];
  const path = `/devices/${deviceId}/relay.json?auth=${FIREBASE_AUTH}`;
  
  const options = {
    hostname: FIREBASE_URL,
    path: path,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  };
  
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const proxyReq = https.request(options, (proxyRes) => {
    proxyRes.on('data', (chunk) => {
      console.log('Firebase data:', chunk.toString());
      res.write(chunk);
    });
    
    proxyRes.on('end', () => {
      res.end();
    });
  });
  
  proxyReq.on('error', (err) => {
    console.error('Error:', err);
    res.end();
  });
  
  proxyReq.end();
});

const PORT = process.env.PORT || 80;
server.listen(PORT, () => {
  console.log(`HTTP proxy on port ${PORT}`);
});
