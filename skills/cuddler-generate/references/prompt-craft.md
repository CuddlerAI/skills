# Prompt craft for Seedance-class video models

Practical rules for writing video prompts that the Cuddler catalog's models (Seedance 2.x and similar) follow well. Distilled from a study of a few hundred high-performing public prompts and from in-house test batches. The examples here are original.

## 1. Pick the shape by length

| Clip | Shape | Size |
|---|---|---|
| 4–8 s | **One paragraph**: subject + one action + setting, one camera move, light and palette, a sound line, what must not change | 60–150 words |
| 10–15 s | **Timecoded beats**: a one-line story (goal → obstacle → payoff), a style line, then 3–5 beats of ~3 s, then sound and continuity | 150–450 words |
| 20–30 s | **Production document**: global rules → format → references → characters → style bible → shot timeline → sound design → continuity → avoid-list | 400–1,200 words |
| any, one camera path | **One continuous take**: the rig, its speed and height, then "camera reaches X at t" events | 150–600 words |

Long prompts are normal for 30-second clips; they fail from contradictions, not length. Before quoting, reread for clashes (two aspect ratios, two durations, a character who is both sitting and walking in the same beat).

## 2. The order of blocks (long prompts)

1. **Global rules** — the one or two rules the model breaks most, stated first and marked as overriding the rest: no background music; dialogue only in <language>; no on-screen text.
2. **Format** — duration, aspect, number of shots and how they join (hard cuts, one take).
3. **References** — what each image controls: "@Image1 = her face, hair and outfit only; ignore its background and any text in it".
4. **Characters** — adult age range, build, face, hair, wardrobe; wardrobe changes per part of the story.
5. **Style bible** — medium (anime, painterly, 3D, live action), lens and depth of field, light and its direction, palette, texture or era. Replace adjectives with settings: not "cinematic", but "35 mm, shallow focus, low warm key light from the left, light film grain".
6. **Shot timeline** — per beat: where, framing, one main action, one camera move.
7. **Sound design** — ambience per location, key effects with their moment, each spoken line with speaker, language and delivery, the music rule.
8. **Continuity** — what must match across shots (face, outfit, key prop, time of day).
9. **Avoid-list** — short, last, and only things that actually went wrong before.

## 3. Beats

- About **3 seconds per beat**, each with **one main action and one camera move**. Two actions in one beat blur together; a beat with no action stalls.
- The **first spoken line starts within 2 seconds**, and the first frame is already inside the event — no slow establishing lead-in.
- End on a **hold**: say when the last line must be finished (for example "by second 13 of 15"), then "lips close, a small smile, eyes on the camera for two seconds". Without it, models stretch the last line to the final frame.
- For 30 s: 8–10 beats, a clear goal → obstacle → result, and the last beat as the payoff or a question to the viewer.

## 4. Sound

- Write sound as its own section: ambience, 1–3 key effects with their moments, dialogue, and the music rule.
- Default music rule: **"only voices and ambient sound, no background music"**. Models add a soft music bed about half the time unless told not to. Put the rule in the global rules too.
- Dialogue: speaker, language, delivery, and the line in quotes, in the target language. For a non-English line add "speaks only <language>, a little slowly".
- Speech budget: spoken time ≤ ~60% of the clip. Rough speaking rates: English ~2.7 words/s, Spanish ~2.6 words/s, Chinese ~4.6 characters/s, Japanese ~6 characters/s. For a 15 s clip that is ~25–28 English words across 2–4 lines.
- Seedance 2.5 bracket convention (optional, useful in long prompts): `( )` music, `< >` sound effects, `{ }` dialogue, `【 】` on-screen text.
- Interruptions are **object sounds**, never people: a phone buzzing on a table, a kettle, rain on the window, ice cracking in a glass, keys dropped on a counter, a car horn outside, a station announcement. "Footsteps", "a knock" or "someone approaches" makes the model draw that person.

## 5. References and identity

- A reference image locks identity (face, hair, outfit), not the scene. With references, the prompt's **first sentence sets the scene**: where, what light, where the character stands or sits, what they wear, where the prop is.
- References drag in their own background and clothing. If the reference shows something you don't want (a car, a logo, a short skirt, a crowded street), say so and describe the replacement in three places: the reference line, the character line and the continuity line.
- Write the look in words as well as attaching the image — hair, eyes, build, outfit, art style — so identity survives motion.
- If the viewer's own persona appears in frame, describe that person too, in third person, as a clearly different second subject, and assign each outfit explicitly ("she wears …; he wears …"). Otherwise keep the viewer as the camera with no visible body.

## 6. Known failure modes and the fix that worked

| What goes wrong | Write instead |
|---|---|
| A second person or extra hands appear | "Only she is in frame the whole time; no other people, hands or faces"; interruptions as object sounds |
| Faces show up in photo frames, posters or TV screens | "No faces in frames, photos, posters or screens" |
| Brand logos grow on phones, laptops, bottles | "plain matte casing with no logo", "the phone screen stays dark" |
| Props sprout labels and modern packaging | Describe the prop concretely: "an unlabeled clay jug" |
| The word "microphone" adds a mic stand | Don't mention microphones at all |
| The word "phone" in a camera direction puts a phone in frame | Give the camera a physical position instead: "camera fixed on the shelf at her chest height" |
| The final push-in ends on eyes only | "The whole face stays in frame from hairline to chin; the last shot is a head-and-shoulders frame with no further push-in" |
| Hands reach toward or cover the lens | Give both hands a task ("one hand on the counter, the other holding the cup"); never write "grabs the camera", "pulls the camera closer" or "selfie" |
| A head turn lasts 2–3 s and shows the back of the head | "She only glances toward the sound with her eyes; her head barely moves and her face stays toward the camera" |
| Low or high selfie angles cause framing accidents | Keep the camera at eye level |
| Objects float or hover | Describe continuous physics: "slides off, falls at normal speed, is caught a hand's width above the floor"; add "no hovering" |
| A "one continuous take" at 30 s gets cut | Hold one-takes to ~15 s, or write deliberate hard cuts at stated times |
| The last line runs to the final frame | State the deadline ("finish this line by second 13") and the hold |
| Background music creeps in | The music rule in both the global rules and the sound section |
| Doors, corridors and glass doors cause scene jumps and extra people | Stage the scene in one open room or outdoor space |

Re-shoots regress: a re-shoot prompt fixed for one defect often breaks something else. When you re-shoot, keep every defensive line from this table in the prompt, then add the specific fix.

## 7. Red lines, written into the prompt

- Adult characters only, stated plainly: "a woman in her late twenties". Never school, campus, students, school uniforms, or family-role romance.
- No real people, public figures or lookalikes; for a realistic face add "an original face that does not resemble any real person".
- No IP, franchise, character or brand names — describe the look instead ("a silver-haired swordswoman in a long dark coat").
- Tension through gaze, distance, timing, props and sound — never body parts, undressing, wet or see-through clothing. "Fully dressed; the outfit stays in place" is enough; don't list what must not be shown.
- No weapons, blood or real disasters.

## 8. Worked examples (original)

**6 s, one paragraph (9:16)**

```text
6-second vertical shot. A glassblower in her forties, cropped grey hair, leather apron over a rolled-sleeve linen shirt, turns a glowing orange bulb of glass on a steel pipe at the furnace mouth, then lifts it and blows a slow breath into it. Camera: slow push-in from waist height to a close shot of the bulb as it swells. Light: furnace glow from the right, the rest of the workshop in cool blue shadow; fine haze. Sound: roaring furnace, the soft hiss of the glass, no music. Keep her apron and the pipe identical from first to last frame.
```

**15 s, timecoded beats (16:9)**

```text
15-second rooftop sequence, 16:9. Story: a gardener races a sudden gust → loses a seed packet to the wind → catches it one-handed at the railing.
Style: soft painterly animation, warm late-afternoon light, long shadows, gentle film grain. Camera language: close and fluid.
0–3s — Medium shot: a man in his thirties in a denim apron kneels between raised beds, tearing open a seed packet. Camera: slow push-in.
3–6s — Wide: a gust lifts the packet out of his hand and tumbles it across the gravel. Camera: quick pan following the packet.
6–9s — Low tracking shot at gravel level: he scrambles after it, apron flapping. Camera: tracks alongside.
9–12s — Medium close-up at the railing: he lunges and snaps the packet out of the air a hand's width from the edge. Camera: holds steady.
12–15s — Close-up: he exhales and laughs, seeds spilling into his palm. Hold still for the last second.
Sound: rooftop wind, gravel crunch, a flapping paper packet, a relieved laugh; no music.
Continuity: same denim apron and rolled sleeves in every shot; the packet is bright yellow throughout.
```

**30 s, production document (skeleton)**

```text
GLOBAL RULES (override everything below): no background music — only voices and location sound; all dialogue in English; no on-screen text or logos.
FORMAT: 30 seconds, 9:16, 9 shots joined by hard cuts at the stated times.
CHARACTERS: MARA — early thirties, athletic, short black curls, a burgundy wool coat over a grey turtleneck.
STYLE BIBLE: semi-realistic 2.5D animation; 35 mm look, shallow focus; sodium-orange street light against blue dusk; light grain.
SHOT TIMELINE:
0–3s SHOT 1 — Night-market alley, medium shot. Mara counts coins at a noodle stall. Camera: slow push-in. She says: "Last bowl tonight?"
3–6s SHOT 2 — …
…
27–30s SHOT 9 — Head-and-shoulders, eye level. She looks straight into the lens: "So — do you trust me or not?" Lips close; hold for two seconds.
SOUND DESIGN: sizzling woks and crowd murmur; a tram bell at 12s; rain starting at 21s.
CONTINUITY: same burgundy coat and curls in every shot; the coin purse stays in her left hand.
AVOID: other faces in close-up, readable signs, hovering objects.
```
