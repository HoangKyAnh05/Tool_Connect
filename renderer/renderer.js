// Global State
let voices = [];
let queue = [];
let currentQueueIndex = -1;
let isPlaying = false;
let isPaused = false;

// Timeline Pagination settings
const timelinePageSize = 50;
let timelineCurrentPage = 0;

// Audio player state variables
let activeUtterance = null;
let pauseTimer = null;
let pauseStartTimestamp = 0;
let pauseRemainingTime = 0;
let activeWords = [];
let currentAudioPlayer = null;
let playbackInterval = null;
let currentHistoryAudio = null;

// Selected default voices for each language code
const selectedLanguageVoices = {
  vi: 'vi-VN-HoaiMyNeural',
  en: 'en-US-EmmaNeural',
  ko: 'ko-KR-SunHiNeural'
};

// Language code display names
const langNames = {
  vi: 'Tiếng Việt',
  en: 'Tiếng Anh',
  ko: 'Tiếng Hàn'
};

// UI Elements
const txtInput = document.getElementById('text-input');
const btnClear = document.getElementById('btn-clear');
const btnTestData = document.getElementById('btn-test-data');
const btnParse = document.getElementById('btn-parse');
const charCount = document.getElementById('char-count');
const wordCount = document.getElementById('word-count');

const chkAutoDetect = document.getElementById('chk-auto-detect');
const defaultLangSelect = document.getElementById('default-lang');
const defaultLangContainer = document.getElementById('default-lang-container');
const globalPreset = document.getElementById('global-preset');

const globalRate = document.getElementById('global-rate');
const globalRateVal = document.getElementById('global-rate-val');
const globalPitch = document.getElementById('global-pitch');
const globalPitchVal = document.getElementById('global-pitch-val');
const commaPause = document.getElementById('comma-pause');
const commaPauseVal = document.getElementById('comma-pause-val');
const periodPause = document.getElementById('period-pause');
const periodPauseVal = document.getElementById('period-pause-val');

const voiceMappingList = document.getElementById('voice-mapping-list');
const timelineEmpty = document.getElementById('timeline-empty');
const timelineList = document.getElementById('timeline-list');
const queueStatusBadge = document.getElementById('queue-status-badge');
const timelineProgressText = document.getElementById('timeline-progress-text');
const timelineProgressBar = document.getElementById('timeline-progress-bar');

const btnSaveProject = document.getElementById('btn-save-project');

// Safe dummy activeWordDisplay for backward compatibility
const activeWordDisplay = {
  get innerHTML() { return ''; },
  set innerHTML(val) {}
};
const playerSeekbar = document.getElementById('player-seekbar');
const playerTimeDisplay = document.getElementById('player-time-display');

const btnPrev = document.getElementById('btn-prev');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnStop = document.getElementById('btn-stop');
const btnNext = document.getElementById('btn-next');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const playerVolume = document.getElementById('player-volume');
const playerVolumeVal = document.getElementById('player-volume-val');

// New Audio Export & History UI Elements
const ttsEngine = document.getElementById('tts-engine');
const btnExportMp3 = document.getElementById('btn-export-mp3');
const btnRefreshHistory = document.getElementById('btn-refresh-history');
const historyEmpty = document.getElementById('history-empty');
const historyList = document.getElementById('history-list');
const btnStripPunctuation = document.getElementById('btn-strip-punctuation');

// -------------------------------------------------------------
// Initialize App & Voice Loading
// -------------------------------------------------------------
async function init() {
  loadEdgeVoices();
  loadAudioHistory();

  // Load configuration from file
  await loadAppSettings();

  // Initialize Split options from appSettings
  const chkSplitLang = document.getElementById('chk-split-lang');
  const chkSplitNewline = document.getElementById('chk-split-newline');
  const chkSplitNumber = document.getElementById('chk-split-number');

  if (chkSplitLang) {
    chkSplitLang.checked = appSettings.split_lang !== false;
    chkSplitLang.addEventListener('change', async () => {
      await saveAppSettings('split_lang', chkSplitLang.checked);
    });
  }
  if (chkSplitNewline) {
    chkSplitNewline.checked = appSettings.split_newline !== false;
    chkSplitNewline.addEventListener('change', async () => {
      await saveAppSettings('split_newline', chkSplitNewline.checked);
    });
  }
  if (chkSplitNumber) {
    chkSplitNumber.checked = appSettings.split_number === true;
    chkSplitNumber.addEventListener('change', async () => {
      await saveAppSettings('split_number', chkSplitNumber.checked);
    });
  }

  // Initialize Google Drive settings from appSettings
  const chkGDriveEnable = document.getElementById('chk-gdrive-enable');
  const txtGDriveUrl = document.getElementById('gdrive-url');
  const selectGDriveFolder = document.getElementById('gdrive-folder-select');
  const txtGDriveFolderLink = document.getElementById('gdrive-folder-link');
  const btnSaveFolder = document.getElementById('btn-save-folder');
  const btnDeleteFolder = document.getElementById('btn-delete-folder');

  if (chkGDriveEnable) {
    chkGDriveEnable.checked = appSettings.gdrive_enable === true;
    chkGDriveEnable.addEventListener('change', async () => {
      await saveAppSettings('gdrive_enable', chkGDriveEnable.checked);
    });
  }
  if (txtGDriveUrl) {
    txtGDriveUrl.value = appSettings.gdrive_url || '';
    txtGDriveUrl.addEventListener('input', async () => {
      await saveAppSettings('gdrive_url', txtGDriveUrl.value.trim());
    });
  }

  const selectGDriveSaveSpeed = document.getElementById('gdrive-save-speed');
  if (selectGDriveSaveSpeed) {
    selectGDriveSaveSpeed.value = appSettings.gdrive_save_speed || 'timeline';
    selectGDriveSaveSpeed.addEventListener('change', async () => {
      await saveAppSettings('gdrive_save_speed', selectGDriveSaveSpeed.value);
    });
  }
  
  if (selectGDriveFolder) {
    populateGDriveFoldersSelect();
    
    const initialFolder = appSettings.gdrive_selected_folder || '';
    if (txtGDriveFolderLink) {
      txtGDriveFolderLink.value = initialFolder;
    }
    
    selectGDriveFolder.addEventListener('change', async () => {
      const val = selectGDriveFolder.value;
      await saveAppSettings('gdrive_selected_folder', val);
      if (txtGDriveFolderLink) {
        txtGDriveFolderLink.value = val;
      }
    });
  }

  if (btnSaveFolder) {
    btnSaveFolder.addEventListener('click', async () => {
      if (!txtGDriveFolderLink || !txtGDriveFolderLink.value.trim()) {
        alert("Vui lòng nhập hoặc dán liên kết thư mục Google Drive trước khi lưu.");
        return;
      }
      
      const link = txtGDriveFolderLink.value.trim();
      const name = await showPromptModal('Nhập tên hiển thị của thư mục (ví dụ: Thư mục Speaking):', '');
      if (!name) return;
      
      const folders = getGDriveFolders();
      const existingIdx = folders.findIndex(f => f.link === link);
      if (existingIdx >= 0) {
        folders[existingIdx].name = name;
      } else {
        folders.push({ name, link });
      }
      await saveGDriveFolders(folders);
      
      populateGDriveFoldersSelect(link);
      await saveAppSettings('gdrive_selected_folder', link);
      alert(`Đã lưu cấu hình thư mục "${name}" thành công!`);
    });
  }

  if (btnDeleteFolder) {
    btnDeleteFolder.addEventListener('click', async () => {
      if (!selectGDriveFolder || !selectGDriveFolder.value) {
        alert("Vui lòng chọn cấu hình thư mục tùy chỉnh muốn xóa.");
        return;
      }
      const val = selectGDriveFolder.value;
      const folders = getGDriveFolders();
      const filtered = folders.filter(f => f.link !== val);
      await saveGDriveFolders(filtered);
      
      populateGDriveFoldersSelect('');
      await saveAppSettings('gdrive_selected_folder', '');
      if (txtGDriveFolderLink) {
        txtGDriveFolderLink.value = '';
      }
      alert("Đã xóa cấu hình thư mục được chọn.");
    });
  }

  // Bind Events
  bindEvents();
  updateTextCounts();
  updateSlidersReadout();
  
  // Listen for save-project-progress events
  if (window.api.onSaveProjectProgress) {
    window.api.onSaveProjectProgress((data) => {
      const btn = document.getElementById('btn-save-project');
      if (btn && data.total > 0) {
        btn.innerHTML = `<span style="font-size: 11px;">Đang lưu... ${data.current}/${data.total}</span>`;
      }
    });
  }
}

async function loadEdgeVoices() {
  const result = await window.api.getEdgeVoices();
  if (result.success && result.voices) {
    voices = result.voices
      .filter(v => {
        const loc = v.Locale.toLowerCase();
        return loc.startsWith('vi') || loc.startsWith('en') || loc.startsWith('ko');
      })
      .map(v => ({
        name: v.ShortName,
        lang: v.Locale,
        friendlyName: v.FriendlyName,
        gender: v.Gender
      }));
    
    // Sort voices by name
    voices.sort((a, b) => a.name.localeCompare(b.name));
    
    renderVoiceMappingList();
    if (queue.length > 0) {
      renderTimeline();
    }
  } else {
    console.error("Lỗi tải giọng đọc Edge TTS:", result.error);
    voices = window.speechSynthesis.getVoices()
      .filter(v => {
        const l = v.lang.toLowerCase();
        return l.startsWith('vi') || l.startsWith('en') || l.startsWith('ko');
      })
      .map(v => ({
        name: v.name,
        lang: v.lang,
        friendlyName: v.name,
        gender: 'N/A'
      }));
    renderVoiceMappingList();
  }
}

// Bind UI Events
function bindEvents() {
  // Input text area
  txtInput.addEventListener('input', () => {
    updateTextCounts();
  });

  btnClear.addEventListener('click', () => {
    txtInput.value = '';
    updateTextCounts();
    txtInput.focus();
  });

  btnTestData.addEventListener('click', () => {
    txtInput.value = `Hello mọi người, chào mừng đến với ứng dụng Multi-Language TTS Director của chúng tôi. 
Hôm nay là ngày 19 tháng 6 năm 2026. Số tiền thanh toán là 1,250,000 VNĐ.

Bây giờ, [rate: 1.5] chúng ta sẽ tăng tốc độ đọc lên 1.5x để nghe nhanh hơn một chút, [pause: 1000] tiếp tục tạm dừng 1 giây. 
[rate: 1.0] [pitch: 1.4] Đọc với giọng cao hơn, [pitch: 0.8] đọc với giọng trầm hơn.

[pitch: 1.0] Tiếp theo là một số câu tiếng nước ngoài:
- Tiếng Nhật: [ja] こんにちは、お元気ですか？ (Xin chào, bạn khỏe không?)
- Tiếng Trung: [zh] 你好，很高兴认识你。 (Xin chào, rất vui được gặp bạn.)
- Tiếng Anh xen kẽ tiếng Việt không dấu: Hello cac ban, hom nay toi se demo tinh nang segment tu dong cua project nay.`;
    updateTextCounts();
    txtInput.focus();
  });

  if (btnStripPunctuation) {
    btnStripPunctuation.addEventListener('click', () => {
      const originalText = txtInput.value;
      if (!originalText.trim()) return;

      const tokens = originalText.split(/(\[[^\]]+\])/g);
      
      const processedTokens = tokens.map(token => {
        if (token.startsWith('[') && token.endsWith(']')) {
          return token;
        }
        
        let clean = token;
        // Strip half-width and full-width punctuation, and common Markdown/math symbols (like #, *, _, +, =, etc.)
        clean = clean.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'|、。！？：；（）【】“”‘’#*=+<>\@\[\]\{\}\\\^]/g, ' ');
        // Replace standalone hyphens/dashes with a space
        clean = clean.replace(/(?:\s|^)-+(?:\s|$)/g, ' ');
        // Collapse multiple spaces to a single space
        clean = clean.replace(/\s+/g, ' ');
        return clean;
      });
      
      txtInput.value = processedTokens.join('').trim();
      updateTextCounts();
      txtInput.focus();
    });
  }

  // Action buttons
  btnParse.addEventListener('click', handleParseText);

  // Global settings changes
  chkAutoDetect.addEventListener('change', () => {
    if (chkAutoDetect.checked) {
      defaultLangContainer.classList.add('hidden');
    } else {
      defaultLangContainer.classList.remove('hidden');
    }
  });

  // Toggle visible on load based on state
  if (chkAutoDetect.checked) {
    defaultLangContainer.classList.add('hidden');
  }

  // Global Preset
  globalPreset.addEventListener('change', handlePresetChange);

  // Sliders and Readouts
  globalRate.addEventListener('input', () => {
    const val = parseFloat(globalRate.value);
    globalRateVal.textContent = `${val}x`;
    updatePresetSpeedButtonsActive();
    if (currentAudioPlayer) {
      const synthesizedRate = parseFloat(currentAudioPlayer.dataset.synthesizedRate) || 1.0;
      currentAudioPlayer.playbackRate = val / synthesizedRate;
    }
    updateAllSegmentsRate(val);
  });

  globalPitch.addEventListener('input', () => {
    const val = parseFloat(globalPitch.value);
    globalPitchVal.textContent = globalPitch.value;
    updatePresetPitchButtonsActive();
    updateAllSegmentsPitch(val);
  });

  commaPause.addEventListener('input', () => {
    commaPauseVal.textContent = `${commaPause.value}ms`;
  });

  periodPause.addEventListener('input', () => {
    periodPauseVal.textContent = `${periodPause.value}ms`;
  });

  playerVolume.addEventListener('input', () => {
    const vol = parseFloat(playerVolume.value) || 1.0;
    playerVolumeVal.textContent = `${Math.round(vol * 100)}%`;
    if (currentAudioPlayer) currentAudioPlayer.volume = vol;
    if (currentHistoryAudio) currentHistoryAudio.volume = vol;
  });

  // Seekbar dragging to seek
  if (playerSeekbar) {
    playerSeekbar.addEventListener('input', () => {
      const activePlayer = currentAudioPlayer || currentHistoryAudio;
      if (activePlayer) {
        activePlayer.currentTime = parseFloat(playerSeekbar.value);
      }
    });
  }

  // Speed Presets
  document.querySelectorAll('.btn-preset-speed').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = parseFloat(e.target.getAttribute('data-val'));
      globalRate.value = val;
      globalRateVal.textContent = `${val}x`;
      updatePresetSpeedButtonsActive();
      if (currentAudioPlayer) {
        const synthesizedRate = parseFloat(currentAudioPlayer.dataset.synthesizedRate) || 1.0;
        currentAudioPlayer.playbackRate = val / synthesizedRate;
      }
      updateAllSegmentsRate(val);
    });
  });

  // Pitch Presets
  document.querySelectorAll('.btn-preset-pitch').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const val = parseFloat(e.target.getAttribute('data-val'));
      globalPitch.value = val;
      globalPitchVal.textContent = val;
      updatePresetPitchButtonsActive();
      updateAllSegmentsPitch(val);
    });
  });

  // Player controls
  btnPlayPause.addEventListener('click', handlePlayPause);
  btnStop.addEventListener('click', stopQueue);
  btnNext.addEventListener('click', nextSegment);
  btnPrev.addEventListener('click', prevSegment);

  // Project save/load
  btnSaveProject.addEventListener('click', handleSaveProject);

  // Export & History events
  btnExportMp3.addEventListener('click', handleExportMp3);
  btnRefreshHistory.addEventListener('click', loadAudioHistory);
}

function updateTextCounts() {
  const text = txtInput.value;
  charCount.textContent = text.length;
  
  // Count words
  const words = text.trim().match(/\S+/g);
  wordCount.textContent = words ? words.length : 0;
}

function updateSlidersReadout() {
  globalRateVal.textContent = `${globalRate.value}x`;
  globalPitchVal.textContent = globalPitch.value;
  commaPauseVal.textContent = `${commaPause.value}ms`;
  periodPauseVal.textContent = `${periodPause.value}ms`;
  playerVolumeVal.textContent = `${Math.round(playerVolume.value * 100)}%`;
}

function updatePresetSpeedButtonsActive() {
  const val = globalRate.value;
  document.querySelectorAll('.btn-preset-speed').forEach(btn => {
    if (btn.getAttribute('data-val') === val) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updatePresetPitchButtonsActive() {
  const val = globalPitch.value;
  document.querySelectorAll('.btn-preset-pitch').forEach(btn => {
    const isMatched = (val === '0.8' && btn.innerText === 'Trầm') || 
                      (val === '1.0' && btn.innerText === 'Chuẩn') || 
                      (val === '1.3' && btn.innerText === 'Cao');
    if (isMatched) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Handle global emotional voice preset changes
function handlePresetChange() {
  const preset = globalPreset.value;
  switch (preset) {
    case 'normal':
      globalRate.value = '1.0';
      globalPitch.value = '1.0';
      break;
    case 'excited': // Phấn khích: Nhanh hơn, Cao độ cao hơn
      globalRate.value = '1.25';
      globalPitch.value = '1.25';
      break;
    case 'sad': // U sầu: Chậm hơn, Cao độ trầm xuống
      globalRate.value = '0.75';
      globalPitch.value = '0.8';
      break;
    case 'serious': // Nghiêm túc: Vừa phải, Trầm hơn một chút
      globalRate.value = '0.95';
      globalPitch.value = '0.9';
      break;
    case 'whispering': // Thì thầm: Rất chậm, Cao độ hơi cao nhẹ
      globalRate.value = '0.85';
      globalPitch.value = '1.1';
      break;
    case 'robot': // Người máy: Đều đều, cao độ cực thấp
      globalRate.value = '1.0';
      globalPitch.value = '0.5';
      break;
  }
  updateSlidersReadout();
  updatePresetSpeedButtonsActive();
  updatePresetPitchButtonsActive();
}

// -------------------------------------------------------------
// Default Voice Mapping
// -------------------------------------------------------------
function renderVoiceMappingList() {
  voiceMappingList.innerHTML = '';
  
  Object.keys(langNames).forEach(langCode => {
    // Filter system voices for this language code
    const langVoices = voices.filter(v => v.lang.toLowerCase().startsWith(langCode));
    
    const row = document.createElement('div');
    row.className = 'voice-map-row';
    
    const badge = document.createElement('div');
    badge.className = 'lang-badge-lbl';
    badge.textContent = langCode;
    badge.title = langNames[langCode];
    row.appendChild(badge);
    
    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'select-wrapper';
    
    const select = document.createElement('select');
    select.id = `voice-select-${langCode}`;
    
    if (langVoices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = `Không tìm thấy giọng hệ thống (Sẽ dùng mặc định)`;
      select.appendChild(option);
      select.disabled = true;
    } else {
      // Find preferred voice
      const preferred = getPreferredVoice(langCode, langVoices);
      
      langVoices.forEach(v => {
        const option = document.createElement('option');
        option.value = v.name;
        option.textContent = `${v.name} (${v.lang})`;
        if (preferred && v.name === preferred.name) {
          option.selected = true;
          selectedLanguageVoices[langCode] = v.name;
        }
        select.appendChild(option);
      });
      
      select.addEventListener('change', (e) => {
        selectedLanguageVoices[langCode] = e.target.value;
        // Update all speech blocks matching this language in the timeline
        updateTimelineVoicesForLang(langCode, e.target.value);
        // Force timeline blocks to update their select option lists
        renderTimeline();
      });
    }
    
    selectWrapper.appendChild(select);
    row.appendChild(selectWrapper);
    voiceMappingList.appendChild(row);
  });
}

function getPreferredVoice(lang, voicesList) {
  // First, filter voices that match the requested language code
  const langVoices = voicesList.filter(v => v.lang.toLowerCase().startsWith(lang.toLowerCase()));
  
  if (langVoices.length === 0) {
    // Fallback to first available voice if no voice matches the language code
    return voicesList[0];
  }
  
  // Find natural/neural voices first within the language-filtered subset
  let voice = langVoices.find(v => v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('neural'));
  if (voice) return voice;
  
  // Specific fallbacks for Windows/macOS/Linux
  if (lang === 'vi') {
    // Vietnamese OneCore Nam/An on Windows
    voice = langVoices.find(v => v.name.toLowerCase().includes('nam') || v.name.toLowerCase().includes('an'));
    if (voice) return voice;
  }
  
  // Search for Google voices
  voice = langVoices.find(v => v.name.toLowerCase().includes('google'));
  if (voice) return voice;
  
  // Microsoft system voices
  voice = langVoices.find(v => v.name.toLowerCase().includes('microsoft'));
  if (voice) return voice;
  
  return langVoices[0];
}

function updateTimelineVoicesForLang(langCode, voiceName) {
  queue.forEach((segment, idx) => {
    if (segment.type === 'speech' && segment.lang === langCode) {
      if (segment.voiceName !== voiceName) {
        segment.voiceName = voiceName;
        segment.audioData = null; // Invalidate cache so new voice gets synthesized
        if (currentQueueIndex === idx) {
          stopQueue();
        }
      }
    }
  });
}

function updateAllSegmentsRate(val) {
  queue.forEach((segment, idx) => {
    if (segment.type === 'speech') {
      segment.rate = val;
      // Update individual block rate input and value label if rendered
      const blockRange = document.getElementById(`block-rate-range-${idx}`);
      const blockVal = document.getElementById(`block-rate-val-${idx}`);
      if (blockRange) {
        blockRange.value = val;
      }
      if (blockVal) {
        blockVal.textContent = `${val}x`;
      }
    }
  });
}

function updateAllSegmentsPitch(val) {
  queue.forEach((segment, idx) => {
    if (segment.type === 'speech') {
      segment.pitch = val;
      // Update individual block pitch input and value label if rendered
      const blockRange = document.getElementById(`block-pitch-range-${idx}`);
      const blockVal = document.getElementById(`block-pitch-val-${idx}`);
      if (blockRange) {
        blockRange.value = val;
      }
      if (blockVal) {
        blockVal.textContent = val;
      }
    }
  });
}

// -------------------------------------------------------------
// Text Parsing & Language Detection
// -------------------------------------------------------------
function handleParseText() {
  const text = txtInput.value.trim();
  if (!text) {
    alert("Vui lòng nhập văn bản trước khi phân tích!");
    return;
  }
  
  stopQueue();
  
  const chkSplitLang = document.getElementById('chk-split-lang');
  const chkSplitNewline = document.getElementById('chk-split-newline');
  const chkSplitNumber = document.getElementById('chk-split-number');
  
  const globalConfig = {
    autoDetect: chkAutoDetect.checked,
    defaultLang: defaultLangSelect.value,
    defaultRate: parseFloat(globalRate.value),
    defaultPitch: parseFloat(globalPitch.value),
    periodPause: parseInt(periodPause.value, 10),
    commaPause: parseInt(commaPause.value, 10),
    defaultEmotion: globalPreset.value,
    splitLang: chkSplitLang ? chkSplitLang.checked : true,
    splitNewline: chkSplitNewline ? chkSplitNewline.checked : true,
    splitNumber: chkSplitNumber ? chkSplitNumber.checked : false
  };
  
  queue = parseTextToQueue(text, globalConfig);
  
  if (queue.length > 0) {
    timelineCurrentPage = 0;
    timelineEmpty.classList.add('hidden');
    timelineList.classList.remove('hidden');
    renderTimeline();
    updateTimelineProgressUI();
  } else {
    timelineEmpty.classList.remove('hidden');
    timelineList.classList.add('hidden');
  }
}

// Common English words frequently mixed in Vietnamese that DO NOT overlap with common unaccented Vietnamese words
const commonEnglishWords = new Set([
  // Pronouns & Basic Determiners
  'i', 'me', 'my', 'myself', 'we', 'us', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves',
  'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves',
  'this', 'that', 'these', 'those', 'each', 'every', 'either', 'neither', 'some', 'any', 'no', 'none', 'all', 'both', 'half', 'either',
  
  // Articles & Prepositions & Conjunctions
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'so', 'yet', 'for', 'at', 'by', 'in', 'on', 'of', 'to', 'up', 'down', 'with', 'about',
  'against', 'between', 'during', 'before', 'after', 'above', 'below', 'from', 'into', 'through', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  
  // Verbs (Auxiliary, Modal & Common)
  'be', 'am', 'is', 'are', 'was', 'were', 'being', 'been', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
  'can', 'could', 'shall', 'should', 'will', 'would', 'may', 'might', 'must', 'ought',
  'say', 'says', 'said', 'go', 'goes', 'went', 'gone', 'come', 'came', 'get', 'gets', 'got', 'getting', 'make', 'makes', 'made', 'making',
  'take', 'takes', 'took', 'taken', 'taking', 'see', 'sees', 'saw', 'seen', 'seeing', 'look', 'looks', 'looked', 'looking',
  'think', 'thinks', 'thought', 'thinking', 'know', 'knows', 'knew', 'known', 'knowing', 'tell', 'tells', 'told', 'telling',
  'give', 'gives', 'gave', 'given', 'giving', 'find', 'finds', 'found', 'finding', 'work', 'works', 'worked', 'working',
  'ask', 'asks', 'asked', 'asking', 'let', 'lets', 'letting', 'help', 'helps', 'helped', 'helping',
  
  // Words from standard conversational scripts
  'speaking', 'part', 'cue', 'card', 'topic', 'describe', 'talk', 'about', 'funny', 'honest', 'depends', 'perfectly',
  'perspective', 'personally', 'convinced', 'concerned', 'seems', 'view', 'opinion', 'argue', 'inclined', 'believe', 'belief',
  'hello', 'hi', 'welcome', 'thanks', 'thank', 'please', 'sorry', 'yes', 'ok', 'okay', 'cool', 'great', 'goodbye', 'bye',
  
  // Technical Terms
  'api', 'app', 'application', 'code', 'coder', 'developer', 'design', 'web', 'website', 'link', 'url', 'click', 'double', 'shortcut', 'desktop',
  'terminal', 'console', 'electron', 'node', 'npm', 'run', 'start', 'test', 'debug', 'install', 'setup', 'config', 'configuration', 'save', 'load',
  'open', 'close', 'file', 'folder', 'directory', 'project', 'text', 'speech', 'audio', 'sound', 'voice', 'rate', 'pitch', 'volume', 'mp3', 'wav',
  'buffer', 'stream', 'server', 'client', 'database', 'db', 'query', 'data', 'json', 'xml', 'html', 'css', 'javascript', 'js', 'python', 'git', 'github',
  'select', 'option', 'checkbox', 'input', 'button', 'output', 'error', 'warning', 'success', 'info', 'trace', 'log', 'logger'
]);

// Common unaccented Vietnamese words to prevent false-positive English classification
const commonVietnameseUnaccentedWords = new Set([
  'chao', 'cac', 'ban', 'toi', 'la', 'va', 'cua', 'trong', 'de', 'co', 'khong', 'nhung', 'mot', 'hai', 'ba', 'bon', 'nam', 'sau',
  'bay', 'tam', 'chin', 'muoi', 'truoc', 'sau', 'ngoai', 'tren', 'duoi', 'nay', 'kia', 'do', 'gi', 'nao', 'sao', 'the', 'vi', 'nen',
  'lam', 'rat', 'qua', 'nhieu', 'it', 'dung', 'sai', 'nghe', 'noi', 'doc', 'viet', 'hoc', 'di', 've', 'ra', 'vao', 'xin', 'cam',
  'on', 'biet', 'hieu', 'tin', 'roi', 'chua', 'xong', 'het', 'con', 'van', 'lai', 'cu', 'moi', 'nhanh', 'cham', 'som', 'muon',
  'xa', 'gan', 'cao', 'thap', 'dai', 'ngan', 'to', 'nho', 'lon', 'be', 'hom', 'nay', 'qua', 'mai', 'tuan', 'thang', 'nam', 'gio',
  'phut', 'giay', 'ngay', 'dem', 'sang', 'trua', 'chieu', 'toi', 'nguoi', 'nha', 'truong', 'lop', 'anh', 'em', 'chi', 'ba', 'me',
  'cha', 'ong', 'con', 'chau', 'nuoc', 'dat', 'troi', 'gio', 'mua', 'nang', 'lanh', 'nong', 'am', 'mat', 'duong', 'pho', 'xe',
  'may', 'bay', 'tau', 'giup', 'duoc', 'muon', 'can', 'phai', 'nen', 'thich',

  // Common administrative, social, business terms (unaccented)
  'trieu', 'tram', 'nghin', 'ty', 'dong', 'quoc', 'gia', 'chinh', 'phu', 'xa', 'hoi', 'kinh', 'te', 'van', 'hoa', 'giao', 'duc', 'y', 'te', 'khoa', 'hoc', 'cong', 'nghe', 'phat', 'trien', 'san', 'xuat', 'kinh', 'doanh', 'dich', 'vu', 'khach', 'hang', 'thi', 'truong', 'san', 'pham', 'chat', 'luong', 'uy', 'tin', 'hieu', 'qua', 'thuc', 'te', 'phu', 'hop', 'dac', 'biet', 'quan', 'trong', 'yeu', 'cau', 'dieu', 'kien', 'quy', 'dinh', 'chinh', 'sach', 'he', 'thong', 'quy', 'trinh', 'huong', 'dan', 'su', 'dung', 'thong', 'tin', 'du', 'lieu', 'tai', 'khoan', 'mat', 'khau', 'dang', 'nhap', 'dang', 'ky', 'thanh', 'vien', 'lien', 'he', 'ho', 'tro', 'tu', 'van', 'thanh', 'toan', 'ngan', 'hang', 'the', 'tin', 'dung', 'mua', 'sam', 'giao', 'hang', 'tiet', 'kiem', 'mien', 'phi', 'khuyen', 'mai', 'giam', 'gia', 'tang', 'su', 'kien', 'tuc', 'binh', 'luan', 'danh', 'gia', 'theo', 'doi', 'kenh', 'hinh', 'am', 'thanh', 'nhac', 'phim', 'truyen', 'bao', 'tap', 'chi', 'thoi', 'su', 'the', 'thao', 'giai', 'tri', 'du', 'lich', 'am', 'thuc', 'nau', 'suc', 'khoe', 'lam', 'dep', 'thoi', 'trang', 'cua', 'doi', 'song', 'gia', 'dinh', 'cai', 'bo', 'ban', 'be', 'dong', 'nghiep', 'cong', 'ty', 'van', 'phong', 'viec', 'sinh', 'vien', 'diem', 'so', 'bang', 'cap', 'chung', 'chi', 'khoa', 'hoc', 'dai', 'hoc', 'vien', 'nghien', 'cuu', 'ung', 'dung', 'phan', 'mem', 'thiet', 'bi', 'dien', 'thoai', 'smart', 'phone', 'dong', 'ho', 'thong', 'minh', 'phu', 'kien', 'linh', 'kien', 'bao', 'hanh', 'sua', 'chua', 'lap', 'dat', 'nang', 'cap', 'thay', 'the', 'doi', 'tra', 'hoan', 'tien', 'khieu', 'nai', 'giai', 'quyet', 'tranh', 'chap'
]);

function isExclusivelyEnglishPattern(word) {
  const w = word.toLowerCase();
  // Consonant clusters at end: st, rt, ld, rd, nt, nd, ct, ft, lt, mp, nk, pt, rk, sk, sp, lly, ss, ff, ll, tt, pp, rr, bb, dd, gg, ck, sh
  if (/(st|rt|ld|rd|nt|nd|ct|ft|lt|mp|nk|pt|rk|sk|sp|lly|ss|ff|ll|tt|pp|rr|bb|dd|gg|ck|sh)$/.test(w)) return true;
  // Consonant clusters at start: str, spl, scr, pr, pl, cl, br, cr, dr, fr, gr, fl, gl, sh, wh, wr, kn, ps, gn
  if (/^(str|spl|scr|pr|pl|cl|br|cr|dr|fr|gr|fl|gl|sh|wh|wr|kn|ps|gn)/.test(w)) return true;
  // Double vowels or letters: ee, oo, ea, ou, nn, mm, cc
  if (/(ee|oo|ea|ou|nn|mm|cc)/.test(w)) return true;
  // Word length > 7
  if (w.length > 7) return true;
  return false;
}

function resolveWordLanguage(token) {
  const cleanWord = token.toLowerCase().replace(/[^a-zà-ỹđ]/g, '');
  if (!cleanWord) return 'neutral';

  // 1. If it has accents, it's 100% Vietnamese
  const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  if (viRegex.test(token)) {
    return 'vi';
  }

  // 2. Japanese, Korean, Chinese, Russian characters are 100% clear
  const jaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  const koRegex = /[\uAC00-\uD7AF]/;
  const zhRegex = /[\u4E00-\u9FFF]/;
  const ruRegex = /[\u0400-\u04FF]/;
  if (jaRegex.test(token)) return 'ja';
  if (koRegex.test(token)) return 'ko';
  if (zhRegex.test(token)) return 'zh';
  if (ruRegex.test(token)) return 'ru';

  // 3. Check for exclusively English patterns
  if (isExclusivelyEnglishPattern(cleanWord)) {
    return 'en';
  }

  // 4. Check lists
  const isEng = commonEnglishWords.has(cleanWord);
  const isVi = commonVietnameseUnaccentedWords.has(cleanWord);

  if (isEng && isVi) {
    // Ambiguous word (like "me", "an", "to", "no", "go", "so")
    return 'ambiguous';
  }
  if (isEng) return 'en';
  if (isVi) return 'vi';

  // 5. Fallback: if it's in neither, has no accents, and contains only a-z, it's English
  if (/^[a-z]+$/.test(cleanWord)) {
    return 'en';
  }

  return 'neutral';
}

function segmentMixedSentence(text, defaultLang) {
  // Split the sentence into words and spaces/punctuation
  const tokens = text.split(/(\s+|[,.!?;:"'()\[\]]+)/g).filter(t => t.length > 0);
  const classifiedTokens = [];
  
  tokens.forEach(token => {
    const isWord = /[a-zA-Zà-ỹĐđ\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF\u4E00-\u9FFF\u0400-\u04FF]/.test(token);
    if (!isWord) {
      classifiedTokens.push({ type: 'sep', text: token, lang: 'neutral' });
      return;
    }
    
    classifiedTokens.push({ type: 'word', text: token, lang: 'neutral' });
  });

  // 1. Resolve initial languages for all word tokens
  classifiedTokens.forEach(token => {
    if (token.type === 'word') {
      token.lang = resolveWordLanguage(token.text);
    }
  });

  // 2. Propagate context to 'neutral' and 'ambiguous' words
  for (let i = 0; i < classifiedTokens.length; i++) {
    if (classifiedTokens[i].type === 'word' && (classifiedTokens[i].lang === 'neutral' || classifiedTokens[i].lang === 'ambiguous')) {
      // Find closest clear language neighbor (left or right)
      let closestLang = null;
      let minDistance = Infinity;
      
      for (let j = 0; j < classifiedTokens.length; j++) {
        if (classifiedTokens[j].type === 'word' && classifiedTokens[j].lang !== 'neutral' && classifiedTokens[j].lang !== 'ambiguous') {
          const dist = Math.abs(i - j);
          if (dist < minDistance) {
            minDistance = dist;
            closestLang = classifiedTokens[j].lang;
          } else if (dist === minDistance) {
            // Tie breaker!
            // If the token is 'the', 'an', 'a', 'to', and the right neighbor (j > i) is English, prefer English!
            const w = classifiedTokens[i].text.toLowerCase();
            if (['the', 'an', 'a', 'to'].includes(w) && j > i && classifiedTokens[j].lang === 'en') {
              closestLang = 'en';
            }
          }
        }
      }
      
      // Fallback if no clear neighbor found in the entire line
      classifiedTokens[i].lang = closestLang || defaultLang;
    }
  }
  
  // Group tokens into segments of consecutive matching languages
  const segments = [];
  let currentLang = null;
  let currentText = '';
  
  classifiedTokens.forEach(token => {
    if (token.type === 'sep') {
      currentText += token.text;
      return;
    }
    
    if (currentLang === null) {
      currentLang = token.lang;
      currentText += token.text;
    } else if (token.lang === currentLang) {
      currentText += token.text;
    } else {
      if (currentText.trim()) {
        segments.push({ lang: currentLang, text: currentText });
      }
      currentLang = token.lang;
      currentText = token.text;
    }
  });
  
  if (currentText.trim()) {
    segments.push({ lang: currentLang, text: currentText });
  }
  
  return segments;
}

function parseTextToQueue(text, config) {
  if (!text || !text.trim()) return [];

  // Preprocess text to break lines before numbers (e.g. " 189 ", " 1. ", " 2) ") if enabled
  if (config.splitNumber) {
    const parts = text.split(/(\[[^\]]+\])/g);
    for (let i = 0; i < parts.length; i++) {
      if (!parts[i].startsWith('[') || !parts[i].endsWith(']')) {
        parts[i] = parts[i].replace(/(?:\s+|^)((?<![\.,\d])\b\d+(?:[\.\)]\s|\s+)(?!\d))/g, '\n$1');
      }
    }
    text = parts.join('');
  }

  const queue = [];
  
  // Default states
  let currentLang = config.defaultLang || 'vi';
  let currentRate = config.defaultRate || 1.0;
  let currentPitch = config.defaultPitch || 1.0;
  let currentEmotion = config.defaultEmotion || 'normal';
  
  if (config.autoDetect) {
    currentLang = detectLanguageOfText(text);
  }

  // Split by tags: [tag]
  const tokens = text.split(/(\[[^\]]+\])/g);
  
  let currentSpeechText = '';

  function flushSpeech() {
    if (currentSpeechText.trim()) {
      let lines = [currentSpeechText];
      
      // 1. Split by newline if enabled
      if (config.splitNewline) {
        lines = [];
        currentSpeechText.split(/\r?\n/).forEach(line => {
          if (line.trim()) {
            lines.push(line.trim());
          }
        });
      }
      
      // 2. Process each line
      lines.forEach(line => {
        if (!line.trim()) return;
        
        let segments = [];
        if (config.splitLang) {
          // Split line by language switches
          segments = segmentMixedSentence(line, currentLang);
        } else {
          // No language split, just treat the whole line as one segment
          let lineLang = currentLang;
          if (config.autoDetect) {
            lineLang = detectLanguageOfText(line);
          }
          segments = [{ lang: lineLang, text: line }];
        }
        
        // 3. Push segments to queue
        segments.forEach(seg => {
          if (!seg.text.trim()) return;
          
          const voiceName = selectedLanguageVoices[seg.lang] || '';
          queue.push({
            type: 'speech',
            text: seg.text.trim(),
            lang: seg.lang,
            rate: currentRate,
            pitch: currentPitch,
            emotion: currentEmotion,
            voiceName: voiceName
          });
        });
      });
      currentSpeechText = '';
    }
  }

  tokens.forEach((token, tokenIndex) => {
    if (token.startsWith('[') && token.endsWith(']')) {
      const tagContent = token.slice(1, -1).trim().toLowerCase();
      
      // Check for pause tag: [pause: 1000]
      if (tagContent.startsWith('pause:')) {
        const duration = parseInt(tagContent.split(':')[1], 10);
        if (!isNaN(duration) && duration > 0) {
          flushSpeech();
          queue.push({
            type: 'pause',
            duration: duration
          });
        }
      }
      // Check for rate tag: [rate: 1.5]
      else if (tagContent.startsWith('rate:')) {
        const val = parseFloat(tagContent.split(':')[1]);
        if (!isNaN(val) && val >= 0.5 && val <= 4.0) {
          flushSpeech();
          currentRate = val;
        }
      }
      // Check for pitch tag: [pitch: 1.2]
      else if (tagContent.startsWith('pitch:')) {
        const val = parseFloat(tagContent.split(':')[1]);
        if (!isNaN(val) && val >= 0.5 && val <= 2.0) {
          flushSpeech();
          currentPitch = val;
        }
      }
      // Check for emotion tag: [emotion: excited]
      else if (tagContent.startsWith('emotion:')) {
        const val = tagContent.split(':')[1].trim();
        if (val) {
          flushSpeech();
          currentEmotion = val;
        }
      }
      // Check for language tag: [vi], [en], [ko]
      else if (['vi', 'en', 'ko', 'ja', 'zh', 'ru', 'de', 'es', 'fr'].includes(tagContent)) {
        flushSpeech();
        currentLang = tagContent;
      }
    } else {
      // Plain text
      currentSpeechText += token;
    }
  });

  flushSpeech();
  return queue;
}

function detectLanguageOfText(text) {
  // Character frequency ranges to identify language code
  
  // 1. Vietnamese Tone Marks Regex (very distinctive!)
  const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  let viChars = 0;
  for (const c of text) {
    if (viRegex.test(c)) viChars++;
  }
  if (viChars > 0) return 'vi';
  
  // 2. Japanese Hiragana/Katakana
  const jaRegex = /[\u3040-\u309F\u30A0-\u30FF]/;
  if (jaRegex.test(text)) return 'ja';
  
  // 3. Korean Hangul
  const koRegex = /[\uAC00-\uD7AF]/;
  if (koRegex.test(text)) return 'ko';
  
  // 4. Chinese characters (Hanzi) - without Japanese kana
  const zhRegex = /[\u4E00-\u9FFF]/;
  if (zhRegex.test(text)) return 'zh';
  
  // 5. Russian Cyrillic characters
  const ruRegex = /[\u0400-\u04FF]/;
  if (ruRegex.test(text)) return 'ru';
  
  // 6. Romance accents
  // German umlauts
  if (/[äöüß]/i.test(text)) return 'de';
  // Spanish ñ, upside down signs
  if (/[ñ¿¡]/i.test(text)) return 'es';
  // French accents
  if (/[éèàùçœâêîôûëï]/i.test(text)) return 'fr';
  
  // Default fallback is English
  return 'en';
}

// -------------------------------------------------------------
// Timeline Rendering
// -------------------------------------------------------------
function renderTimeline() {
  timelineList.innerHTML = '';
  
  if (queue.length === 0) return;

  const totalPages = Math.ceil(queue.length / timelinePageSize);
  if (timelineCurrentPage >= totalPages) {
    timelineCurrentPage = Math.max(0, totalPages - 1);
  }

  const startIdx = timelineCurrentPage * timelinePageSize;
  const endIdx = Math.min(queue.length, (timelineCurrentPage + 1) * timelinePageSize);

  // Render paginated items
  for (let index = startIdx; index < endIdx; index++) {
    const item = queue[index];
    const block = document.createElement('div');
    block.className = `timeline-block ${item.type}-block`;
    block.id = `timeline-block-${index}`;
    
    // Maintain visual states (active/completed) during navigation
    if (index === currentQueueIndex) {
      block.classList.add('active-block');
    } else if (currentQueueIndex !== -1 && index < currentQueueIndex) {
      block.classList.add('completed-block');
    }

    if (item.type === 'pause') {
      renderPauseBlock(block, item, index);
    } else {
      renderSpeechBlock(block, item, index);
    }
    
    timelineList.appendChild(block);
  }

  // Add pagination control
  if (totalPages > 1) {
    const nav = document.createElement('div');
    nav.className = 'timeline-pagination-nav';
    nav.style.display = 'flex';
    nav.style.justifyContent = 'center';
    nav.style.alignItems = 'center';
    nav.style.gap = '15px';
    nav.style.padding = '15px 0';
    nav.style.marginTop = '15px';
    nav.style.borderTop = '1px solid var(--border-card)';
    
    const btnPrev = document.createElement('button');
    btnPrev.className = 'btn btn-secondary btn-sm';
    btnPrev.textContent = 'Trang trước';
    btnPrev.disabled = timelineCurrentPage === 0;
    btnPrev.style.minWidth = '100px';
    btnPrev.addEventListener('click', () => {
      timelineCurrentPage--;
      renderTimeline();
      timelineList.scrollTop = 0;
    });
    
    const info = document.createElement('span');
    info.style.fontSize = '13px';
    info.style.color = 'var(--text-secondary)';
    info.style.fontWeight = '600';
    info.textContent = `Trang ${timelineCurrentPage + 1} / ${totalPages}`;
    
    const btnNext = document.createElement('button');
    btnNext.className = 'btn btn-secondary btn-sm';
    btnNext.textContent = 'Trang sau';
    btnNext.disabled = timelineCurrentPage === totalPages - 1;
    btnNext.style.minWidth = '100px';
    btnNext.addEventListener('click', () => {
      timelineCurrentPage++;
      renderTimeline();
      timelineList.scrollTop = 0;
    });
    
    nav.appendChild(btnPrev);
    nav.appendChild(info);
    nav.appendChild(btnNext);
    timelineList.appendChild(nav);
  }
}

function renderPauseBlock(container, item, index) {
  container.innerHTML = `
    <div class="pause-block-content">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <span>Khoảng nghỉ:</span>
      <input type="number" id="pause-input-${index}" min="0" max="10000" step="100" value="${item.duration}">
      <span>ms (${(item.duration / 1000).toFixed(1)} giây)</span>
      <div class="block-actions">
        <button class="btn-icon delete-block-btn" data-index="${index}" title="Xóa đoạn nghỉ">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `;
  
  const pauseInput = container.querySelector(`input[type="number"]`);
  pauseInput.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 0) {
      item.duration = val;
      const label = container.querySelector('.pause-block-content span:last-of-type');
      label.textContent = `ms (${(val / 1000).toFixed(1)} giây)`;
    }
  });

  container.querySelector('.delete-block-btn').addEventListener('click', () => {
    deleteBlock(index);
  });
}

function getVoiceDisplayName(voiceName) {
  if (!voiceName) return 'Mặc định';
  const v = voices.find(val => val.name === voiceName);
  if (v) {
    const shortName = v.name.split('-').pop();
    const genderText = v.gender === 'Female' ? 'Nữ' : v.gender === 'Male' ? 'Nam' : 'N/A';
    return `${shortName} (${genderText})`;
  }
  return voiceName.split('-').pop() || voiceName;
}

function renderSpeechBlock(container, item, index) {
  // Ensure item.voiceName is populated if it's currently empty
  if (!item.voiceName) {
    item.voiceName = selectedLanguageVoices[item.lang] || (voices.length > 0 ? voices[0].name : '');
  }
  
  container.innerHTML = `
    <div class="block-header">
      <span class="block-index">#${index + 1}</span>
      <span class="block-badge-lang lang-${item.lang}">${langNames[item.lang] || item.lang}</span>
      
      <div class="block-voice-toggle-wrapper">
        <button class="block-voice-toggle-btn" id="block-voice-btn-${index}" title="Bấm để đổi nhanh giọng/ngôn ngữ">
          ${getVoiceDisplayName(item.voiceName)}
        </button>
      </div>
      
      <div class="block-actions">
        <button class="btn-icon play-block-btn" data-index="${index}" title="Phát từ câu này">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="btn-icon delete-block-btn" data-index="${index}" title="Xóa câu">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
    
    <div class="block-body">
      <div class="block-text" contenteditable="true" spellcheck="false" id="block-text-${index}">
        ${item.text}
      </div>
      
      <div class="block-sliders">
        <div class="block-slider-item">
          <label>Tốc độ:</label>
          <input type="range" id="block-rate-range-${index}" min="0.5" max="4.0" step="0.1" value="${item.rate}">
          <span class="block-slider-val" id="block-rate-val-${index}">${item.rate}x</span>
        </div>
        
        <div class="block-slider-item">
          <label>C.Độ:</label>
          <input type="range" id="block-pitch-range-${index}" min="0.5" max="2.0" step="0.1" value="${item.pitch}">
          <span class="block-slider-val" id="block-pitch-val-${index}">${item.pitch}</span>
        </div>

        <div class="block-slider-item">
          <label>C.Xúc:</label>
          <span style="font-size: 11px; text-transform: capitalize; color: var(--color-accent); font-weight: 500;">
            ${item.emotion}
          </span>
        </div>
      </div>
    </div>
  `;
  
  // Set voice listener (Toggle Button)
  const voiceBtn = container.querySelector(`#block-voice-btn-${index}`);
  voiceBtn.addEventListener('click', () => {
    const defaultVoiceNames = Object.values(selectedLanguageVoices).filter(Boolean);
    if (defaultVoiceNames.length === 0) return;
    
    let currentIdx = defaultVoiceNames.indexOf(item.voiceName);
    if (currentIdx === -1) {
      const matchingVoice = defaultVoiceNames.find(vName => {
        const v = voices.find(val => val.name === vName);
        return v && v.lang.split('-')[0].toLowerCase() === item.lang;
      });
      currentIdx = matchingVoice ? defaultVoiceNames.indexOf(matchingVoice) : 0;
    }
    
    const nextIdx = (currentIdx + 1) % defaultVoiceNames.length;
    const newVoiceName = defaultVoiceNames[nextIdx];
    
    if (item.voiceName !== newVoiceName) {
      item.voiceName = newVoiceName;
      item.audioData = null; // invalidate cache
      
      if (currentQueueIndex === index) {
        stopQueue();
      }

      voiceBtn.textContent = getVoiceDisplayName(newVoiceName);

      const selectedVoice = voices.find(v => v.name === newVoiceName);
      if (selectedVoice) {
        const newLang = selectedVoice.lang.split('-')[0].toLowerCase();
        if (item.lang !== newLang) {
          item.lang = newLang;
          
          const badge = container.querySelector('.block-badge-lang');
          if (badge) {
            badge.textContent = langNames[newLang] || newLang.toUpperCase();
            badge.className = `block-badge-lang lang-${newLang}`;
          }
        }
      }
    }
  });
  
  // Set editable text listener
  const textElem = container.querySelector(`#block-text-${index}`);
  textElem.addEventListener('blur', () => {
    const val = textElem.innerText.trim();
    if (item.text !== val) {
      item.text = val;
      item.audioData = null; // invalidate cache
      
      if (currentQueueIndex === index) {
        stopQueue();
      }
    }
  });
  
  // Set sliders listeners
  const rateRange = container.querySelector(`#block-rate-range-${index}`);
  const rateVal = container.querySelector(`#block-rate-val-${index}`);
  rateRange.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    item.rate = val;
    rateVal.textContent = `${val}x`;
    if (isPlaying && currentQueueIndex === index && currentAudioPlayer) {
      const synthesizedRate = parseFloat(currentAudioPlayer.dataset.synthesizedRate) || 1.0;
      currentAudioPlayer.playbackRate = val / synthesizedRate;
    }
  });
  
  const pitchRange = container.querySelector(`#block-pitch-range-${index}`);
  const pitchVal = container.querySelector(`#block-pitch-val-${index}`);
  pitchRange.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    if (item.pitch !== val) {
      item.pitch = val;
      item.audioData = null; // invalidate cache
      
      if (currentQueueIndex === index) {
        stopQueue();
      }
    }
    pitchVal.textContent = e.target.value;
  });

  // Action listeners
  container.querySelector('.play-block-btn').addEventListener('click', () => {
    playFromIndex(index);
  });
  
  container.querySelector('.delete-block-btn').addEventListener('click', () => {
    deleteBlock(index);
  });
}

function deleteBlock(index) {
  const wasActive = currentQueueIndex === index;
  queue.splice(index, 1);
  
  if (queue.length === 0) {
    stopQueue();
    timelineEmpty.classList.remove('hidden');
    timelineList.classList.add('hidden');
  } else {
    if (wasActive) {
      stopQueue();
    } else if (currentQueueIndex > index) {
      currentQueueIndex--;
    }
    renderTimeline();
    updateTimelineProgressUI();
  }
}

// -------------------------------------------------------------
// Playback Control Logic
// -------------------------------------------------------------
function handlePlayPause() {
  if (currentHistoryAudio) {
    const filePath = currentHistoryAudio.dataset.path;
    const playBtn = document.querySelector(`button[data-path="${filePath.replace(/\\/g, '\\\\')}"]`);
    if (!currentHistoryAudio.paused) {
      currentHistoryAudio.pause();
      if (playBtn) {
        playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        playBtn.title = 'Phát âm thanh';
      }
      updatePlayerStatusUI('paused');
    } else {
      currentHistoryAudio.play();
      if (playBtn) {
        playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        playBtn.title = 'Tạm dừng';
      }
      updatePlayerStatusUI('speaking');
    }
    return;
  }

  if (queue.length === 0) {
    alert("Chưa có timeline câu nói. Vui lòng bấm 'Phân tích & Tách câu' trước!");
    return;
  }

  if (isPlaying) {
    if (isPaused) {
      resumeQueue();
    } else {
      pauseQueue();
    }
  } else {
    playQueue();
  }
}

let isPreloading = false;

async function preloadQueueAudio() {
  if (isPreloading) return;
  isPreloading = true;
  
  // Find all speech blocks that don't have audioData cached
  const uncachedSegments = queue
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => item.type === 'speech' && !item.audioData);
    
  if (uncachedSegments.length === 0) {
    isPreloading = false;
    return;
  }

  const totalToCache = uncachedSegments.length;
  let cachedCount = 0;
  
  updatePlayerStatusUI('preloading');
  if (playerTimeDisplay) {
    playerTimeDisplay.textContent = `Đang kết nối & tải âm thanh (0/${totalToCache})...`;
  }
  
  // Concurrency limit of 5 parallel requests
  const limit = 5;
  let activeIndex = 0;
  
  const worker = async () => {
    while (activeIndex < uncachedSegments.length) {
      if (!isPlaying || isPaused) break; // abort if stopped or paused
      
      const current = activeIndex++;
      const { item, idx } = uncachedSegments[current];
      
      try {
        let voiceName = item.voiceName;
        if (!voiceName && item.lang) {
          voiceName = selectedLanguageVoices[item.lang];
          if (!voiceName) {
            const preferred = getPreferredVoice(item.lang, voices);
            voiceName = preferred ? preferred.name : '';
          }
        }
        if (!voiceName && voices.length > 0) {
          voiceName = voices[0].name;
        }

        const result = await window.api.synthesizeEdgeTts({
          text: item.text,
          voice: voiceName,
          rate: item.rate || 1.0,
          pitch: item.pitch || 1.0,
          engine: ttsEngine.value
        });
        
        if (result.success && result.audioData) {
          item.audioData = result.audioData;
          item.fallbackUsed = result.fallbackUsed;
          item.synthesizedRate = item.rate || 1.0;
        } else {
          console.error(`Failed to preload segment #${idx + 1}:`, result.error);
        }
      } catch (err) {
        console.error(`Error preloading segment #${idx + 1}:`, err);
      }
      
      cachedCount++;
      if (playerTimeDisplay && isPlaying && !isPaused) {
        playerTimeDisplay.textContent = `Đang kết nối & tải âm thanh (${cachedCount}/${totalToCache})...`;
      }
    }
  };
  
  const workers = [];
  for (let i = 0; i < Math.min(limit, uncachedSegments.length); i++) {
    workers.push(worker());
  }
  
  await Promise.all(workers);
  isPreloading = false;
}

async function playQueue() {
  isPlaying = true;
  isPaused = false;
  
  await preloadQueueAudio();
  
  if (!isPlaying || isPaused) return; // check if user cancelled or paused during preloading
  
  updatePlayerStatusUI('speaking');
  
  if (currentQueueIndex === -1 || currentQueueIndex >= queue.length) {
    currentQueueIndex = 0;
  }
  
  playSegment(currentQueueIndex);
}

async function playFromIndex(index) {
  stopQueue();
  
  isPlaying = true;
  isPaused = false;
  currentQueueIndex = index;
  
  await preloadQueueAudio();
  
  if (!isPlaying || isPaused) return;
  
  updatePlayerStatusUI('speaking');
  playSegment(currentQueueIndex);
}

function formatTime(secs) {
  if (isNaN(secs) || !isFinite(secs)) return '00:00';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function setupAudioPlayerEvents(audio) {
  audio.addEventListener('loadedmetadata', () => {
    if (playerSeekbar) {
      playerSeekbar.max = audio.duration;
      playerSeekbar.value = audio.currentTime;
    }
    if (playerTimeDisplay) {
      const prefix = audio.dataset.fallbackUsed === 'true' ? '[Dự phòng] ' : '';
      playerTimeDisplay.textContent = `${prefix}00:00 / ${formatTime(audio.duration)}`;
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (playerSeekbar) {
      playerSeekbar.value = audio.currentTime;
    }
    if (playerTimeDisplay) {
      const prefix = audio.dataset.fallbackUsed === 'true' ? '[Dự phòng] ' : '';
      playerTimeDisplay.textContent = `${prefix}${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    }
  });

  audio.addEventListener('play', () => {
    if (audio.dataset.isHistory === 'true' || audio.dataset.isHistory === true) {
      audio.playbackRate = 1.0;
      return;
    }
    
    const targetRate = isPlaying && currentQueueIndex !== -1 && queue[currentQueueIndex] && queue[currentQueueIndex].type === 'speech'
      ? (queue[currentQueueIndex].rate || parseFloat(globalRate.value) || 1.0)
      : (parseFloat(globalRate.value) || 1.0);
    
    const synthesizedRate = parseFloat(audio.dataset.synthesizedRate) || 1.0;
    audio.playbackRate = targetRate / synthesizedRate;
  });
}

function playSegment(index) {
  if (index < 0 || index >= queue.length) {
    stopQueue();
    return;
  }
  
  currentQueueIndex = index;
  updateTimelineProgressUI();
  
  const targetPage = Math.floor(index / timelinePageSize);
  if (targetPage !== timelineCurrentPage) {
    timelineCurrentPage = targetPage;
    renderTimeline();
  }
  
  highlightActiveTimelineCard(index);
  
  const item = queue[index];
  
  if (item.type === 'pause') {
    cleanupAudioPlayer();
    if (playerTimeDisplay) playerTimeDisplay.textContent = `Tạm nghỉ ${item.duration}ms...`;
    
    pauseStartTimestamp = Date.now();
    pauseRemainingTime = item.duration;
    
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      playSegment(currentQueueIndex + 1);
    }, item.duration);
    
  } else if (item.type === 'speech') {
    if (!item.text.trim()) {
      playSegment(currentQueueIndex + 1);
      return;
    }
    
    cleanupAudioPlayer();
    
    // Choose voice
    let voiceName = item.voiceName;
    if (!voiceName && item.lang) {
      voiceName = selectedLanguageVoices[item.lang];
      if (!voiceName) {
        const preferred = getPreferredVoice(item.lang, voices);
        voiceName = preferred ? preferred.name : '';
      }
    }
    if (!voiceName && voices.length > 0) {
      voiceName = voices[0].name;
    }

    console.log(`[TTS Playback] Segment #${index + 1} | Text: "${item.text}" | Lang: ${item.lang} | Voice: ${voiceName || 'Default'}`);

    if (item.audioData) {
      // Play cached audio data instantly without connection delays
      const audioSrc = "data:audio/mp3;base64," + item.audioData;
      const audio = new Audio(audioSrc);
      audio.volume = parseFloat(playerVolume.value) || 1.0;
      audio.dataset.fallbackUsed = !!item.fallbackUsed;
      audio.dataset.isPreSpedUp = (ttsEngine.value === 'edge' && !item.fallbackUsed);
      audio.dataset.synthesizedRate = (ttsEngine.value === 'edge' && !item.fallbackUsed)
        ? (item.synthesizedRate || item.rate || parseFloat(globalRate.value) || 1.0)
        : 1.0;
      currentAudioPlayer = audio;
      
      setupAudioPlayerEvents(audio);
      
      audio.addEventListener('ended', () => {
        cleanupAudioPlayer();
        playSegment(currentQueueIndex + 1);
      });
      
      audio.addEventListener('error', (err) => {
        console.error("Audio playback error:", err);
        cleanupAudioPlayer();
        playSegment(currentQueueIndex + 1);
      });
      
      audio.play().catch(err => {
        console.error("Failed to start audio playback:", err);
        cleanupAudioPlayer();
        playSegment(currentQueueIndex + 1);
      });
    } else {
      if (playerTimeDisplay) playerTimeDisplay.textContent = "Đang kết nối...";
      
      window.api.synthesizeEdgeTts({
        text: item.text,
        voice: voiceName,
        rate: item.rate || 1.0,
        pitch: item.pitch || 1.0,
        engine: ttsEngine.value
      }).then(result => {
        if (!isPlaying || currentQueueIndex !== index || isPaused) return; // safety check
        
        if (result.success && result.audioData) {
          const audioSrc = "data:audio/mp3;base64," + result.audioData;
          const audio = new Audio(audioSrc);
          audio.volume = parseFloat(playerVolume.value) || 1.0;
          audio.dataset.fallbackUsed = !!result.fallbackUsed;
          audio.dataset.isPreSpedUp = (ttsEngine.value === 'edge' && !result.fallbackUsed);
          audio.dataset.synthesizedRate = (ttsEngine.value === 'edge' && !result.fallbackUsed)
            ? (item.rate || parseFloat(globalRate.value) || 1.0)
            : 1.0;
          currentAudioPlayer = audio;
          
          setupAudioPlayerEvents(audio);
          
          audio.addEventListener('ended', () => {
            cleanupAudioPlayer();
            playSegment(currentQueueIndex + 1);
          });
          
          audio.addEventListener('error', (err) => {
            console.error("Audio playback error:", err);
            cleanupAudioPlayer();
            playSegment(currentQueueIndex + 1);
          });
          
          audio.play().catch(err => {
            console.error("Failed to start audio playback:", err);
            cleanupAudioPlayer();
            playSegment(currentQueueIndex + 1);
          });
        } else {
          console.error("Edge TTS synthesis failed:", result.error);
          if (playerTimeDisplay) playerTimeDisplay.textContent = `Lỗi: ${result.error || 'TTS Error'}`;
          setTimeout(() => {
            if (currentQueueIndex === index) {
              playSegment(currentQueueIndex + 1);
            }
          }, 2000);
        }
      }).catch(err => {
        console.error("synthesizeEdgeTts RPC error:", err);
        setTimeout(() => {
          if (currentQueueIndex === index) {
            playSegment(currentQueueIndex + 1);
          }
        }, 2000);
      });
    }
  }
}

function pauseQueue() {
  if (!isPlaying || isPaused) return;
  
  isPaused = true;
  updatePlayerStatusUI('paused');
  
  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
  } else if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
    const elapsed = Date.now() - pauseStartTimestamp;
    pauseRemainingTime = Math.max(0, pauseRemainingTime - elapsed);
  }
}

function resumeQueue() {
  if (!isPlaying || !isPaused) return;
  
  isPaused = false;
  updatePlayerStatusUI('speaking');
  
  if (currentAudioPlayer) {
    currentAudioPlayer.play().catch(e => console.error("Failed to resume audio:", e));
  } else {
    // Resume a silent pause
    pauseStartTimestamp = Date.now();
    pauseTimer = setTimeout(() => {
      pauseTimer = null;
      playSegment(currentQueueIndex + 1);
    }, pauseRemainingTime);
  }
}

function stopQueue() {
  isPlaying = false;
  isPaused = false;
  currentQueueIndex = -1;
  
  cleanupAudioPlayer();
  
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  
  updatePlayerStatusUI('idle');
  updateTimelineProgressUI();
  removeActiveTimelineCardHighlight();
  
  activeWordDisplay.innerHTML = `<span class="placeholder-text">Chưa phát âm thanh. Nhấn Phát để bắt đầu.</span>`;
}

function nextSegment() {
  if (queue.length === 0) return;
  
  stopTimersAndSpeech();
  
  if (currentQueueIndex < queue.length - 1) {
    currentQueueIndex++;
    isPlaying = true;
    isPaused = false;
    updatePlayerStatusUI('speaking');
    playSegment(currentQueueIndex);
  } else {
    stopQueue();
  }
}

function prevSegment() {
  if (queue.length === 0) return;
  
  stopTimersAndSpeech();
  
  if (currentQueueIndex > 0) {
    currentQueueIndex--;
    isPlaying = true;
    isPaused = false;
    updatePlayerStatusUI('speaking');
    playSegment(currentQueueIndex);
  } else {
    playFromIndex(0);
  }
}

function cleanupAudioPlayer() {
  if (playbackInterval) {
    clearInterval(playbackInterval);
    playbackInterval = null;
  }
  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer = null;
  }
  if (currentHistoryAudio && !currentHistoryAudio.paused) {
    currentHistoryAudio.pause();
  }
}

function stopTimersAndSpeech() {
  cleanupAudioPlayer();
  if (pauseTimer) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
}

function startAudioHighlighting(audio, text) {
  if (playbackInterval) clearInterval(playbackInterval);
  playbackInterval = setInterval(() => {
    if (audio.paused || audio.ended) {
      clearInterval(playbackInterval);
      return;
    }
    const curTime = audio.currentTime;
    const duration = audio.duration;
    if (duration > 0) {
      const pct = curTime / duration;
      const charIndex = Math.floor(pct * text.length);
      highlightWordAtIndex(charIndex, text);
    }
  }, 50);
}

// -------------------------------------------------------------
// Playback UI Helpers
// -------------------------------------------------------------
function updatePlayerStatusUI(status) {
  if (status === 'speaking') {
    queueStatusBadge.className = 'badge badge-speaking';
    queueStatusBadge.textContent = 'Đang đọc';
    playIcon.classList.add('hidden');
    pauseIcon.classList.remove('hidden');
  } else if (status === 'paused') {
    queueStatusBadge.className = 'badge badge-paused';
    queueStatusBadge.textContent = 'Tạm dừng';
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  } else {
    queueStatusBadge.className = 'badge badge-idle';
    queueStatusBadge.textContent = 'Sẵn sàng';
    playIcon.classList.remove('hidden');
    pauseIcon.classList.add('hidden');
  }
}

function updateTimelineProgressUI() {
  const total = queue.length;
  const current = currentQueueIndex === -1 ? 0 : currentQueueIndex + 1;
  
  timelineProgressText.textContent = `${current} / ${total} câu`;
  
  const pct = total > 0 ? (current / total) * 100 : 0;
  timelineProgressBar.style.width = `${pct}%`;
}

function highlightActiveTimelineCard(index) {
  removeActiveTimelineCardHighlight();
  
  const activeBlock = document.getElementById(`timeline-block-${index}`);
  if (activeBlock) {
    activeBlock.classList.add('active-block');
    activeBlock.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  // Highlight completed previous cards on the current visible page
  const startIdx = timelineCurrentPage * timelinePageSize;
  for (let i = startIdx; i < index; i++) {
    const prevBlock = document.getElementById(`timeline-block-${i}`);
    if (prevBlock) {
      prevBlock.classList.add('completed-block');
    }
  }
}

function removeActiveTimelineCardHighlight() {
  document.querySelectorAll('.timeline-block').forEach(block => {
    block.classList.remove('active-block');
    block.classList.remove('completed-block');
  });
}

// -------------------------------------------------------------
// Word-by-word Highlighter (Karaoke)
// -------------------------------------------------------------
function prepareActiveSentenceDisplay(text) {
  activeWords = [];
  
  // Parse words with their starting/ending offsets
  const wordsList = [];
  const regex = /\S+/g;
  let match;
  
  while ((match = regex.exec(text)) !== null) {
    wordsList.push({
      word: match[0],
      start: match.index,
      end: regex.lastIndex,
      element: null
    });
  }
  
  activeWordDisplay.innerHTML = '';
  
  let lastPos = 0;
  wordsList.forEach((w, index) => {
    // Add white spaces before the word if necessary
    if (w.start > lastPos) {
      const spaceText = text.substring(lastPos, w.start);
      activeWordDisplay.appendChild(document.createTextNode(spaceText));
    }
    
    const wordSpan = document.createElement('span');
    wordSpan.className = 'speech-word';
    wordSpan.textContent = w.word;
    wordSpan.id = `word-span-${index}`;
    
    // Bind click to speak starting exactly from this word (advanced skip inside sentence)
    wordSpan.addEventListener('click', () => {
      // Feature: speak sentence starting from this specific word
      speakSentenceFromWordIndex(index, wordsList, text);
    });
    
    activeWordDisplay.appendChild(wordSpan);
    w.element = wordSpan;
    lastPos = w.end;
  });
  
  if (lastPos < text.length) {
    const trailingSpace = text.substring(lastPos);
    activeWordDisplay.appendChild(document.createTextNode(trailingSpace));
  }
  
  activeWords = wordsList;
}

function highlightWordAtIndex(charIndex, text) {
  if (activeWords.length === 0) return;
  
  // Find which word matches this charIndex
  let activeWordIdx = -1;
  for (let i = 0; i < activeWords.length; i++) {
    const w = activeWords[i];
    if (charIndex >= w.start && charIndex < w.end) {
      activeWordIdx = i;
      break;
    }
  }
  
  if (activeWordIdx === -1) {
    // Fallback: choose the closest word
    for (let i = 0; i < activeWords.length; i++) {
      if (activeWords[i].start >= charIndex) {
        activeWordIdx = i;
        break;
      }
    }
  }
  
  activeWords.forEach((w, idx) => {
    if (idx === activeWordIdx) {
      w.element.classList.add('active-word');
      w.element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      w.element.classList.remove('active-word');
    }
  });
}

// Speak sentence from specific clicked word
function speakSentenceFromWordIndex(wordIdx, wordsList, fullText) {
  const startCharPos = wordsList[wordIdx].start;
  const partialText = fullText.substring(startCharPos);
  
  if (!partialText.trim()) return;
  
  stopTimersAndSpeech();
  
  isPlaying = true;
  isPaused = false;
  updatePlayerStatusUI('speaking');
  
  const currentSegment = queue[currentQueueIndex];
  
  let voiceName = '';
  if (currentSegment && currentSegment.voiceName) {
    voiceName = currentSegment.voiceName;
  } else if (currentSegment && currentSegment.lang) {
    voiceName = selectedLanguageVoices[currentSegment.lang];
  }
  if (!voiceName && voices.length > 0) {
    voiceName = voices[0].name;
  }
  
  // Set status to loading
  activeWordDisplay.innerHTML = `<span class="placeholder-text">[Đang kết nối giọng đọc Edge Neural...]</span>`;
  
  window.api.synthesizeEdgeTts({
    text: partialText,
    voice: voiceName,
    rate: currentSegment ? currentSegment.rate : 1.0,
    pitch: currentSegment ? currentSegment.pitch : 1.0,
    engine: ttsEngine.value
  }).then(result => {
    if (!isPlaying || isPaused) return;
    
    if (result.success && result.audioData) {
      const audioSrc = "data:audio/mp3;base64," + result.audioData;
      const audio = new Audio(audioSrc);
      audio.volume = parseFloat(playerVolume.value) || 1.0;
      audio.dataset.isPreSpedUp = (ttsEngine.value === 'edge' && !result.fallbackUsed);
      audio.dataset.synthesizedRate = (ttsEngine.value === 'edge' && !result.fallbackUsed)
        ? (currentSegment ? (currentSegment.rate || parseFloat(globalRate.value) || 1.0) : 1.0)
        : 1.0;
      currentAudioPlayer = audio;
      
      prepareActiveSentenceDisplay(fullText);
      
      audio.addEventListener('play', () => {
        const targetRate = currentSegment
          ? (currentSegment.rate || parseFloat(globalRate.value) || 1.0)
          : (parseFloat(globalRate.value) || 1.0);
        const synthesizedRate = parseFloat(audio.dataset.synthesizedRate) || 1.0;
        audio.playbackRate = targetRate / synthesizedRate;
          
        if (playbackInterval) clearInterval(playbackInterval);
        playbackInterval = setInterval(() => {
          if (audio.paused || audio.ended) {
            clearInterval(playbackInterval);
            return;
          }
          const curTime = audio.currentTime;
          const duration = audio.duration;
          if (duration > 0) {
            const pct = curTime / duration;
            const partialCharIdx = Math.floor(pct * partialText.length);
            const realCharIndex = startCharPos + partialCharIdx;
            highlightWordAtIndex(realCharIndex, fullText);
          }
        }, 50);
      });
      
      audio.addEventListener('ended', () => {
        cleanupAudioPlayer();
        playSegment(currentQueueIndex + 1);
      });
      
      audio.addEventListener('error', (err) => {
        console.error("Partial audio playback error:", err);
        cleanupAudioPlayer();
        playSegment(currentQueueIndex + 1);
      });
      
      audio.play().catch(err => {
        console.error("Failed to play partial audio:", err);
        cleanupAudioPlayer();
        playSegment(currentQueueIndex + 1);
      });
    } else {
      console.error("Edge TTS synthesis failed:", result.error);
      cleanupAudioPlayer();
      playSegment(currentQueueIndex + 1);
    }
  }).catch(err => {
    console.error("synthesizeEdgeTts RPC error:", err);
    cleanupAudioPlayer();
    playSegment(currentQueueIndex + 1);
  });
}

// -------------------------------------------------------------
// Project Save & Load Operations
// -------------------------------------------------------------
async function handleSaveProject() {
  if (queue.length === 0) {
    alert("Không có gì để lưu! Vui lòng nhập văn bản và bấm Phân tích & Tách câu trước.");
    return;
  }
  
  // Generate friendly project name automatically based on first sentence text + date/time
  let baseName = '';
  if (queue && queue.length > 0) {
    const firstSpeech = queue.find(item => item.type === 'speech' && item.text.trim());
    if (firstSpeech) {
      baseName = firstSpeech.text.trim().split(/\s+/).slice(0, 6).join(' ');
      if (baseName.length > 35) {
        baseName = baseName.substring(0, 35) + '...';
      }
    }
  }
  
  if (!baseName) {
    baseName = 'Dự án TTS';
  }
  
  const now = new Date();
  const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }).replace(/\//g, '-');
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }).replace(/:/g, 'h');
  const defaultProjectName = `${baseName} (${timeStr} ${dateStr})`;

  // Prompt the user for name using the custom prompt modal
  const inputName = await showPromptModal('Đặt tên cho dự án:', defaultProjectName);
  if (!inputName) return; // User cancelled

  const projectName = inputName.trim();
  
  const originalBtnHTML = btnSaveProject.innerHTML;
  btnSaveProject.disabled = true;
  btnSaveProject.innerHTML = `<span style="font-size: 11px;">Đang lưu...</span>`;
  
  try {
    const txtGDriveFolderLink = document.getElementById('gdrive-folder-link');
    
    const exportItems = queue.map(item => {
      if (item.type === 'speech') {
        return {
          ...item,
          rate: item.rate || parseFloat(globalRate.value) || 1.0
        };
      }
      return item;
    });
    
    const result = await window.api.saveProjectAudio({
      projectName: projectName || 'Dự án TTS',
      items: exportItems,
      defaultVoiceMapping: selectedLanguageVoices,
      ttsEngine: ttsEngine.value
    });
    
    if (result.success) {
      renderAudioHistory(result.history);
      
      // Auto-upload to Google Drive if configured
      const chkGDriveEnable = document.getElementById('chk-gdrive-enable');
      const txtGDriveUrl = document.getElementById('gdrive-url');
      
      let driveUrl = null;
      let driveUploadError = null;
      
      if (chkGDriveEnable && chkGDriveEnable.checked && txtGDriveUrl && txtGDriveUrl.value.trim()) {
        btnSaveProject.innerHTML = `<span style="font-size: 10px;">Đang tải lên Drive...</span>`;
        try {
          const uploadRes = await uploadToGoogleDrive({
            filePath: result.filePath,
            filename: `${projectName}.mp3`,
            webAppUrl: txtGDriveUrl.value.trim(),
            folderId: txtGDriveFolderLink ? txtGDriveFolderLink.value.trim() : ''
          });
          
          if (uploadRes.success) {
            driveUrl = uploadRes.url;
          } else {
            driveUploadError = uploadRes.error;
          }
        } catch (uploadErr) {
          driveUploadError = uploadErr.message;
        }
      }
      
      btnSaveProject.disabled = false;
      btnSaveProject.innerHTML = originalBtnHTML;
      
      if (driveUrl) {
        alert(`Đã lưu dự án "${projectName}" và tải lên Google Drive thành công!\nLink tải: ${driveUrl}`);
      } else if (driveUploadError) {
        alert(`Đã lưu dự án "${projectName}" cục bộ nhưng lỗi tải lên Google Drive: ${driveUploadError}`);
      } else {
        alert(`Đã lưu dự án "${projectName}" thành công!\nBấm OK để nghe lại file âm thanh của dự án.`);
      }
      
      // Auto play the newly saved project audio from history list
      if (result.filePath) {
        const playBtn = document.querySelector(`button[data-path="${result.filePath.replace(/\\/g, '\\\\')}"]`);
        if (playBtn) {
          playHistoryAudio(result.filePath, playBtn);
        }
      }
    } else {
      btnSaveProject.disabled = false;
      btnSaveProject.innerHTML = originalBtnHTML;
      alert(`Lỗi khi lưu dự án: ${result.error}`);
    }
  } catch (err) {
    btnSaveProject.disabled = false;
    btnSaveProject.innerHTML = originalBtnHTML;
    alert(`Lỗi khi lưu dự án: ${err.message}`);
  }
}

// -------------------------------------------------------------
// Audio History & MP3 Export Handlers
// -------------------------------------------------------------
async function loadAudioHistory() {
  const result = await window.api.getAudioHistory();
  if (result.success) {
    renderAudioHistory(result.history);
  } else {
    console.error("Lỗi khi tải lịch sử âm thanh:", result.error);
  }
}

function renderAudioHistory(history) {
  if (!history || history.length === 0) {
    historyEmpty.classList.remove('hidden');
    historyList.classList.add('hidden');
    historyList.innerHTML = '';
    return;
  }
  
  historyEmpty.classList.add('hidden');
  historyList.classList.remove('hidden');
  historyList.innerHTML = '';
  
  history.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    
    const info = document.createElement('div');
    info.className = 'history-item-info';
    
    const name = document.createElement('div');
    name.className = 'history-item-name';
    name.textContent = item.name;
    name.title = item.path;
    info.appendChild(name);
    
    const meta = document.createElement('div');
    meta.className = 'history-item-meta';
    meta.textContent = `${item.date} • ${item.size}`;
    info.appendChild(meta);
    
    el.appendChild(info);
    
    const actions = document.createElement('div');
    actions.className = 'history-item-actions';
    
    // Play button
    const btnPlay = document.createElement('button');
    btnPlay.className = 'btn btn-secondary btn-sm';
    btnPlay.setAttribute('data-path', item.path);
    btnPlay.style.padding = '4px 8px';
    btnPlay.title = 'Phát âm thanh';
    btnPlay.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    btnPlay.addEventListener('click', () => playHistoryAudio(item.path, btnPlay));
    actions.appendChild(btnPlay);
    
    // Open folder button
    const btnFolder = document.createElement('button');
    btnFolder.className = 'btn btn-secondary btn-sm';
    btnFolder.style.padding = '4px 8px';
    btnFolder.title = 'Mở thư mục chứa file';
    btnFolder.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`;
    btnFolder.addEventListener('click', () => window.api.openFolderContaining(item.path));
    actions.appendChild(btnFolder);
    
    // Google Drive Manual Upload button
    const btnUpload = document.createElement('button');
    btnUpload.className = 'btn btn-secondary btn-sm';
    btnUpload.style.padding = '4px 8px';
    btnUpload.title = 'Tải lên Google Drive';
    btnUpload.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 22h20L12 2zM12 6l7.5 13h-15L12 6z"/></svg>`;
    btnUpload.addEventListener('click', async (e) => {
      e.stopPropagation();
      const txtGDriveUrl = document.getElementById('gdrive-url');
      const txtGDriveFolderLink = document.getElementById('gdrive-folder-link');
      
      const webAppUrl = txtGDriveUrl ? txtGDriveUrl.value.trim() : '';
      if (!webAppUrl) {
        alert("Vui lòng cấu hình 'Google Apps Script Web App URL' trong mục cấu hình trước.");
        return;
      }
      
      const originalHTML = btnUpload.innerHTML;
      btnUpload.disabled = true;
      btnUpload.innerHTML = `<span style="font-size: 8px; font-weight: bold; color: #3b82f6;">...</span>`;
      
      try {
        const uploadRes = await uploadToGoogleDrive({
          filePath: item.path,
          filename: `${item.name}.mp3`,
          webAppUrl: webAppUrl,
          folderId: txtGDriveFolderLink ? txtGDriveFolderLink.value.trim() : ''
        });
        
        if (uploadRes.success) {
          alert(`Tải lên Google Drive thành công!\nĐường liên kết:\n${uploadRes.url}`);
        } else {
          alert(`Lỗi tải lên Google Drive: ${uploadRes.error}`);
        }
      } catch (err) {
        alert(`Lỗi kết nối tải lên Google Drive: ${err.message}`);
      } finally {
        btnUpload.disabled = false;
        btnUpload.innerHTML = originalHTML;
      }
    });
    actions.appendChild(btnUpload);
    
    // Delete button
    const btnDel = document.createElement('button');
    btnDel.className = 'btn btn-secondary btn-sm';
    btnDel.style.padding = '4px 8px';
    btnDel.style.color = '#ef4444';
    btnDel.title = 'Xóa file';
    btnDel.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
    btnDel.addEventListener('click', async () => {
      if (confirm(`Bạn có chắc chắn muốn xóa file này khỏi ổ đĩa và thư viện?\n${item.name}`)) {
        if (currentHistoryAudio && !currentHistoryAudio.paused) {
          currentHistoryAudio.pause();
          currentHistoryAudio = null;
        }
        const delResult = await window.api.deleteAudioFile(item.path);
        if (delResult.success) {
          renderAudioHistory(delResult.history);
        } else {
          alert(`Lỗi khi xóa file: ${delResult.error}`);
        }
      }
    });
    actions.appendChild(btnDel);
    
    el.appendChild(actions);
    historyList.appendChild(el);
  });
}

async function playHistoryAudio(filePath, playBtn) {
  const activeTitle = document.querySelector('.active-sentence-title');
  
  if (currentHistoryAudio && currentHistoryAudio.dataset.path === filePath) {
    if (!currentHistoryAudio.paused) {
      currentHistoryAudio.pause();
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      playBtn.title = 'Phát âm thanh';
      updatePlayerStatusUI('paused');
      return;
    } else {
      currentHistoryAudio.play();
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      playBtn.title = 'Tạm dừng';
      updatePlayerStatusUI('speaking');
      return;
    }
  }
  
  cleanupAudioPlayer();
  
  playBtn.innerHTML = `<span style="font-size: 10px;">...</span>`;
  
  const result = await window.api.getAudioBase64(filePath);
  if (result.success) {
    const audioSrc = "data:audio/mp3;base64," + result.base64;
    const audio = new Audio(audioSrc);
    audio.volume = parseFloat(playerVolume.value) || 1.0;
    audio.dataset.path = filePath;
    audio.dataset.isHistory = true;
    currentHistoryAudio = audio;
    playBtn._audioInstance = audio;
    
    if (activeTitle) {
      const filename = filePath.split(/[\\/]/).pop();
      activeTitle.textContent = `Đang phát: ${filename}`;
    }
    
    setupAudioPlayerEvents(audio);
    
    audio.addEventListener('play', () => {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
      playBtn.title = 'Tạm dừng';
      updatePlayerStatusUI('speaking');
      audio.playbackRate = 1.0;
    });
    
    audio.addEventListener('pause', () => {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      playBtn.title = 'Phát âm thanh';
      updatePlayerStatusUI('paused');
    });
    
    audio.addEventListener('ended', () => {
      playBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
      playBtn.title = 'Phát âm thanh';
      updatePlayerStatusUI('idle');
      currentHistoryAudio = null;
      if (activeTitle) {
        activeTitle.textContent = 'Đang phát:';
      }
    });
    
    audio.play().catch(err => {
      console.error("Lỗi phát audio thư viện:", err);
      alert("Không thể phát âm thanh: " + err.message);
      loadAudioHistory();
    });
  } else {
    alert("Lỗi khi tải file âm thanh: " + result.error);
    loadAudioHistory();
  }
}

async function handleExportMp3() {
  if (queue.length === 0) {
    alert("Không có gì để xuất! Vui lòng nhập văn bản và bấm Phân tích & Tách câu trước.");
    return;
  }
  
  const originalBtnText = btnExportMp3.innerHTML;
  btnExportMp3.disabled = true;
  btnExportMp3.innerHTML = `<span style="font-size: 11px;">Đang xuất...</span>`;
  
  const exportItems = queue.map(item => {
    if (item.type === 'speech') {
      return {
        ...item,
        rate: item.rate || parseFloat(globalRate.value) || 1.0
      };
    }
    return item;
  });

  const result = await window.api.exportTimelineMp3({
    items: exportItems,
    defaultVoiceMapping: selectedLanguageVoices,
    ttsEngine: ttsEngine.value
  });
  
  btnExportMp3.disabled = false;
  btnExportMp3.innerHTML = originalBtnText;
  
  if (result.success) {
    alert(`Đã xuất và lưu tệp MP3 thành công tại:\n${result.filePath}`);
    if (result.history) {
      renderAudioHistory(result.history);
    } else {
      loadAudioHistory();
    }
  } else if (result.error !== 'Cancelled by user') {
    alert(`Lỗi khi xuất MP3: ${result.error}`);
  }
}

function showPromptModal(title, defaultValue) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-prompt-overlay';

    const container = document.createElement('div');
    container.className = 'custom-prompt-container';

    const titleEl = document.createElement('h3');
    titleEl.className = 'custom-prompt-title';
    titleEl.textContent = title;
    container.appendChild(titleEl);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'custom-prompt-input';
    input.value = defaultValue || '';
    container.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'custom-prompt-actions';

    const btnCancel = document.createElement('button');
    btnCancel.className = 'custom-prompt-btn-cancel';
    btnCancel.textContent = 'Hủy';
    actions.appendChild(btnCancel);

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'custom-prompt-btn-confirm';
    btnConfirm.textContent = 'Xác nhận';
    actions.appendChild(btnConfirm);

    container.appendChild(actions);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    setTimeout(() => input.focus(), 50);
    setTimeout(() => overlay.classList.add('show'), 10);

    const close = (value) => {
      overlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(overlay);
        resolve(value);
      }, 250);
    };

    btnCancel.addEventListener('click', () => close(null));
    btnConfirm.addEventListener('click', () => {
      const val = input.value.trim();
      close(val || null);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const val = input.value.trim();
        close(val || null);
      } else if (e.key === 'Escape') {
        close(null);
      }
    });
  });
}

async function uploadToGoogleDrive({ filePath, filename, webAppUrl, folderId }) {
  const base64Result = await window.api.getAudioBase64(filePath);
  if (!base64Result.success) {
    return { success: false, error: 'Không thể đọc file base64: ' + base64Result.error };
  }
  
  const parsedFolderId = extractFolderId(folderId);
  
  const response = await fetch(webAppUrl, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify({
      filename: filename,
      base64: base64Result.base64,
      folderId: parsedFolderId || ''
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const resData = await response.json();
  return resData;
}

function extractFolderId(input) {
  if (!input) return '';
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
}

let appSettings = {};

async function loadAppSettings() {
  try {
    appSettings = await window.api.getConfig();
    if (!appSettings) appSettings = {};
  } catch (err) {
    console.error('Lỗi khi tải cấu hình:', err);
    appSettings = {};
  }
}

async function saveAppSettings(key, value) {
  appSettings[key] = value;
  try {
    await window.api.saveConfig(appSettings);
  } catch (err) {
    console.error('Lỗi khi lưu cấu hình:', err);
  }
}

function getGDriveFolders() {
  return appSettings.gdrive_folders || [];
}

async function saveGDriveFolders(folders) {
  await saveAppSettings('gdrive_folders', folders);
}

function populateGDriveFoldersSelect(selectedVal) {
  const select = document.getElementById('gdrive-folder-select');
  if (!select) return;
  
  select.innerHTML = '<option value="">Thư mục tùy chỉnh mới...</option>';
  
  const folders = getGDriveFolders();
  folders.forEach((folder) => {
    const opt = document.createElement('option');
    opt.value = folder.link;
    opt.textContent = folder.name;
    select.appendChild(opt);
  });
  
  if (selectedVal !== undefined) {
    select.value = selectedVal;
  } else {
    select.value = appSettings.gdrive_selected_folder || '';
  }
}

// Start App
init();
