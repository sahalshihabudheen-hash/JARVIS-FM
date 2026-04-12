/**
 * Cosmic Radio - Core Logic
 */

const API_BASE = 'https://de1.api.radio-browser.info/json';
const USER_AGENT = 'CosmicRadio/1.0';

// State Management
let state = {
    currentStation: null,
    isPlaying: false,
    volume: 0.7,
    stations: [],
    location: null,
    activeType: 'topvote'
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
    currentArtwork: document.getElementById('current-artwork'),
    sectionTitle: document.getElementById('section-title'),
    navItems: document.querySelectorAll('.nav-item'),
    genreItems: document.querySelectorAll('.genre-item'),
    genreChips: document.querySelectorAll('.chip')
};

// --- Initialization ---

async function init() {
    setupEventListeners();
    await detectLocation();
    fetchStations('topvote'); // Default view
    setupVisualizer();
}

// --- API Logic ---

async function fetchStations(type, query = '', params = {}) {
    showLoader();
    let url = '';
    
    switch(type) {
        case 'topvote':
            // Hybrid view: Local stations first, then global top vote
            const localTag = state.location?.country_code === 'IN' ? 'malayalam' : 'trending';
            url = `${API_BASE}/stations/search?tag=${localTag}&limit=20&order=clickcount&reverse=true`;
            elements.sectionTitle.textContent = `Recommended for You`;
            break;
        case 'topclick':
            url = `${API_BASE}/stations/topclick/20`;
            elements.sectionTitle.textContent = 'Most Popular';
            break;
        case 'search':
            url = `${API_BASE}/stations/search?name=${query}&limit=50&order=clickcount&reverse=true`;
            elements.sectionTitle.textContent = `Results for "${query}"`;
            break;
        case 'tag':
            url = `${API_BASE}/stations/bytag/${query}?limit=30&order=clickcount&reverse=true`;
            elements.sectionTitle.textContent = `${query.toUpperCase()} Stations`;
            break;
        case 'local':
            const stateName = state.location?.region || 'Kerala';
            const countryCode = state.location?.country_code || 'IN';
            // Search primarily by Malayalam language to ensure Kerala stations
            url = `${API_BASE}/stations/search?language=malayalam&order=clickcount&reverse=true&limit=60`;
            elements.sectionTitle.textContent = `Malayalam Stations (Kerala)`;
            break;
        case 'islamic':
            // Broader search to ensure results
            url = `${API_BASE}/stations/search?tag=islamic&limit=60&order=clickcount&reverse=true`;
            elements.sectionTitle.textContent = `Islamic & Peace Radio`;
            break;
    }

    try {
        const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
        const data = await response.json();
        state.stations = data;
        renderStations(data);
    } catch (error) {
        console.error('Error fetching stations:', error);
        elements.stationList.innerHTML = '<p class="error">Failed to load stations. Please try again.</p>';
    }
}

// --- Location Logic ---

async function detectLocation() {
    try {
        // Using ipapi.co for quick location without user permission prompt for better UX initially
        // but fallback to browser geolocation for precise results if needed.
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        state.location = data;
        elements.locationText.textContent = `${data.city}, ${data.country_name}`;
    } catch (e) {
        elements.locationText.textContent = 'Unknown Location';
    }
}

// --- UI Rendering ---

function renderStations(stations) {
    elements.stationList.innerHTML = '';
    
    if (stations.length === 0) {
        elements.stationList.innerHTML = '<p class="no-results">No stations found matching your criteria.</p>';
        return;
    }

    stations.forEach(station => {
        const card = document.createElement('div');
        card.className = 'station-card glass';
        
        const artwork = station.favicon || '';
        const artworkHtml = artwork 
            ? `<img src="${artwork}" onerror="this.src='https://via.placeholder.com/200/8b5cf6/ffffff?text=${encodeURIComponent(station.name[0])}'" alt="${station.name}">`
            : `<i data-lucide="radio"></i>`;

        card.innerHTML = `
            <div class="station-card-artwork">
                ${artworkHtml}
                <div class="play-overlay">
                    <i data-lucide="play-circle"></i>
                </div>
            </div>
            <div class="station-card-info">
                <h5>${station.name}</h5>
                <p>${station.tags.split(',').slice(0, 2).join(', ') || 'Global'}</p>
            </div>
        `;

        card.onclick = () => playStation(station);
        elements.stationList.appendChild(card);
    });

    // Re-init icons for newly added elements
    if (window.lucide) lucide.createIcons();
}

function showLoader() {
    elements.stationList.innerHTML = '<div class="loader-container"><div class="loader"></div></div>';
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
    
    if (station.favicon) {
        elements.currentArtwork.innerHTML = `<img src="${station.favicon}" alt="${station.name}">`;
    } else {
        elements.currentArtwork.innerHTML = `<i data-lucide="music"></i>`;
        lucide.createIcons();
    }

    const streamUrl = station.url_resolved || station.url;
    
    if (streamUrl.includes('.m3u8')) {
        if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(elements.audioPlayer);
            hls.on(Hls.Events.MANIFEST_PARSED, function() {
                startPlayback();
            });
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) alert("This HLS stream failed to load.");
            });
        } else if (elements.audioPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari native HLS
            elements.audioPlayer.src = streamUrl;
            startPlayback();
        } else {
            alert("Your browser doesn't support this stream format.");
        }
    } else {
        elements.audioPlayer.src = streamUrl;
        startPlayback();
    }
}

function startPlayback() {
    elements.audioPlayer.play()
        .then(() => {
            state.isPlaying = true;
            updatePlayUI();
            elements.togglePlay.disabled = false;
        })
        .catch(err => {
            console.error("Playback failed:", err);
            alert("This stream is currently unavailable. Try another station.");
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
    elements.playIcon.setAttribute('data-lucide', state.isPlaying ? 'pause' : 'play');
    lucide.createIcons();
}

// --- Event Listeners ---

function setupEventListeners() {
    // Search
    let timeout = null;
    elements.stationSearch.oninput = (e) => {
        clearTimeout(timeout);
        const query = e.target.value;
        if (query.length > 2) {
            timeout = setTimeout(() => fetchStations('search', query), 500);
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

    // Genres
    elements.genreItems.forEach(item => {
        item.onclick = () => {
            const tag = item.getAttribute('data-tag');
            fetchStations('tag', tag);
        };
    });

    // Player Controls
    elements.togglePlay.onclick = togglePlay;
    elements.volumeSlider.oninput = (e) => {
        const vol = e.target.value;
        elements.audioPlayer.volume = vol;
        state.volume = vol;
    };

    // Genre Chips
    elements.genreChips.forEach(chip => {
        chip.onclick = () => {
            elements.genreChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            
            const tag = chip.getAttribute('data-tag');
            if (tag === 'trending') {
                fetchStations('topvote');
            } else if (tag === 'malayalam') {
                fetchStations('local');
            } else {
                fetchStations('tag', tag);
            }
        };
    });
}

// --- Visualizer Logic --- (Simplified/Removed for maximum compatibility)
function setupVisualizer() {
    // We'll keep the function signature to avoid errors, but skip the MediaElementSource 
    // connection which causes silent audio on cross-origin streams.
    console.log("Visualizer disabled for stream compatibility.");
}

// Start the app
init();
