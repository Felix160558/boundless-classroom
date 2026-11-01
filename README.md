# Boundless Classroom · Space Version

Love, Share and Peace.

A quiet classroom floating in space. A public, static learning demo built with HTML, CSS, JavaScript and a pinned local copy of Three.js 0.161.0. Visitors do not need a ChatGPT or GitHub account.

## Explore

- **Match** opens the cat teacher's classroom directly. No real-person matching.
- **Reservation** saves a demo booking in the current browser. No teacher is notified.
- **Enter the VR** opens a navigable 3D classroom concept, with a whiteboard, one desk, one chair, a cat teacher and teacher/learner floor markers.
- On a compatible HTTPS/WebXR device, an experimental single-user headset entry is offered. Actual headset compatibility has not been verified.

The teacher is the actual textured 3D character supplied for this project, extracted from a larger multi-character GLB. It retains the original orange fur, face, round glasses, ivory shirt, beige vest, navy tie, short trousers, Chemistry book and curled tail. The selected full-body teacher retains its original 170,111 vertices and 322,092 triangles. Its 4096px texture is re-encoded for a 15.7 MB download; initial loading has a visible progress state. This static model has no skeleton or expression animation.

The background uses continuous, gently curved stardust veils, fine particles at different depths, soft twinkling and slow drift. Warm classroom edges, subtle glazing and a softer floor finish echo the supplied visual direction. There are no solid planets or solar-system orbit decorations. Reference images themselves are not published.

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
- cat-teacher.glb — the selected textured teacher from the supplied model
- GLTFLoader.js / BufferGeometryUtils.js — local Three.js r161 loader and utility
- three.module.min.js / THREE-LICENSE.txt — pinned Three.js runtime and MIT notice

Bookings are stored only under localStorage key boundless_demo_booking. Chat is in page memory and is cleared on reload. Browser text-to-speech behavior depends on the browser and operating system. Neither site files nor this public repository contain chat archives, original cat photographs or service credentials.

THREE-LICENSE.txt covers the bundled third-party Three.js runtime, GLTFLoader and BufferGeometryUtils. The supplied character asset is included for this demo; no separate downstream redistribution license has been declared. A separate license for the original project code has not been selected.
