document.addEventListener('DOMContentLoaded', function() {
    // Get the volume slider
    const volumeSlider = document.getElementById('volumeSlider');
    // Set currentVolume based on fader's initial position
    let sounds = {};  
    let currentVolume = volumeSlider.value / 100;

    
    function updateVolume() {
        currentVolume = volumeSlider.value / 100; 
        Object.values(sounds).forEach(audio => {
            audio.volume = currentVolume;
        });
    }

    // Listen for changes on the volume slider
    volumeSlider.addEventListener('input', updateVolume);

    // Mapping of pad values to sound file names
    const soundMap = {
        '01': 'big-kick.wav',
        '02': 'dnb-snare.wav',
        '03': 'SOUL - Snare 1.wav',
        '04': 'SOUL - CL 1.wav',
        '05': 'chord-stab-dshrp.mp3',
        '06': '',
        '07': 'sound7.wav',
        '08': 'sound8.wav',
        '09': 'sound9.wav',
        '10': 'sound10.wav',
        '11': 'sound11.wav',
        '12': 'sound12.wav'
    };

    // Select all pads
    const pads = document.querySelectorAll('.pad');

    pads.forEach(pad => {
        pad.addEventListener('click', function() {
            const padValue = this.getAttribute('value');
            const soundFile = soundMap[padValue]; 

            if (soundFile) {
                // Check if the Audio object exists
                if (!sounds[padValue]) {
                    sounds[padValue] = new Audio(soundFile);
                }

                // Set the sound's volume to currentVolume before playing
                sounds[padValue].volume = currentVolume;
                
                // Play sound
                sounds[padValue].currentTime = 0; // Rewind to the start
                sounds[padValue].play();

                // Update display
                document.getElementById('fileName').innerText = soundFile;
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

    // Listen for key presses
    document.addEventListener('keydown', function(event) {
         // Get the pad value based on the pressed key
        const padValue = keyMap[event.code];
        if (padValue) {
            // Get the sound file from the existing soundMap
            const soundFile = soundMap[padValue]; 

            if (soundFile) {
                // Check if Audio object already exists
                if (!sounds[padValue]) {
                    sounds[padValue] = new Audio(soundFile);
                }

                // Set volume and play sound
                sounds[padValue].volume = currentVolume;
                sounds[padValue].currentTime = 0; // Rewind to the start
                sounds[padValue].play();

                // Update display
                document.getElementById('fileName').innerText = soundFile;
                document.getElementById('value').innerText = padValue;
            }
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

    // Add event listener for ham-menu
    document.querySelector('.ham-menu').addEventListener('click', toggleMenu);

    function updateTime() {
        var currentTime = new Date();
        var hours = currentTime.getHours();
        var minutes = currentTime.getMinutes();
        var seconds = currentTime.getSeconds();
        
        // Format
        minutes = (minutes < 10 ? "0" : "") + minutes;
        seconds = (seconds < 10 ? "0" : "") + seconds;

        // Format time in 12-hour format with AM/PM
        var ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 should be displayed as 12
        var timeString = hours + ":" + minutes + ":" + seconds + " " + ampm + " EST";

        // Display the time
        document.getElementById("live-time").innerText = timeString;

        // Update time per second
        setTimeout(updateTime, 1000);
    }

    updateTime();
});
