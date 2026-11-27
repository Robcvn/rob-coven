// Ball drop: an experimental physics toy for the home page.
// Press the white dot in the nav to drop a ball onto the page text.
// Steer with the Left/Right arrow keys and hold Shift to run, or tilt a phone: further tilts run.
// Jump with the Up arrow key or Space, or by touching the screen on a phone: hold for a higher jump.
// In the air, hold toward a wall to slide down it, and jump to kick off it.
// A hard enough hit knocks the letters under the ball loose, and fast loose letters
// can knock more letters loose in turn.
// When the ball reaches the footer line it stays there, and every loose letter falls to the line and collects.
// Pressing the dot again puts the text back and removes the ball.
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
    var TILT_DEAD_ZONE = 3;        // degrees; past this a tilt walks
    var TILT_RUN = 20;             // degrees; past this a tilt runs
    var FOLLOW_START = 0.6;        // fraction of the viewport height; a falling ball is kept above this
    var FOLLOW_TOP = 0.3;          // fraction of the viewport height; a rising ball is kept below this
    var FOLLOW_EASE = 0.15;
    var REST_SPEED = 0.2;
    var FADE_MS = 600;
    var EDGE = 200;                // thickness of the walls and floor
    var SAME_LINE_GAP = 2;         // px between rects that count as touching
    var EDGE_CHANNEL = 28;         // clear space at each side so the ball can always fall
    var ALL_CATEGORIES = 0xFFFFFFFF;

    var PX_PER_SECOND = 60;        // Matter velocity units to px per second
    // Steering sets the ball's horizontal speed directly. Speeds are in px per second.
    var WALK_SPEED = 240;
    var RUN_SPEED = 480;           // while Shift is held
    var GROUND_ACCEL_S = 0.15;     // seconds from standing to top speed on the ground
    var GROUND_STOP_S = 0.05;      // seconds from top speed to a stop when no direction is held
    var SKID_S = 0.15;             // seconds from top speed to a stop when the direction is reversed
    var AIR_ACCEL_SHARE = 0.8;     // share of the ground rate the ball speeds up at in the air
    var AIR_STOP_S = 0.25;         // seconds from top speed to a stop in the air with no direction held
    var JUMP_SPEED = 545;          // upward speed of a jump; held, it lifts the ball about 120px
    var JUMP_CUT_SPEED = 140;      // upward speed is cut to this when jump is let go while rising
    var WALL_SLIDE_SPEED = 120;    // the most a ball holding toward a wall falls at
    var WALL_STICK_MS = 50;        // the ball stays on a wall this long after steering away from it
    var WALL_JUMP_GRACE_MS = 200;  // a wall jump still works this long after leaving a wall
    var WALL_NORMAL = 0.7;         // a contact this close to horizontal is a wall
    var TAP_MOVE = 10;             // px a touch moves before it counts as a scroll
    var BREAK_SPEED = 300;         // px per second into a line of text that knocks letters loose
    var BREAK_REACH = 40;          // px each side of the ball's centre
    var BREAK_KEEP = 0.4;          // share of its velocity the ball keeps after a break
    var CHAIN_SPEED = 375;         // px per second at which a loose letter knocks text loose
    var CHAIN_KEEP = 0.6;          // share of its velocity a loose letter keeps after a break
    var MAX_LOOSE = 400;
    var RETURN_MS = 800;
    var CLICK_AFTER_TOUCH_MS = 1000; // a click this soon after a touch came from that touch

    // Collision categories: platforms, walls and the floor keep Matter's default.
    var CAT_BALL = 0x0002;
    var CAT_CHAR = 0x0004;
    var NOT_BALL = ALL_CATEGORIES ^ CAT_BALL;
    var NOT_CHAR = ALL_CATEGORIES ^ CAT_CHAR;
    var ACTIVE_CLASS = 'ball-drop-active';

    // Platforms are never taken from inside these.
    var EXCLUDE = '.nav, .mobile-menu, .ball-drop, .drop-ball, .drop-char, script, style, noscript, hr';
    var TAP_IGNORE = 'a, button, input, select, textarea';
    // Links and buttons a touch tap always follows, even while a game is on.
    var KEEP_CONTROLS = '.nav, .mobile-menu';
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
    var floorIsLine = false;       // the floor is the footer divider, where loose letters collect
    var collecting = false;        // loose letters fall through the text and images to the footer line
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
    var ballVelocity = { x: 0, y: 0 };
    var wallTouch = 0;             // side of a wall the ball touched in this step: -1 left, 1 right
    var wallSide = 0;              // side of the wall the ball is on in the air, or 0
    var sliding = false;           // on a wall and holding toward it
    var stickStart = 0;            // when the player steered away from the wall being slid on
    var lastWallSide = 0;
    var lastWallTime = -Infinity;
    var jumpCuttable = false;      // the jump in progress can still be cut short

    var loose = [];                // loose characters, oldest first
    var broken = false;
    var pendingBreaks = [];
    var returnTimer = 0;

    var keyLeft = false;
    var keyRight = false;
    var keyRun = false;
    var tilt = 0;                  // degrees, 0 inside the dead zone; positive tilts right
    var keysOn = false;
    var orientationOn = false;
    var tap = null;
    var lastTouchEnd = null;

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
        if (collecting) {
            body.collisionFilter.mask = NOT_CHAR;
        }
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
                }
            }

            // A contact from the side is a wall, unless it is a loose letter or the ball is moving away from it.
            if (!other.looseChar && collision.supportCount && Math.abs(collision.normal.x) >= WALL_NORMAL) {
                var side = collision.supports[0].x > ball.position.x ? 1 : -1;
                if (ballVelocity.x * side >= 0) {
                    wallTouch = side;
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

    // The direction held, -1, 0 or 1, and whether to run. The arrow keys win over a tilt.
    function steering() {
        var keys = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
        if (keys) {
            return { dir: keys, run: keyRun };
        }
        return { dir: tilt > 0 ? 1 : (tilt < 0 ? -1 : 0), run: keyRun || Math.abs(tilt) >= TILT_RUN };
    }

    function approach(value, target, change) {
        return value < target ? Math.min(target, value + change) : Math.max(target, value - change);
    }

    // Move the horizontal speed toward the target speed at the rate for the ground or the air.
    function applyInput(now) {
        var input = steering();
        var top = input.run ? RUN_SPEED : WALK_SPEED;
        var v = Body.getVelocity(ball);
        var vx = v.x * PX_PER_SECOND;

        // Steering away from a wall being slid on leaves the ball on it for a moment.
        if (sliding && wallSide && input.dir === -wallSide) {
            if (!stickStart) {
                stickStart = now;
            }
            if (now - stickStart < WALL_STICK_MS) {
                Body.setVelocity(ball, { x: 0, y: v.y });
                return;
            }
        } else {
            stickStart = 0;
        }

        var seconds;
        if (!input.dir) {
            seconds = grounded ? GROUND_STOP_S : AIR_STOP_S;
        } else if (grounded && vx * input.dir < 0) {
            seconds = SKID_S;
        } else {
            seconds = grounded ? GROUND_ACCEL_S : GROUND_ACCEL_S / AIR_ACCEL_SHARE;
        }
        var target = input.dir * top;
        var next = approach(vx, target, top / seconds * STEP_MS / 1000);
        if (next !== vx) {
            Body.setVelocity(ball, { x: next / PX_PER_SECOND, y: v.y });
        }
    }

    // After a step: which wall, if any, the ball is on in the air, and the slide down it.
    function updateWall(now) {
        var input = steering();
        var side = grounded ? 0 : wallTouch;
        // A ball stuck to a wall stays on it while the stick lasts, touching or not.
        if (!side && !grounded && stickStart && now - stickStart < WALL_STICK_MS) {
            side = wallSide;
        }
        wallSide = side;
        if (side) {
            lastWallSide = side;
            lastWallTime = now;
        }
        var stuck = stickStart && now - stickStart < WALL_STICK_MS;
        sliding = !!side && (input.dir === side || (sliding && stuck));
        if (sliding) {
            // Gravity adds to the speed in the next step before the ball moves, so allow for it.
            var gravityStep = engine.gravity.y * engine.gravity.scale * 1000 * STEP_MS;
            var cap = (WALL_SLIDE_SPEED - gravityStep) / PX_PER_SECOND;
            var v = Body.getVelocity(ball);
            if (v.y > cap) {
                Body.setVelocity(ball, { x: v.x, y: cap });
            }
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
        var now = performance.now();
        if (ball) {
            applyInput(now);
            ballVelocity = Body.getVelocity(ball);
        }
        grounded = false;
        wallTouch = 0;
        pendingBreaks = [];
        Engine.update(engine, STEP_MS);

        pendingBreaks.forEach(applyBreak);
        updateLoose();

        if (!ball) {
            return;
        }
        if (grounded) {
            jumpCuttable = jumpCuttable && Body.getVelocity(ball).y < 0;
        }
        updateWall(now);
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

    // The page scrolls down to keep a falling ball above FOLLOW_START, and up to keep a rising ball
    // below FOLLOW_TOP, easing toward the target either way.
    function follow() {
        if (Body.getSpeed(ball) < REST_SPEED) {
            return;
        }
        var viewHeight = window.innerHeight;
        var current = window.scrollY;
        var maxScroll = document.documentElement.scrollHeight - viewHeight;
        var target = Math.min(ball.position.y - viewHeight * FOLLOW_START, maxScroll);
        if (target <= current) {
            target = Math.max(ball.position.y - viewHeight * FOLLOW_TOP, 0);
            if (target >= current || Body.getVelocity(ball).y >= 0) {
                return;
            }
        }
        var distance = Math.abs(target - current);
        var delta = Math.max(distance * FOLLOW_EASE, Math.min(1, distance));
        window.scrollTo(window.scrollX, current + (target > current ? delta : -delta));
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

    // The game is over: the ink pulls back too.
    function clearActive() {
        var root = document.documentElement;
        root.classList.remove(ACTIVE_CLASS);
        if (!root.className) {
            root.removeAttribute('class');
        }
        inkGameOff();
    }

    function removeBall() {
        clearTimeout(fadeTimer);
        fadeTimer = 0;
        fading = false;
        endPassThrough();
        stopCollecting();
        clearActive();
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

    // Every loose letter, and every letter knocked loose after, falls through the text and images
    // to the footer line. The ball still lands on them.
    function collectLetters() {
        if (collecting) {
            return;
        }
        collecting = true;
        endPassThrough();
        platforms.forEach(function (platform) {
            platform.collisionFilter.mask = NOT_CHAR;
        });
        loose.forEach(function (item) {
            if (item.body) {
                Sleeping.set(item.body, false);
            }
        });
    }

    function stopCollecting() {
        if (!collecting) {
            return;
        }
        collecting = false;
        platforms.forEach(function (platform) {
            platform.collisionFilter.mask = ALL_CATEGORIES;
        });
    }

    // On the footer line the ball stays and the loose letters collect there; anywhere else it fades.
    function reachFloor() {
        if (fading) {
            return;
        }
        if (floorIsLine) {
            collectLetters();
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

        // Steering sets the speed directly, so the ball neither rolls, grips nor bounces.
        ball = Bodies.polygon(x, y, BALL_SIDES, RADIUS, {
            restitution: 0,
            friction: 0,
            frictionStatic: 0,
            frictionAir: 0.01,
            // 0 keeps the ball awake and its sleep counter at zero, so Matter drops its
            // contacts as soon as it leaves a surface and every landing is a new collision.
            sleepThreshold: 0,
            collisionFilter: { group: 0, category: CAT_BALL, mask: ALL_CATEGORIES },
            label: 'ball'
        });
        Body.setInertia(ball, Infinity);
        Composite.add(engine.world, ball);
        startPassThrough();

        ballEl = document.createElement('div');
        ballEl.className = 'drop-ball';
        ballEl.setAttribute('aria-hidden', 'true');
        document.body.appendChild(ballEl);
        // Quick double taps jump instead of zooming the page while a ball exists.
        document.documentElement.classList.add(ACTIVE_CLASS);

        grounded = false;
        ballVelocity = { x: 0, y: 0 };
        wallSide = 0;
        sliding = false;
        stickStart = 0;
        lastWallTime = -Infinity;
        jumpCuttable = false;
        render();
        startLoop();
    }

    // One jump from the ground. In the air, a jump on a wall, or just after leaving one,
    // kicks up and away from it at the current top speed.
    function jump() {
        if (!ball || fading) {
            return;
        }
        var v = Body.getVelocity(ball);
        if (grounded && v.y > -1) {
            Body.setVelocity(ball, { x: v.x, y: -JUMP_SPEED / PX_PER_SECOND });
        } else if (wallSide || performance.now() - lastWallTime <= WALL_JUMP_GRACE_MS) {
            var side = wallSide || lastWallSide;
            var top = steering().run ? RUN_SPEED : WALK_SPEED;
            Body.setVelocity(ball, { x: -side * top / PX_PER_SECOND, y: -JUMP_SPEED / PX_PER_SECOND });
            wallSide = 0;
            sliding = false;
            stickStart = 0;
            lastWallTime = -Infinity;
        } else {
            return;
        }
        grounded = false;
        jumpCuttable = true;
    }

    // Letting go of jump while the ball is still rising cuts the jump short.
    function releaseJump() {
        if (!ball || !jumpCuttable) {
            return;
        }
        jumpCuttable = false;
        var v = Body.getVelocity(ball);
        if (v.y < -JUMP_CUT_SPEED / PX_PER_SECOND) {
            Body.setVelocity(ball, { x: v.x, y: -JUMP_CUT_SPEED / PX_PER_SECOND });
        }
    }

    // ---------- Keyboard ----------

    function isTypingTarget(el) {
        if (!el || el.nodeType !== 1) {
            return false;
        }
        var tag = el.tagName;
        return el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    function isJumpKey(key) {
        return key === 'ArrowUp' || key === ' ';
    }

    function onKeyDown(event) {
        keyRun = event.shiftKey;
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && !isJumpKey(event.key)) {
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
        if (isJumpKey(event.key)) {
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
        keyRun = event.shiftKey;
        if (event.key === 'ArrowLeft') {
            keyLeft = false;
        } else if (event.key === 'ArrowRight') {
            keyRight = false;
        } else if (isJumpKey(event.key)) {
            releaseJump();
        }
    }

    function releaseKeys() {
        keyLeft = false;
        keyRight = false;
        keyRun = false;
        releaseJump();
    }

    // ---------- Touch ----------

    // A touch jumps as it lands, unless it is in the header or the menu, or on a form control.
    // Lifting the finger, or moving it far enough to scroll, cuts the jump short.
    // The listeners are passive and never block scrolling.
    function findTouch(list, id) {
        for (var i = 0; i < list.length; i++) {
            if (list[i].identifier === id) {
                return list[i];
            }
        }
        return null;
    }

    function onTouchStart(event) {
        if (tap) {
            releaseJump();
            tap = null;
        }
        if (event.touches.length !== 1) {
            return;
        }
        var touch = event.changedTouches[0];
        var target = event.target.nodeType === 1 ? event.target : event.target.parentElement;
        if (target && (target.closest(KEEP_CONTROLS) || (target.closest(TAP_IGNORE) && !contentControl(target)))) {
            return;
        }
        tap = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
        jump();
    }

    function movedTooFar(touch) {
        return Math.sqrt(Math.pow(touch.clientX - tap.x, 2) + Math.pow(touch.clientY - tap.y, 2)) >= TAP_MOVE;
    }

    function onTouchMove(event) {
        var touch = tap && findTouch(event.changedTouches, tap.id);
        if (touch && movedTooFar(touch)) {
            releaseJump();
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
        lastTouchEnd = { time: performance.now(), playing: !!ball };
        if (tap && findTouch(event.changedTouches, tap.id)) {
            releaseJump();
            tap = null;
        }
    }

    function onTouchCancel() {
        if (tap) {
            releaseJump();
        }
        tap = null;
    }

    // While a game is on, a click that came from a touch on a link or button in the page content
    // is cancelled, so a tap meant as a jump never opens a link. Touch events are never blocked.
    // This backs up the style sheet, which takes those links out of hit testing on touch screens.
    // Some browsers report a tap's click as a mouse click, so a recent touch counts as well.
    function onClickCapture(event) {
        var recent = lastTouchEnd && performance.now() - lastTouchEnd.time < CLICK_AFTER_TOUCH_MS;
        var fromTouch = event.pointerType === 'touch' || recent;
        if (!fromTouch || (!ball && !(recent && lastTouchEnd.playing))) {
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
        tilt = size <= TILT_DEAD_ZONE ? 0 : degrees;
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

    // ---------- Setup ----------

    // The dot is an on/off switch: it drops a ball, or ends the game that is on.
    function onPress(event) {
        startListening();
        if (ball) {
            restoreText();
            removeBall();
        } else {
            restoreText();
            drop();
            inkGameOn(event.currentTarget);
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
    // Starting a game spreads the ink from the pressed dot over the whole screen, and the page
    // stays inverted until the game ends, when the ink pulls back into the dot.
    var INK_SIZE = 220;            // px across when fully spread on hover
    var INK_SPREAD_MS = 900;
    var INK_RETREAT_MS = 350;
    var INK_COVER_MS = 1100;       // from the dot to covering the screen
    var INK_UNCOVER_MS = 600;      // from covering the screen back into the dot
    var INK_FADE_MS = 200;         // with reduced motion the inversion fades instead
    var INK_POINTS = 48;
    // Waves around the edge: [waves per turn, share of the radius, radians per second, phase].
    var INK_WAVES = [[2, 0.08, 0.42, 0.3], [3, 0.055, -0.31, 1.9], [4, 0.035, 0.55, 4.1], [5, 0.02, -0.67, 2.6]];
    var INK_WAVE_TOTAL = INK_WAVES.reduce(function (sum, w) {
        return sum + w[1];
    }, 0);
    var INK_DRIFT = 3;             // px the whole shape wanders
    var INK_HOVER = '(hover: hover) and (pointer: fine)';
    var INK_STILL = '(prefers-reduced-motion: reduce)';
    var INVERTED_CLASS = 'ball-drop-inverted';
    var SVG_NS = 'http://www.w3.org/2000/svg';

    var inkDot = document.querySelector('.flex-nav .ball-drop');
    var ink = null;

    function prefersStill() {
        return !!window.matchMedia && window.matchMedia(INK_STILL).matches;
    }

    function inkAllowed() {
        return !!window.matchMedia && window.matchMedia(INK_HOVER).matches && !prefersStill();
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function easeOutQuad(t) {
        return 1 - (1 - t) * (1 - t);
    }

    function makeInk() {
        if (ink) {
            return;
        }
        var svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('class', 'ball-drop-ink');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.display = 'none';
        var path = document.createElementNS(SVG_NS, 'path');
        svg.appendChild(path);
        // Once the screen is covered, one plain layer stands in for the moving shape.
        var cover = document.createElement('div');
        cover.className = 'ball-drop-invert';
        cover.setAttribute('aria-hidden', 'true');
        cover.style.display = 'none';
        document.body.appendChild(svg);
        document.body.appendChild(cover);
        ink = {
            svg: svg, path: path, cover: cover, width: 0, height: 0,
            from: 0, to: 0, start: 0, duration: 0, ease: easeOutCubic, rafId: 0, fadeTimer: 0,
            centreEl: inkDot, cx: 0, cy: 0, hovering: false, gameOn: false, covered: false
        };
    }

    // The visible header dot: the one in the desktop nav, or the one beside the hamburger.
    function visibleDot() {
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].offsetParent) {
                return buttons[i];
            }
        }
        return ink.centreEl;
    }

    // The colour exception reads correctly only while the whole page is inverted.
    function setInverted(on) {
        var root = document.documentElement;
        root.classList.toggle(INVERTED_CLASS, on);
        if (!root.className) {
            root.removeAttribute('class');
        }
    }

    function inkCentre() {
        var r = ink.centreEl.getBoundingClientRect();
        if (r.width || r.height) {
            ink.cx = r.left + r.width / 2;
            ink.cy = r.top + r.height / 2;
        }
    }

    // Big enough that even the shortest part of the wavy edge is past every corner of the screen.
    function coverRadius() {
        inkCentre();
        var w = document.documentElement.clientWidth;
        var h = window.innerHeight;
        var far = Math.max(
            Math.hypot(ink.cx, ink.cy), Math.hypot(w - ink.cx, ink.cy),
            Math.hypot(ink.cx, h - ink.cy), Math.hypot(w - ink.cx, h - ink.cy)
        );
        return (far + INK_DRIFT + 2) / (1 - INK_WAVE_TOTAL);
    }

    // The radius, in px, at a moment.
    function inkRadius(now) {
        var t = ink.duration ? clamp((now - ink.start) / ink.duration, 0, 1) : 1;
        return ink.from + (ink.to - ink.from) * ink.ease(t);
    }

    // Spread out or pull back from wherever the shape is now, so it never snaps.
    // `fullMs` is the time for a change of `fullRadius`.
    function inkTo(target, fullMs, fullRadius) {
        var now = performance.now();
        var current = inkRadius(now);
        ink.from = current;
        ink.to = target;
        ink.start = now;
        ink.duration = fullMs * Math.min(1, Math.abs(target - current) / fullRadius);
        ink.ease = target > current ? easeOutCubic : easeOutQuad;
        ink.svg.style.display = '';
        if (!ink.rafId) {
            ink.rafId = requestAnimationFrame(inkFrame);
        }
    }

    function inkFrame(now) {
        ink.rafId = 0;
        var radius = inkRadius(now);
        var done = now >= ink.start + ink.duration;
        if (done && ink.gameOn) {
            // The screen is covered: swap to the plain layer and stop.
            ink.covered = true;
            ink.cover.style.display = '';
            ink.svg.style.display = 'none';
            setInverted(true);
            return;
        }
        if (done && radius <= 0) {
            // Idle: nothing painted and nothing running.
            ink.svg.style.display = 'none';
            return;
        }
        inkCentre();
        var seconds = now / 1000;
        var cx = ink.cx + INK_DRIFT * Math.sin(seconds * 0.5);
        var cy = ink.cy + INK_DRIFT * Math.sin(seconds * 0.37 + 1);

        // The drawing area is the part of the screen the shape can reach.
        var reach = radius * (1 + INK_WAVE_TOTAL) + 2;
        var left = Math.max(0, Math.floor(cx - reach));
        var top = Math.max(0, Math.floor(cy - reach));
        var width = Math.max(1, Math.min(document.documentElement.clientWidth, Math.ceil(cx + reach)) - left);
        var height = Math.max(1, Math.min(window.innerHeight, Math.ceil(cy + reach)) - top);
        if (width !== ink.width || height !== ink.height) {
            ink.width = width;
            ink.height = height;
            ink.svg.setAttribute('width', width);
            ink.svg.setAttribute('height', height);
        }
        ink.svg.style.transform = 'translate(' + left + 'px, ' + top + 'px)';

        var points = [];
        for (var i = 0; i < INK_POINTS; i++) {
            var angle = i / INK_POINTS * Math.PI * 2;
            var scale = 1;
            INK_WAVES.forEach(function (w) {
                scale += w[1] * Math.sin(w[0] * angle + w[2] * seconds + w[3]);
            });
            points.push([cx - left + Math.cos(angle) * radius * scale, cy - top + Math.sin(angle) * radius * scale]);
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

    // With reduced motion there is no shape: the plain layer fades in and out.
    function fadeCover(on) {
        clearTimeout(ink.fadeTimer);
        var cover = ink.cover;
        cover.classList.add('is-easing');
        if (on) {
            cover.style.opacity = '0';
            cover.style.display = '';
            cover.getBoundingClientRect();
            cover.style.opacity = '1';
        } else {
            cover.style.opacity = '0';
            ink.fadeTimer = setTimeout(function () {
                cover.style.display = 'none';
                cover.style.opacity = '';
                cover.classList.remove('is-easing');
            }, INK_FADE_MS);
        }
    }

    // A game has started from `dot`.
    function inkGameOn(dot) {
        makeInk();
        if (ink.gameOn) {
            return;
        }
        ink.gameOn = true;
        if (prefersStill()) {
            fadeCover(true);
            setInverted(true);
            return;
        }
        ink.centreEl = dot;
        inkTo(coverRadius(), INK_COVER_MS, coverRadius());
    }

    // The game has ended: pull back into the visible dot, or to the hover size if the mouse is on it.
    function inkGameOff() {
        if (!ink || !ink.gameOn) {
            return;
        }
        ink.gameOn = false;
        setInverted(false);
        if (prefersStill() || ink.cover.classList.contains('is-easing')) {
            fadeCover(false);
            return;
        }
        var full = coverRadius();
        if (ink.covered) {
            // Hand back from the plain layer to the shape at full size.
            ink.covered = false;
            ink.from = ink.to = full;
            ink.duration = 0;
            ink.cover.style.display = 'none';
        }
        ink.centreEl = visibleDot();
        var settle = ink.hovering && inkAllowed() && ink.centreEl === inkDot ? INK_SIZE / 2 : 0;
        inkTo(settle, INK_UNCOVER_MS, full);
    }

    // Hovering is remembered during a game, so the shape can settle at the hover size when it ends.
    function onInkEnter() {
        if (!inkAllowed()) {
            return;
        }
        makeInk();
        ink.hovering = true;
        if (!ink.gameOn) {
            ink.centreEl = inkDot;
            inkTo(INK_SIZE / 2, INK_SPREAD_MS, INK_SIZE / 2);
        }
    }

    function onInkLeave() {
        if (!ink) {
            return;
        }
        ink.hovering = false;
        if (!ink.gameOn) {
            inkTo(0, INK_RETREAT_MS, INK_SIZE / 2);
        }
    }

    if (inkDot) {
        inkDot.addEventListener('mouseenter', onInkEnter);
        inkDot.addEventListener('mouseleave', onInkLeave);
    }

    // Phones fire height-only resizes when the address bar hides; ignore those.
    // A width change restores the text at once and removes the ball.
    window.addEventListener('resize', function () {
        if (window.innerWidth !== lastWidth) {
            lastWidth = window.innerWidth;
            restoreText();
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
