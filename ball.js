// Ball drop: an experimental physics toy for the home page.
// Press the white dot in the nav to drop a ball onto the page text.
// Steer with the Left/Right arrow keys, or by tilting a phone.
(function () {
    'use strict';

    if (typeof Matter === 'undefined') {
        return;
    }

    var Engine = Matter.Engine;
    var Bodies = Matter.Bodies;
    var Body = Matter.Body;
    var Composite = Matter.Composite;
    var Events = Matter.Events;

    var RADIUS = 10;
    // A multiple of 4 puts a flat edge, not a corner, at the bottom of the ball,
    // so it lands flat instead of tipping over and rolling away.
    var BALL_SIDES = 24;
    var STEP_MS = 1000 / 120;      // fixed physics step
    var MAX_FRAME_MS = 50;         // long frames are clamped to this
    // Matter velocities are in px per 1/60s. 18 is 9px per 1/120s step,
    // well under a ball radius plus the height of a line of text.
    var MAX_SPEED = 18;
    var MAX_SPEED_X = 6;
    var PUSH_GROUND = 0.35;        // velocity added per step at full input
    var PUSH_AIR = 0.1;
    var TILT_DEAD_ZONE = 3;        // degrees
    var TILT_FULL = 30;            // degrees
    var FOLLOW_START = 0.6;        // fraction of the viewport height
    var FOLLOW_EASE = 0.15;
    var REST_SPEED = 0.2;
    var FADE_MS = 600;
    var EDGE = 200;                // thickness of the walls and floor
    var SAME_LINE_GAP = 2;         // px between rects that count as touching
    var EDGE_CHANNEL = 28;         // clear space at each side so the ball can always fall
    var ALL_CATEGORIES = 0xFFFFFFFF;

    // Platforms are never taken from inside these.
    var EXCLUDE = '.nav, .mobile-menu, .ball-drop, .drop-ball, script, style, noscript, hr';

    var buttons = document.querySelectorAll('.ball-drop');
    var nav = document.querySelector('.nav');
    if (!buttons.length || !nav) {
        return;
    }

    var engine = Engine.create({
        gravity: { x: 0, y: 1, scale: 0.001 },
        positionIterations: 8,
        velocityIterations: 6
    });

    var staticBodies = [];
    var platforms = [];
    var passThrough = [];          // platforms the ball started inside
    var floorBody = null;
    var built = false;
    var docHeight = 0;
    var viewWidth = 0;
    var lastWidth = window.innerWidth;

    var ball = null;
    var ballEl = null;
    var fading = false;
    var fadeTimer = 0;
    var rafId = 0;
    var lastTime = 0;
    var accumulator = 0;
    var grounded = false;

    var keyLeft = false;
    var keyRight = false;
    var tilt = 0;
    var keysOn = false;
    var orientationOn = false;

    // ---------- Platforms ----------

    function hasZeroOpacity(el, memo) {
        if (!el || el.nodeType !== 1) {
            return false;
        }
        if (memo.has(el)) {
            return memo.get(el);
        }
        var zero = parseFloat(getComputedStyle(el).opacity) === 0 || hasZeroOpacity(el.parentElement, memo);
        memo.set(el, zero);
        return zero;
    }

    // display: none leaves no client rects, so it is caught by the size checks.
    function isHidden(el, memo) {
        var visibility = getComputedStyle(el).visibility;
        return visibility === 'hidden' || visibility === 'collapse' || hasZeroOpacity(el, memo);
    }

    function toDocRect(r, sx, sy) {
        return { l: r.left + sx, t: r.top + sy, r: r.right + sx, b: r.bottom + sy };
    }

    function sameLineNeighbours(a, b) {
        var overlap = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        var minHeight = Math.min(a.b - a.t, b.b - b.t);
        return overlap >= minHeight * 0.5 &&
            a.l <= b.r + SAME_LINE_GAP &&
            b.l <= a.r + SAME_LINE_GAP;
    }

    // Join rects that sit side by side on the same line, so there are no seams.
    function mergeLines(rects) {
        var out = rects.slice();
        var changed = true;
        while (changed) {
            changed = false;
            for (var i = 0; i < out.length; i++) {
                for (var j = i + 1; j < out.length; j++) {
                    if (sameLineNeighbours(out[i], out[j])) {
                        out[i] = {
                            l: Math.min(out[i].l, out[j].l),
                            t: Math.min(out[i].t, out[j].t),
                            r: Math.max(out[i].r, out[j].r),
                            b: Math.max(out[i].b, out[j].b)
                        };
                        out.splice(j, 1);
                        j--;
                        changed = true;
                    }
                }
            }
        }
        return out;
    }

    function collectRects() {
        var memo = new Map();
        var sx = window.scrollX;
        var sy = window.scrollY;
        var textRects = [];
        var boxRects = [];
        var range = document.createRange();
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        var node, parent, list, r, i;

        while ((node = walker.nextNode())) {
            if (!/\S/.test(node.nodeValue)) {
                continue;
            }
            parent = node.parentElement;
            // Text inside a button is covered by the button's own box.
            if (!parent || parent.closest(EXCLUDE + ', button') || isHidden(parent, memo)) {
                continue;
            }
            range.selectNodeContents(node);
            list = range.getClientRects();
            for (i = 0; i < list.length; i++) {
                r = list[i];
                if (r.width >= 1 && r.height >= 1) {
                    textRects.push(toDocRect(r, sx, sy));
                }
            }
        }

        var boxes = document.body.querySelectorAll('img, button');
        for (i = 0; i < boxes.length; i++) {
            if (boxes[i].closest(EXCLUDE) || isHidden(boxes[i], memo)) {
                continue;
            }
            r = boxes[i].getBoundingClientRect();
            if (r.width >= 1 && r.height >= 1) {
                boxRects.push(toDocRect(r, sx, sy));
            }
        }

        return mergeLines(textRects).concat(boxRects);
    }

    function staticRect(x, y, w, h, friction, label) {
        return Bodies.rectangle(x, y, w, h, {
            isStatic: true,
            friction: friction,
            restitution: 0,
            label: label
        });
    }

    function buildWorld() {
        Composite.remove(engine.world, staticBodies);
        staticBodies = [];
        platforms = [];

        viewWidth = document.documentElement.clientWidth;
        docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);

        // Trim platforms clear of the edge channels; drop any with nothing left.
        var minX = EDGE_CHANNEL;
        var maxX = viewWidth - EDGE_CHANNEL;
        collectRects().forEach(function (r) {
            var left = Math.max(r.l, minX);
            var right = Math.min(r.r, maxX);
            if (right <= left) {
                return;
            }
            platforms.push(staticRect((left + right) / 2, (r.t + r.b) / 2, right - left, r.b - r.t, 1, 'platform'));
        });
        staticBodies = platforms.slice();

        // Walls at the viewport edges, floor at the bottom of the document.
        var wallHeight = docHeight + EDGE * 4;
        staticBodies.push(staticRect(-EDGE / 2, docHeight / 2, EDGE, wallHeight, 0, 'wall'));
        staticBodies.push(staticRect(viewWidth + EDGE / 2, docHeight / 2, EDGE, wallHeight, 0, 'wall'));
        floorBody = staticRect(viewWidth / 2, docHeight + EDGE / 2, viewWidth + EDGE * 2, EDGE, 1, 'floor');
        staticBodies.push(floorBody);

        Composite.add(engine.world, staticBodies);
        built = true;

        // The old bodies are gone; if the ball was still falling clear, carry that over.
        if (ball && passThrough.length) {
            passThrough = [];
            startPassThrough();
        }
    }

    // ---------- Starting inside content ----------

    function boundsOverlap(a, b) {
        return a.min.x < b.max.x && a.max.x > b.min.x &&
            a.min.y < b.max.y && a.max.y > b.min.y;
    }

    // Platforms the ball starts inside are ignored until it has fully cleared them.
    function startPassThrough() {
        platforms.forEach(function (platform) {
            if (boundsOverlap(ball.bounds, platform.bounds)) {
                platform.collisionFilter.mask = 0;
                passThrough.push(platform);
            }
        });
    }

    function updatePassThrough() {
        passThrough = passThrough.filter(function (platform) {
            if (boundsOverlap(ball.bounds, platform.bounds)) {
                return true;
            }
            platform.collisionFilter.mask = ALL_CATEGORIES;
            return false;
        });
    }

    function endPassThrough() {
        passThrough.forEach(function (platform) {
            platform.collisionFilter.mask = ALL_CATEGORIES;
        });
        passThrough = [];
    }

    // ---------- Collisions ----------

    function onCollision(event, isStart) {
        if (!ball) {
            return;
        }
        for (var i = 0; i < event.pairs.length; i++) {
            var pair = event.pairs[i];
            if (pair.bodyA !== ball && pair.bodyB !== ball) {
                continue;
            }
            var other = pair.bodyA === ball ? pair.bodyB : pair.bodyA;
            if (isStart && other === floorBody) {
                startFade();
            }
            // A contact below the centre means the ball is on a surface.
            var collision = pair.collision;
            for (var k = 0; k < collision.supportCount; k++) {
                if (collision.supports[k].y > ball.position.y + RADIUS * 0.5) {
                    grounded = true;
                }
            }
        }
    }

    Events.on(engine, 'collisionStart', function (event) {
        onCollision(event, true);
    });
    Events.on(engine, 'collisionActive', function (event) {
        onCollision(event, false);
    });

    // ---------- Loop ----------

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function applyInput() {
        var input = clamp((keyRight ? 1 : 0) - (keyLeft ? 1 : 0) + tilt, -1, 1);
        var v = Body.getVelocity(ball);
        var vx = v.x + input * (grounded ? PUSH_GROUND : PUSH_AIR);
        vx = clamp(vx, -MAX_SPEED_X, MAX_SPEED_X);
        if (vx !== v.x) {
            Body.setVelocity(ball, { x: vx, y: v.y });
        }
    }

    function capSpeed() {
        var v = Body.getVelocity(ball);
        var speed = Math.sqrt(v.x * v.x + v.y * v.y);
        if (speed > MAX_SPEED) {
            Body.setVelocity(ball, { x: v.x * MAX_SPEED / speed, y: v.y * MAX_SPEED / speed });
        }
    }

    function step() {
        applyInput();
        grounded = false;
        Engine.update(engine, STEP_MS);
        if (!ball) {
            return;
        }
        capSpeed();
        if (passThrough.length) {
            updatePassThrough();
        }
        // In case the ball ever slips past the floor.
        if (ball.position.y > docHeight + RADIUS) {
            startFade();
        }
    }

    function render() {
        // Clamp the drawing inside the page so a slight overlap with a wall
        // or the floor never adds a scrollbar.
        var x = clamp(ball.position.x - RADIUS, 0, Math.max(0, viewWidth - RADIUS * 2));
        var y = Math.min(ball.position.y - RADIUS, docHeight - RADIUS * 2);
        ballEl.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
    }

    function follow() {
        if (Body.getSpeed(ball) < REST_SPEED) {
            return;
        }
        var viewHeight = window.innerHeight;
        var current = window.scrollY;
        var maxScroll = document.documentElement.scrollHeight - viewHeight;
        var target = Math.min(ball.position.y - viewHeight * FOLLOW_START, maxScroll);
        if (target <= current) {
            return;
        }
        var delta = Math.max((target - current) * FOLLOW_EASE, Math.min(1, target - current));
        window.scrollTo(window.scrollX, current + delta);
    }

    function frame(now) {
        rafId = 0;
        if (!ball) {
            return;
        }
        accumulator += clamp(now - lastTime, 0, MAX_FRAME_MS);
        lastTime = now;
        while (accumulator >= STEP_MS) {
            accumulator -= STEP_MS;
            step();
            if (!ball) {
                return;
            }
        }
        render();
        follow();
        rafId = requestAnimationFrame(frame);
    }

    // ---------- Ball ----------

    function removeBall() {
        clearTimeout(fadeTimer);
        fadeTimer = 0;
        fading = false;
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = 0;
        }
        endPassThrough();
        if (ball) {
            Composite.remove(engine.world, ball);
            ball = null;
        }
        if (ballEl) {
            ballEl.parentNode.removeChild(ballEl);
            ballEl = null;
        }
    }

    function startFade() {
        if (fading || !ballEl) {
            return;
        }
        fading = true;
        ballEl.classList.add('is-fading');
        fadeTimer = setTimeout(removeBall, FADE_MS);
    }

    // The ball always starts at the horizontal centre, just under the nav.
    function drop() {
        if (!built) {
            buildWorld();
        }
        removeBall();

        var x = document.documentElement.clientWidth / 2 + window.scrollX;
        var y = nav.getBoundingClientRect().bottom + RADIUS + 2 + window.scrollY;

        ball = Bodies.polygon(x, y, BALL_SIDES, RADIUS, {
            restitution: 0.25,
            friction: 0.3,
            frictionStatic: 1,
            frictionAir: 0.01,
            label: 'ball'
        });
        Composite.add(engine.world, ball);
        startPassThrough();

        ballEl = document.createElement('div');
        ballEl.className = 'drop-ball';
        ballEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ballEl);

        grounded = false;
        accumulator = 0;
        lastTime = performance.now();
        render();
        rafId = requestAnimationFrame(frame);
    }

    // ---------- Keyboard ----------

    function isTypingTarget(el) {
        if (!el || el.nodeType !== 1) {
            return false;
        }
        var tag = el.tagName;
        return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function onKeyDown(event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
            return;
        }
        // Leave the browser's Back and Forward shortcuts alone.
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (!ball || isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
            return;
        }
        event.preventDefault();
        if (event.key === 'ArrowLeft') {
            keyLeft = true;
        } else {
            keyRight = true;
        }
    }

    function onKeyUp(event) {
        if (event.key === 'ArrowLeft') {
            keyLeft = false;
        } else if (event.key === 'ArrowRight') {
            keyRight = false;
        }
    }

    function releaseKeys() {
        keyLeft = false;
        keyRight = false;
    }

    // ---------- Tilt ----------

    function screenAngle() {
        var angle = 0;
        if (window.screen && screen.orientation && typeof screen.orientation.angle === 'number') {
            angle = screen.orientation.angle;
        } else if (typeof window.orientation === 'number') {
            angle = window.orientation;
        }
        return ((angle % 360) + 360) % 360;
    }

    function onOrientation(event) {
        if (event.beta === null || event.gamma === null) {
            tilt = 0;
            return;
        }
        // Positive means the visual right side of the screen is lower.
        var degrees;
        var angle = screenAngle();
        if (angle === 90) {
            degrees = event.beta;
        } else if (angle === 270) {
            degrees = -event.beta;
        } else if (angle === 180) {
            degrees = -event.gamma;
        } else {
            degrees = event.gamma;
        }
        var size = Math.abs(degrees);
        tilt = size <= TILT_DEAD_ZONE ? 0 :
            (degrees < 0 ? -1 : 1) * Math.min(1, (size - TILT_DEAD_ZONE) / (TILT_FULL - TILT_DEAD_ZONE));
    }

    function listenOrientation() {
        if (!orientationOn) {
            orientationOn = true;
            window.addEventListener('deviceorientation', onOrientation);
        }
    }

    // Must run directly inside the click handler for the iOS permission prompt.
    function startListening() {
        if (!keysOn) {
            keysOn = true;
            document.addEventListener('keydown', onKeyDown);
            document.addEventListener('keyup', onKeyUp);
            window.addEventListener('blur', releaseKeys);
        }
        if (orientationOn || typeof window.DeviceOrientationEvent === 'undefined') {
            return;
        }
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            var request;
            try {
                request = DeviceOrientationEvent.requestPermission();
            } catch (e) {
                return;
            }
            if (request && typeof request.then === 'function') {
                request.then(function (state) {
                    if (state === 'granted') {
                        listenOrientation();
                    }
                }, function () {});
            }
        } else {
            listenOrientation();
        }
    }

    // ---------- Setup ----------

    function onPress(event) {
        startListening();
        drop();
        // A mouse or touch press (detail > 0) should not leave a focus ring behind;
        // keyboard activation keeps focus on the dot.
        if (event.detail > 0) {
            event.currentTarget.blur();
        }
    }

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', onPress);
    }

    // Phones fire height-only resizes when the address bar hides; ignore those.
    window.addEventListener('resize', function () {
        if (window.innerWidth !== lastWidth) {
            lastWidth = window.innerWidth;
            buildWorld();
        }
    });

    if (document.readyState === 'complete') {
        buildWorld();
    } else {
        window.addEventListener('load', buildWorld);
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(buildWorld);
    }
})();
