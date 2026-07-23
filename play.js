document.addEventListener('DOMContentLoaded', function() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    
    const volumeSlider = document.getElementById('volumeSlider');
    let currentVolume = volumeSlider.value / 100;
    let gainNode = audioContext.createGain();
    gainNode.gain.value = currentVolume;
    gainNode.connect(audioContext.destination);
    
    const buffers = {};
    const soundMap = {
        '01': 'Kick-1.wav',
        '02': 'Kick-2.wav',
        '03': 'Snare-4.wav',
        '04': 'Snare-3.wav',
        '05': 'CHH-1.wav',
        '06': 'CHH-2.wav',
        '07': 'CHH-3.wav',
        '08': 'Perc-1.wav',
        '09': 'Perc-2.wav',
        '10': 'Cym-1.wav',
        '11': '808-dshrp.wav',
        '12': '808-dshrp-oct.wav'
    };
    
    function resumeAudioContext() {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }
    
    async function loadSounds() {
        const loadPromises = Object.entries(soundMap).map(async ([padValue, fileName]) => {
            try {
                const response = await fetch(fileName);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                buffers[padValue] = audioBuffer;
            } catch (error) {
                console.error(`Error loading sound ${fileName}:`, error);
            }
        });
        
        await Promise.all(loadPromises);
    }
    
    function playSound(padValue) {
        resumeAudioContext();
        
        if (buffers[padValue]) {
            const source = audioContext.createBufferSource();
            source.buffer = buffers[padValue];
            source.connect(gainNode);
            source.start(0);
            
            document.getElementById('fileName').innerText = soundMap[padValue];
            document.getElementById('value').innerText = padValue;
        }
    }
    
    function updateVolume() {
        currentVolume = volumeSlider.value / 100;
        gainNode.gain.value = currentVolume;
    }
    
    volumeSlider.addEventListener('input', updateVolume);
    
    const pads = document.querySelectorAll('.pad');
    pads.forEach(pad => {
        ['touchstart', 'click'].forEach(eventType => {
            pad.addEventListener(eventType, function(e) {
                if (eventType === 'touchstart') {
                    e.preventDefault();
                }
                
                resumeAudioContext();
                const padValue = this.getAttribute('value');
                playSound(padValue);
            }, { passive: false });
        });
    });
    
    const keyMap = {
        'KeyA': '01', 
        'KeyS': '02', 
        'KeyD': '03', 
        'KeyF': '04', 
        'KeyG': '05',
        'KeyH': '06',
        'KeyJ': '07',
        'KeyK': '08',
        'KeyL': '09',
        'KeyZ': '10',
        'KeyX': '11',
        'KeyC': '12'
    };
    
    document.addEventListener('keydown', function(event) {
        const padValue = keyMap[event.code];
        if (padValue) {
            resumeAudioContext();
            playSound(padValue);
        }
    });
    
    function toggleMenu() {
        var hamMenu = document.querySelector('.ham-menu');
        var hamDisplay = document.querySelector('.ham-display');
        var hamFooter = document.querySelector('.ham-footer');
        var mobileMenu = document.querySelector('.mobile-menu');
        var body = document.body;
        
        hamMenu.classList.toggle('active');
        hamDisplay.classList.toggle('active');
        hamFooter.classList.toggle('active');
        mobileMenu.classList.toggle('active');
        body.classList.toggle('nav-open');
    }
    
    document.querySelector('.ham-menu').addEventListener('click', toggleMenu);
    
    function updateTime() {
        // Cleveland local time (America/New_York), 12-hour format e.g. "4:32 PM ET"
        var timeString = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).format(new Date()) + ' ET';
        document.getElementById("live-time").innerText = timeString;
        setTimeout(updateTime, 30000);
    }
    
    loadSounds();
    updateTime();
});
