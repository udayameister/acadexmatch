# Help Assistant

A chat window for candidates, institution staff and visitors that answers questions about using AcadeXMatch.

## Behaviour

- A **Help** button sits at the bottom-right of every page except the admin console.
- The chat **opens by itself once after each sign-in** for candidates and institution staff (institute
  administrators and recruiters). It does not reopen as they move between pages. It opens again after they
  sign out and back in. Visitors are never interrupted; they see only the button.
- Answers are tailored to the person: candidate topics, institution topics or visitor topics.
- Each answer has buttons to the right page and suggested follow-up questions.

## Privacy and safety

- **No account data.** `/api/help` has no access to the database or the session. It receives only the question,
  whether the person is a candidate, institution or visitor, and the earlier messages of this chat. It cannot
  reveal anyone's personal details, including the person's own.
- **Secrets never leave the browser.** Messages that look like a password, sign-in or verification code, card,
  bank, Aadhaar or PAN number, or an API key are stopped in the browser with a warning, and refused again on the
  server.
- **Other people's data is declined**, for example "phone number of candidate X", "who else applied" or
  "list of applicants with emails".
- **Nothing is stored or logged.** The chat lives only in the page and is cleared on sign-out.
- Rate limit: 30 messages per minute per IP. Only same-site JSON requests are accepted.

## Answers

Answers come from the built-in knowledge base in `lib/helpBot.ts` (`HELP_ARTICLES`, about 40 articles), so it works
with no outside service and no cost. To add or correct an answer, edit the article's `answer`, `keywords` or
`links`, add a sample question to `tests/help-assistant.ts`, and run `npm run test:app`.

### Optional: conversational answers with Claude

If these secrets are set, the matching help articles are given to Claude, which writes a more conversational
reply and can handle follow-up questions. It is told to answer only from those articles. If the call fails, the
knowledge-base answer is used.

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | an Anthropic API key (console.anthropic.com) |
| `HELP_ASSISTANT_MODEL` | optional; default `claude-haiku-5-5` |
| `HELP_ASSISTANT_AI` | optional; `off` turns the AI mode off without removing the key |

Messages that were blocked as secrets or as requests about other people are never sent to Claude.
