// Ball drop: an experimental physics toy for the home page.
// Press the white dot in the nav to drop a ball onto the page text.
// Steer with the Left/Right arrow keys, or by tilting a phone.
// Jump with the Up arrow key, or by tapping on a phone: two jumps before landing.
// A hard enough hit knocks the letters under the ball loose, and fast loose letters
// can knock more letters loose in turn.
// When the ball reaches the footer line, the footer turns into a short side-scrolling run.
// Pressing the dot while a game is on ends it.
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
    var Sleeping = Matter.Sleeping;

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

    var PX_PER_SECOND = 60;        // Matter velocity units to px per second
    var JUMP_SPEED = 7.3;          // upward velocity of a jump; lifts the ball about 80px
    var JUMPS = 2;
    var TAP_MS = 250;
    var TAP_MOVE = 10;             // px
    var BREAK_SPEED = 300;         // px per second into a line of text that knocks letters loose
    var BREAK_REACH = 40;          // px each side of the ball's centre
    var BREAK_KEEP = 0.4;          // share of its velocity the ball keeps after a break
    var CHAIN_SPEED = 375;         // px per second at which a loose letter knocks text loose
    var CHAIN_KEEP = 0.6;          // share of its velocity a loose letter keeps after a break
    var MAX_LOOSE = 400;
    var RETURN_MS = 800;
    var CLICK_AFTER_TOUCH_MS = 1000; // a click this soon after a touch came from that touch

    // Footer game
    // The nominal speed rises steadily from the start speed to the end speed at the flag, 60 seconds in.
    var GAME_SPEED_START = 220;    // px per second
    var GAME_SPEED_END = 440;
    var GAME_RUN_S = 60;           // run time at the flag
    var GAME_PHASE_S = 15;         // the platforms change colour at the start of each phase
    var GAME_PHASES = ['', 'is-red', 'is-green', 'is-blue'];
    // The most nominal px any landing platform lies ahead of the ball 0.4s before the latest jump for it.
    // Narrower stages scale the on-screen speed down so that much always fits in front of the ball.
    var GAME_LOOK_AHEAD = 580;
    var HIGH_SCORE_KEY = 'ball-drop-high-score';
    var GAME_BALL_AT = 0.25;       // the ball's place across the stage
    var GAME_OVERHANG = 60;        // px the drawing area reaches above the stage, for the drop from the line
    var GAME_GLIDE_MS = 600;       // the carried-over ball moves to its place as it drops
    var GAME_FADE_MS = 800;
    var GAME_RESTART_MS = 500;
    var GAME_FINISH_MS = 2000;
    var PX_PER_METRE = 10;
    var SMALL_SCREEN = '(max-width: 800px)';
    // The ball rises and falls as the page ball does, with Matter's gravity and the ball's air friction.
    var BASE_MS = 1000 / PX_PER_SECOND;                 // Matter's velocity unit
    var GAME_GRAVITY = 0.001 * STEP_MS * STEP_MS;       // px per step, added every step
    var GAME_AIR = 1 - 0.01 * STEP_MS / BASE_MS;
    var GAME_JUMP = JUMP_SPEED * STEP_MS / BASE_MS;     // px per step
    var GAME_MAX_STEP = MAX_SPEED * STEP_MS / BASE_MS;
    // Platforms: the run times, in seconds, at which the ball reaches each end, and the height above
    // the stage bottom in px. The first platform starts at the stage's left edge. Four phases of
    // 15 seconds, each with shorter platforms, bigger steps, tighter timing and more double jumps.
    var COURSE = [
        [null, 2.50, 60],
        [2.80, 4.20, 90],
        [4.68, 5.88, 50],
        [6.75, 8.15, 70],          // double jump
        [8.34, 9.54, 130],
        [10.09, 11.29, 60],
        [11.99, 13.29, 150],       // double jump
        [13.84, 15.04, 80],
        [15.42, 16.62, 80],
        [16.98, 17.88, 120],
        [18.50, 19.35, 60],
        [20.23, 21.13, 130],       // double jump
        [21.73, 22.58, 80],
        [23.42, 24.32, 160],       // double jump
        [24.98, 25.83, 80],
        [26.77, 27.67, 120],       // double jump
        [28.25, 29.10, 80],
        [29.37, 30.17, 140],
        [30.89, 31.59, 50],
        [32.42, 33.17, 150],       // double jump
        [33.85, 34.55, 80],
        [35.43, 36.18, 160],       // double jump
        [36.91, 37.61, 60],
        [38.57, 39.27, 110],       // double jump
        [39.62, 40.37, 160],
        [41.10, 41.95, 60],
        [42.78, 43.73, 160],       // double jump
        [44.48, 45.08, 50],
        [45.95, 46.50, 160],       // double jump
        [47.34, 47.84, 40],
        [48.67, 49.22, 160],       // double jump
        [50.01, 50.51, 70],
        [51.44, 51.99, 160],       // double jump
        [52.80, 53.30, 60],
        [54.20, 54.75, 160],       // double jump
        [55.51, 56.01, 80],
        [56.96, 57.51, 160],       // double jump
        [58.19, 60.40, 120]
    ];

    // Collision categories: platforms, walls and the floor keep Matter's default.
    var CAT_BALL = 0x0002;
    var CAT_CHAR = 0x0004;
    var NOT_BALL = ALL_CATEGORIES ^ CAT_BALL;
    var NOT_CHAR = ALL_CATEGORIES ^ CAT_CHAR;
    var ACTIVE_CLASS = 'ball-drop-active';

    // Platforms are never taken from inside these.
    var EXCLUDE = '.nav, .mobile-menu, .ball-drop, .drop-ball, .drop-char, .drop-stage, script, style, noscript, hr';
    var TAP_IGNORE = 'a, button, input, select, textarea';
    // Links and buttons a touch tap always follows, even while a game is on.
    var KEEP_CONTROLS = '.nav, .mobile-menu, .drop-exit';
    var FOOTER_ROWS = '.mobile-name, .footer-links, .footer';
    var HIGHLIGHT_NAME = 'drop-broken';

    var buttons = document.querySelectorAll('.ball-drop');
    var nav = document.querySelector('.nav');
    if (!buttons.length || !nav) {
        return;
    }
    var footerLine = document.querySelector('hr.footer-divider');

    // Broken letters are hidden with a highlight, which leaves the DOM and layout untouched.
    var canBreak = !!(window.CSS && CSS.highlights && typeof window.Highlight === 'function');
    var brokenHighlight = null;

    var engine = Engine.create({
        gravity: { x: 0, y: 1, scale: 0.001 },
        positionIterations: 8,
        velocityIterations: 6,
        enableSleeping: true
    });

    var platforms = [];
    var edges = [];                // walls and floor
    var passThrough = [];          // platforms the ball started inside
    var floorBody = null;
    var floorIsLine = false;       // the floor is the footer divider, where the footer game starts
    var built = false;
    var docHeight = 0;
    var floorY = 0;
    var viewWidth = 0;
    var lastWidth = window.innerWidth;
    var charCache = new Map();     // text node -> measured characters

    var ball = null;
    var ballEl = null;
    var fading = false;
    var fadeTimer = 0;
    var rafId = 0;
    var lastTime = 0;
    var accumulator = 0;
    var grounded = false;
    var jumpsLeft = 0;
    var ballVelocity = { x: 0, y: 0 };

    var loose = [];                // loose characters, oldest first
    var broken = false;
    var pendingBreaks = [];
    var pendingFloor = [];
    var returnTimer = 0;

    var keyLeft = false;
    var keyRight = false;
    var tilt = 0;
    var keysOn = false;
    var orientationOn = false;
    var tap = null;
    var lastTouchEnd = null;

    var reachedFooter = false;
    var game = null;

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
                            b: Math.max(out[i].b, out[j].b),
                            nodes: out[i].nodes.concat(out[j].nodes.filter(function (node) {
                                return out[i].nodes.indexOf(node) === -1;
                            }))
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

    // Text and boxes below the footer divider are not part of the course.
    function collectRects() {
        var memo = new Map();
        var sx = window.scrollX;
        var sy = window.scrollY;
        var textRects = [];
        var boxRects = [];
        var range = document.createRange();
        var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        var node, parent, list, r, rect, i;

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
                    rect = toDocRect(r, sx, sy);
                    if (rect.t < floorY) {
                        rect.nodes = [node];
                        textRects.push(rect);
                    }
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
                rect = toDocRect(r, sx, sy);
                if (rect.t < floorY) {
                    boxRects.push(rect);
                }
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

    // Trim a platform clear of the edge channels; a platform with nothing left is dropped.
    // `text` is null for images and buttons, which never break.
    function addPlatform(rect, text) {
        var left = Math.max(rect.l, EDGE_CHANNEL);
        var right = Math.min(rect.r, viewWidth - EDGE_CHANNEL);
        if (right <= left) {
            return;
        }
        var body = staticRect((left + right) / 2, (rect.t + rect.b) / 2, right - left, rect.b - rect.t, 1, 'platform');
        body.text = text;
        platforms.push(body);
        Composite.add(engine.world, body);
    }

    function removePlatform(body) {
        Composite.remove(engine.world, body);
        platforms.splice(platforms.indexOf(body), 1);
        var index = passThrough.indexOf(body);
        if (index !== -1) {
            passThrough.splice(index, 1);
        }
    }

    function footerTop() {
        floorIsLine = false;
        if (footerLine) {
            var r = footerLine.getBoundingClientRect();
            if (r.width || r.height) {
                floorIsLine = true;
                return r.top + window.scrollY;
            }
        }
        return docHeight;
    }

    function buildWorld() {
        Composite.remove(engine.world, platforms.concat(edges));
        platforms = [];
        edges = [];
        charCache = new Map();

        viewWidth = document.documentElement.clientWidth;
        docHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        floorY = footerTop();

        collectRects().forEach(function (r) {
            addPlatform(r, r.nodes ? { nodes: r.nodes, rect: r, chars: null } : null);
        });

        // Walls at the viewport edges, floor at the top of the footer divider.
        var wallHeight = floorY + EDGE * 4;
        edges.push(staticRect(-EDGE / 2, floorY / 2, EDGE, wallHeight, 0, 'wall'));
        edges.push(staticRect(viewWidth + EDGE / 2, floorY / 2, EDGE, wallHeight, 0, 'wall'));
        floorBody = staticRect(viewWidth / 2, floorY + EDGE / 2, viewWidth + EDGE * 2, EDGE, 1, 'floor');
        edges.push(floorBody);
        Composite.add(engine.world, edges);
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

    // Platforms the ball starts inside let the ball through until it has fully
    // cleared them. Loose letters still collide with them.
    function startPassThrough() {
        platforms.forEach(function (platform) {
            if (boundsOverlap(ball.bounds, platform.bounds)) {
                platform.collisionFilter.mask = NOT_BALL;
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

    // ---------- Breaking text ----------

    function nodeChars(node) {
        var list = charCache.get(node);
        if (list) {
            return list;
        }
        list = [];
        var text = node.nodeValue;
        var range = document.createRange();
        var sx = window.scrollX;
        var sy = window.scrollY;
        for (var i = 0; i < text.length; i++) {
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            var rects = range.getClientRects();
            for (var k = 0; k < rects.length; k++) {
                // Collapsed white space has no size and is skipped.
                if (rects[k].width > 0 && rects[k].height > 0) {
                    list.push({ node: node, index: i, ch: text.charAt(i), rect: toDocRect(rects[k], sx, sy) });
                    break;
                }
            }
        }
        charCache.set(node, list);
        return list;
    }

    // The characters on a line platform, left to right.
    function platformChars(platform) {
        var text = platform.text;
        if (!text.chars) {
            var line = text.rect;
            var chars = [];
            text.nodes.forEach(function (node) {
                nodeChars(node).forEach(function (c) {
                    var cx = (c.rect.l + c.rect.r) / 2;
                    var cy = (c.rect.t + c.rect.b) / 2;
                    if (cy >= line.t && cy <= line.b && cx >= line.l - 1 && cx <= line.r + 1) {
                        chars.push(c);
                    }
                });
            });
            chars.sort(function (a, b) {
                return a.rect.l - b.rect.l;
            });
            text.chars = chars;
        }
        return text.chars;
    }

    // Every non-space character on the line whose box overlaps the span from left to right.
    function charsUnder(platform, left, right) {
        return platformChars(platform).filter(function (c) {
            return /\S/.test(c.ch) && c.rect.r > left && c.rect.l < right;
        });
    }

    // How fast a body was moving into the platform along the contact normal, in px per second.
    function impactSpeed(pair, body, velocity, platform) {
        var normal = pair.collision.normal;
        var nx = normal.x;
        var ny = normal.y;
        // Point the normal from the body towards the platform.
        if (nx * (platform.position.x - body.position.x) + ny * (platform.position.y - body.position.y) < 0) {
            nx = -nx;
            ny = -ny;
        }
        return (velocity.x * nx + velocity.y * ny) * PX_PER_SECOND;
    }

    function breakPending(platform) {
        return pendingBreaks.some(function (found) {
            return found.platform === platform;
        });
    }

    function addRun(run) {
        while (run.length && !/\S/.test(run[0].ch)) {
            run.shift();
        }
        while (run.length && !/\S/.test(run[run.length - 1].ch)) {
            run.pop();
        }
        if (!run.length) {
            return;
        }
        var rect = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };
        run.forEach(function (c) {
            rect.l = Math.min(rect.l, c.rect.l);
            rect.t = Math.min(rect.t, c.rect.t);
            rect.r = Math.max(rect.r, c.rect.r);
            rect.b = Math.max(rect.b, c.rect.b);
        });
        addPlatform(rect, { nodes: null, rect: rect, chars: run });
    }

    function wakeLooseNear(bounds) {
        var area = { min: { x: bounds.min.x - 40, y: bounds.min.y - 60 }, max: { x: bounds.max.x + 40, y: bounds.max.y + 10 } };
        loose.forEach(function (item) {
            if (item.body && item.body.isSleeping && boundsOverlap(item.body.bounds, area)) {
                Sleeping.set(item.body, false);
            }
        });
    }

    // The line's platform is replaced by platforms for the characters that remain.
    function applyBreak(found) {
        // The letter that hit the line has been removed since, by the limit on loose letters: ignore it.
        if (found.by && !found.by.body) {
            return;
        }
        var platform = found.platform;
        var chars = platformChars(platform);
        var bounds = platform.bounds;
        removePlatform(platform);

        var run = [];
        chars.forEach(function (c) {
            if (found.hit.indexOf(c) === -1) {
                run.push(c);
            } else {
                addRun(run);
                run = [];
            }
        });
        addRun(run);

        found.hit.forEach(function (c) {
            addLoose(c, found.velocity, found.by);
        });
        trimLoose();
        wakeLooseNear(bounds);
        broken = true;

        // The ball or letter that broke the line carries on through the gap.
        var keep = found.by ? CHAIN_KEEP : BREAK_KEEP;
        var hitter = found.by ? found.by.body : ball;
        if (hitter) {
            Body.setVelocity(hitter, { x: found.velocity.x * keep, y: found.velocity.y * keep });
        }
    }

    // ---------- Loose characters ----------

    function effectiveOpacity(el) {
        var opacity = 1;
        for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
            opacity *= parseFloat(getComputedStyle(n).opacity);
        }
        return opacity;
    }

    function charTransform(x, y, angle) {
        return 'translate(' + x + 'px, ' + y + 'px) rotate(' + angle + 'rad)';
    }

    // `by` is the loose letter that broke the line, or undefined when the ball did.
    function addLoose(c, velocity, by) {
        var w = c.rect.r - c.rect.l;
        var h = c.rect.b - c.rect.t;
        var body = Bodies.rectangle(c.rect.l + w / 2, c.rect.t + h / 2, w, h, {
            density: 0.0002,
            friction: 0.4,
            frictionAir: 0.01,
            restitution: 0.2,
            label: 'char',
            // New letters ignore whatever broke them loose until they are clear of it,
            // so it carries on through the gap.
            collisionFilter: { group: 0, category: CAT_CHAR, mask: by ? NOT_CHAR : NOT_BALL }
        });
        Body.setVelocity(body, {
            x: velocity.x * 0.5 + (Math.random() - 0.5) * 2,
            y: velocity.y * 0.5 + (Math.random() - 0.5) * 2
        });
        Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.3);

        var parent = c.node.parentElement;
        var style = getComputedStyle(parent);
        var el = document.createElement('div');
        el.className = 'drop-char';
        el.setAttribute('aria-hidden', 'true');
        el.textContent = c.ch;
        el.style.fontFamily = style.fontFamily;
        el.style.fontSize = style.fontSize;
        el.style.fontWeight = style.fontWeight;
        el.style.fontStyle = style.fontStyle;
        el.style.fontStretch = style.fontStretch;
        el.style.fontVariant = style.fontVariant;
        el.style.fontFeatureSettings = style.fontFeatureSettings;
        el.style.letterSpacing = style.letterSpacing;
        el.style.textTransform = style.textTransform;
        el.style.color = style.color;
        el.style.opacity = String(effectiveOpacity(parent));
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        el.style.lineHeight = h + 'px';
        el.style.transform = charTransform(c.rect.l, c.rect.t, 0);
        document.body.appendChild(el);

        var range = document.createRange();
        range.setStart(c.node, c.index);
        range.setEnd(c.node, c.index + 1);
        if (!brokenHighlight) {
            brokenHighlight = new Highlight();
            CSS.highlights.set(HIGHLIGHT_NAME, brokenHighlight);
        }
        brokenHighlight.add(range);

        var item = {
            body: body, el: el, w: w, h: h,
            homeX: c.rect.l, homeY: c.rect.t,
            x: c.rect.l, y: c.rect.t, angle: 0,
            fresh: true, freshFrom: by || null, fading: false, timer: 0
        };
        body.looseChar = item;
        loose.push(item);
        Composite.add(engine.world, body);
    }

    // Fade a loose character out and remove it; its original stays hidden until the text is restored.
    function fadeLoose(item) {
        if (item.fading) {
            return;
        }
        item.fading = true;
        if (item.body) {
            Composite.remove(engine.world, item.body);
            item.body = null;
        }
        item.el.style.opacity = '0';
        item.timer = setTimeout(function () {
            if (item.el.parentNode) {
                item.el.parentNode.removeChild(item.el);
            }
            var index = loose.indexOf(item);
            if (index !== -1) {
                loose.splice(index, 1);
            }
        }, FADE_MS);
    }

    function trimLoose() {
        var active = loose.filter(function (item) {
            return !item.fading;
        });
        for (var i = 0; i < active.length - MAX_LOOSE; i++) {
            fadeLoose(active[i]);
        }
    }

    function updateLoose() {
        loose.forEach(function (item) {
            var body = item.body;
            if (!body) {
                return;
            }
            if (item.fresh) {
                var other = item.freshFrom ? item.freshFrom.body : ball;
                if (!other || !boundsOverlap(body.bounds, other.bounds)) {
                    item.fresh = false;
                    item.freshFrom = null;
                    body.collisionFilter.mask = ALL_CATEGORIES;
                }
            }
            if (body.isSleeping) {
                return;
            }
            var v = Body.getVelocity(body);
            var speed = Math.sqrt(v.x * v.x + v.y * v.y);
            if (speed > MAX_SPEED) {
                Body.setVelocity(body, { x: v.x * MAX_SPEED / speed, y: v.y * MAX_SPEED / speed });
            }
        });
    }

    function anyLooseMoving() {
        return loose.some(function (item) {
            return item.body && !item.body.isSleeping;
        });
    }

    function renderLoose() {
        loose.forEach(function (item) {
            var body = item.body;
            if (!body || body.isSleeping) {
                return;
            }
            // Keep the drawing inside the page width so it never adds a scrollbar.
            var halfWidth = (Math.abs(item.w * Math.cos(body.angle)) + Math.abs(item.h * Math.sin(body.angle))) / 2;
            var cx = clamp(body.position.x, halfWidth, Math.max(halfWidth, viewWidth - halfWidth));
            item.x = cx - item.w / 2;
            item.y = body.position.y - item.h / 2;
            item.angle = body.angle;
            item.el.style.transform = charTransform(item.x, item.y, item.angle);
        });
    }

    // Letters fly home and straighten, then the originals are shown again.
    function startReturn() {
        if (!broken || returnTimer) {
            return;
        }
        var flying = loose.filter(function (item) {
            return !item.fading;
        });
        flying.forEach(function (item) {
            if (item.body) {
                Composite.remove(engine.world, item.body);
                item.body = null;
            }
            // Take the shortest turn back to upright.
            var angle = Math.atan2(Math.sin(item.angle), Math.cos(item.angle));
            item.el.style.transform = charTransform(item.x, item.y, angle);
        });
        // Commit the start positions before the transition begins.
        document.body.getBoundingClientRect();
        flying.forEach(function (item) {
            item.el.classList.add('is-returning');
            item.el.style.transform = charTransform(item.homeX, item.homeY, 0);
        });
        returnTimer = setTimeout(restoreText, RETURN_MS);
    }

    // Remove every loose letter, show the originals and rebuild the platforms.
    function restoreText() {
        clearTimeout(returnTimer);
        returnTimer = 0;
        loose.forEach(function (item) {
            clearTimeout(item.timer);
            if (item.body) {
                Composite.remove(engine.world, item.body);
            }
            if (item.el.parentNode) {
                item.el.parentNode.removeChild(item.el);
            }
        });
        loose = [];
        if (brokenHighlight) {
            brokenHighlight.clear();
        }
        if (broken) {
            broken = false;
            buildWorld();
        }
    }

    // ---------- Collisions ----------

    function onCollision(event, isStart) {
        for (var i = 0; i < event.pairs.length; i++) {
            var pair = event.pairs[i];
            var a = pair.bodyA;
            var b = pair.bodyB;

            if (isStart && (a === floorBody || b === floorBody)) {
                var item = (a === floorBody ? b : a).looseChar;
                if (item && item.body) {
                    pendingFloor.push(item);
                }
            }

            // A loose letter that hits intact text hard enough knocks the letters it lands on loose.
            // Sleeping letters never break anything, and nor do letters that have been removed.
            var letter = a.looseChar || b.looseChar;
            var line = a.looseChar ? b : a;
            if (isStart && canBreak && letter && letter.body && line.text && !letter.body.isSleeping && !breakPending(line)) {
                var letterVelocity = Body.getVelocity(letter.body);
                if (impactSpeed(pair, letter.body, letterVelocity, line) >= CHAIN_SPEED) {
                    var struck = charsUnder(line, letter.body.bounds.min.x, letter.body.bounds.max.x);
                    if (struck.length) {
                        pair.isActive = false;
                        pendingBreaks.push({ platform: line, hit: struck, velocity: letterVelocity, by: letter });
                        continue;
                    }
                }
            }

            if (!ball || (a !== ball && b !== ball)) {
                continue;
            }
            var other = a === ball ? b : a;
            if (isStart && other === floorBody) {
                reachFloor();
            }

            // A hard enough hit on a line of text knocks the letters under the ball loose.
            // The pair is switched off for this step so the ball goes through instead of bouncing.
            if (isStart && canBreak && other.text && !fading && !breakPending(other) &&
                    impactSpeed(pair, ball, ballVelocity, other) >= BREAK_SPEED) {
                var x = ball.position.x;
                var hit = charsUnder(other, x - BREAK_REACH, x + BREAK_REACH);
                if (hit.length) {
                    pair.isActive = false;
                    pendingBreaks.push({ platform: other, hit: hit, velocity: { x: ballVelocity.x, y: ballVelocity.y } });
                    continue;
                }
            }

            // A contact below the centre means the ball is on a surface.
            var collision = pair.collision;
            for (var k = 0; k < collision.supportCount; k++) {
                if (collision.supports[k].y > ball.position.y + RADIUS * 0.5) {
                    grounded = true;
                    // Landing from above gives both jumps back.
                    if (Body.getVelocity(ball).y > -1) {
                        jumpsLeft = JUMPS;
                    }
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
        if (ball) {
            applyInput();
            ballVelocity = Body.getVelocity(ball);
        }
        grounded = false;
        pendingBreaks = [];
        pendingFloor = [];
        Engine.update(engine, STEP_MS);

        pendingBreaks.forEach(applyBreak);
        pendingFloor.forEach(fadeLoose);
        updateLoose();
        // Started after the step, so every letter knocked loose in it goes home with the rest.
        if (reachedFooter) {
            reachedFooter = false;
            startFooterGame();
        }

        if (!ball) {
            return;
        }
        capSpeed();
        if (passThrough.length) {
            updatePassThrough();
        }
        // In case the ball ever slips past the floor.
        if (ball.position.y > floorY + RADIUS) {
            reachFloor();
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

    // Runs while a ball exists or any loose letter is still moving.
    function frame(now) {
        rafId = 0;
        accumulator += clamp(now - lastTime, 0, MAX_FRAME_MS);
        lastTime = now;
        while (accumulator >= STEP_MS) {
            accumulator -= STEP_MS;
            step();
        }
        if (ball) {
            render();
            follow();
        }
        renderLoose();
        if (ball || anyLooseMoving()) {
            rafId = requestAnimationFrame(frame);
        }
    }

    function startLoop() {
        if (!rafId) {
            accumulator = 0;
            lastTime = performance.now();
            rafId = requestAnimationFrame(frame);
        }
    }

    // ---------- Ball ----------

    function clearActive() {
        var root = document.documentElement;
        root.classList.remove(ACTIVE_CLASS);
        if (!root.className) {
            root.removeAttribute('class');
        }
    }

    function removeBall() {
        clearTimeout(fadeTimer);
        fadeTimer = 0;
        fading = false;
        reachedFooter = false;
        endPassThrough();
        if (!game) {
            clearActive();
        }
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
        startReturn();
    }

    // On the footer line the ball carries on into the footer game; anywhere else it fades.
    function reachFloor() {
        if (fading) {
            return;
        }
        if (floorIsLine) {
            reachedFooter = true;
        } else {
            startFade();
        }
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
            // 0 keeps the ball awake and its sleep counter at zero, so Matter drops its
            // contacts as soon as it leaves a surface and every landing is a new collision.
            sleepThreshold: 0,
            collisionFilter: { group: 0, category: CAT_BALL, mask: ALL_CATEGORIES },
            label: 'ball'
        });
        Composite.add(engine.world, ball);
        startPassThrough();

        ballEl = document.createElement('div');
        ballEl.className = 'drop-ball';
        ballEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ballEl);
        // Quick double taps jump instead of zooming the page while a ball exists.
        document.documentElement.classList.add(ACTIVE_CLASS);

        grounded = false;
        jumpsLeft = JUMPS;
        ballVelocity = { x: 0, y: 0 };
        render();
        startLoop();
    }

    function jump() {
        if (game) {
            gameJump();
            return;
        }
        if (!ball || fading || jumpsLeft <= 0) {
            return;
        }
        jumpsLeft -= 1;
        Body.setVelocity(ball, { x: Body.getVelocity(ball).x, y: -JUMP_SPEED });
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
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' &&
                event.key !== 'Escape') {
            return;
        }
        // Leave the browser's Back and Forward shortcuts alone.
        if (event.altKey || event.ctrlKey || event.metaKey) {
            return;
        }
        if (event.key === 'Escape') {
            if (game) {
                endFooterGame(true);
            }
            return;
        }
        if ((!ball && !game) || isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
            return;
        }
        // Left and Right do nothing in the footer game.
        if (game && event.key !== 'ArrowUp') {
            return;
        }
        event.preventDefault();
        if (event.key === 'ArrowUp') {
            // One jump per press: key repeat is ignored.
            if (!event.repeat) {
                jump();
            }
        } else if (event.key === 'ArrowLeft') {
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

    // ---------- Touch ----------

    // A tap is a short, still touch that is not on a form control or on a link or button in the
    // header or the menu. The listeners are passive and never block scrolling.
    function findTouch(list, id) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].identifier === id) {
                return list[i];
            }
        }
        return null;
    }

    function onTouchStart(event) {
        if (event.touches.length !== 1) {
            tap = null;
            return;
        }
        var touch = event.changedTouches[0];
        tap = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: performance.now(), target: event.target };
    }

    function movedTooFar(touch) {
        return Math.sqrt(Math.pow(touch.clientX - tap.x, 2) + Math.pow(touch.clientY - tap.y, 2)) >= TAP_MOVE;
    }

    function onTouchMove(event) {
        var touch = tap && findTouch(event.changedTouches, tap.id);
        if (touch && movedTooFar(touch)) {
            tap = null;
        }
    }

    // A link or button in the page content, outside the header and the menu.
    function contentControl(el) {
        var control = el && el.closest('a, button');
        return control && !control.closest(KEEP_CONTROLS) ? control : null;
    }

    function onTouchEnd(event) {
        // Remembered for the click that may follow this touch.
        lastTouchEnd = { time: performance.now(), playing: !!(ball || game) };
        var touch = tap && findTouch(event.changedTouches, tap.id);
        if (!touch) {
            return;
        }
        var target = tap.target.nodeType === 1 ? tap.target : tap.target.parentElement;
        var isTap = performance.now() - tap.time <= TAP_MS && !movedTooFar(touch) &&
            !(target && target.closest(TAP_IGNORE) && !contentControl(target));
        tap = null;
        if (isTap) {
            jump();
        }
    }

    function onTouchCancel() {
        tap = null;
    }

    // While a game is on, a click that came from a touch on a link or button in the page content
    // is cancelled, so a tap meant as a jump never opens a link. Touch events are never blocked.
    function onClickCapture(event) {
        var recent = lastTouchEnd && performance.now() - lastTouchEnd.time < CLICK_AFTER_TOUCH_MS;
        var fromTouch = event.pointerType ? event.pointerType === 'touch' : recent;
        if (!fromTouch || (!ball && !game && !(recent && lastTouchEnd.playing))) {
            return;
        }
        var target = event.target.nodeType === 1 ? event.target : event.target.parentElement;
        if (contentControl(target)) {
            event.preventDefault();
        }
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
            document.addEventListener('touchstart', onTouchStart, { passive: true });
            document.addEventListener('touchmove', onTouchMove, { passive: true });
            document.addEventListener('touchend', onTouchEnd, { passive: true });
            document.addEventListener('touchcancel', onTouchCancel, { passive: true });
            document.addEventListener('click', onClickCapture, true);
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

    // ---------- Footer game ----------

    function px(value) {
        return value + 'px';
    }

    function makeEl(tag, className, parent, text) {
        var el = document.createElement(tag);
        el.className = className;
        if (text) {
            el.textContent = text;
        }
        if (parent) {
            parent.appendChild(el);
        }
        return el;
    }

    // Nominal px along the course at a run time, in seconds.
    function courseAt(t) {
        return GAME_SPEED_START * t + (GAME_SPEED_END - GAME_SPEED_START) * t * t / (2 * GAME_RUN_S);
    }

    // ---------- High score ----------

    var highScore = 0;

    function readHighScore() {
        try {
            var stored = parseInt(window.localStorage.getItem(HIGH_SCORE_KEY), 10);
            if (stored > highScore) {
                highScore = stored;
            }
        } catch (e) {}
        return highScore;
    }

    function saveHighScore() {
        try {
            window.localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
        } catch (e) {}
    }

    // The column rises into view the first time; after that only a new value does.
    function showHighScore(g) {
        var value = makeEl('span', 'label-text opac-5', null, highScore + ' m');
        if (g.bestValueEl) {
            value.classList.add('drop-rise');
            g.bestEl.replaceChild(value, g.bestValueEl);
        } else {
            g.bestEl.appendChild(value);
            g.bestEl.classList.add('is-shown');
        }
        g.bestValueEl = value;
    }

    // A run has ended, by a fall, at the flag or by leaving the game.
    function endRun(g) {
        if (g.recorded) {
            return;
        }
        g.recorded = true;
        if (g.metres > readHighScore()) {
            highScore = g.metres;
            saveHighScore();
            showHighScore(g);
        }
    }

    // ---------- Course ----------

    // The platform under the ball's place on the course, at the given height.
    function platformAt(at, y) {
        for (var i = 0; i < game.platforms.length; i++) {
            var p = game.platforms[i];
            if (at >= p.left && at <= p.right && Math.abs(p.y - y) < 0.5) {
                return p;
            }
        }
        return null;
    }

    // Platforms are one way: the ball lands on the first one it crosses going down.
    function landing(at, from, to) {
        var found = null;
        game.platforms.forEach(function (p) {
            if (at >= p.left && at <= p.right && from <= p.y && to >= p.y && (!found || p.y < found.y)) {
                found = p;
            }
        });
        return found;
    }

    function setColour(g, index) {
        if (g.colour !== index) {
            if (g.colour) {
                g.track.classList.remove(GAME_PHASES[g.colour]);
            }
            if (index) {
                g.track.classList.add(GAME_PHASES[index]);
            }
            g.colour = index;
        }
    }

    function startRun(x, y) {
        var g = game;
        g.phase = 'drop';          // the platforms wait until the ball lands
        g.time = 0;                // seconds alive in this run
        g.travel = 0;
        g.metres = 0;
        g.recorded = false;
        g.x = x;
        g.y = y;
        g.step = 0;
        g.grounded = false;
        g.jumpsLeft = JUMPS;
        // Back to white at once, without the fade.
        g.track.classList.add('is-instant');
        setColour(g, 0);
        g.track.getBoundingClientRect();
        g.track.classList.remove('is-instant');
    }

    function gameStep() {
        var g = game;
        if (g.phase === 'run') {
            g.time = Math.min(g.time + STEP_MS / 1000, GAME_RUN_S);
            g.travel = courseAt(g.time);
            g.metres = Math.floor(g.travel / PX_PER_METRE);
            setColour(g, Math.min(GAME_PHASES.length - 1, Math.floor(g.time / GAME_PHASE_S)));
            if (g.time >= GAME_RUN_S) {
                finishRun();
            }
        }
        if (g.glide < GAME_GLIDE_MS) {
            g.glide = Math.min(g.glide + STEP_MS, GAME_GLIDE_MS);
            var t = g.glide / GAME_GLIDE_MS;
            g.x = g.ballX + (g.fromX - g.ballX) * (1 - t * t * (3 - 2 * t));
        }
        var at = g.travel + (g.x - g.ballX) / g.scale;
        if (g.grounded && !platformAt(at, g.y + RADIUS)) {
            g.grounded = false;
        }
        if (!g.grounded) {
            g.step = clamp(g.step * GAME_AIR + GAME_GRAVITY, -GAME_MAX_STEP, GAME_MAX_STEP);
            var from = g.y + RADIUS;
            g.y += g.step;
            var p = g.step > 0 ? landing(at, from, g.y + RADIUS) : null;
            if (p) {
                g.y = p.y - RADIUS;
                g.step = 0;
                g.grounded = true;
                g.jumpsLeft = JUMPS;
                if (g.phase === 'drop') {
                    g.phase = 'run';
                }
            }
        }
        // Fallen out of the stage: a short pause, then the run starts again.
        if (g.y - RADIUS > g.height && g.phase !== 'finished') {
            g.phase = 'pause';
            endRun(g);
            g.timers.push(setTimeout(function () {
                startRun(g.ballX, g.lineY - RADIUS);
            }, GAME_RESTART_MS));
        }
    }

    function gameRender() {
        var g = game;
        g.ballEl.style.transform = 'translate(' + (g.x - RADIUS) + 'px, ' + (g.y - RADIUS + GAME_OVERHANG) + 'px)';
        g.platforms.forEach(function (p) {
            p.el.style.transform = 'translate(' + (g.ballX + (p.left - g.travel) * g.scale) + 'px, ' + (p.y + GAME_OVERHANG) + 'px)';
        });
        if (g.metres !== g.shownMetres) {
            g.shownMetres = g.metres;
            g.distanceEl.textContent = g.metres + ' m';
        }
    }

    function gameFrame(now) {
        var g = game;
        if (!g) {
            return;
        }
        g.rafId = 0;
        g.accumulator += clamp(now - g.lastTime, 0, MAX_FRAME_MS);
        g.lastTime = now;
        while (g.accumulator >= STEP_MS) {
            g.accumulator -= STEP_MS;
            if (g.phase !== 'pause' && g.phase !== 'ending') {
                gameStep();
            }
        }
        if (game === g && g.phase !== 'ending') {
            gameRender();
            g.rafId = requestAnimationFrame(gameFrame);
        }
    }

    function gameJump() {
        var g = game;
        if (g.phase !== 'run' || g.jumpsLeft <= 0) {
            return;
        }
        g.jumpsLeft -= 1;
        g.grounded = false;
        g.step = -GAME_JUMP;
        if (!g.jumped) {
            g.jumped = true;
            g.hintEl.classList.add('is-gone');
        }
    }

    function finishRun() {
        var g = game;
        g.phase = 'finished';
        g.hintEl.textContent = 'Finished';
        g.hintEl.classList.remove('opac-5', 'is-gone');
        endRun(g);
        g.timers.push(setTimeout(function () {
            endFooterGame(false);
        }, GAME_FINISH_MS));
    }

    // The page game ends where the ball meets the footer line, and the footer gives way to a stage.
    function startFooterGame() {
        if (!ball || game) {
            return;
        }
        var fromX = ball.position.x;
        var fromY = ball.position.y;
        startReturn();
        endPassThrough();
        Composite.remove(engine.world, ball);
        ball = null;
        releaseKeys();
        var el = ballEl;
        ballEl = null;

        var stage = makeEl('div', 'drop-stage');
        var track = makeEl('div', 'drop-track', stage);
        track.setAttribute('aria-hidden', 'true');
        var hud = makeEl('div', 'drop-hud', stage);
        var distanceCol = makeEl('div', 'drop-score', hud);
        makeEl('span', 'f-label', distanceCol, 'Distance');
        var distanceEl = makeEl('span', 'label-text opac-5', distanceCol, '0 m');
        var bestEl = makeEl('div', 'drop-score drop-best', hud);
        makeEl('span', 'f-label', bestEl, 'High score');
        var small = window.matchMedia && window.matchMedia(SMALL_SCREEN).matches;
        var hintEl = makeEl('span', 'label-text opac-5 drop-hint', stage, small ? 'Tap to jump' : 'Up arrow to jump');
        var exitEl = makeEl('button', 'label-text opac-5 drop-exit', stage, 'Exit');
        exitEl.type = 'button';
        exitEl.addEventListener('click', function () {
            endFooterGame(true);
        });

        // The stage sits directly under the line; the footer rows are held where they were while they fade.
        var row = footerLine.closest('.row') || footerLine.parentNode;
        var before = row.getBoundingClientRect().height;
        stage.style.marginTop = px(-parseFloat(getComputedStyle(footerLine).marginBottom));
        footerLine.parentNode.insertBefore(stage, footerLine.nextSibling);
        var shift = row.getBoundingClientRect().height - before;
        var rows = Array.prototype.map.call(document.querySelectorAll(FOOTER_ROWS), function (rowEl) {
            var saved = { el: rowEl, style: rowEl.getAttribute('style') };
            // Set as an attribute, not through el.style, so removing it later leaves no trace.
            rowEl.setAttribute('style', (saved.style ? saved.style + ' ' : '') + 'top: ' + px(-shift) + ';');
            rowEl.classList.add('drop-footer-fade');
            return saved;
        });

        var rect = stage.getBoundingClientRect();
        var width = stage.clientWidth;
        var height = stage.clientHeight;
        var ballX = Math.round(width * GAME_BALL_AT);
        // On-screen px per nominal px.
        var scale = Math.min(1, (width - ballX) / GAME_LOOK_AHEAD);
        var platforms = COURSE.map(function (c) {
            var left = c[0] === null ? -ballX / scale : courseAt(c[0]);
            var right = courseAt(c[1]);
            var platformEl = makeEl('div', 'drop-platform', track);
            platformEl.style.width = px((right - left) * scale);
            return { left: left, right: right, y: height - c[2], el: platformEl };
        });
        var last = platforms[platforms.length - 1];
        makeEl('div', 'drop-flag', last.el).style.left = px((courseAt(GAME_RUN_S) - last.left) * scale);
        el.classList.remove('is-fading');
        track.appendChild(el);

        game = {
            stage: stage, track: track, rows: rows, shift: shift, ballEl: el, distanceEl: distanceEl, hintEl: hintEl,
            bestEl: bestEl, bestValueEl: null, colour: 0,
            platforms: platforms, width: width, height: height, ballX: ballX, scale: scale,
            lineY: -footerLine.getBoundingClientRect().height,
            fromX: fromX - (rect.left + window.scrollX), glide: 0,
            jumped: false, shownMetres: 0, timers: [], rafId: 0, accumulator: 0, lastTime: performance.now()
        };
        startRun(game.fromX, fromY - (rect.top + window.scrollY));
        if (readHighScore() > 0) {
            showHighScore(game);
        }

        // Commit the starting styles, then fade the footer out and the stage in.
        stage.getBoundingClientRect();
        stage.classList.add('is-shown');
        rows.forEach(function (saved) {
            saved.el.classList.add('drop-footer-out');
        });
        game.timers.push(setTimeout(function () {
            rows.forEach(function (saved) {
                saved.el.classList.add('drop-footer-gone');
            });
        }, GAME_FADE_MS));

        // Bring the whole stage into view, below the sticky nav.
        var top = rect.top + window.scrollY;
        var bottom = top + height;
        var navBottom = nav.getBoundingClientRect().bottom;
        var target = null;
        if (bottom > window.scrollY + window.innerHeight) {
            target = bottom - window.innerHeight;
        }
        if (top < (target === null ? window.scrollY : target) + navBottom) {
            target = top - navBottom;
        }
        if (target !== null) {
            window.scrollTo({ top: target, behavior: 'smooth' });
        }

        gameRender();
        game.rafId = requestAnimationFrame(gameFrame);
    }

    // At the flag the stage fades out and the footer fades back in; every other way out is immediate.
    function endFooterGame(immediate) {
        var g = game;
        if (!g) {
            return;
        }
        g.timers.forEach(clearTimeout);
        g.timers = [];
        endRun(g);
        if (!immediate) {
            if (g.phase === 'ending') {
                return;
            }
            g.phase = 'ending';
            g.stage.classList.remove('is-shown');
            g.ballEl.classList.add('is-fading');
            g.rows.forEach(function (saved) {
                saved.el.classList.remove('drop-footer-gone');
            });
            g.stage.getBoundingClientRect();
            g.rows.forEach(function (saved) {
                saved.el.classList.remove('drop-footer-out');
            });
            // The page is about to get shorter: scroll up first so nothing jumps when the stage goes.
            var maxScroll = document.documentElement.scrollHeight - g.shift - window.innerHeight;
            if (window.scrollY > maxScroll) {
                window.scrollTo({ top: Math.max(0, maxScroll), behavior: 'smooth' });
            }
            g.timers.push(setTimeout(function () {
                endFooterGame(true);
            }, GAME_FADE_MS));
            return;
        }
        game = null;
        cancelAnimationFrame(g.rafId);
        g.stage.parentNode.removeChild(g.stage);
        g.rows.forEach(function (saved) {
            saved.el.classList.remove('drop-footer-fade', 'drop-footer-out', 'drop-footer-gone');
            if (saved.style === null) {
                saved.el.removeAttribute('style');
            } else {
                saved.el.setAttribute('style', saved.style);
            }
        });
        if (!ball) {
            clearActive();
        }
    }

    // ---------- Setup ----------

    // The dot is an on/off switch: it drops a ball, or ends the game that is on.
    function onPress(event) {
        startListening();
        if (ball || game) {
            endFooterGame(true);
            restoreText();
            removeBall();
        } else {
            restoreText();
            drop();
        }
        // A mouse or touch press (detail > 0) should not leave a focus ring behind;
        // keyboard activation keeps focus on the dot.
        if (event.detail > 0) {
            event.currentTarget.blur();
        }
    }

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', onPress);
    }

    // ---------- Ink on the dot ----------

    // With a mouse, hovering the dot in the desktop nav spills a blob of ink that inverts
    // everything under it. Its edge is a few slow waves around a circle, so it is never round,
    // never jagged, and keeps moving gently while the pointer stays.
    var INK_SIZE = 220;            // px across when fully spread
    var INK_SPREAD_MS = 900;
    var INK_RETREAT_MS = 350;
    var INK_POINTS = 48;
    // Waves around the edge: [waves per turn, share of the radius, radians per second, phase].
    var INK_WAVES = [[2, 0.08, 0.42, 0.3], [3, 0.055, -0.31, 1.9], [4, 0.035, 0.55, 4.1], [5, 0.02, -0.67, 2.6]];
    var INK_DRIFT = 3;             // px the whole shape wanders
    var INK_BOX = INK_SIZE * 1.5;  // drawing area, with room for the waves and the drift
    var INK_HOVER = '(hover: hover) and (pointer: fine)';
    var INK_STILL = '(prefers-reduced-motion: reduce)';
    var SVG_NS = 'http://www.w3.org/2000/svg';

    var inkDot = document.querySelector('.flex-nav .ball-drop');
    var ink = null;

    function inkAllowed() {
        return !!window.matchMedia && window.matchMedia(INK_HOVER).matches &&
            !window.matchMedia(INK_STILL).matches;
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function easeOutQuad(t) {
        return 1 - (1 - t) * (1 - t);
    }

    // The spread, from 0 to 1, at a moment.
    function inkSpread(now) {
        var t = ink.duration ? clamp((now - ink.start) / ink.duration, 0, 1) : 1;
        return ink.from + (ink.to - ink.from) * ink.ease(t);
    }

    // Spread out or pull back from wherever the shape is now, so it never snaps.
    function inkTo(target) {
        var now = performance.now();
        var current = inkSpread(now);
        ink.from = current;
        ink.to = target;
        ink.start = now;
        ink.duration = (target ? INK_SPREAD_MS : INK_RETREAT_MS) * Math.abs(target - current);
        ink.ease = target ? easeOutCubic : easeOutQuad;
        if (!ink.rafId) {
            ink.svg.style.display = '';
            ink.rafId = requestAnimationFrame(inkFrame);
        }
    }

    function inkFrame(now) {
        ink.rafId = 0;
        var spread = inkSpread(now);
        if (spread <= 0 && ink.to === 0) {
            // Idle: nothing painted and nothing running.
            ink.svg.style.display = 'none';
            return;
        }
        var r = inkDot.getBoundingClientRect();
        var seconds = now / 1000;
        var cx = r.left + r.width / 2 + INK_DRIFT * Math.sin(seconds * 0.5);
        var cy = r.top + r.height / 2 + INK_DRIFT * Math.sin(seconds * 0.37 + 1);
        ink.svg.style.transform = 'translate(' + (cx - INK_BOX / 2) + 'px, ' + (cy - INK_BOX / 2) + 'px)';

        var radius = spread * INK_SIZE / 2;
        var points = [];
        for (var i = 0; i < INK_POINTS; i++) {
            var angle = i / INK_POINTS * Math.PI * 2;
            var scale = 1;
            INK_WAVES.forEach(function (w) {
                scale += w[1] * Math.sin(w[0] * angle + w[2] * seconds + w[3]);
            });
            points.push([INK_BOX / 2 + Math.cos(angle) * radius * scale, INK_BOX / 2 + Math.sin(angle) * radius * scale]);
        }
        // A smooth closed curve through the points.
        var d = 'M' + points[0][0].toFixed(2) + ' ' + points[0][1].toFixed(2);
        for (var k = 0; k < INK_POINTS; k++) {
            var p0 = points[(k + INK_POINTS - 1) % INK_POINTS];
            var p1 = points[k];
            var p2 = points[(k + 1) % INK_POINTS];
            var p3 = points[(k + 2) % INK_POINTS];
            d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2) +
                ' ' + (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2) +
                ' ' + p2[0].toFixed(2) + ' ' + p2[1].toFixed(2);
        }
        ink.path.setAttribute('d', d + 'Z');
        ink.rafId = requestAnimationFrame(inkFrame);
    }

    function onInkEnter() {
        if (!inkAllowed()) {
            return;
        }
        if (!ink) {
            var svg = document.createElementNS(SVG_NS, 'svg');
            svg.setAttribute('class', 'ball-drop-ink');
            svg.setAttribute('aria-hidden', 'true');
            svg.setAttribute('width', INK_BOX);
            svg.setAttribute('height', INK_BOX);
            var path = document.createElementNS(SVG_NS, 'path');
            svg.appendChild(path);
            document.body.appendChild(svg);
            ink = { svg: svg, path: path, from: 0, to: 0, start: 0, duration: 0, ease: easeOutCubic, rafId: 0 };
        }
        inkTo(1);
    }

    function onInkLeave() {
        if (ink) {
            inkTo(0);
        }
    }

    if (inkDot) {
        inkDot.addEventListener('mouseenter', onInkEnter);
        inkDot.addEventListener('mouseleave', onInkLeave);
    }

    // Phones fire height-only resizes when the address bar hides; ignore those.
    // A width change restores the text and the footer at once and removes the ball.
    window.addEventListener('resize', function () {
        if (window.innerWidth !== lastWidth) {
            lastWidth = window.innerWidth;
            restoreText();
            endFooterGame(true);
            removeBall();
            buildWorld();
        }
    });

    // If the layout settles after letters were knocked loose, put the text back first.
    function onLayoutReady() {
        if (broken) {
            restoreText();
        } else {
            buildWorld();
        }
    }

    if (document.readyState === 'complete') {
        buildWorld();
    } else {
        window.addEventListener('load', onLayoutReady);
    }

    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(onLayoutReady);
    }
})();
