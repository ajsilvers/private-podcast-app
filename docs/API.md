# Subscribe API

Server-to-server endpoint for adding someone to a private podcast feed after they opt in on a website. The response includes that person's private feed URL. The site can email it and show it on screen, for example in the confirmation modal.

## Endpoint

```
POST https://feeds.launchcastformula.com/api/v1/subscribe
Authorization: Bearer lcf_live_<key>
Content-Type: application/json
```

Create keys in the dashboard under **Settings → API Keys**. Give each site its own key and limit it to the feeds that site may subscribe people to. The key is shown once, when you create it. Store it as a server-side secret, such as `PODCAST_API_KEY`, and never send it to a browser.

## Request

```json
{
  "feed": "dbt-audio-series",
  "email": "jane@example.com",
  "first_name": "Jane",
  "external_id": "optional-id-from-your-site"
}
```

| Field | Required | Notes |
|---|---|---|
| `feed` | yes | The show's **feed slug**, set in the show settings. |
| `email` | yes | Trimmed and lowercased, so `Jane@Example.com` and `jane@example.com` are the same person. |
| `first_name` | no | Stored as the subscriber's name. `name` is accepted as an alternative. |
| `external_id` | no | Stored for tracing only, such as your site's capture ID. |

Any other field is rejected with a 400. The request can't set the start date, cadence or show. Those come from the feed's settings in the dashboard.

## Responses

New subscriber: **201**. Already subscribed: **200**. The body has the same shape either way:

```json
{
  "feed_url": "https://feeds.launchcastformula.com/api/feeds/AbC123…",
  "subscriber_id": "…",
  "feed": "dbt-audio-series",
  "status": "active",
  "created": true,
  "start_date": "2026-10-04T12:00:00.000Z"
}
```

| Status | `error` | Meaning |
|---|---|---|
| 400 | `invalid_request` | Malformed JSON, missing/invalid email, or unknown field (`issues` explains) |
| 401 | `unauthorized` | Missing, wrong or revoked key |
| 403 | `feed_closed` | The feed has "Accepting new subscribers" switched off |
| 404 | `feed_not_found` | Unknown slug, **or** this key isn't allowed for that feed (same response on purpose) |
| 409 | `subscriber_revoked` | This email was removed from this feed. No URL is returned. Re-enable it in the dashboard. |
| 413 | `payload_too_large` | Body over 8 KB |
| 500 | `internal_error` | Temporary problem. Safe to retry. |

## Guarantees

- **Idempotent.** Repeating a call with the same email and feed returns the same `feed_url`. It never creates a second subscriber or restarts a drip schedule. You can safely retry after a timeout.
- **Revocation sticks.** A revoked subscriber stays revoked whatever the API is sent, and their feed URL returns 404 straight away.
- **Feed URLs are permanent** while the subscriber is active.

## Showing the link

The site may email `feed_url` and display it, for example in a modal with "Copy link" and "Open in Apple Podcasts" buttons. It isn't treated as sensitive. If someone enters another person's address and that person replies, revoke the subscriber in the dashboard.

## How episodes are released

Each feed's settings decide this, not the request:

- **Binge:** every published episode is available as soon as they subscribe.
- **Drip:** episode N releases at signup time + (N−1) × interval days, counted in exact hours rather than at midnight.
- **Dated:** each episode has one UTC release date and time, the same for everyone. People who subscribe late see every episode already released.

Podcast apps check feeds on their own schedule, so an episode appears in the app at the next check after its release time.

## Example: Netlify function

```js
// netlify/functions/subscribe.mjs (server-side only)
const res = await fetch(`${process.env.PODCAST_API_BASE_URL}/api/v1/subscribe`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.PODCAST_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ feed: "dbt-audio-series", email, first_name: firstName, external_id: captureId }),
  signal: AbortSignal.timeout(5000),
});

if (res.ok) {
  const { feed_url } = await res.json();
  // 1. Save feed_url on the ESP contact (e.g. a Bento field `podcast_feed_url`) and trigger the email.
  // 2. Return feed_url to the browser so the confirmation modal can show it.
  return Response.json({ ok: true, feed_url });
}
if (res.status >= 500) {
  // Keep the captured opt-in and retry later. The API is idempotent.
}
```
