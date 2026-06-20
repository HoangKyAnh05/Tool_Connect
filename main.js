const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

const logPath = path.join(app.getPath('userData'), 'debug_tts_synthesis.log');
function logDebug(message) {
  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${message}\n`);
  } catch (err) {
    // ignore
  }
}

let clockSkewSeconds = 0;
const historyFilePath = path.join(app.getPath('userData'), 'saved_audios.json');
const savedProjectsDir = path.join(app.getPath('userData'), 'saved_projects');

// Ensure saved_projects directory exists
function ensureSavedProjectsDir() {
  if (!fs.existsSync(savedProjectsDir)) {
    fs.mkdirSync(savedProjectsDir, { recursive: true });
  }
}

function getSilenceMp3Buffer(durationMs) {
  // Generate proper MPEG Audio Layer 3 silence frames
  // MPEG1 Layer3, 128kbps, 44100Hz, stereo => frame size = 417 or 418 bytes
  // Each frame = ~26.12ms of audio
  // Frame header: FF FB 90 00 (MPEG1, Layer3, 128kbps, 44100Hz, stereo)
  const frameSize = 417;
  const frameDurationMs = 26.12;
  const numFrames = Math.max(1, Math.ceil(durationMs / frameDurationMs));
  
  const silentFrame = Buffer.alloc(frameSize, 0);
  // MPEG1 Audio frame header for 128kbps, 44100Hz, stereo, no padding
  silentFrame[0] = 0xFF;
  silentFrame[1] = 0xFB; // MPEG1, Layer3, no CRC
  silentFrame[2] = 0x90; // 128kbps, 44100Hz
  silentFrame[3] = 0x00; // stereo, no padding, no extension
  
  const buffers = [];
  for (let i = 0; i < numFrames; i++) {
    buffers.push(Buffer.from(silentFrame));
  }
  return Buffer.concat(buffers);
}

function runGoogleTts(text, voice) {
  return new Promise((resolve, reject) => {
    let lang = 'vi';
    if (voice && typeof voice === 'string') {
      const parts = voice.split('-');
      if (parts.length > 0) {
        lang = parts[0].toLowerCase();
      }
    }
    
    const maxLen = 180;
    const words = text.split(/\s+/);
    const chunks = [];
    let currentChunk = '';
    
    for (const word of words) {
      if ((currentChunk + ' ' + word).trim().length > maxLen) {
        chunks.push(currentChunk.trim());
        currentChunk = word;
      } else {
        currentChunk = (currentChunk + ' ' + word).trim();
      }
    }
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    const fetchChunk = (chunkText) => {
      return new Promise((resResolve, resReject) => {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=tw-ob&q=${encodeURIComponent(chunkText)}`;
        const req = https.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        }, (res) => {
          if (res.statusCode !== 200) {
            resReject(new Error(`Google Translate TTS trả về mã trạng thái ${res.statusCode}`));
            return;
          }
          const buffers = [];
          res.on('data', (chunk) => { buffers.push(chunk); });
          res.on('end', () => {
            resResolve(Buffer.concat(buffers));
          });
        });
        
        req.on('error', (err) => {
          resReject(err);
        });
      });
    };
    
    Promise.all(chunks.map(fetchChunk))
      .then((buffers) => {
        const finalBuffer = Buffer.concat(buffers);
        resolve(finalBuffer.toString('base64'));
      })
      .catch(reject);
  });
}

function getAudioHistory() {
  try {
    if (!fs.existsSync(historyFilePath)) {
      return [];
    }
    const content = fs.readFileSync(historyFilePath, 'utf-8');
    const list = JSON.parse(content);
    const existingList = list.filter(item => fs.existsSync(item.path));
    if (existingList.length !== list.length) {
      fs.writeFileSync(historyFilePath, JSON.stringify(existingList, null, 2), 'utf-8');
    }
    return existingList;
  } catch (e) {
    console.error("Error reading audio history:", e);
    return [];
  }
}

function addAudioHistory(name, filePath, sizeBytes) {
  try {
    const list = getAudioHistory();
    const filteredList = list.filter(item => item.path !== filePath);
    
    const newItem = {
      name,
      path: filePath,
      date: new Date().toLocaleString('vi-VN'),
      size: (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB'
    };
    
    filteredList.unshift(newItem);
    fs.writeFileSync(historyFilePath, JSON.stringify(filteredList, null, 2), 'utf-8');
    return filteredList;
  } catch (e) {
    console.error("Error adding to audio history:", e);
    return [];
  }
}

function deleteAudioHistory(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const list = getAudioHistory();
    const updated = list.filter(item => item.path !== filePath);
    fs.writeFileSync(historyFilePath, JSON.stringify(updated, null, 2), 'utf-8');
    return updated;
  } catch (e) {
    console.error("Error deleting audio history item:", e);
    return getAudioHistory();
  }
}

// Helper to generate the Sec-MS-GEC token
function generateSecMsGec() {
  const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  const adjustedTimeMs = Date.now() + (clockSkewSeconds * 1000);
  const nowSecs = BigInt(Math.floor(adjustedTimeMs / 1000));
  const roundedSecs = nowSecs - (nowSecs % 300n);
  const fileTimeTicks = (roundedSecs + 11644473600n) * 10000000n;
  const inputStr = fileTimeTicks.toString() + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash('sha256').update(inputStr).digest('hex').toUpperCase();
}

// Helper to create a masked text frame for WebSocket client
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

// Fetch list of Microsoft Edge TTS voices
function fetchEdgeVoices() {
  return new Promise((resolve, reject) => {
    const url = 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4';
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const voices = JSON.parse(data);
          resolve(voices);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

function chunkTextForEdgeTts(text, maxCharLen = 2500) {
  if (text.length <= maxCharLen) {
    return [text];
  }
  
  const sentences = text.match(/[^.!?\r\n]+(?:[.!?\r\n]+|$)|[\r\n]+/g) || [text];
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxCharLen) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
      
      while (currentChunk.length > maxCharLen) {
        const words = currentChunk.split(/\s+/);
        let part = '';
        let rest = [];
        for (let i = 0; i < words.length; i++) {
          if ((part + ' ' + words[i]).length <= maxCharLen) {
            part += (part ? ' ' : '') + words[i];
          } else {
            rest = words.slice(i);
            break;
          }
        }
        if (part) {
          chunks.push(part);
        }
        currentChunk = rest.join(' ');
      }
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function runEdgeTts(text, voice, rate, pitch, isRetry = false) {
  const chunks = chunkTextForEdgeTts(text, 2500);
  if (chunks.length === 1) {
    return runEdgeTtsSingle(chunks[0], voice, rate, pitch, isRetry);
  }
  
  logDebug(`runEdgeTts: splitting text of length ${text.length} into ${chunks.length} chunks for synthesis.`);
  return Promise.all(chunks.map(chunk => runEdgeTtsSingle(chunk, voice, rate, pitch, isRetry)))
    .then(buffersBase64 => {
      const buffers = buffersBase64.map(b => Buffer.from(b, 'base64'));
      const combinedBuffer = Buffer.concat(buffers);
      return combinedBuffer.toString('base64');
    });
}

// Edge TTS Single Chunk Synthesis Engine
function runEdgeTtsSingle(text, voice, rate, pitch, isRetry = false) {
  let finalVoice = voice;
  if (voice === 'vi-VN-AnNeural' || voice === 'vi-VN-An') {
    finalVoice = 'vi-VN-HoaiMyNeural';
  }
  logDebug(`runEdgeTts: starting synthesis. Voice: ${voice} (mapped to ${finalVoice}), Rate: ${rate}, Pitch: ${pitch}, text length: ${text.length}`);
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
      timeout: 10000 // 10 seconds timeout for handshake
    });
    
    let audioBuffers = [];
    let completed = false;
    let requestDestroyed = false;

    req.on('timeout', () => {
      requestDestroyed = true;
      req.destroy();
      reject(new Error("Kết nối tới máy chủ Edge TTS bị quá thời gian (Timeout 10s)."));
    });

    req.on('response', (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        if (res.statusCode === 403 && !isRetry) {
          const serverDateStr = res.headers['date'];
          if (serverDateStr) {
            const serverTimeMs = Date.parse(serverDateStr);
            if (!isNaN(serverTimeMs)) {
              const clientTimeMs = Date.now();
              clockSkewSeconds = Math.floor((serverTimeMs - clientTimeMs) / 1000);
              console.log(`Đã phát hiện lệch giờ máy tính. Đang tự động bù lệch ${clockSkewSeconds} giây và thử lại...`);
              runEdgeTtsSingle(text, voice, rate, pitch, true)
                .then(resolve)
                .catch(reject);
              return;
            }
          }
        }
        reject(new Error(`Máy chủ Edge trả về mã lỗi HTTP ${res.statusCode}: ${responseData}`));
      });
    });

    req.on('error', (err) => {
      if (requestDestroyed) return;
      reject(err);
    });

    req.on('upgrade', (res, socket, head) => {
      socket.setTimeout(15000); // 15 seconds socket inactivity timeout
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error("Hết thời gian phản hồi từ máy chủ (Socket Timeout 15s)."));
      });

      const timestamp = new Date().toString();
      const configMsg = `Path: speech.config\r\nContent-Type: application/json\r\nX-Timestamp: ${timestamp}\r\n\r\n{"context":{"system":{"name":"SpeechSDK","version":"1.30.0","build":"JavaScript","lang":"JavaScript"}}}`;
      
      // Edge TTS rate: supported range approx -50% to +200% (0.5x to 3.0x)
      // Format must be integer percentage: "+100%", "-50%"
      // Clamp rate to Edge TTS supported range
      const clampedRate = Math.max(0.25, Math.min(rate, 3.0));
      const ratePctValue = (clampedRate - 1.0) * 100;
      const ratePct = ratePctValue >= 0 
        ? `+${ratePctValue.toFixed(0)}%` 
        : `${ratePctValue.toFixed(0)}%`;
        
      // Edge TTS pitch: supported range approx -50Hz to +50Hz
      const clampedPitch = Math.max(0.5, Math.min(pitch, 2.0));
      const pitchHz = Math.round((clampedPitch - 1.0) * 50);
      const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;
      
      // Extract locale dynamically from the voice name to prevent language mismatch errors
      let voiceLocale = 'en-US';
      if (finalVoice) {
        const parts = finalVoice.split('-');
        if (parts.length >= 2) {
          voiceLocale = `${parts[0]}-${parts[1]}`;
        }
      }
      
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${voiceLocale}'><voice name='${finalVoice}'><prosody rate='${ratePct}' pitch='${pitchStr}'>${text}</prosody></voice></speak>`;
      const ssmlMsg = `Path: ssml\r\nContent-Type: application/ssml+xml\r\nX-RequestId: ${connectionId}\r\nX-Timestamp: ${timestamp}\r\n\r\n${ssml}`;
      
      logDebug(`runEdgeTts: sending SSML: ${ssml}`);
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
          logDebug(`runEdgeTts: WebSocket closed successfully. Received ${audioBuffers.length} chunks, total ${finalAudio.length} bytes.`);
          resolve(finalAudio.toString('base64'));
        } else {
          logDebug(`runEdgeTts: WebSocket closed prematurely. Completed: ${completed}, chunks: ${audioBuffers.length}`);
          reject(new Error("WebSocket closed prematurely without turn.end"));
        }
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });

    req.end();
  });
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 900,
    minHeight: 650,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f172a',
      symbolColor: '#6366f1',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  // IPC Handlers
  ipcMain.handle('get-edge-voices', async () => {
    try {
      const voices = await fetchEdgeVoices();
      return { success: true, voices };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('synthesize-edge-tts', async (event, { text, voice, rate, pitch, engine }) => {
    try {
      let audioData;
      if (engine === 'google') {
        audioData = await runGoogleTts(text, voice);
      } else {
        audioData = await runEdgeTts(text, voice, rate, pitch);
      }
      return { success: true, audioData };
    } catch (err) {
      console.error("Primary TTS engine failed, trying Google TTS fallback:", err.message);
      try {
        const audioData = await runGoogleTts(text, voice);
        return { success: true, audioData, fallbackUsed: true };
      } catch (fallbackErr) {
        return { success: false, error: err.message };
      }
    }
  });

  ipcMain.handle('export-timeline-mp3', async (event, { items, defaultVoiceMapping, ttsEngine }) => {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Xuất dự án ra file MP3',
        defaultPath: path.join(app.getPath('downloads'), 'speech_project.mp3'),
        filters: [{ name: 'Audio Files', extensions: ['mp3'] }]
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Cancelled by user' };
      }

      const buffers = [];
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type === 'pause') {
          const silenceBuffer = getSilenceMp3Buffer(item.duration);
          buffers.push(silenceBuffer);
        } else if (item.type === 'speech') {
          if (!item.text.trim()) continue;
          
          let voiceName = item.voiceName;
          if (!voiceName && item.lang) {
            voiceName = defaultVoiceMapping[item.lang];
          }
          
          let base64Audio;
          if (ttsEngine === 'google') {
            logDebug(`export-timeline-mp3: segment ${i+1}/${items.length} using Google TTS`);
            base64Audio = await runGoogleTts(item.text, voiceName);
          } else {
            try {
              logDebug(`export-timeline-mp3: segment ${i+1}/${items.length} requesting Edge TTS with speed ${item.rate || 1.0}`);
              base64Audio = await runEdgeTts(item.text, voiceName, item.rate || 1.0, item.pitch || 1.0);
              logDebug(`export-timeline-mp3: segment ${i+1} Edge TTS success. length: ${base64Audio.length}`);
            } catch (err) {
              logDebug(`export-timeline-mp3: segment ${i+1} Edge TTS failed: ${err.message}. Falling back to Google.`);
              base64Audio = await runGoogleTts(item.text, voiceName);
            }
          }
          
          buffers.push(Buffer.from(base64Audio, 'base64'));
        }
      }
      
      const combinedBuffer = Buffer.concat(buffers);
      fs.writeFileSync(filePath, combinedBuffer);
      
      const history = addAudioHistory(path.basename(filePath), filePath, combinedBuffer.length);
      
      return { success: true, filePath, history };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-audio-history', async () => {
    try {
      const history = getAudioHistory();
      return { success: true, history };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('delete-audio-file', async (event, filePath) => {
    try {
      const history = deleteAudioHistory(filePath);
      return { success: true, history };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('get-audio-base64', async (event, filePath) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error("File không tồn tại trên máy tính.");
      }
      const data = fs.readFileSync(filePath);
      return { success: true, base64: data.toString('base64') };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-folder-containing', async (event, filePath) => {
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('open-link', async (event, url) => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });



  // Save project as MP3 inside app data (internal library)
  ipcMain.handle('save-project-audio', async (event, { projectName, items, defaultVoiceMapping, ttsEngine: engine }) => {
    try {
      ensureSavedProjectsDir();
      
      const buffers = [];
      const totalItems = items.length;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        // Throttle progress updates to avoid saturating IPC channel
        if (i === 0 || i === totalItems - 1 || i % 10 === 0) {
          event.sender.send('save-project-progress', { current: i + 1, total: totalItems });
        }
        
        if (item.type === 'pause') {
          const silenceBuffer = getSilenceMp3Buffer(item.duration);
          buffers.push(silenceBuffer);
        } else if (item.type === 'speech') {
          if (!item.text.trim()) continue;
          
          let voiceName = item.voiceName;
          if (!voiceName && item.lang) {
            voiceName = defaultVoiceMapping[item.lang];
          }
          
          let base64Audio;
          if (engine === 'google') {
            logDebug(`save-project-audio: segment ${i+1}/${items.length} using Google TTS`);
            base64Audio = await runGoogleTts(item.text, voiceName);
          } else {
            try {
              logDebug(`save-project-audio: segment ${i+1}/${items.length} requesting Edge TTS with speed ${item.rate || 1.0}`);
              base64Audio = await runEdgeTts(item.text, voiceName, item.rate || 1.0, item.pitch || 1.0);
              logDebug(`save-project-audio: segment ${i+1} Edge TTS success. length: ${base64Audio.length}`);
            } catch (err) {
              logDebug(`save-project-audio: segment ${i+1} Edge TTS failed: ${err.message}. Falling back to Google.`);
              base64Audio = await runGoogleTts(item.text, voiceName);
            }
          }
          
          buffers.push(Buffer.from(base64Audio, 'base64'));
        }
      }
      
      const combinedBuffer = Buffer.concat(buffers);
      
      // Generate unique filename
      const timestamp = Date.now();
      const safeProjectName = (projectName || 'Dự án TTS').replace(/[^a-zA-Z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ\s_-]/gi, '').trim();
      const filename = `${safeProjectName}_${timestamp}.mp3`;
      const filePath = path.join(savedProjectsDir, filename);
      
      fs.writeFileSync(filePath, combinedBuffer);
      
      // Save metadata directly to audio history (Thư viện Audio đã lưu)
      const history = addAudioHistory(projectName || 'Dự án TTS', filePath, combinedBuffer.length);
      
      return { success: true, history, filePath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  const configFilePath = path.join(app.getPath('userData'), 'app_config.json');

  ipcMain.handle('get-config', () => {
    try {
      if (fs.existsSync(configFilePath)) {
        const data = fs.readFileSync(configFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (err) {
      console.error('Lỗi khi đọc file cấu hình:', err);
    }
    return {};
  });

  ipcMain.handle('save-config', (event, config) => {
    try {
      fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      console.error('Lỗi khi ghi file cấu hình:', err);
      return { success: false, error: err.message };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


