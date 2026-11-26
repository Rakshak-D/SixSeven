# Live Slate walkthrough

From a checkout with Node, Corepack and Docker Desktop available, run:

```powershell
.\start.ps1 -Live
```

On Unix, run `./start.sh --live`. The launcher creates missing local settings and prepares a fresh demo database. Demo accounts are owner@demo.invalid, contractor@demo.invalid and engineer@demo.invalid. Read the locally generated password from your ignored environment file. Use a separate Compose name and unused ports when demonstrating from a second checkout.

1. Sign in as the engineer. Create a new project and invite the seeded owner and contractor.
2. In separate browser profiles, sign in as each recipient, accept and reload. Return to the engineer team screen to see the accepted invitations.
3. Open Greenfield Home as contractor and inspect stock and wage records. Sign in as engineer and compare the roster without wage amounts.
4. On an owner project, inspect pending mock supplier payments and applicable spending limits. Record employee payments through the contractor wage form. Supplier payments and medical reimbursement remain simulations.
5. Open Ask Slate. A configured provider supplies a generated reply. Without configuration the UI reports that it is offline. Prototype samples require explicit prototype mode.

The release browser suite covers session separation, onboarding, stock, wage privacy and approvals. It exercises medical and steel uploads with synthetic image files through authenticated browser requests. See the frontend and backend ledgers for the verification status of other workflows. Camera capture requires HTTPS or localhost. Client timestamps identify the reported capture time and do not authenticate a physical scene.

## End-to-end prototype walkthroughs (2026-11-26)

Run with `NEXT_PUBLIC_USE_MOCKS=0` against a migrated and seeded local database (`pnpm db:migrate`, `pnpm db:seed`).

**A. Seeded project.** Sign in as each demo account in a separate browser profile. The contractor records a delivery on Today; the engineer verifies it from home; the owner adds a supplier and an order on Money and decides proposals with a note. Everything shown comes from the database.

**B. New project.**
1. The engineer signs in, starts a project and opens *Set up the project* on home.
2. *Import Revit quantities*: upload the quantity take-off exported from Revit as .xlsx (columns Category, Level, Type, Count, Quantity, Unit). Enter a rate per line, the allowed overuse and the stock alert, then add. The .rvt file itself is not read. *Add a material* covers anything typed by hand.
3. *Write the checklist*: start from the template, or one task per imported level; edit tasks and phases; save.
4. On Team, invite an owner and a contractor by email. Each opens /login, chooses *Invited? Create your account*, signs up with the invited email, and accepts the invitation on the projects page.
5. The contractor adds and removes workers on Wages at any time.
