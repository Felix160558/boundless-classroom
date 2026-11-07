# Boundless Classroom · Space Version

## Quiet input 33

The composer uses one microphone with automatic Chinese/English transcription and one leftmost plus icon for images/PDF. No manual language buttons. A pause or Stop ends the recording; text remains editable before Send. Audio is transcribed through the invited gateway, not guessed from browser language. Recording is bounded to 60 seconds; actual recognition accuracy and device acceptance are owner-reviewed.

Images/PDF can be chosen, pasted or dropped. PDF rendering is local; choose up to three pages/images per question. Only selected images are sent when Send is pressed. DeepSeek image references expire in two hours; follow-up context is bounded. Existing invited access, short-lived encrypted context and shared RMB5 daily admission cover dialogue, voice and transcription. No credentials or user-uploaded assets are in this public repository.

PDF.js 6.5.438 is lazy-loaded locally with its Apache-2.0 license. The site remains native HTML/CSS/ESM, with the original teacher and classroom. This release is prepared locally; publication status is recorded by the maintainer.


## Bilingual input 32 · 2026-11-07

Dictation offers equal Chinese / English controls, persists the explicit choice, and uses browser language preferences on first use. Remove the draft-text heuristic: an empty or Chinese draft must not force an English recording through zh-CN. Each recording freezes its language; switching stops the old take and preserves editable text, without auto-starting the microphone. Keep the Safari user gesture, restart and late-event isolation. English recording feedback uses English. Browser Web Speech still uses one recognition language per take, not guaranteed automatic bilingual detection.

The teacher follows the current student's actual question for reply and board language, ignoring the language of Chinese scene metadata. English questions get English explanations/board notes and Chinese questions get Chinese, with explicit translation/bilingual requests taking precedence. Mixed speech follows the main question language. English molecular geometry terms remain. No provider, cost cap, stored connection, invite, 3D scene or cloned-voice changes. Owner performs microphone/audio/device acceptance. Static allowlist remains 33 files; six-file incremental release. Source: docs/BILINGUAL_INPUT_32.md.

## Quiet shape 31 · 2026-11-07

Molecular geometry names now use English on the whiteboard (Bent, Linear, Trigonal pyramidal, Tetrahedral and appropriate local geometry for complex molecules). Remove geometry-name labels beneath 3D models; keep only the formula identifier. Preserve all original atom positions, bonds, dipoles, model rotation and character visuals. The teacher prompt requests English shape terminology, with a narrow client-side terminology normalizer for board text; ordinary explanations remain bilingual.

Voice startup removes a redundant database lookup before atomic admission, carries voice capability in authenticated chat responses, and reduces the initial PCM buffer from 140 ms to 80 ms. Preserve the same voice, speech rate, one synthesis per answer, cancellation, manual Safari resume, bounded audio and shared RMB5/day admission. Actual network/provider latency and listening acceptance remain with the owner. No paid model or synthesis checks. Publication status is recorded separately; local implementation is not deployment evidence.


## All-subject classroom 30 · 2026-11-07

This release supersedes version 29's fixed four-step molecular chapter. There is one open, all-subject conversation: remove the chapter launcher, chapter controls and subject tabs. Mathematics, physics and chemistry are teaching priorities, not mandatory routes. Keep the original cat, deep-space classroom, live translucent background and existing conversation/voice controls; the chat rail is smaller and quieter.

The local ChemBoard catalog contains 51 finite molecular/ion structures. Explicit requests such as “展示水分子的 3D 模型” resolve through a deterministic, allowlisted dialogue tool and display actual Three.js objects in the existing room. Chinese/English names and formulas are supported; ambiguous isomers require clarification. Up to two structures can be compared. Drag a model to rotate it; subsequent requests can switch models, hide them, or show/hide a supported net-polarity overlay. Suggestions in the teacher's reply remain optional actions rather than silently replacing the current scene. Never invent unavailable structures or execute model-supplied code, URLs or coordinates.

Net-polarity graphics are curated for H₂O, NH₃, CO₂, CH₄, benzene and HCN only. Other structures remain viewable but unsupported net directions must be disclosed. Arrows use the chemical positive-tail to negative-head convention and qualitative lengths; they are not numerical dipole calculations. Raw SDF partial charges are unused. Imported coordinates and source attribution remain in the catalog; the original ChemBoard project is unchanged.

The teacher receives bounded scene/tool context and can introduce an actually displayed model, invite observation and ask a relevant guiding question. It cannot see the live canvas or generate any requested model. The backend persona is all-subject, warm and cat-like, with explicit scientific uncertainty. Existing invited access, remembered connection, cloned voice and shared RMB5 daily limit remain. Publication and device acceptance are separate: this source is not proof of a live deployment. The owner performs visual, audio and device checks. Static allowlist: 33 files; molecule-lesson-content.js is an inert legacy cache stub, not an active chapter.

## Molecular classroom 29 · 2026-11-07

A four-step H₂O / CO₂ comparison lesson lives inside the existing classroom chat rail. Molecules are actual Three.js objects from ChemBoard atom/bond data; students can drag them, see bond-polarity arrows, compare cancellation/resultant direction and read synchronized whiteboard notes. The cat presents a curated script, clearly labelled guided narration. Optional reading uses the existing authenticated/budgeted cloned-voice path; entering a shared lesson link never starts paid audio automatically. Follow-up questions carry bounded current-step context through the existing chat contract; the model is not claimed to see or manipulate the scene. No backend deployment needed.

Water's imported conformer (~103.98°) is slightly idealized to the reference 104.5° for this teaching display, preserving original source coordinates in code and individual bond lengths. CO₂ is linear. Chemical arrows point positive-tail to negative-head; their lengths are qualitative and not computed dipole magnitudes. Raw SDF partial charges are deliberately unused. All original character assets, homepage, glass room, voice identity, access and daily RMB5 cap remain. Current step/models/board carry into the existing seated VR view; no new XR input or spatial audio. Owner handles visual/audio/device checks. Static allowlist: 31 files. Release details are recorded privately.

## Smooth voice 28

Preserves the existing classroom and cloned voice. Supports opt-in PCM streaming from the authenticated gateway so playback can begin before the full answer audio arrives. One synthesis request is made per answer; cancellation and manual Safari resume never start a replacement paid request. Older gateways or browsers without WebAudio retain the complete MP3 path. The voice capability check starts while the text response is being prepared. Real latency, audio and device acceptance remain with the owner.

## Cat voice 27

Adds an optional invited voice gateway and remembered read-aloud preference. CosyVoice credentials and the selected voice live only on the existing backend; the public files contain no original recording or provider key. Audio playback coordinates with the existing teacher mouth animation and cancels on navigation, interruption or microphone use. The original character, classroom and teacher-presence-26 motions remain. Provider configuration and successful playback are required before calling the clone connected; unconfigured gateway operation remains explicitly browser read-aloud. The owner handles visual/audio/device acceptance. This static snapshot contains 29 files; model cache stays refined-cat-22.


## Teacher presence 26

This version coordinates existing facial expressions with classroom states and adds restrained independent nods and head tilts. A local head/neck binding keeps the collar boundary anchored, with the face, glasses, eyelids, mouth details and fine fur following the same motion. Preserve the supplied character, original GLB/4K atlas, proportions and fixed stance; do not add whole-body bobbing, arm gestures or whiteboard pointing. Transitions remain smooth, VR motion is smaller and reduced-motion preferences are respected. There are no new AI calls or backend changes. Modules use teacher-presence-26; model/fur-data cache stays refined-cat-22. The public allowlist now includes cat-presence.js and contains 28 files. Visual/audio/device acceptance belongs to the owner; publication status is recorded privately.

## Natural mouth 25

The mouth opens along the supplied model's original lip seam through a restrained lower-jaw hinge, with soft cheek/neck blending. The small cavity spans the moving lip seam and the canines follow the upper lip. This replaces the earlier oval clipping in the face and fine-fur shaders. Original vertex identities precede appended seam vertices so the current grooming references remain attached. The same head and original GLB/4K atlas are retained without rescaling; asset/data cache stays refined-cat-22. App, scene, teacher and updated grooming modules use natural-mouth-25. Keep the existing speech lifecycle and version 24 amplitude; articulation is approximate, not measured pitch or phoneme alignment. The 27-file static allowlist, UI, tail, backend access and budget remain. Visual/audio/device acceptance belongs to the owner. Other proposed teacher gestures are a future plan only.


## Expressive mouth 24

Speech-driven lip movement is 2.2 times the previous version, with softly eased accents and occasional small openings that reveal a three-dimensional oral cavity and rounded little canines. Teeth recede with the aperture when the mouth closes. Emphasis is estimated from utterance boundaries and continuous prosody, not measured audio pitch, waveform or phoneme alignment. Preserve the supplied model, exact 4K atlas, head scale and outline, existing Smile, fine-fur attachment, tail and UI. App, scene and teacher code use expressive-mouth-24; the grooming module uses expressive-mouth-24 to clip fibers at the opening, and model/fur-data cache stays refined-cat-22. The public allowlist remains 27 files. Visual, audio and device acceptance belongs to the owner; publication status is recorded privately.


## Speaking cat 23

The existing browser read-aloud now drives two small runtime mouth poses on the same head mesh. Playback start/resume activates continuous, softly varied articulation; word/sentence boundary events add restrained accents when supported. Pause, end, errors, cancellation, navigation and microphone entry release the mouth smoothly. This is approximate speech-cued articulation, not measured audio or phoneme alignment. The original GLB, 4K texture, head scale, face outline and all existing actions remain; the fine fibers follow every active face morph. No cloned voice, new supplier or API charge is added. App, scene, teacher code and grooming code use speaking-cat-23; model preload/cache and fine-fur data remain refined-cat-22. Visual, audio and device acceptance belongs to the owner.


## Refined cat 22

The teacher keeps the supplied character and original vertex/morph identities with bounded surface cleanup. Its exact original 4K texture and UVs remain. cat-fur.js and cat-fur.bin add 56,000 short tapered 3D fiber ribbons on exposed fur, with camera-facing curves, soft color variation and distance fade. Clothes, the Chemistry book and the eye/glasses region are masked out. Roots follow the actual tail position buffer and existing smile deformation. The GLB alone contains the mesh cleanup; the separate runtime grooming layer is also needed for fine fibers. Model/app/scene imports and preload use refined-cat-22; tail topology compatibility remains fluid-cat-6, with time-tail-19 weights. The allowlist is 27 static files. Original baked texture defects are not all removed; no fully rebuilt glasses, book, clothing or physical hair scattering is claimed. The owner requested this model-only multiple-angle and close-up inspection; headset/device/performance acceptance is still separate. Existing UI, text AI, dictation, whiteboard, access and budget remain.


Love, Share and Peace.

A quiet classroom floating in space. A public, static learning demo built with HTML, CSS, JavaScript and a pinned local copy of Three.js 0.161.0. Visitors do not need a ChatGPT or GitHub account.

## Explore

- **Match** opens the cat teacher's classroom directly. No real-person matching.
- **Reservation** saves a demo booking in the current browser. No teacher is notified.
- **Enter the VR** places you directly in the student chair, looking past your desk toward the cat teacher and whiteboard. Glass walls on both sides and a glass ceiling open onto the existing stardust universe. Drag, swipe or use arrow keys to look around from the fixed seat; there is no extra sit-down button or movement panel.
- On a compatible HTTPS/WebXR device, an experimental single-user headset entry is offered. Its first tracked frame is aligned to the same seat, and subsequent physical head motion remains tracked. Actual headset compatibility has not been verified.

The teacher uses the original supplied 3D character. The detail refinement retains the original topology and exact 4096px source JPEG texture, with bounded surface cleanup and a separate short-fiber layer, without mesh simplification, texture resizing or vertex quantization. The asset is 19.64 MB: visual detail and future close-up viewing take priority over a tiny first download. Local Meshopt compression remains lossless for the stored geometry. The model starts preloading when the page opens; a browser-local model cache is used when available.

Entering Match gradually brings out a gentle closed-mouth smile. Click or tap the teacher for a smile or wink; resting the pointer over it gives a quiet acknowledgement. One fixed head mesh is used throughout: a localized smile morph moves the mouth corners and inner cheeks, while small curved 3D eyelids gradually cover the stationary eyes. The head is never replaced or rescaled. Smooth easing and damped weights preserve continuity even when an interaction interrupts another. The classroom avatar also works as a keyboard greeting button. Reduced-motion preferences disable idle motion and automatic blinking. Read-aloud uses restrained approximate mouth articulation; there is no facial tracking, measured phoneme alignment or full skeleton rig.

The background uses a continuous panoramic stardust band surrounding the classroom, roughly twice the former centerline length. Its curved extensions join beyond the central view, with seamless periodic noise and no faded endpoints. Five soft depth layers, fine particles, soft twinkling and slow drift preserve the quiet atmosphere. Warm classroom edges, subtle glazing and a softer floor finish echo the supplied visual direction. The chair has a simple symmetric seat and backrest with continuous circular corners and rolled edges. Each panel is one indexed surface, mirrored from the same quadrant samples, with shared boundary vertices and analytic smooth normals. Its supports are rounded tubes. There are no solid planets or solar-system orbit decorations. Reference images themselves are not published.

## Honest demo boundaries

This snapshot connects the existing classroom to a separate Cloudflare Workers + D1 gateway for an invite-only DeepSeek Flash text pilot. The website remains public and requires no ChatGPT account. The gateway enforces invitation access, short-lived sessions and a shared conservative daily API budget; there is no provider key in this repository. A configured-service failure is shown honestly and never silently replaced with a scripted reply. If the operator deliberately clears apiOrigin, the interface explicitly labels the original Room 001 chemistry, English and mathematics scripts as offline.

The same classroom supports multi-turn Chinese/English dialogue, waiting, cancellation, retrying the same request and starting a new conversation. The teacher is gentle, cute and patient, with a small cat-like touch and careful scientific explanations. Model output still needs checking; there is no retrieval, laboratory tool, curriculum engine or guaranteed factual verifier. Successful deployment and a valid server-side model key are required; this source snapshot alone is not evidence of a working service.

For AI dialogue, text passes through Cloudflare to DeepSeek. The gateway keeps encrypted recent context for up to two idle hours, bounded to 12 recent pairs and roughly 24KB of UTF-8 content. Expired data becomes unusable immediately and is cleaned on a schedule; provider backups have separate retention. Browser chat stays in page memory and clears on reload. With the owner-requested remember-connection feature, the app access token is retained in this browser for up to 30 days; the raw invitation and provider key are never saved in browser storage. The pilot is not a long-term student record. Cancellation stops waiting and attempts to abort the request; it does not guarantee that the model provider stops billing.

The microphone beside the composer uses browser-managed speech recognition to transcribe speech into an editable draft; it never sends the draft automatically. The separate read-aloud toggle remains browser text-to-speech. This static directory does not include a running backend. There is no account system, real teacher marketplace, WebRTC, multi-user XR, payment, deposit or penalty.

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

The 24-file snapshot adds teacher-content.js, katex.mjs, katex-local.css and KATEX-LICENSE.txt. Model HTML is treated as text; the renderer creates safe DOM elements and uses KaTeX with untrusted-resource features disabled. KaTeX's original WOFF2 fonts are embedded in the local stylesheet. Retain its MIT license.

Quiet-entry-14 makes each home entry underline match its own word width using an intrinsic-width inline-flex button. Keep Match and Reservation independent; do not stretch their borders to the anchor width or restore decorative arrows. The teacher/board features remain gentle-board-13 and the model cache remains fluid-cat-6.

## Remember connection

Enter the invitation once to remember the connection in the same browser for 30 days. Refreshing or starting a new dialogue keeps access; “退出连接” removes the saved connection, including in other open tabs. The access credential is scoped to this gateway and expires at the server-issued deadline. If browser storage is unavailable, the page says that it could not remember the connection. This remembers access, not chat transcripts. There is no new 1,000-question limit; the existing shared RMB5/day API budget remains.

## Gentle tail update

The two home captions beneath Match and Reservation are removed. The supplied teacher now has a subtle, continuous tail sway with slowly varying amplitude and speed. A smooth geodesic mask anchors the tail root, and the existing mesh is bent only during rendering. The original GLB, 4K texture, face, proportions and fluid-cat-6 model cache remain unchanged. There are no programmed pauses; reduced-motion preferences smoothly return the tail to rest. cat-tail-rig.js contains the small derived weight map. The owner handles visual and device acceptance.


## Classroom load 17

The first classroom render no longer waits for the tail weight map, GLB loader or geometry decoder. Those resources load separately after the scene starts; idle tail motion attaches after the complete teacher appears. The unchanged detailed GLB preloads at low priority so essential classroom scripts can load first. A 45-second startup notice and stalled-model download timeout replace indefinite waiting; optional-tail failures leave the teacher and classroom visible and explain the missing animation. The small tail sway has a slightly larger lateral range to remain perceptible, retaining smooth random targets, tip delay and the fixed root. Scene/app cache version is classroom-load-17; model and weight-map cache identities remain unchanged. Visual/device acceptance belongs to the owner.


## Native tail 18

The body tail now uses two native relative morph targets driven by continuous sine/cosine weights with smooth random amplitude/rate changes and delayed tip motion. This replaces the previous onBeforeCompile shader hook. Native morphs apply to the visible body, shadows and raycasting through the same renderer path as the existing facial animation. The two targets affect only the mapped tail vertices, keep the root fixed and leave the stored GLB, face, neutral positions, UVs, scale and 4K texture unchanged. Keep the lazy tail-data attachment from classroom-load-17. Read-only data-tail-motion and data-tail-pose attributes on the scene container assist with reported animation failures without adding visible controls or storing user data. Respect reduced motion. Naturalness and device acceptance remain with the owner.


## Time tail 19

Idle tail motion is driven directly by the absolute seconds supplied by renderer.setAnimationLoop, independently of clicks, hover, classroom entry or face reactions. It uses a small anchored rotation field with soft tip delay, gently varying analytic phase/amplitude and a smooth startup. A fresh geometry instance carries a dynamic position buffer; only mapped tail vertices are updated from immutable neutral coordinates each frame, marked with needsUpdate. No custom shader or late-added body morph layout is required. The corrected root falloff gives the tail body meaningful movement rather than suppressing most vertices to tiny offsets. Respect reduced-motion preferences and pause rendering in hidden tabs. Keep the supplied GLB, head, texture, proportions, lazy loading, 30-day access and budget unchanged. Visual acceptance still belongs to the owner.


## Voice input 20

A small microphone beside the text field starts dictation on a user click, with interim text, a restrained listening indicator, elapsed time, stop and “重新录入”. Restart replaces the latest unedited voice take and preserves the text that preceded it. Typing, leaving the classroom, hiding the page, opening invitation access or starting a new dialogue stops listening. Sending finishes the current take first and ignores late recognition callbacks. No automatic submission or background restart occurs. Ordinary topics use Mandarin; the English topic uses en-US recognition.

Speech recognition requires a supported browser, HTTPS and microphone/recognition permission. Safari may also require Siri or Dictation enabled in system settings. Recognition may use the browser vendor's service; do not assume all audio stays on-device. The site does not save audio recordings, add an ASR backend or put credentials in the client. Only confirmed text is sent to the existing teacher gateway. Unsupported browsers and permission/service errors keep normal text input available. The lightweight dictation.js module loads independently of the classroom.

The composer is lightly transparent with one thin rounded border, subtle microphone feedback and restrained round controls. The existing teacher, space, tail, conversation, remembered access and daily budget remain unchanged. Microphone, transcription and visual acceptance belong to the owner; no live microphone test is claimed.


## Clear classroom 21

The classroom uses one full-viewport live WebGL scene, including behind the chat. Camera view offsets preserve the teacher's prior desktop/phone framing. The chat rail, header, topic controls and composer surroundings have a light translucent surface and restrained 5px backdrop blur, with no replacement background image. Readable message bubbles and the thin rounded composer remain. The supplied graduation-cap cat portrait is displayed through an SVG viewport; the name, AI-assistant badge and welcome line are native text, not a flattened banner. teacher-portrait.png is the owner-authorized UI artwork, not a private reference photograph. The static allowlist contains 25 files. App/style/scene use clear-classroom-21; original teacher geometry/texture and model cache fluid-cat-6 remain. Existing dictation, text AI, whiteboard, remembered access and budget are unchanged. Visual acceptance belongs to the owner; no browser experience test is claimed.
