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
        // Cleveland local time (America/New_York), 12-hour format e.g. "4:32 PM ET"
        var timeString = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        }).format(new Date()) + ' ET';

        // Display the time
        document.getElementById("live-time").innerText = timeString;

        // Refresh every 30 seconds
        setTimeout(updateTime, 30000);
    }

    updateTime();
});
