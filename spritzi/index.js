var btns = document.getElementsByClassName('pag-btn');
var cans = document.getElementsByClassName('can');
var currentIndex = 0;
var interval = 6000;
var autoScrollInterval;

function autoScroll() {
    currentIndex++;

    if(currentIndex >= cans.length) {
        currentIndex = 0;
    }

    var nextButton = btns[currentIndex];
    nextButton.click();
}

autoScrollInterval = setInterval(autoScroll, interval);

function startAutoScroll() {
    clearInterval(autoScrollInterval);
    autoScrollInterval = setInterval(autoScroll, interval);
}

function activeBtn(event){
    var curr = event.target;

    if(curr.classList.contains('active-btn')) {
        return false;
    }                

    else {
        for(var i = 0; i < btns.length; i++){
            btns[i].classList.remove('active-btn');
        }

        curr.classList.add('active-btn');
        changeBackground(event);
        startAutoScroll();
    }
}

function canSwap(event) {
    var curr = event.target;
    currValue = curr.getAttribute('value');

    for(var i = 0; i < cans.length; i++) { 
        cans[i].classList.remove('active-can')
    }

    for(var i = 0; i < cans.length; i++) {
        var canValue = cans[i].getAttribute('value');

        if(canValue === currValue) {
            cans[i].classList.add('active-can');
            startAutoScroll();
            break;
        }
     }
}

function changeBackground(event) {
    var rightContainer = document.querySelector('.right-container');
    rightContainer.classList.remove('straw-bg', 'og-bg', 'gf-bg');

    var btnValue = event.target.getAttribute('value'); 

    switch (btnValue) {
        case '1':
            rightContainer.classList.add('straw-bg');
            break;
        case '2':
            rightContainer.classList.add('og-bg');
            break;
        case '3':
            rightContainer.classList.add('gf-bg');
            break;
    }
}

function toggleMenu() {
    var hamMenu = document.querySelector('.ham-menu');
    var hamDisplay = document.querySelector('.ham-display');
    var mobileMenu = document.querySelector('.mobile-menu');
    var body = document.body;

    hamMenu.classList.toggle('active');
    hamDisplay.classList.toggle('active');
    mobileMenu.classList.toggle('active');
    body.classList.toggle('nav-open');
}

// Swipe functionality
let touchstartX = 0;
let touchendX = 0;
const imgContainer = document.querySelector('.img-container');

imgContainer.addEventListener('touchstart', (e) => {
    touchstartX = e.changedTouches[0].screenX;
}, false);

imgContainer.addEventListener('touchend', (e) => {
    touchendX = e.changedTouches[0].screenX;
    handleSwipeGesture();
}, false);

function handleSwipeGesture() {
    if (touchendX < touchstartX) {
        moveRight();
    }
    if (touchendX > touchstartX) {
        moveLeft();
    }
}

function moveRight() {
    currentIndex = (currentIndex + 1) % cans.length;
    updateDisplay();
}

function moveLeft() {
    currentIndex = (currentIndex - 1 + cans.length) % cans.length;
    updateDisplay();
}

function updateDisplay() {
    for (let i = 0; i < cans.length; i++) {
        cans[i].classList.remove('active-can');
        btns[i].classList.remove('active-btn');
    }
    cans[currentIndex].classList.add('active-can');
    btns[currentIndex].classList.add('active-btn');
    changeBackground({ target: btns[currentIndex] });
}

document.querySelector('.ham-menu').addEventListener('click', toggleMenu);
