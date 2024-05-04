document.addEventListener('DOMContentLoaded', function() {
    const volumeSlider = document.getElementById('volumeSlider');
    let currentVolume = volumeSlider.value / 100;
    let sounds = {};

    // Preload all sounds
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

    Object.keys(soundMap).forEach(padValue => {
        sounds[padValue] = new Audio(soundMap[padValue]);
    });

    function updateVolume() {
        currentVolume = volumeSlider.value / 100;
        Object.values(sounds).forEach(audio => {
            audio.volume = currentVolume;
        });
    }

    volumeSlider.addEventListener('input', updateVolume);

    const pads = document.querySelectorAll('.pad');
    pads.forEach(pad => {
        pad.addEventListener('click', function() {
            const padValue = this.getAttribute('value');
            if (sounds[padValue]) {
                sounds[padValue].volume = currentVolume;
                sounds[padValue].currentTime = 0;
                sounds[padValue].play();
                document.getElementById('fileName').innerText = soundMap[padValue];
                document.getElementById('value').innerText = padValue;
            }
        });
    });

    updateVolume();

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
        if (padValue && sounds[padValue]) {
            sounds[padValue].volume = currentVolume;
            sounds[padValue].currentTime = 0;
            sounds[padValue].play();
            document.getElementById('fileName').innerText = soundMap[padValue];
            document.getElementById('value').innerText = padValue;
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
        var currentTime = new Date();
        var hours = currentTime.getHours();
        var minutes = currentTime.getMinutes();
        var seconds = currentTime.getSeconds();
        
        minutes = (minutes < 10 ? "0" : "") + minutes;
        seconds = (seconds < 10 ? "0" : "") + seconds;
        var ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        var timeString = hours + ":" + minutes + ":" + seconds + " " + ampm + " EST";

        document.getElementById("live-time").innerText = timeString;
        setTimeout(updateTime, 1000);
    }

    updateTime();
});
