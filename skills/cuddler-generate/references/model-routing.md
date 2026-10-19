# Model routing

How to turn "make me X" into a model and a request without guessing. The catalog is **runtime data**: `list_models` and `whoami` are the truth for this account today. This file is a guide to reading them.

## 1. Reading the catalog

`list_models` returns `{ pricingVersion, video: [...], image: [...] }`.

| Field | Use it for |
|---|---|
| `id` | The only value you may pass as `modelId`. Copy it; never type one from memory. |
| `available` | `false` = not in this account's plan or not open for it yet. Don't use it; tell the user if they asked for it. |
| `isDefault` | The model to use when the user names none (also what renders when `modelId` is omitted). |
| `requiredPlan` | Why an unavailable model is unavailable. |
| `minDurationSec` / `maxDurationSec` | Hard duration limits for this account. |
| `aspectRatios` / `resolutions` | Allowed `aspectRatio` and `resolution` values. |
| `imageModes` | `first_frame` and/or `reference`. |
| `maxReferenceImages` | How many `references` one request accepts. |
| `nativeAudio` | The clip comes with generated sound and dialogue. |
| `pricing[]` | The price of every length at every resolution, in credits. The quote is still the price you gate on. |
| image `creditsPerImage` | Price per image. |

`whoami` adds the account view: `plan.tier`, `credits.balance` and `credits.dailyAllowance`, this connection's daily `budget` (null unless Cuddler has set a daily limit; otherwise `limit`, `spent`, `remaining`, `resetsAt`), `permissions` (`create`: reference images; `spend`: paid renders) and `features` (`images`, `videos`, `uploads`).

## 2. Picking the model

1. The user named one → it must be in the list with `available: true`. If not: "`<name>` isn't available on your plan" (or "isn't a Cuddler model"), list what is, and stop for their choice. Never substitute silently and never invent an id.
2. No name → the `isDefault` entry.
3. Check the job against the entry: seconds within `minDurationSec`–`maxDurationSec`, aspect in `aspectRatios`, the image mode you need in `imageModes`, reference count ≤ `maxReferenceImages`. If the default fails a check, take the first available entry that passes and say why.
4. Cheaper only on request: when the user asks for cheaper or faster, compare `pricing[]` for the same length and resolution and take the lowest available entry that still passes step 3.

The live list always wins over anything you remember about models or plans.

## 3. Durations, aspects and references

- **Duration.** One continuous take holds best up to ~15 s. At 30 s the model tends to insert a few cuts, so write 30-second prompts as a sequence of beats.
- **Aspect.** Use a value from `aspectRatios` (typically `16:9` and `9:16`). A first-frame video takes the image's shape, so prepare the image in the shape you want.
- **Reference mode.** Up to `maxReferenceImages` images. The prompt must name each one at least once as `@Image1`, `@Image2` … in `references` order, and must not name an image that isn't attached. Say what each image controls: "@Image1 is her face, hair and outfit only".
- **First-frame mode** (`imageMode: "first_frame"`). Exactly one image; it becomes frame 0. The prompt describes motion and what happens next, not the picture itself, and contains no `@Image` tag.
- **Where references come from.** `{ "characterId": … }` for one of the user's characters (its main picture), `{ "url": … }` for an image this account made (`create_image`) or uploaded (`finish_upload`). Other URLs are refused.

## 4. What a video looks like

`get_video` returns `video`: `id`, `status` (`rendering`, `ready`, `failed`), `progress`, `pollAfterSeconds` while rendering, `videoUrl` and `posterUrl` once ready, `failureReason` and `retry` (`credits`, `free`) when it failed, and `creditsCharged`. Keep the video `id`: it is what support asks for. A ready video may also carry `files`, the same download links `get_download_link` gives, and `pageUrl`, the clip's page on cuddler.ai, which only the account's owner can open.

`get_download_link` returns `files`: one `video` and one `poster`, each with `url`, `filename`, `contentType` and `expiresAt` (about 10 minutes). With `watermark: true` the `video` file carries the Cuddler.ai corner mark (and `watermarked: true`); the first such request for a video can take up to about a minute, and `watermark_rendering` means ask again after a few seconds.

## 5. Refusals

A refused call comes back as an error whose text starts with a code, followed by a JSON `details` object with a `reason` where there is one. When credits or the plan are the reason, say what happened and what is still possible; never suggest buying credits, a plan or an upgrade.

| Code or reason | Meaning | Do |
|---|---|---|
| `CONTENT_BLOCKED` | Prompt or reference refused, or it reads as a minor | Rewrite within the red lines; nothing was charged |
| `reference_mentions_mismatch` | `@Image` tags don't match the references | Fix the tags; nothing was charged |
| `photoreal_unavailable` | Realistic looks aren't enabled for the account | Use an illustrated or 2.5D look and say so |
| `prompt_too_long`, bad duration or aspect | A request outside the model's limits | Fix the named problem; nothing was charged |
| `confirmation_required` | Cuddler asks for approval in the browser for this call | Give the user the `approvalUrl`; after they approve, repeat the identical call plus `approvalId` |
| `confirmation_pending` | The approval page has not been approved yet | Give the user the `approvalUrl` again; after they approve, repeat the identical call plus `approvalId` |
| `confirmation_declined`, `confirmation_cancelled` | The user said no to the price, or closed the confirmation (the host's dialog or the approval page) | Nothing was charged; stop. Call again only if they ask |
| `confirmation_mismatch` | The host answered a confirmation that belongs to other arguments | Nothing was charged; make the call you mean again and the host asks again |
| `confirmation_used` | That confirmation already ran the call once | Nothing more was charged. If you have no result, repeat the identical call with the same `idempotencyKey`: the host asks once more and the key never charges twice |
| `permission_not_granted` | Spending or uploads were not allowed when Cuddler was connected | The `cuddler-setup` skill: connect again and allow it |
| `feature_unavailable` | Images, videos or uploads aren't open for this account | Say so |
| `plan_required`, `model_not_in_plan` | The model or option isn't in the plan | Say so and offer an available model |
| `price_above_consent` | The price moved above `maxCredits` | Quote again → new gate |
| `idempotency_key_reused`, `idempotency_key_spent` | The key belongs to another request | A new key is a new charge → new gate |
| `concurrency_limit` | Every render slot is busy | Wait for a running video, then repeat with the same key |
| a budget reason | Cuddler set a daily limit for this connection and it is spent | Stop; it resets at `budget.resetsAt` |
| `account_not_eligible` (a 403 on any call) | Connecting is for paid Cuddler plans (Lite, Pro or Ultra) and creator partners; free plans, trials and gifted plans can't connect | Stop and say so; don't suggest a plan or an upgrade |
| `CREDIT_INSUFFICIENT` | The balance is below the price; nothing was charged | Stop and say so; something the balance covers is a new quote and gate |
| `member_cost_breaker` (a `CREDIT_INSUFFICIENT` refusal) | This billing period's plan credits can no longer be spent through agents; `purchasedAvailable` is what the user bought | Stop and say so: until the date in `resetsAt` (until the plan renews when there is none), nothing was charged, the Cuddler app is not affected. Don't suggest buying credits or a plan |
| `NOT_FOUND` | Wrong id, or not this account's | Check the id |
| `status: failed` | The render failed | `retry_video` (the first retry is free) |
| `provider_rejected`, `reference_face_rejected`, `reference_not_registered` | The model refused it; no retry | Change the prompt or the images and quote a new video |
