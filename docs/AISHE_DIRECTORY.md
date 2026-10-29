# AISHE institute directory

The platform keeps the list of higher-education institutions published on the AISHE portal, so an institution
signing up can find itself by name or AISHE code and have its details filled in.

## Updating the directory (platform administrator)

1. Download the institution list from the AISHE portal (Excel `.xlsx` or CSV), for one state or all of India.
2. Admin console → **Institute directory** → choose the file → **Upload and update**.
3. The summary shows how many institutions were added, updated, unchanged and skipped, and which column was
   used for which field.

Rows are matched by AISHE code. New codes are added and changed rows are updated. A blank cell never erases a stored
value, and nothing is ever deleted, so states can be uploaded one at a time and a newer export can simply be
uploaded again. Old `.xls` files must be saved as `.xlsx` or CSV first. Limit: 25 MB per file.

Columns read (header names are matched loosely; a title row above the header is skipped):

| Field | Header examples | Required |
|---|---|---|
| code | AISHE Code | yes (`C-16544`, `U-0439`, `S-2772`; `c16544` is normalised) |
| name | Institute Name | yes |
| category | Category (`Standlone` is stored as `Standalone`) | |
| university | Name of Affiliated University | |
| type | Type of Institute | |
| state, district, status | State, District, Status | |
| website, established, management | Website, Year of Establishment, Management | |

## Where it is used

- **Institution sign-up** (`/register` → Institution → Register a new institute): the name box searches the
  directory as you type, and typing an AISHE code looks it up. Choosing an entry fills in the name, AISHE code,
  city (district), state and website, all still editable.
- **On sign-up**, the server looks the AISHE code up again, stores the directory entry on the new institute
  (`aisheDirectory`) and sets the institution type from it.
- **Verification tab**: pending institutes show whether their AISHE code is in the directory.

The directory is reference data only. Institute accounts and their verification are kept separately and are never
changed by an upload.

## Storage and APIs

- MySQL table `acx_aishe` (viewable in phpMyAdmin); `data/aishe.json` in local development. It is held in memory
  for search and reloaded every 5 minutes and after each upload.
- `POST /api/admin/aishe` (admin only, multipart `file`; `?preview=1` checks without saving) and
  `GET /api/admin/aishe` (counts by state and category).
- `GET /api/aishe?q=<name or code>&state=` and `GET /api/aishe?code=<code>`: public, rate-limited, returning
  the published AISHE fields only.
- Code: `lib/server/sheet.ts` (xlsx/csv reader), `lib/server/aishe.ts`, `components/AisheLookup.tsx`,
  `components/AisheDirectoryPanel.tsx`. Test: `npm run test:aishe`.
