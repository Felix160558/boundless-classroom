# Boundless Classroom · Space Version

Love, Share and Peace.

A quiet classroom floating in space. A public, static learning demo built with HTML, CSS, JavaScript and a pinned local copy of Three.js 0.161.0. Visitors do not need a ChatGPT or GitHub account.

## Explore

- **Match** opens the cat teacher's classroom directly. No real-person matching.
- **Reservation** saves a demo booking in the current browser. No teacher is notified.
- **Enter the VR** places you directly in the student chair, looking past your desk toward the cat teacher and whiteboard. Glass walls on both sides and a glass ceiling open onto the existing stardust universe. Drag, swipe or use arrow keys to look around from the fixed seat; there is no extra sit-down button or movement panel.
- On a compatible HTTPS/WebXR device, an experimental single-user headset entry is offered. Its first tracked frame is aligned to the same seat, and subsequent physical head motion remains tracked. Actual headset compatibility has not been verified.

The teacher uses the original supplied 3D character. This version restores the original geometry detail and exact 4096px source JPEG texture, with no mesh simplification, texture resizing or vertex quantization. The asset is 19.64 MB: visual detail and future close-up viewing take priority over a tiny first download. Local Meshopt compression remains lossless for the stored geometry. The model starts preloading when the page opens; a browser-local model cache is used when available.

Entering Match gradually brings out a gentle closed-mouth smile. Click or tap the teacher for a smile or wink; resting the pointer over it gives a quiet acknowledgement. One fixed head mesh is used throughout: a localized smile morph moves the mouth corners and inner cheeks, while small curved 3D eyelids gradually cover the stationary eyes. The head is never replaced or rescaled. Smooth easing and damped weights preserve continuity even when an interaction interrupts another. The classroom avatar also works as a keyboard greeting button. Reduced-motion preferences disable idle motion and automatic blinking. There is no facial tracking, lip sync or full skeleton rig.

The background uses a continuous panoramic stardust band surrounding the classroom, roughly twice the former centerline length. Its curved extensions join beyond the central view, with seamless periodic noise and no faded endpoints. Five soft depth layers, fine particles, soft twinkling and slow drift preserve the quiet atmosphere. Warm classroom edges, subtle glazing and a softer floor finish echo the supplied visual direction. The chair has circular corner arcs on both the seat and backrest, rolled three-dimensional edges and rounded tubular supports. There are no solid planets or solar-system orbit decorations. Reference images themselves are not published.

## Honest demo boundaries

The cat uses the original Room 001 offline chemistry, English and mathematics scripts, not a large language model. Optional speech is browser text-to-speech, not voice input. There is no backend, account system, real teacher marketplace, WebRTC, multi-user XR, payment, deposit or penalty.

Basic learning is free, with no VIP, memberships, ads or paywall. Participation is voluntary. Any future appreciation payment would be optional and transparently handled; this demo implements no payment.

## Local preview

Serve this directory:

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/. No package installation or build is needed. ES modules should be served over HTTP rather than opened as local files.

## Publish to GitHub Pages

This folder is ready to publish from the repository main branch root. In Settings → Pages, select “Deploy from a branch”, main, / (root). All runtime paths are relative, including the local Three.js runtime; there are no external fonts, trackers or CDN dependencies.

## Files

- index.html — the three entry points, classroom chat and reservation dialog
- styles.css — responsive space interface
- app.js — navigation, local booking, offline teaching UI and capability states
- tutor.js — original Room 001 lesson scripts
- space-scene.js — 3D classroom, provided teacher loading, cosmos, camera and optional single-user WebXR
- cat-teacher.glb — original-detail teacher with a continuous smile morph and eyelid surface metadata
- cat-teacher.js — local model cache, continuous facial weights, curved eyelids and teacher picking
- meshopt_decoder.mjs / MESHOPT-LICENSE.txt — pinned Meshoptimizer 1.3.0 decoder and MIT notice
- GLTFLoader.js / BufferGeometryUtils.js — local Three.js r161 loader and utility
- three.module.min.js / THREE-LICENSE.txt — pinned Three.js runtime and MIT notice

Bookings are stored only under localStorage key boundless_demo_booking. Chat is in page memory and is cleared on reload. Browser text-to-speech behavior depends on the browser and operating system. Neither site files nor this public repository contain chat archives, original cat photographs or service credentials.

THREE-LICENSE.txt covers the bundled third-party Three.js runtime, GLTFLoader and BufferGeometryUtils. MESHOPT-LICENSE.txt covers the bundled Meshoptimizer decoder. The supplied character asset is included for this demo; no separate downstream redistribution license has been declared. A separate license for the original project code has not been selected.
