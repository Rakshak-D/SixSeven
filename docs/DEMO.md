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
