// PLAN.md §03 — Figma's `createImage` rejects a side over 4096px. Applied
// to the *output* of the full-resolution pipeline (Resize/Tile/Blend can
// all grow the frame past the source's own size), never to the input.
export const FIGMA_MAX_IMAGE_DIMENSION = 4096

// PLAN.md §05 Phase 05 — live preview decodes a downscaled copy so a 4K
// source never pushes full-resolution pixels through the pipeline on
// every settings tweak. Generous enough to stay sharp at the preview's
// 4x zoom ceiling for anything up to a 400px on-screen pane.
export const PREVIEW_MAX_DIMENSION = 1600
