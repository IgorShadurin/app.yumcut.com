# CTA Clips (Call‑to‑Action) – Repository Structure

This folder stores reusable CTA video clips that the daemon can append to the base video automatically during rendering.

At render time, when the user’s “Include Call to Action” setting is enabled, the daemon looks for exactly one clip using the following priority (placeholders shown literally):

- `content/cta/<lang>/<VOICE_ID>/subscribe.mp4`
- `content/cta/<lang>/subscribe.mp4`
- `content/cta/universal.mp4`

Only the first existing file in that order is used.

Notes
- `<lang>` is the target language code (lowercase). Currently used codes in the app: `en`, `ru`, `es`, `fr`, `de`, `pt`, `it`.
- `<VOICE_ID>` is the `TemplateVoice.externalId` (not the internal DB id). Place a clip under a voice folder only if that voice needs a bespoke CTA.
- The filename must be exactly subscribe.mp4.
- The daemon copies the chosen clip to `workspace/video-basic-effects/parts/final.mp4` before running the basic‑effects step. The basic‑effects script detects that file and appends it to the base sequence; the merge step (`video:merge-layers`) then applies overlays/watermark/music to the combined result.

Recommended specs
- Container: MP4 (H.264 video; AAC audio is optional).
- Orientation: 9:16 (vertical), sized for 1080x1920 timeline.
- Duration: short and snappy (e.g., 1–3 seconds). Keep file size small.
- Audio: optional. If present, ensure it’s clean and level‑matched; background music may still be mixed in the merge step.

Examples

```
content/cta/
  universal.mp4
  en/
    subscribe.mp4
    VOICE_ALPHA/
      subscribe.mp4
  es/
    subscribe.mp4
  fr/
    VOICE_BRAVO/
      subscribe.mp4
```

Troubleshooting
- If no file is found for the language/voice and no `universal.mp4` exists, the daemon logs a warning and skips the CTA.
- The daemon logs which CTA path was injected (look for “CTA injected into parts for basic-effects”).

Conventions
- Keep assets legal, brand‑safe, and free of third‑party rights issues.
- Use the exact filename `subscribe.mp4` and lowercase folder names for language codes.
- Prefer short clips to avoid noticeable pacing slowdowns at the end of the video.
