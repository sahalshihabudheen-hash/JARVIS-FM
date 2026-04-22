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
    locationText: document.getElementById('location-text'),
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

    if (type === 'home') {
        const tagList = state.preferredGenres.length > 0 
            ? state.preferredGenres.join(',') 
            : 'mixed';
        url = `${API_BASE}/stations/search?tagList=${tagList}&tagExact=false&order=clickcount&reverse=true&limit=60`;
        elements.sectionTitle.textContent = 'For You';
        elements.sectionSubtitle.textContent = `Personalized stations based on your interest in ${state.preferredGenres.slice(0, 3).join(', ')}`;

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
        url = `${API_BASE}/stations/search?language=malayalam&order=clickcount&reverse=true&limit=60`;
        elements.sectionTitle.textContent = 'Malayalam Stations (Kerala)';

    } else if (type === 'islamic') {
        url = `${API_BASE}/stations/search?tag=islamic&limit=60&order=clickcount&reverse=true`;
        elements.sectionTitle.textContent = 'Peace & Serenity';
        elements.sectionSubtitle.textContent = 'Spiritual and calming signals from around the world';

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
        elements.stationList.innerHTML = '<p class="no-results">No stations found matching your criteria.</p>';
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

function renderSection(title, subtitle, stations) {
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
            ? `<img src="${artwork}" loading="lazy" onerror="this.src='/logo.png'; this.className='placeholder-logo'; this.onerror=null;" alt="${station.name}">`
            : `<img src="/logo.png" class="placeholder-logo" alt="JARVIS FM">`;

        // Add contextual badges
        let badgeHtml = '';
        if (title === 'Live Now') {
            badgeHtml = `<div class="card-badge badge-live">Live</div>`;
        } else if (index < 2 && state.activeType === 'topvote') {
            badgeHtml = `<div class="card-badge badge-popular"><i data-lucide="trending-up" style="width:10px;height:10px"></i> Popular</div>`;
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

    elements.stationList.appendChild(section);

    if (window.lucide) {
        lucide.createIcons({
            attrs: { class: 'lucide-icon' },
            nameAttr: 'data-lucide',
            root: grid
        });
    }
}

function showLoader() {
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
            <div class="divider-line"></div>
            <div class="carousel-nav">
                <button class="nav-btn prev-btn"><i data-lucide="chevron-left"></i></button>
                <button class="nav-btn next-btn"><i data-lucide="chevron-right"></i></button>
            </div>
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
        
        const artwork = station.favicon || '/logo.png';
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
