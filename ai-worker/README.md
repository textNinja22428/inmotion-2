# IN MOTION · Private GPT connection

The Android app must NOT contain an OpenAI API key. This Worker is a private proxy between your app and the OpenAI Responses API.

## One-time setup

1. Create an OpenAI API key in your OpenAI platform account (API usage is billed separately from ChatGPT).
2. Sign in to your own Cloudflare account on a computer with Node.js installed.
3. From this `ai-worker` directory:
   ```bash
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put PAIRING_TOKEN
   ```
   Use your real API key for the first secret. For PAIRING_TOKEN use an independently generated 32+ character random string. Keep both out of GitHub and out of chats.
4. The Worker URL printed by Cloudflare will resemble `https://inmotion-private-ai.<your-account>.workers.dev`.
5. Open IN MOTION > Settings > OpenAI · Secure Connection. Enter `https://inmotion-private-ai.<your-account>.workers.dev/chat` and your PAIRING_TOKEN (not the OpenAI key).
6. In ASK IN MOTION, questions use GPT when configured. The app includes available text across its day log, work projects, study, exercise, hourly planner, general notes, Guardian log and saved in-app chat history with each request. There is no 8-message cutoff. Media file bytes and separate ChatGPT-account conversations are NOT accessed.
7. Any change to ai-worker/src/index.js MUST be deployed again with `npx wrangler deploy`; rebuilding the Android APK does not update the live Cloudflare Worker. AI input remains subject to provider context limits, Worker transfer limits and API charges.

The app falls back to its offline local search without the Worker. When AI is connected, the user-selected private Worker receives app text automatically. This is intended for the user's own authorized personal data only. The Server never stores your notes; the OpenAI request uses `store:false`. Do not send confidential EY or client material unless independently authorized by your organization.

**Security:** Do not publish the pairing token. If exposed, rotate it via `npx wrangler secret put PAIRING_TOKEN`. The static pairing token is a basic single-user protection, not account-level authentication. If you ever need a public multi-user release, add real user auth, quotas and rate limiting.
