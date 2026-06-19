const crypto = require('crypto');
const https = require('https');
const fs = require('fs');

let clockSkewSeconds = 0;

function generateSecMsGec() {
  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const adjustedTimeMs = Date.now() + (clockSkewSeconds * 1000);
  const nowSecs = BigInt(Math.floor(adjustedTimeMs / 1000));
  const roundedSecs = nowSecs - (nowSecs % 300n);
  const fileTimeTicks = (roundedSecs + 11644473600n) * 10000000n;
  const inputStr = fileTimeTicks.toString() + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash('sha256').update(inputStr).digest('hex').toUpperCase();
}

function createTextFrame(text) {
  const payload = Buffer.from(text, 'utf-8');
  const len = payload.length;
  let header;
  
  if (len < 126) {
    header = Buffer.alloc(2 + 4);
    header[0] = 0x81;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4 + 4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10 + 4);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  
  const maskKey = crypto.randomBytes(4);
  maskKey.copy(header, header.length - 4);
  
  const maskedPayload = Buffer.alloc(len);
  for (let i = 0; i < len; i++) {
    maskedPayload[i] = payload[i] ^ maskKey[i % 4];
  }
  
  return Buffer.concat([header, maskedPayload]);
}

function runEdgeTts(text, voice, ratePctString, pitchStr) {
  return new Promise((resolve, reject) => {
    const connectionId = crypto.randomBytes(16).toString('hex').toUpperCase();
    const gecToken = generateSecMsGec();
    const CHROMIUM_FULL_VERSION = '143.0.3650.75';
    const CHROMIUM_MAJOR_VERSION = '143';
    const gecVersion = `1-${CHROMIUM_FULL_VERSION}`;
    const muid = crypto.randomBytes(16).toString('hex').toUpperCase();

    const headers = {
      'Host': 'speech.platform.bing.com',
      'Connection': 'Upgrade',
      'Upgrade': 'websocket',
      'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
      'Sec-WebSocket-Version': '13',
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
      'Sec-MS-GEC': gecToken,
      'Sec-MS-GEC-Version': gecVersion,
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Cookie': `muid=${muid};`
    };

    const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}&Sec-MS-GEC=${gecToken}&Sec-MS-GEC-Version=${gecVersion}`;
    
    const req = https.request(url, {
      method: 'GET',
      headers: headers,
      timeout: 10000
    });
    
    let audioBuffers = [];
    let completed = false;
    let requestDestroyed = false;

    req.on('timeout', () => {
      requestDestroyed = true;
      req.destroy();
      reject(new Error("Timeout 10s"));
    });

    req.on('response', (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
      });
    });

    req.on('error', (err) => {
      if (requestDestroyed) return;
      reject(err);
    });

    req.on('upgrade', (res, socket, head) => {
      socket.setTimeout(15000);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error("Socket Timeout 15s"));
      });

      const timestamp = new Date().toString();
      const configMsg = `Path: speech.config\r\nContent-Type: application/json\r\nX-Timestamp: ${timestamp}\r\n\r\n{"context":{"system":{"name":"SpeechSDK","version":"1.30.0","build":"JavaScript","lang":"JavaScript"}}}`;
      
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody rate='${ratePctString}' pitch='${pitchStr}'>${text}</prosody></voice></speak>`;
      const ssmlMsg = `Path: ssml\r\nContent-Type: application/ssml+xml\r\nX-RequestId: ${connectionId}\r\nX-Timestamp: ${timestamp}\r\n\r\n${ssml}`;
      
      console.log(`Sending SSML for ${ratePctString}:`, ssml);

      socket.write(createTextFrame(configMsg));
      socket.write(createTextFrame(ssmlMsg));

      let wsBuffer = Buffer.alloc(0);

      socket.on('data', (chunk) => {
        wsBuffer = Buffer.concat([wsBuffer, chunk]);
        
        while (true) {
          if (wsBuffer.length < 2) break;
          const firstByte = wsBuffer[0];
          const secondByte = wsBuffer[1];
          const opcode = firstByte & 0x0F;
          const isMasked = (secondByte & 0x80) !== 0;
          let payloadLen = secondByte & 0x7F;
          let headerOffset = 2;
          
          if (payloadLen === 126) {
            if (wsBuffer.length < 4) break;
            payloadLen = wsBuffer.readUInt16BE(2);
            headerOffset = 4;
          } else if (payloadLen === 127) {
            if (wsBuffer.length < 10) break;
            payloadLen = Number(wsBuffer.readBigUInt64BE(2));
            headerOffset = 10;
          }
          
          if (isMasked) {
            headerOffset += 4;
          }
          
          if (wsBuffer.length < headerOffset + payloadLen) break;
          
          let payload = wsBuffer.subarray(headerOffset, headerOffset + payloadLen);
          wsBuffer = wsBuffer.subarray(headerOffset + payloadLen);
          
          if (isMasked) {
            const maskKey = wsBuffer.subarray(headerOffset - 4, headerOffset);
            const unmasked = Buffer.alloc(payloadLen);
            for (let i = 0; i < payloadLen; i++) {
              unmasked[i] = payload[i] ^ maskKey[i % 4];
            }
            payload = unmasked;
          }
          
          if (opcode === 1) {
            const textMsg = payload.toString('utf-8');
            if (textMsg.includes('Path: turn.end')) {
              completed = true;
              socket.end();
              break;
            }
          } else if (opcode === 2) {
            if (payload.length > 2) {
              const headerLen = payload.readUInt16BE(0);
              const audioChunk = payload.subarray(2 + headerLen);
              if (audioChunk.length > 0) {
                audioBuffers.push(audioChunk);
              }
            }
          } else if (opcode === 8) {
            socket.end();
            break;
          }
        }
      });

      socket.on('close', () => {
        if (completed && audioBuffers.length > 0) {
          const finalAudio = Buffer.concat(audioBuffers);
          resolve(finalAudio);
        } else {
          reject(new Error("WebSocket closed prematurely"));
        }
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });

    req.end();
  });
}

async function start() {
  const text = "Chào mừng bạn đến với ứng dụng đọc văn bản đa ngôn ngữ.";
  const voice = "vi-VN-HoaiMyNeural";
  
  try {
    console.log("Testing +100.00%...");
    const audio1 = await runEdgeTts(text, voice, "+100.00%", "+0Hz");
    console.log("Success +100.00%, size:", audio1.length);
  } catch (err) {
    console.error("Failed +100.00%:", err.message);
  }

  try {
    console.log("Testing +100%...");
    const audio2 = await runEdgeTts(text, voice, "+100%", "+0Hz");
    console.log("Success +100%, size:", audio2.length);
  } catch (err) {
    console.error("Failed +100%:", err.message);
  }
}

start();
