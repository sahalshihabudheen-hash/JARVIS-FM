/**
 * JARVIS FM - Core Logic
 */

const MIRRORS = ['de1', 'nl1', 'at1'];
const API_MIRROR = MIRRORS[Math.floor(Math.random() * MIRRORS.length)];
const API_BASE = `https://${API_MIRROR}.api.radio-browser.info/json`;
const USER_AGENT = 'JARVIS-FM/1.0';

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
    setTimeout(() => toast.remove(), 380);
}

// State Management
let state = {
    currentStation: null,
    isPlaying: false,
    volume: 0.7,
    stations: [],
    location: null,
    activeType: 'topvote',
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
    playerBar: document.querySelector('.player-bar')
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
        fetchStations('topvote');
    }

    setupVisualizer();
}

// --- API Logic ---

async function fetchStations(type, query = '') {
    showLoader();
    let url = '';

    if (type === 'topvote') {
        let tag = 'trending';
        if (state.preferredGenres.length > 0) {
            tag = state.preferredGenres[Math.floor(Math.random() * state.preferredGenres.length)];
        } else if (state.location && state.location.country_code === 'IN') {
            tag = 'malayalam';
        }
        url = `${API_BASE}/stations/search?tag=${tag}&limit=30&order=clickcount&reverse=true`;
        elements.sectionTitle.textContent = state.preferredGenres.length > 0
            ? `Picked for You: ${tag.charAt(0).toUpperCase() + tag.slice(1)}`
            : 'Recommended for You';

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
        const response = await fetch(url, { 
            headers: { 'User-Agent': USER_AGENT },
            signal: AbortSignal.timeout(8000) // Timeout after 8s
        });
        const data = await response.json();
        state.stations = data;
        
        // Cache the results for next time
        if (type === 'topvote' || type === 'topclick') {
            localStorage.setItem('cachedStations', JSON.stringify(data));
        }
        
        renderStations(data);
    } catch (error) {
        console.error('Error fetching stations:', error);
        // Only show error if we have no cached data to show
        if (elements.stationList.children.length <= 1) {
            elements.stationList.innerHTML = '<p class="error">Failed to load stations. Please check your connection.</p>';
        }
        showToast('API is slow or unreachable. Showing last known stations.', 'warning');
    }
}

// --- Location Logic ---

async function detectLocation() {
    // Check cache first
    const cachedLoc = localStorage.getItem('userLocation');
    if (cachedLoc) {
        const data = JSON.parse(cachedLoc);
        state.location = data;
        elements.locationText.textContent = `${data.city}, ${data.country_name}`;
    }

    try {
        const response = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
        const data = await response.json();
        state.location = data;
        localStorage.setItem('userLocation', JSON.stringify(data));
        elements.locationText.textContent = `${data.city}, ${data.country_name}`;
    } catch (e) {
        if (!state.location) elements.locationText.textContent = 'Global Mode';
    }
}

// --- UI Rendering ---

function renderStations(stations) {
    elements.stationList.innerHTML = '';

    if (stations.length === 0) {
        elements.stationList.innerHTML = '<p class="no-results">No stations found matching your criteria.</p>';
        return;
    }

    stations.forEach((station, index) => {
        const card = document.createElement('div');
        
        // Randomly assign varied layout classes for a "human" feel
        const isFeatured = index === 0 && stations.length > 5;
        card.className = `station-card glass ${isFeatured ? 'card-featured' : ''}`;

        const artwork = station.favicon || '';
        const artworkHtml = artwork
            ? `<img src="${artwork}" onerror="this.src='https://images.unsplash.com/photo-1590602847861-f357a9332bbc?q=80&w=260&auto=format&fit=crop'; this.onerror=null;" alt="${station.name}">`
            : `<i data-lucide="radio"></i>`;

        // Add contextual badges
        let badgeHtml = '';
        if (index < 3 && state.activeType === 'topvote') {
            badgeHtml = `<div class="card-badge badge-popular"><i data-lucide="trending-up" style="width:10px;height:10px"></i> Popular</div>`;
        } else if (Math.random() > 0.7) {
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
                ${isFeatured ? '<span class="featured-label">Curated for you</span>' : ''}
            </div>
        `;

        card.onclick = () => playStation(station);
        elements.stationList.appendChild(card);
    });

    if (window.lucide) lucide.createIcons();
}

function showLoader() {
    // Only show the big loader if the grid is empty (first load)
    if (elements.stationList.children.length === 0 || elements.stationList.querySelector('.no-results')) {
        elements.stationList.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
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
            artwork.innerHTML = `<img src="${station.favicon}" onerror="this.parentElement.innerHTML='<i data-lucide=\\'radio\\'></i>'; lucide.createIcons();" alt="${station.name}">`;
        } else {
            artwork.innerHTML = `<i data-lucide="radio"></i>`;
            lucide.createIcons();
        }
    }

    // Show the player bar and adjust layout
    elements.playerBar.classList.add('visible');
    document.body.classList.add('player-visible');

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
    if (!playBtn) return;
    
    // Replace the inner HTML to ensure Lucide can re-render the icon correctly
    playBtn.innerHTML = `<i data-lucide="${state.isPlaying ? 'pause' : 'play'}"></i>`;
    lucide.createIcons();
    
    // Toggle visualizer animation
    const vis = document.getElementById('visualizer-pill');
    if (vis) {
        vis.style.opacity = state.isPlaying ? '1' : '0.3';
        const bars = vis.querySelectorAll('.vis-bar');
        bars.forEach(bar => {
            bar.style.animationPlayState = state.isPlaying ? 'running' : 'paused';
        });
    }
}

function updateVolume(vol) {
    elements.audioPlayer.volume = vol;
    state.volume = vol;
    elements.volumeSlider.value = vol;
    elements.volumeProgress.style.width = `${vol * 100}%`;
    elements.volumePercent.textContent = `${Math.round(vol * 100)}%`;
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
                fetchStations('search', query).then(refreshAnimations);
            }, 500);
        } else if (query.length === 0) {
            fetchStations(state.activeType).then(refreshAnimations);
        }
    };

    // Navigation
    elements.navItems.forEach(item => {
        item.onclick = () => {
            elements.navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            const type = item.getAttribute('data-type');
            state.activeType = type;
            fetchStations(type).then(refreshAnimations);
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

    elements.volUp.onclick = () => {
        updateVolume(Math.min(1, state.volume + 0.1));
    };

    elements.volDown.onclick = () => {
        updateVolume(Math.max(0, state.volume - 0.1));
    };

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
