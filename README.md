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

The background uses a continuous panoramic stardust band surrounding the classroom, roughly twice the former centerline length. Its curved extensions join beyond the central view, with seamless periodic noise and no faded endpoints. Five soft depth layers, fine particles, soft twinkling and slow drift preserve the quiet atmosphere. Warm classroom edges, subtle glazing and a softer floor finish echo the supplied visual direction. The chair has a simple symmetric seat and backrest with continuous circular corners and rolled edges. Each panel is one indexed surface, mirrored from the same quadrant samples, with shared boundary vertices and analytic smooth normals. Its supports are rounded tubes. There are no solid planets or solar-system orbit decorations. Reference images themselves are not published.

## Honest demo boundaries

This snapshot connects the existing classroom to a separate Cloudflare Workers + D1 gateway for an invite-only DeepSeek Flash text pilot. The website remains public and requires no ChatGPT account. The gateway enforces invitation access, short-lived sessions and a shared conservative daily API budget; there is no provider key in this repository. A configured-service failure is shown honestly and never silently replaced with a scripted reply. If the operator deliberately clears apiOrigin, the interface explicitly labels the original Room 001 chemistry, English and mathematics scripts as offline.

The same classroom supports multi-turn Chinese/English dialogue, waiting, cancellation, retrying the same request and starting a new conversation. The teacher is gentle, cute and patient, with a small cat-like touch and careful scientific explanations. Model output still needs checking; there is no retrieval, laboratory tool, curriculum engine or guaranteed factual verifier. Successful deployment and a valid server-side model key are required; this source snapshot alone is not evidence of a working service.

For AI dialogue, text passes through Cloudflare to DeepSeek. The gateway keeps encrypted recent context for up to two idle hours, bounded to 12 recent pairs and roughly 24KB of UTF-8 content. Expired data becomes unusable immediately and is cleaned on a schedule; provider backups have separate retention. Browser chat stays in page memory and clears on reload. With the owner-requested remember-connection feature, the app access token is retained in this browser for up to 30 days; the raw invitation and provider key are never saved in browser storage. The pilot is not a long-term student record. Cancellation stops waiting and attempts to abort the request; it does not guarantee that the model provider stops billing.

Optional speech is browser text-to-speech, not voice input. This static directory does not include a running backend. There is no account system, real teacher marketplace, WebRTC, multi-user XR, payment, deposit or penalty.

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
- app.js — navigation, local booking, teaching UI, service states and offline fallback mode
- tutor.js — original Room 001 lesson scripts
- teacher-client.js — provider-independent dialogue transport, 30-day remembered access, explicit disconnect and memory-only conversation identity
- teacher-config.js — public HTTPS gateway origin only; an intentionally empty origin means explicitly offline
- space-scene.js — 3D classroom, provided teacher loading, cosmos, camera and optional single-user WebXR
- cat-teacher.glb — original-detail teacher with a continuous smile morph and eyelid surface metadata
- cat-teacher.js — local model cache, continuous facial weights, curved eyelids and teacher picking
- meshopt_decoder.mjs / MESHOPT-LICENSE.txt — pinned Meshoptimizer 1.3.0 decoder and MIT notice
- GLTFLoader.js / BufferGeometryUtils.js — local Three.js r161 loader and utility
- three.module.min.js / THREE-LICENSE.txt — pinned Three.js runtime and MIT notice

Bookings are stored only under localStorage key boundless_demo_booking. Browser chat is in page memory and is cleared on reload; AI mode also uses the bounded encrypted backend context described above. Browser text-to-speech behavior depends on the browser and operating system. Neither site files nor this public repository contain chat archives, original cat photographs or service credentials.

THREE-LICENSE.txt covers the bundled third-party Three.js runtime, GLTFLoader and BufferGeometryUtils. MESHOPT-LICENSE.txt covers the bundled Meshoptimizer decoder. The supplied character asset is included for this demo; no separate downstream redistribution license has been declared. A separate license for the original project code has not been selected.

The website remains public; real-AI pilot access is invite-only. Provider credentials and the daily budget are enforced at the gateway, never by client-side counters. Do not publish the backend environment, invite codes or quota database. Browser text rendering uses textContent rather than executing model HTML.

## Gentle board update

The two decorative arrows beside Match and Reservation are removed. Replies now have readable emphasis, lists, code, simple tables and safely typeset mathematics through local KaTeX 0.19.1. The original character and model cache remain unchanged.

The cat teacher uses a warmer, gently playful teaching voice and returns a concise board title with up to three points in the same model call. These notes appear on the actual 3D whiteboard and stay available when entering the seated space; starting a new conversation clears them. Scientific conditions and uncertainty should remain in the summary. If an older gateway reply lacks notes, the client extracts short existing sentences without another API call. Summaries and replies can still contain model mistakes.

The 23-file snapshot adds teacher-content.js, katex.mjs, katex-local.css and KATEX-LICENSE.txt. Model HTML is treated as text; the renderer creates safe DOM elements and uses KaTeX with untrusted-resource features disabled. KaTeX's original WOFF2 fonts are embedded in the local stylesheet. Retain its MIT license.

Quiet-entry-14 makes each home entry underline match its own word width using an intrinsic-width inline-flex button. Keep Match and Reservation independent; do not stretch their borders to the anchor width or restore decorative arrows. The teacher/board features remain gentle-board-13 and the model cache remains fluid-cat-6.

## Remember connection

Enter the invitation once to remember the connection in the same browser for 30 days. Refreshing or starting a new dialogue keeps access; “退出连接” removes the saved connection, including in other open tabs. The access credential is scoped to this gateway and expires at the server-issued deadline. If browser storage is unavailable, the page says that it could not remember the connection. This remembers access, not chat transcripts. There is no new 1,000-question limit; the existing shared RMB5/day API budget remains.

## Gentle tail update

The two home captions beneath Match and Reservation are removed. The supplied teacher now has a subtle, continuous tail sway with slowly varying amplitude and speed. A smooth geodesic mask anchors the tail root, and the existing mesh is bent only during rendering. The original GLB, 4K texture, face, proportions and fluid-cat-6 model cache remain unchanged. There are no programmed pauses; reduced-motion preferences smoothly return the tail to rest. cat-tail-rig.js contains the small derived weight map. The owner handles visual and device acceptance.
