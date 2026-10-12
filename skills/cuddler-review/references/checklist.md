# Review checklist

Score every clip against all three parts. Anchor each finding to a timestamp or frame file, and give the fix, not just the flaw.

## A. Machine checks (`summary.txt`)

| Check | PASS | WARN | FAIL | Read it with |
|---|---|---|---|---|
| Duration | within 0.6 s of the expected length | — | otherwise | Seedance renders whole seconds; a short file means a cut-off render |
| Aspect | matches the expected ratio (±2%) | — | otherwise | A first-frame clip takes its image's shape |
| Audio stream | present | — | missing | Cuddler and Seedance clips carry audio unless silence was requested |
| First sound onset (voice band) | ≤ 2.0 s | 2.0–3.0 s | > 3.0 s | Approximate; confirm the mouth starts moving in the frames |
| End hold (after the last sound) | ≥ 1.5 s | < 1.5 s | — | Ambience can hide it; check the last frames for a closed mouth and eye contact |
| Longest silence inside the clip | ≤ 3.5 s | > 3.5 s | — | A long hole often means a dropped line |
| Cuts | 0 when one take was asked for | any | — | Fast motion can trigger false cuts, and soft or misty shots score low (a hard cut there can read about 0.25); confirm on the sheet at the listed times |
| True peak | ≤ −1 dBTP | > −1 dBTP | — | Clipping risk after re-encoding on social platforms |
| Loudness | reported | — | — | Integrated LUFS, for information (social platforms normalise around −14) |

## B. Visual checks (sheet and frames)

1. **Story** — the planted prop, the payoff and the final line land in order, at roughly the intended moments.
2. **Identity** — the same face and hair in every frame, matching the reference if there was one.
3. **Outfit** — the same clothes throughout, fully in place; no drift back to reference clothing that the prompt replaced.
4. **Hands** — never reaching toward, touching or covering the lens. A hand fixing hair or holding a prop is fine; zoom in before judging.
5. **Head** — in POV clips the face stays toward the camera; the back of the head never shows for more than half a second.
6. **People** — only the intended people: no extra hands, faces in the background, faces in photo frames, posters or screens.
7. **Text and marks** — no subtitles, captions, watermarks, readable signs, logos, or brand-like shapes on devices and packaging.
8. **Final frame** — head and shoulders (not eyes only), mouth closed, eye contact for hook clips. It is the likely poster and end-card frame.
9. **Anatomy and physics** — no extra or melting fingers, warped faces mid-motion, floating objects.
10. **Scene stability** — the background doesn't jump (indoor → outdoor, a different room) inside a take.
11. **Props** — the object stays the same object and doesn't grow labels.

## C. Red lines — any hit means reject

- Anyone who reads as under 18: face, body, clothing, props or setting.
- School, campus, classroom, school uniform, or student framing.
- A recognisable real person or a celebrity lookalike.
- IP: a franchise character's signature look, logos, brand marks.
- Nudity, sexualised framing, clothing slipping, emphasis on wet or see-through clothing.
- Gore, weapons as the focus, real disaster imagery.

## D. Defect → prompt fix

| Defect | Add to the re-shoot prompt |
|---|---|
| A hand at the lens | "both hands stay busy (…); they never reach toward, touch or cover the camera" |
| A long head turn | "she only glances toward it with her eyes; her head barely moves and her face stays toward the camera" |
| An extra person | "only she is in frame the whole time"; replace footsteps, knocks and arrivals with an object sound |
| A face in a frame or screen | "no faces in frames, photos, posters or screens" |
| A logo | "plain casing with no logo; the screen stays dark" |
| A music bed | "only voices and ambient sound effects, no background music" — in the global rules and the tail |
| No end hold | "she finishes this line by second 13, then her lips close and she holds eye contact for two seconds" |
| A late first line | "the first line starts before second 2", and open mid-action |
| An eyes-only final close-up | "the last shot stays head-and-shoulders, with no further push-in" |
| Outfit drift | Describe the outfit in the reference line, the character line and the continuity line |
| A dropped line | Shorten the lines to the budget; one line per beat |
| A scene jump | One location, no doors or corridors; fix where the furniture stands |

A re-shoot keeps every defensive line the previous prompt had and adds the new fix; re-shoots that fix one defect often introduce another.

## E. Report template

```text
Clip: <path> (<duration> s, <W>×<H>)
Verdict: pass | fix | reject
Machine: duration ✓ · aspect ✓ · audio ✓ · onset 1.1 s ✓ · end hold 0.9 s △ · cuts 0 ✓ · −15.8 LUFS
Issues, most serious first:
  1. [P0] 7.5–8.0 s — a hand covers the lens → add "both hands stay busy …"
  2. [P1] …
Lines: verified by transcript | not verified (no transcription tool)
Next: deliver | one re-shoot with the fixes above (new gate) | discard
```
