/**
 * JARVIS FM - Core Logic
 */

const API_BASE = 'https://de1.api.radio-browser.info/json';
const USER_AGENT = 'JARVIS-FM/1.0';

// State Management
let state = {
    currentStation: null,
    isPlaying: false,
    volume: 0.7,
    stations: [],
    location: null,
    activeType: 'topvote',
    preferredGenres: JSON.parse(localStorage.getItem('preferredGenres')) || []
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
    navItems: document.querySelectorAll('.nav-item'),
    genreItems: document.querySelectorAll('.genre-item'),
    genreChips: document.querySelectorAll('.chip'),
    onboardingModal: document.getElementById('onboarding-modal'),
    onboardingGenres: document.querySelectorAll('.onboarding-genre'),
    finishOnboarding: document.getElementById('finish-onboarding'),
    volumeProgress: document.getElementById('volume-progress'),
    volumePercent: document.getElementById('volume-percent'),
    volUp: document.getElementById('vol-up'),
    volDown: document.getElementById('vol-down'),
    prevBtn: document.getElementById('prev-station'),
    nextBtn: document.getElementById('next-station')
};

// --- Initialization ---

async function init() {
    setupEventListeners();
    await detectLocation();

    if (state.preferredGenres.length === 0) {
        showOnboarding();
    } else {
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
        elements.sectionTitle.textContent = 'Islamic & Peace Radio';
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
            ? `<img src="${artwork}" onerror="this.style.display='none'" alt="${station.name}">`
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
                if (data.fatal) alert('This HLS stream failed to load.');
            });
        } else if (elements.audioPlayer.canPlayType('application/vnd.apple.mpegurl')) {
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
            console.error('Playback failed:', err);
            alert('This stream is currently unavailable. Try another station.');
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
