# Handoff: room modeling on МастерДом (for Codex)

Written 2026-10-10. Site: http://46.253.132.163/ (construction VPS, see `~/Documents/Claude/AGENTS.md`,
FLEET row "construction"). Code on GitHub matches production as of 2026-10-10 (only `.bak` files differ).
GitHub default branch: `claude/renovation-cost-estimator-Z3bQw`. Work there, commit and push.

## What is wrong today

1. **The full room planner is orphaned.** On 2026-06-10 (`514165a`, "Rework site into construction company
   website") `public/index.html` became a landing page. The old index was the only page that loaded the
   planner, so these files are now dead code, loaded by no page:
   - `public/js/floorplan.js` (2D plan on Konva: drag, zoom, edge editing, collision)
   - `public/js/walldraw.js` (draw walls / custom room shapes)
   - `public/js/shapes.js`, `snapping.js`, `furniture.js`, `viewer3d.js`
   The old page is in git: `git show 90f80c6:public/index.html` (script tags at lines 9-12 and 299-307).
   It loaded `https://unpkg.com/three@0.152.2/examples/js/...`, which three.js stopped shipping in r148,
   so that version would not work even if re-linked.
2. **What `/calculator` has now** (`public/calculator.html` + `public/js/room3d.js`, also used by
   `public/project.html`): rectangular rooms only (name, width, length, height), auto-placed furniture,
   orbit view, three.js r128 from cdnjs. It works, but a client cannot draw a real apartment.
3. **The AI design chat gives canned answers.** `ai.js` calls `https://openrouter.ai/api/v1` directly;
   from Russia that returns 403. `server.js` (`/api/chat`, around line 387) catches the error and
   silently answers with `generateMockResponse()` keywords. Broken since the site moved to the VPS
   on 2026-09-25. The fleet already has an egress for this: `OPENROUTER_BASE_URL` =
   the goodron relay on port 18443 (see content-scheduler's `.env` on the VPS for the exact value;
   read it on the server, do not copy it into git).

## Task

A. ~~Fix the chat~~: done 2026-10-10 by Claude (`OPENROUTER_BASE_URL` = goodron relay, fallback model
   `CHAT_OPENROUTER_FALLBACKS`). Skip it.

B. **Bring modeling back into `/calculator`**, merged with the current `room3d.js` viewer:
   - 2D plan tab: rooms placed side by side as one apartment, drag/snap, non-rectangular rooms
     (draw walls), doors and windows, furniture from the catalogue. Reuse the orphaned files where
     they still fit; drop what does not.
   - 3D tab: the same plan in 3D (walls, floor textures from `public/textures/`, furniture).
   - Areas from the drawn shapes feed the price calculation in `calculator.js` (walls, floor, ceiling
     areas, minus door/window openings).
   - Saved/shared projects (`/project/:id`, SQLite `projects` table) must keep loading old saves;
     store the new shape data next to the old fields, never break the old format.
   - Mobile: usable at 375 px wide (touch drag, pinch zoom), the operator's clients use phones.

## Constraints

- UI text in Russian. No em dashes in UI text.
- Plain HTML/CSS/vanilla JS, no build step. Load libraries only from a CDN that works from Russia
  (cdnjs and jsdelivr were checked 2026-10-10 and work); pin exact versions. Prefer a three.js
  release that still has a way to load OrbitControls without a bundler (r128 does, as used now).
- Host has 1 CPU / 1 GB RAM: no heavy server work, all modeling runs in the browser.
- Never print or commit `.env`. SQLite backups use `.backup`, never a file copy.
- Deploy: rsync code (not `.env`, `data/`, `public/uploads`) to `/var/www/Design-renovation/`
  as `goodron@46.253.132.163` with `--rsync-path="sudo rsync"`, then `sudo pm2 restart design-renovation`.
  Back up `data/` with sqlite `.backup` before any schema change.
- Test the real path from Russia: on the operator's Mac, `curl --interface en0 http://46.253.132.163/calculator`.

## Done when

- On a phone-width screen a user can draw a two-room apartment with a non-rectangular room, add a door,
  a window and a sofa, switch to 3D, see a price, save, and open the share link.
- An old saved project still opens.
- Orphaned files are either used or deleted; nothing unused is left in `public/js/`.
