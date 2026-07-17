# Soroban Contract Events

This document lists all events emitted by the Stellar IndigoPay Soroban smart contracts.

## Event Schema Format

| Event Name | Topics | Data | When Emitted |
| ---------- | ------ | ---- | ------------ |

---

## 1. `donated`

**Description**: Emitted after a successful XLM donation to a project.

| Event Name | Topics                           | Data                                                     | When Emitted                  |
| ---------- | -------------------------------- | -------------------------------------------------------- | ----------------------------- |
| `donated`  | `["donated", donor, project_id]` | `{ "amount": u128, "badge": String, "msg_hash": Bytes }` | After successful XLM donation |

---

## 2. `nft_mint`

**Description**: Emitted when a donor reaches a new badge tier and receives an NFT.

| Event Name | Topics                | Data                                        | When Emitted              |
| ---------- | --------------------- | ------------------------------------------- | ------------------------- |
| `nft_mint` | `["nft_mint", donor]` | `{ "badge_tier": String, "token_id": u32 }` | On new badge tier reached |

---

## 3. `project_registered`

**Description**: Emitted when a new climate project is registered.

| Event Name           | Topics                               | Data                                    | When Emitted                   |
| -------------------- | ------------------------------------ | --------------------------------------- | ------------------------------ |
| `project_registered` | `["project_registered", project_id]` | `{ "name": String, "wallet": Address }` | When a new project is approved |

---

## 4. `project_updated`

**Description**: Emitted when project details or impact metrics are updated.

| Event Name        | Topics                            | Data                                       | When Emitted                 |
| ----------------- | --------------------------------- | ------------------------------------------ | ---------------------------- |
| `project_updated` | `["project_updated", project_id]` | `{ "field": String, "new_value": String }` | When project info is updated |

---

## 5. `impact_updated`

**Description**: Emitted when CO₂ impact or other metrics are updated for a project.

| Event Name       | Topics                           | Data                                   | When Emitted                |
| ---------------- | -------------------------------- | -------------------------------------- | --------------------------- |
| `impact_updated` | `["impact_updated", project_id]` | `{ "co2_offset": u128, "trees": u32 }` | After impact metrics update |

---

## 6. `badge_awarded`

**Description**: Emitted when a donor is awarded a new badge (complements `nft_mint`).

| Event Name      | Topics                     | Data                                 | When Emitted                       |
| --------------- | -------------------------- | ------------------------------------ | ---------------------------------- |
| `badge_awarded` | `["badge_awarded", donor]` | `{ "tier": String, "name": String }` | When donor reaches badge threshold |

---

## 7. `withdrawal`

**Description**: Emitted when a project withdraws funds.

| Event Name   | Topics                       | Data                                    | When Emitted               |
| ------------ | ---------------------------- | --------------------------------------- | -------------------------- |
| `withdrawal` | `["withdrawal", project_id]` | `{ "amount": u128, "remaining": u128 }` | When project withdraws XLM |

---

## 8. `contract_initialized`

**Description**: Emitted once when the contract is initialized.

| Event Name             | Topics                     | Data                   | When Emitted                  |
| ---------------------- | -------------------------- | ---------------------- | ----------------------------- |
| `contract_initialized` | `["contract_initialized"]` | `{ "admin": Address }` | On contract deployment / init |

---

## 9. `camp_crt`

**Description**: Emitted when the admin creates a time-bound fundraising campaign on a project.

| Event Name | Topics                              | Data                                       | When Emitted                |
| ---------- | ----------------------------------- | ------------------------------------------ | --------------------------- |
| `camp_crt` | `["camp_crt", admin, project_id]`   | `{ "goal": i128, "deadline_ledger": u32 }` | On `create_campaign`        |

---

## 10. `camp_ext`

**Description**: Emitted when the admin extends an active campaign deadline.

| Event Name | Topics                              | Data                      | When Emitted         |
| ---------- | ----------------------------------- | ------------------------- | -------------------- |
| `camp_ext` | `["camp_ext", admin, project_id]`   | `{ "new_deadline": u32 }` | On `extend_campaign` |

---

## 11. `camp_cls`

**Description**: Emitted when the admin closes a campaign (`Closed` or `Expired`).

| Event Name | Topics                            | Data                         | When Emitted        |
| ---------- | --------------------------------- | ---------------------------- | ------------------- |
| `camp_cls` | `["camp_cls", admin, project_id]` | `{ "status": CampaignStatus }` | On `close_campaign` |

---

## 12. `camp_goal`

**Description**: Emitted when a donation causes the campaign goal to be reached.

| Event Name  | Topics                         | Data                      | When Emitted                         |
| ----------- | ------------------------------ | ------------------------- | ------------------------------------ |
| `camp_goal` | `["camp_goal", project_id]`    | `{ "total_raised": i128 }` | When `total_raised >= goal` on donate |

---

## Usage Notes

- All events follow Soroban’s standard event format: `topics: Vec<Val>`, `data: Val`.
- `donor` and `project_id` are usually `Address` or `String` depending on implementation.
- Events can be queried via Horizon or Soroban RPC tools.
- Frontend / backend should listen to these for real-time updates, notifications, and leaderboard.

**Last Updated**: July 17, 2026
