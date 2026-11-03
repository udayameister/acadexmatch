# Event advertisements (FDP, workshop, seminar, conference)

A paid service: organisers advertise academic events on AcadeXMatch.

| Type | Price (default, incl. GST) | Where it is shown |
|---|---|---|
| FDP, workshop or seminar | ₹1,000 per listing | Home page section **FDPs, workshops and seminars**, and `/events` |
| Conference | ₹2,000 per listing | Its own home page section **Upcoming conferences**, and `/conferences` |

Both prices are set in **Admin console → Events & conferences**. Each listing has its own page (`/events/<id>`)
with schema.org Event data for search engines, and is in the sitemap while live.

## Flow

1. **Post.** Any signed-in account (institution staff, candidates, administrators) opens **Advertise an FDP or
   conference** (`/events/post`, also in the account menu and the footer) and fills in the details:
   - type, title, organiser, department
   - dates, how it is held (in person, online or hybrid), venue, city and state
   - registration deadline and fee, description, topics, who can attend
   - registration and brochure links, contact email and phone
   - for conferences only: national or international, paper submission deadline, publication

   The listing is saved as **Waiting for payment**. An email address must be confirmed first, under the same rule
   as posting vacancies.
2. **Pay** with Razorpay (`event_listing` / `conference_listing`). The amount is worked out on the server from the
   listing's type, and only the poster can pay for their own listing. The payment is recorded with an invoice and
   receipt, and the listing becomes **Paid, waiting for review**.
3. **Review.** The administrator sees it under **To review**. They can:
   - **Approve & publish**
   - **Reject**, with a reason that the organiser sees
   - **Publish without payment**, to waive the fee for an unpaid listing
   - **Delete**

   Bank transfers can be recorded under Transactions → Record an offline payment (choose the listing).
4. **Live** until the event's end date, then it drops off the site automatically.

## Rules

- Status and payment fields are never taken from the browser. A paid listing cannot switch between a conference
  and an FDP/workshop/seminar, because the prices differ.
- Organisers can edit their listings. Edits to a paid listing go back to review before they are shown.
- Unpaid listings can be deleted by their poster. A paid listing can only be removed by the administrator.
- Refunding the payment with "end access" takes the listing down.
- Unpublished listings are visible only to their poster and the administrator, and are kept out of search results.

## Code

- `lib/events.ts`: types, prices, input checks, visibility
- `lib/server/events.ts`: save, delete, review
- `app/api/events`, `app/api/admin/events`
- `lib/server/payments.ts`: order, activation, refund, offline payment
- `components/HomeEventSections.tsx`, `EventCard.tsx`, `EventsBrowser.tsx`, `EventsAdminPanel.tsx`
- `app/events/*`, `app/conferences`
- Tests: `tests/events.ts`
