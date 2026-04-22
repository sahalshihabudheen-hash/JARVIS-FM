/**
 * JARVIS FM - Core Logic
 */

const API_BASE = `https://de1.api.radio-browser.info/json`;
const USER_AGENT = 'JARVIS-FM/1.0';
let activeFetchController = null;

// --- Toast Notification System ---
const TOAST_ICONS = { error: '⚡', success: '✅', info: 'ℹ️', warning: '⚠️' };
const TOAST_TITLES = { error: 'Stream Error', success: 'Now Playing', info: 'Info', warning: 'Heads Up' };

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${TOAST_ICONS[type]}</span>
        <div class="toast-body">
            <div class="toast-title">${TOAST_TITLES[type]}</div>
            <div class="toast-msg">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

    // Click anywhere on toast to dismiss
    toast.onclick = (e) => {
        if (e.target.classList.contains('toast-close')) return;
        dismissToast(toast);
    };

    container.appendChild(toast);

    // Auto-dismiss
    setTimeout(() => dismissToast(toast), duration);
}

function dismissToast(toast) {
    if (!toast || !toast.isConnected) return;
    toast.classList.add('toast-hide');
    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 380);
}

// State Management
let state = {
    currentStation: null,
    isPlaying: false,
    volume: 0.7,
    stations: [],
    location: null,
    activeType: 'topvote',
    activeTag: null,
    preferredGenres: JSON.parse(localStorage.getItem('preferredGenres')) || [],
    recentlyPlayed: JSON.parse(localStorage.getItem('recentlyPlayed')) || []
};

// UI Elements
const elements = {
    stationList: document.getElementById('station-list'),
    stationSearch: document.getElementById('station-search'),
    locationText: document.getElementById('locationText'),
    locationExplorer: document.getElementById('locationExplorer'),
    togglePlay: document.getElementById('toggle-play'),
    playIcon: document.getElementById('play-icon'),
    audioPlayer: document.getElementById('audio-player'),
    volumeSlider: document.getElementById('volume-slider'),
    currentStationName: document.getElementById('current-station-name'),
    currentStationGenre: document.getElementById('current-station-genre'),
    sectionTitle: document.getElementById('section-title'),
    sectionSubtitle: document.getElementById('section-subtitle'),
    navItems: document.querySelectorAll('.nav-item'),
    genreItems: document.querySelectorAll('.genre-item'),

    onboardingModal: document.getElementById('onboarding-modal'),
    onboardingGenres: document.querySelectorAll('.onboarding-genre'),
    finishOnboarding: document.getElementById('finish-onboarding'),
    volumeProgress: document.getElementById('volume-progress'),
    volumePercent: document.getElementById('volume-percent'),
    volUp: document.getElementById('vol-up'),
    volDown: document.getElementById('vol-down'),
    prevBtn: document.getElementById('prev-station'),
    nextBtn: document.getElementById('next-station'),
    playerBar: document.querySelector('.player-bar'),
    miniArtwork: document.getElementById('player-artwork'),
    expandTrigger: document.getElementById('player-expand-trigger'),
    liveBadge: document.getElementById('live-status-badge'),
    
    // Expanded Player
    expandedOverlay: document.getElementById('expanded-player'),
    expandedClose: document.getElementById('close-expanded'),
    expandedArtwork: document.getElementById('expanded-artwork'),
    expandedBg: document.getElementById('expanded-bg'),
    expandedName: document.getElementById('expanded-name'),
    expandedGenre: document.getElementById('expanded-genre'),
    expTogglePlay: document.getElementById('exp-toggle-play'),
    expPrev: document.getElementById('exp-prev'),
    expNext: document.getElementById('exp-next'),
    expVolume: document.getElementById('exp-volume-slider')
};

// --- Error Handling ---
window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global Error:', msg, 'at', url, ':', lineNo);
    showToast(`App Error: ${msg}`, 'error');
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled Rejection:', event.reason);
    const errorMsg = event.reason?.message || event.reason || 'Network error';
    showToast(`Error: ${errorMsg}`, 'warning');
};

// --- Initialization ---

async function init() {
    setupEventListeners();
    
    // Non-blocking location detection
    detectLocation();

    // Load from cache first for instant UI
    const cached = localStorage.getItem('cachedStations');
    if (cached) {
        state.stations = JSON.parse(cached);
        renderStations(state.stations);
    }

    if (state.preferredGenres.length === 0) {
        showOnboarding();
    } else {
        // Fetch fresh data in the background
        fetchStations('home');
    }

    setupVisualizer();
}

// --- API Logic ---

async function fetchStations(type, query = '') {
    // Abort any ongoing fetch to prevent speed-clogging and toast spam
    if (activeFetchController) {
        activeFetchController.abort();
    }
    activeFetchController = new AbortController();
    const signal = activeFetchController.signal;

    showLoader();
    console.log(`Fetching stations: ${type} ${query}`);
    let url = '';

    if (type !== 'local') {
        elements.locationExplorer.style.display = 'none';
    }

    if (type === 'home') {
        const primaryGenre = state.preferredGenres[0] || 'mixed';
        url = `${API_BASE}/stations/search?tag=${primaryGenre}&order=clickcount&reverse=true&limit=60`;
        elements.sectionTitle.textContent = 'For You';
        elements.sectionSubtitle.textContent = state.preferredGenres.length > 0 
            ? `Personalized selection based on your interest in ${state.preferredGenres.join(', ')}`
            : 'Explore trending global hits curated for you';

    } else if (type === 'topvote') {
        url = `${API_BASE}/stations/topvote/60`;
        elements.sectionTitle.textContent = 'Trending Stations';
        elements.sectionSubtitle.textContent = 'What everyone is listening to right now';

    } else if (type === 'topclick') {
        url = `${API_BASE}/stations/topclick/20`;
        elements.sectionTitle.textContent = 'Most Popular';

    } else if (type === 'search') {
        url = `${API_BASE}/stations/search?name=${query}&limit=50&order=clickcount&reverse=true`;
        elements.sectionTitle.textContent = `Results for "${query}"`;

    } else if (type === 'tag') {
        url = `${API_BASE}/stations/bytag/${query}?limit=30&order=clickcount&reverse=true`;
        elements.sectionTitle.textContent = `${query.toUpperCase()} Stations`;

    } else if (type === 'local') {
        const country = query || (state.location ? state.location.country_code : 'IN');
        const region = state.location?.region || '';
        
        url = `${API_BASE}/stations/bycountrycodeexact/${country}?order=clickcount&reverse=true&limit=60`;
        elements.sectionTitle.textContent = `Nearby Stations`;
        elements.sectionSubtitle.textContent = `Signals from ${country.toUpperCase()}`;
        
        renderLocationExplorer(country);

    } else if (type === 'islamic') {
        url = `${API_BASE}/stations/search?tag=islamic&limit=60&order=clickcount&reverse=true`;
        elements.sectionTitle.textContent = 'Peace & Serenity';
        elements.sectionSubtitle.textContent = 'Spiritual and calming signals from around the world';

    } else if (type === 'tuner') {
        renderTuner();
        return;

    } else if (type === 'history') {
        renderStations(state.recentlyPlayed);
        elements.sectionTitle.textContent = 'Recently Played';
        elements.sectionSubtitle.textContent = 'Pick up where you left off';
        return; 
    }

    if (type === 'topvote') {
        elements.sectionSubtitle.textContent = 'Personalized selection based on your vibe';
    } else if (type === 'topclick') {
        elements.sectionSubtitle.textContent = 'What everyone is listening to right now';
    } else if (type === 'local') {
        elements.sectionSubtitle.textContent = 'Bringing the local community direct to your ears';
    }

    try {
        const mirrors = [API_BASE, 'https://at1.api.radio-browser.info/json', 'https://all.api.radio-browser.info/json'];
        let lastError = null;

        for (const mirror of mirrors) {
            const fetchUrl = url.replace(API_BASE, mirror);
            console.log(`Trying mirror: ${mirror}`);
            
            try {
                const response = await fetch(fetchUrl, { 
                    signal: anySignal([signal, timeoutSignal(10000)]) 
                });
                
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                
                const data = await response.json();
                state.stations = data;
                
                if (type === 'topvote' || type === 'topclick') {
                    localStorage.setItem('cachedStations', JSON.stringify(data));
                }
                
                renderStations(data);
                return; // Success, exit the loop
            } catch (error) {
                if (error.name === 'AbortError' && signal.aborted) return; 
                console.warn(`Mirror ${mirror} failed:`, error.message);
                lastError = error;
            }
        }

        // If we reach here, all mirrors failed
        if (elements.stationList.querySelector('.skeleton-card')) {
            elements.stationList.innerHTML = `
                <div class="error-container">
                    <i data-lucide="wifi-off" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:20px;"></i>
                    <p class="error">All radio database mirrors are currently unreachable. Please check your connection.</p>
                    <button class="primary-btn" onclick="location.reload()" style="margin-top:20px;">Retry Now</button>
                </div>
            `;
            if (window.lucide) lucide.createIcons({ root: elements.stationList });
        }
    } finally {
        if (activeFetchController && activeFetchController.signal === signal) {
            activeFetchController = null;
        }
    }
}

// Utility to combine abort signals
function anySignal(signals) {
    const controller = new AbortController();
    for (const signal of signals) {
        if (!signal || !signal.addEventListener) continue;
        if (signal.aborted) {
            controller.abort();
            return signal;
        }
        signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
}

// Compatibility timeout signal
function timeoutSignal(ms) {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
}

// --- Location Logic ---

async function detectLocation() {
    console.log('Detecting location...');
    // Check cache first
    const cachedLoc = localStorage.getItem('userLocation');
    if (cachedLoc) {
        try {
            const data = JSON.parse(cachedLoc);
            state.location = data;
            elements.locationText.textContent = `${data.city}, ${data.country_name}`;
        } catch(e) {}
    }

    try {
        const response = await fetch('https://ipapi.co/json/', { signal: timeoutSignal(5000) });
        if (!response.ok) throw new Error('Location API failed');
        const data = await response.json();
        state.location = data;
        localStorage.setItem('userLocation', JSON.stringify(data));
        elements.locationText.textContent = data.region 
            ? `${data.city}, ${data.region}` 
            : `${data.city}, ${data.country_name}`;
        console.log('Location detected:', data.city, data.region);
    } catch (e) {
        console.warn('Location detection failed, using Global Mode');
        if (!state.location) elements.locationText.textContent = 'Global Mode';
    }
}

// --- UI Rendering ---

function renderStations(stations) {
    // Check if the data is actually different to prevent jarring screen flashes
    const stationIds = stations.map(s => s.stationuuid).join(',');
    if (elements.stationList.getAttribute('data-last-ids') === stationIds) {
        return;
    }
    elements.stationList.setAttribute('data-last-ids', stationIds);

    elements.stationList.innerHTML = '';

    if (stations.length === 0) {
        if (state.activeType === 'local') {
            elements.stationList.innerHTML = `
                <div class="no-results glass">
                    <i data-lucide="search-x"></i>
                    <h3>No stations found in this region</h3>
                    <p>Try scanning another popular area. Enter a country code (e.g., US, GB, IN):</p>
                    <input type="text" id="manual-region-input" placeholder="e.g. IN" class="glass-input">
                    <button class="primary-btn" onclick="fetchStations('local', document.getElementById('manual-region-input').value)">Scan</button>
                </div>
            `;
        } else {
            elements.stationList.innerHTML = `
                <div class="no-results glass">
                    <i data-lucide="search-x"></i>
                    <h3>No results found</h3>
                    <p>Try exploring a different genre or searching for another name.</p>
                </div>
            `;
        }
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Split stations into Live and Others (using lastcheckok as a proxy for real-time availability)
    const liveStations = stations.filter(s => s.lastcheckok === 1).slice(0, 12);
    const otherStations = stations.filter(s => s.lastcheckok !== 1 || !liveStations.includes(s));

    if (liveStations.length > 0) {
        // Recommendation Carousel for top 5 live stations
        renderRecommendations(liveStations.slice(0, 5));
        renderSection('Live Now', 'Stations with a verified active signal', liveStations.slice(5));
    }

    if (otherStations.length > 0) {
        renderSection('All Frequencies', 'Explore the rest of the signals', otherStations);
    }
}

window.searchByTag = function(tag) {
    state.activeType = 'tag';
    fetchStations('tag', tag);
};

function renderSection(title, subtitle, stations, targetContainer = null) {
    const section = document.createElement('div');
    section.className = 'grid-section';
    section.innerHTML = `
        <div class="section-divider">
            <div class="divider-info">
                <h3>${title}</h3>
                <p>${subtitle}</p>
            </div>
            <div class="divider-line"></div>
        </div>
        <div class="station-grid section-grid-inner"></div>
    `;
    
    const grid = section.querySelector('.section-grid-inner');
    
    stations.forEach((station, index) => {
        const card = document.createElement('div');
        card.className = 'station-card glass';

        const artwork = station.favicon || '';
        const artworkHtml = artwork
            ? `<img src="${artwork}" loading="lazy" onerror="this.src='/LOGO.gif'; this.className='placeholder-logo'; this.onerror=null;" alt="${station.name}">`
            : `<img src="/LOGO.gif" class="placeholder-logo" alt="JARVIS FM">`;

        let badgeHtml = '';
        if (station.lastcheckok === 1) {
            badgeHtml = `<div class="card-badge badge-live">Live</div>`;
        }

        card.innerHTML = `
            ${badgeHtml}
            <div class="station-card-artwork">
                ${artworkHtml}
                <div class="play-overlay">
                    <i data-lucide="play-circle"></i>
                </div>
            </div>
            <div class="station-card-info">
                <h5>${station.name}</h5>
                <p>${station.tags.split(',').slice(0, 2).join(' • ') || 'Global Radio'}</p>
            </div>
        `;

        card.onclick = () => playStation(station);
        grid.appendChild(card);
    });

    if (targetContainer) {
        targetContainer.innerHTML = '';
        targetContainer.appendChild(section);
    } else {
        elements.stationList.appendChild(section);
    }

    if (window.lucide) {
        lucide.createIcons({ root: section });
    }
}

function renderTuner() {
    const currentCountry = state.location?.country_name || 'India';
    const currentCountryCode = state.location?.country_code || 'IN';

    elements.stationList.innerHTML = `
        <div class="tuner-container glass">
            <div class="tuner-display">
                <span class="tuner-freq" id="tunerFreq">102.7</span>
                <span class="tuner-unit">MHz</span>
            </div>
            <div class="tuner-controls">
                <input type="range" min="87.5" max="108.0" step="0.1" value="102.7" class="tuner-slider" id="tunerSlider">
                <div class="tuner-filters">
                    <label class="filter-toggle">
                        <input type="checkbox" id="localFilter" checked>
                        <span class="toggle-slider"></span>
                        <span class="toggle-label">Only search in ${currentCountry}</span>
                    </label>
                </div>
                <div class="tuner-buttons">
                    <button class="primary-btn tune-btn" id="tuneBtn">
                        <i data-lucide="radio"></i> Tune Station
                    </button>
                </div>
            </div>
            <div class="tuner-status" id="tunerStatus">Adjust the dial to find local signals</div>
        </div>
        <div id="tunerResults" class="station-grid-container"></div>
    `;

    const slider = document.getElementById('tunerSlider');
    const freqDisplay = document.getElementById('tunerFreq');
    const tuneBtn = document.getElementById('tuneBtn');
    const status = document.getElementById('tunerStatus');
    const localFilter = document.getElementById('localFilter');
    const resultsContainer = document.getElementById('tunerResults');

    slider.oninput = () => {
        freqDisplay.textContent = parseFloat(slider.value).toFixed(1);
    };

    tuneBtn.onclick = async () => {
        const freq = freqDisplay.textContent;
        const isLocal = localFilter.checked;
        
        status.textContent = isLocal ? `Scanning for ${freq} MHz in ${currentCountry}...` : `Global Scan for ${freq} MHz...`;
        tuneBtn.disabled = true;
        
        try {
            let url = `${API_BASE}/stations/search?name=${freq}&limit=40&order=clickcount&reverse=true`;
            if (isLocal) {
                url += `&countrycode=${currentCountryCode}`;
            }

            const response = await fetch(url, { signal: timeoutSignal(10000) });
            const stations = await response.json();
            
            if (stations.length > 0) {
                status.textContent = `Found ${stations.length} stations on ${freq} MHz ${isLocal ? 'locally' : 'globally'}`;
                renderSection(`Stations on ${freq}`, `Signals found ${isLocal ? 'in ' + currentCountry : 'worldwide'}`, stations, resultsContainer);
            } else {
                status.textContent = `No stations found on ${freq} MHz ${isLocal ? 'in ' + currentCountry : ''}. Try turning off the local filter.`;
                resultsContainer.innerHTML = '';
            }
        } catch (e) {
            status.textContent = "Tuning failed. Please try again.";
        } finally {
            tuneBtn.disabled = false;
        }
    };

    if (window.lucide) lucide.createIcons();
    
    elements.sectionTitle.textContent = 'Digital Tuner';
    elements.sectionSubtitle.textContent = 'Manually dial in your favorite frequencies just like a real FM radio';
}

function showLoader() {
    elements.locationExplorer.style.display = 'none';
    elements.stationList.innerHTML = `
        <div class="station-grid">
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
            <div class="skeleton-card"></div>
        </div>
    `;
}

function renderRecommendations(stations) {
    const container = document.createElement('div');
    container.className = 'recommendations-carousel-container';
    container.innerHTML = `
        <div class="section-divider">
            <div class="divider-info">
                <h3>Top Recommendations</h3>
                <p>Curated signals based on your vibe</p>
            </div>
            <section class="station-grid-container">
                <button class="nav-btn prev-btn"><i data-lucide="chevron-left"></i></button>
                <button class="nav-btn next-btn"><i data-lucide="chevron-right"></i></button>
            </section>
        </div>
        <div class="recommendations-scroll">
            <div class="recommendations-inner"></div>
        </div>
    `;
    
    const inner = container.querySelector('.recommendations-inner');
    const scrollContainer = container.querySelector('.recommendations-scroll');
    
    stations.forEach((station, index) => {
        const item = document.createElement('div');
        item.className = 'recommendation-item glass';
        
        const artwork = station.favicon || '/LOGO.gif';
        const isPlaceholder = !station.favicon;

        item.innerHTML = `
            <div class="rec-artwork">
                <img src="${artwork}" class="${isPlaceholder ? 'placeholder-logo' : ''}" alt="${station.name}">
                <div class="rec-play-overlay">
                    <i data-lucide="play"></i>
                </div>
            </div>
            <div class="rec-info">
                <h4>${station.name}</h4>
                <p>${station.tags.split(',')[0] || 'Global'}</p>
            </div>
        `;

        item.onclick = () => playStation(station);
        inner.appendChild(item);
    });

    // Navigation Logic
    container.querySelector('.prev-btn').onclick = () => {
        scrollContainer.scrollBy({ left: -340, behavior: 'smooth' });
    };
    container.querySelector('.next-btn').onclick = () => {
        scrollContainer.scrollBy({ left: 340, behavior: 'smooth' });
    };

    elements.stationList.prepend(container);

    if (window.lucide) {
        lucide.createIcons({ root: container });
    }
}

function refreshAnimations() {
    const cards = elements.stationList.querySelectorAll('.station-card');
    cards.forEach((card, index) => {
        card.style.animation = 'none';
        card.offsetHeight; // trigger reflow
        card.style.animation = '';
        card.style.animationDelay = `${Math.min(index * 0.05, 0.5)}s`;
    });
}

// --- Player Logic ---
let hls = null;

function playStation(station) {
    if (hls) {
        hls.destroy();
        hls = null;
    }

    state.currentStation = station;
    elements.currentStationName.textContent = station.name;
    elements.currentStationGenre.textContent = station.tags.split(',').slice(0, 3).join(' • ') || 'Live Stream';

    // Update player artwork
    const artwork = document.getElementById('player-artwork');
    if (artwork) {
        if (station.favicon) {
            artwork.innerHTML = `<img src="${station.favicon}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'radio\\'></i>'; lucide.createIcons({ root: this.parentElement });" alt="${station.name}">`;
        } else {
            artwork.innerHTML = `<i data-lucide="radio"></i>`;
            lucide.createIcons({ root: artwork });
        }
    }

    // Show the player bar and adjust layout
    elements.playerBar.classList.add('visible');
    document.body.classList.add('player-visible');

    updateExpandedUI(station);

    const streamUrl = station.url_resolved || station.url;

    if (streamUrl.includes('.m3u8')) {
        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(elements.audioPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, function () {
                startPlayback();
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) showToast('This HLS stream failed to load. Try another station.', 'error');
            });
        } else if (elements.audioPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            elements.audioPlayer.src = streamUrl;
            startPlayback();
        } else {
            showToast("Your browser doesn't support this stream format.", 'warning');
        }
    } else {
        elements.audioPlayer.src = streamUrl;
        startPlayback();
    }

    // Update Recently Played
    addToRecentlyPlayed(station);
}

function addToRecentlyPlayed(station) {
    let recent = state.recentlyPlayed.filter(s => s.stationuuid !== station.stationuuid);
    recent.unshift(station);
    state.recentlyPlayed = recent.slice(0, 10);
    localStorage.setItem('recentlyPlayed', JSON.stringify(state.recentlyPlayed));
}

function startPlayback() {
    elements.audioPlayer.play()
        .then(() => {
            state.isPlaying = true;
            updatePlayUI();
            elements.togglePlay.disabled = false;
        })
        .catch(err => {
            console.error('Playback failed:', err);
            showToast('Stream unavailable. Trying another station might help!', 'error');
        });
}

function togglePlay() {
    if (state.isPlaying) {
        elements.audioPlayer.pause();
        state.isPlaying = false;
    } else {
        elements.audioPlayer.play();
        state.isPlaying = true;
    }
    updatePlayUI();
}

function updatePlayUI() {
    const playBtn = document.getElementById('toggle-play');
    const expPlayBtn = document.getElementById('exp-toggle-play');
    
    if (playBtn) {
        playBtn.innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}"></i>`;
    }
    if (expPlayBtn) {
        expPlayBtn.innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}"></i>`;
    }
    
    lucide.createIcons();
    
    // Toggle Live Badge visibility
    if (elements.liveBadge) {
        elements.liveBadge.style.display = state.isPlaying ? 'flex' : 'none';
        elements.liveBadge.style.opacity = state.isPlaying ? '1' : '0';
    }
    
    // Toggle visualizer animation
    const visContainers = [document.getElementById('visualizer-pill'), document.querySelector('.expanded-visualizer')];
    visContainers.forEach(container => {
        if (!container) return;
        container.style.opacity = state.isPlaying ? '1' : '0.3';
        const bars = container.querySelectorAll('.vis-bar');
        bars.forEach(bar => {
            bar.style.animationPlayState = state.isPlaying ? 'running' : 'paused';
        });
    });
}

function updateExpandedUI(station) {
    if (!station) return;
    elements.expandedName.textContent = station.name;
    elements.expandedGenre.textContent = station.tags.split(',').slice(0, 3).join(' • ') || 'Live Stream';
    
    const artwork = station.favicon || 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=400';
    elements.expandedArtwork.src = artwork;
    elements.expandedBg.style.backgroundImage = `url(${artwork})`;
}

function updateVolume(vol) {
    elements.audioPlayer.volume = vol;
    state.volume = vol;
    
    // Sync Mini Player
    elements.volumeSlider.value = vol;
    elements.volumeProgress.style.width = `${vol * 100}%`;
    elements.volumePercent.textContent = `${Math.round(vol * 100)}%`;
    
    // Sync Expanded Player
    if (elements.expVolume) {
        elements.expVolume.value = vol;
        const expProgress = document.getElementById('exp-volume-progress');
        if (expProgress) expProgress.style.width = `${vol * 100}%`;
    }
}

// --- Event Listeners ---

function setupEventListeners() {
    // Search
    let timeout = null;
    elements.stationSearch.oninput = (e) => {
        clearTimeout(timeout);
        const query = e.target.value;
        if (query.length > 2) {
            timeout = setTimeout(() => {
                fetchStations('search', query);
            }, 500);
        } else if (query.length === 0) {
            fetchStations(state.activeType);
        }
    };

    // Navigation
    elements.navItems.forEach(item => {
        item.onclick = () => {
            elements.navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const type = item.getAttribute('data-type');
            state.activeType = type;
            fetchStations(type);
        };
    });

    // Audio Player Sync
    elements.audioPlayer.onplay = () => {
        state.isPlaying = true;
        updatePlayUI();
    };

    elements.audioPlayer.onpause = () => {
        state.isPlaying = false;
        updatePlayUI();
    };

    elements.audioPlayer.onwaiting = () => {
        elements.togglePlay.classList.add('loading');
    };

    elements.audioPlayer.onplaying = () => {
        elements.togglePlay.classList.remove('loading');
    };

    // Player Controls
    elements.togglePlay.onclick = togglePlay;

    elements.volumeSlider.oninput = (e) => {
        updateVolume(parseFloat(e.target.value));
    };

    if (elements.volUp) {
        elements.volUp.onclick = () => {
            updateVolume(Math.min(1, state.volume + 0.1));
        };
    }

    if (elements.volDown) {
        elements.volDown.onclick = () => {
            updateVolume(Math.max(0, state.volume - 0.1));
        };
    }

    // Station Skipping
    elements.nextBtn.onclick = () => {
        if (state.stations.length > 0) {
            const nextIdx = (state.stations.indexOf(state.currentStation) + 1) % state.stations.length;
            playStation(state.stations[nextIdx]);
        }
    };

    elements.prevBtn.onclick = () => {
        if (state.stations.length > 0) {
            const currentIdx = state.stations.indexOf(state.currentStation);
            const prevIdx = (currentIdx - 1 + state.stations.length) % state.stations.length;
            playStation(state.stations[prevIdx]);
        }
    };


    // Onboarding Listeners
    elements.onboardingGenres.forEach(btn => {
        btn.onclick = () => {
            btn.classList.toggle('selected');
            const selectedCount = document.querySelectorAll('.onboarding-genre.selected').length;
            elements.finishOnboarding.disabled = selectedCount < 3;
            if (selectedCount >= 3) {
                elements.finishOnboarding.textContent = 'Ready to Rock!';
            } else {
                elements.finishOnboarding.textContent = `Pick ${3 - selectedCount} more`;
            }
        };
    });

    elements.finishOnboarding.onclick = () => {
        const selected = Array.from(document.querySelectorAll('.onboarding-genre.selected'))
            .map(btn => btn.getAttribute('data-tag'));
        state.preferredGenres = selected;
        localStorage.setItem('preferredGenres', JSON.stringify(selected));
        elements.onboardingModal.classList.add('hidden');
        fetchStations('topvote');
    };

    // Expanded Player Listeners
    const openPlayer = () => elements.expandedOverlay.classList.remove('hidden');
    
    elements.miniArtwork.onclick = openPlayer;
    if (elements.expandTrigger) elements.expandTrigger.onclick = openPlayer;

    elements.expandedClose.onclick = () => {
        elements.expandedOverlay.classList.add('hidden');
    };

    elements.expTogglePlay.onclick = togglePlay;
    elements.expPrev.onclick = () => elements.prevBtn.click();
    elements.expNext.onclick = () => elements.nextBtn.click();
    
    elements.expVolume.oninput = (e) => {
        updateVolume(parseFloat(e.target.value));
    };
}

function showOnboarding() {
    elements.onboardingModal.classList.remove('hidden');
}

// --- Visualizer Logic ---
function setupVisualizer() {
    console.log('Visualizer disabled for stream compatibility.');
}

// Start the app
init();
function renderLocationExplorer(currentCountry) {
    elements.locationExplorer.innerHTML = `
        <div class="location-explorer-bar glass">
            <div class="explorer-notice">
                <i data-lucide="info"></i>
                <p>Location detection might not be exact. Feel free to manually change your region below!</p>
            </div>
            <div class="explorer-controls">
                <div class="explorer-field">
                    <label>Country</label>
                    <select id="countrySelect">
                        <option value="IN" ${currentCountry === 'IN' ? 'selected' : ''}>India</option>
                        <option value="US" ${currentCountry === 'US' ? 'selected' : ''}>USA</option>
                        <option value="GB" ${currentCountry === 'GB' ? 'selected' : ''}>UK</option>
                        <option value="AE" ${currentCountry === 'AE' ? 'selected' : ''}>UAE</option>
                        <option value="PK" ${currentCountry === 'PK' ? 'selected' : ''}>Pakistan</option>
                        <option value="SA" ${currentCountry === 'SA' ? 'selected' : ''}>Saudi Arabia</option>
                    </select>
                </div>
                <div class="explorer-field">
                    <label>Manual Scan</label>
                    <div class="search-input-group">
                        <input type="text" id="manualLocationInput" placeholder="Enter City or State...">
                        <button class="primary-btn" id="manualLocationBtn"><i data-lucide="search"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `;

    elements.locationExplorer.querySelector('#countrySelect').onchange = (e) => {
        fetchStations('local', e.target.value);
    };

    const manualInput = elements.locationExplorer.querySelector('#manualLocationInput');
    const manualBtn = elements.locationExplorer.querySelector('#manualLocationBtn');

    const handleManualSearch = () => {
        const val = manualInput.value.trim();
        if (val) {
            fetchStations('tag', val);
        }
    };

    manualBtn.onclick = handleManualSearch;
    manualInput.onkeypress = (e) => { if (e.key === 'Enter') handleManualSearch(); };

    if (window.lucide) lucide.createIcons({ root: elements.locationExplorer });
}

window.searchByTag = function(tag) {
    fetchStations('tag', tag);
};
