document.addEventListener('DOMContentLoaded', function() {
    
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
