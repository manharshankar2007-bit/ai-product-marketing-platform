Subject: 🔔 Coming Soon: System Changes effective from July 1

*July 01: The Rules Change. No Exceptions*

10 changes take effect on 1 July across Verification & KYC, Account Structure, Billing & Invoicing, and Cash Automation.

**Why This Is Changing**

Most of what's below comes down to one thing: making sure money, identity, and account hierarchy all point to a single, verifiable source of truth. Cash sitting in a wallet with no verified bank account behind it, riders working public networks with no identity check, and child accounts quietly drifting from their parent's billing setup have all been operational grey areas until now.

From 1 July, they become rules the system enforces on its own.

**Verification & KYC**

**Inactive Riders Marked Automatically At Month-End**

Starting 30th June, the system will automatically mark riders inactive on a periodic basis. Note that this isn't a one-time cleanup; it repeats regularly to make sure the system stays clean and accounts do not have bloated rider count.

Riders who haven't worked in a period of 30 days and hold no cash, would be automatically marked inactive.

**Bank Verification Required Before Any COD Cash Is Paid Out**

From 1 July, a business needs verified bank details in system to receive the due from Pidge amount back to them. Until verification is complete, the Due From Pidge page will show a banner flagging this, and any attempt to turn on T+1 remittance will be blocked. This applies wherever COD orders are involved.

Pidge ends up holding cash that's owed back to a business; without a verified account to send it to, that money has nowhere to go. Finance will not process the money unless bank information is available and verified in system.

**Mandatory Aadhaar Verification for Riders**

All riders operating through the public network (including PPN) or operating as loaned riders (PDR) must have a successfully Aadhaar-verified profile.

Riders who are not Aadhaar verified will be automatically removed from the public network and cannot rejoin until their verification is completed. Additionally, vendors/CT teams will not be able to create future loan shifts for unverified riders.

This requirement applies only to riders participating in the public network or PDR. Captive riders fulfilling only your own business orders are not impacted by this validation. Business KYC guidelines, which may be stricter than just Aadhaar verification, apply to PDR.

A business receiving fulfilment from a public network rider has no other way to vet that person, Aadhaar verification is the one check that travels with the rider across accounts.

**Enterprise Accounts Gated On GST And Bank Verification**

Enterprise accounts will be created directly from the Admin Panel (V2), but no new user can be added until both GST verification and bank verification are complete. From 1 July, any Enterprise account without a valid GST on file will be disabled. Existing Enterprise accounts are backfilled with GST data ahead of this so nobody is caught off guard.

GST and bank details are what make Enterprise invoicing and settlement work correctly, catching gaps at account creation is far cheaper than untangling them after orders have already been billed. Additionally, once an Enterprise account is GST verified, it will auto-populate the legal name (and certain other fields) in the business name field (display only) to ensure verified legal names are in place.

**Account Structure & Hierarchy**

**Parent Accounts Become View-Only Holding Entities**

A parent (Enterprise) account can no longer create orders, riders, routes, or vehicles, those actions are hidden across the Orders, Routes, and Fleet screens, leaving only the ability to view and download reports. All operational work — placing orders, managing riders, building routes, adding vehicles — now happens exclusively in the child accounts underneath it.

A parent account's job is to oversee and configure the accounts beneath it, not to run operations itself. Keeping that line clean stops assets from ending up at the wrong level of the hierarchy. We will release more features to make parent accounts even more powerful in the future as they are expected to be holding/central entities.

**New Child Accounts Inherit The Parent's Rate Card And Wallet By Default**

Any new child account created under an Enterprise parent will, by default, follow the parent's rate structure — default or custom — and have its wallet source set to the parent account, so charges are deducted from the parent's wallet. This can still be overridden at the level of a single charge type, so a child could follow the parent's rates everywhere except, say, its own minimum guarantee, which it pays for itself.

Today every new child account needs its rates configured from scratch, and that's exactly where mismatches and incorrect invoices come from. Inheriting by default means a new account starts correct.

**Billing & Invoicing**

**B2B And B2C Accounts Now Get Separate Invoice Series**

Any account with GST details in the system will now generate B2B and B2C invoices under separate, distinct invoice number series, rather than sharing one sequence.

---

M3M Urbana Business Park, Sector 67

Gurugram, Haryana (122101)

VISIT WEBSITE
