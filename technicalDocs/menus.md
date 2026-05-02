# Menus and variants

Shortly I just implemented the entities of variants and options (and two more so the logic work) and now I will explain. \

The Manager can create a menu (Sufllaqe) the branch manager can inherit BranchMenuItem and only change the price, aviability, isHighlighted. So far so good and simple \
Now what I just implemented:\
The branch can also add **variants and options**, how this works\

Let's imagine that a customer want to buy a "sufllaqe" from x restaurant branch.\
Firstly Manager had to create the "MENU" Sufflaqe  set default price than can add options in OptionGroup table: name = "zgjidh mishin" and can set the option_config setting so only one option can be set (can also set the maxOption of variants) \
Similary manager can select the variant (OptionVariant) that can be "mishderri" or "mishpule" and so for one option group there are x amount of option variant, the x is specified in option group with column name maxOption
-> BranchMenuItem -> branch manager is the manager of specified restaurant location and he can make changes like the price, aviability, isHighlighted. But there is a problem that what if this branch manager dont have sauce specified by the restaurant manager or the price is too low for his location. \
To solve this I created BranchOptionConfig entity that can only be populated if restaurant branch manager wishes to make those changes.
Database buisnnes rule
//NOT allowed duplicated, Blloku + Salce Kosi (twice)\
### here is AI version of this but summarized
# Menus, Options, and Variants – Domain Design

## 1. Global Menu Definition (Manager)

- The **Manager** creates a `MenuItem` (e.g. *Sufllaqe*)
- Sets:
    - default price
    - default availability
- Adds **Option Groups**
    - Example: `Zgjidh mishin`
    - Configuration:
        - `maxOptions` (e.g. only one option can be selected)

- Each **Option Group** contains multiple **Option Variants**
    - Examples:
        - mish derri
        - mish pule

At this level:
- Prices and availability are **global defaults**
- No branch-specific logic exists

---

## 2. Branch Menu Customization

Each restaurant branch inherits the global menu via:

- `BranchMenuItem`

The **Branch Manager** can override:
- price
- availability
- isHighlighted

This handles branch-level customization for menu items.

---

## 3. Problem: Branch-Specific Options & Variants

Real-world constraints:
- A branch may not have all variants defined globally
- Variant prices may be too low for certain locations
- Some options may be temporarily unavailable

Example:
- Global option: *Salcë Kosi*
- Branch: *Blloku*
- Blloku runs out → option must be disabled
- Or price must be increased locally

Global configuration alone is insufficient.

---

## 4. Solution: BranchOptionConfig

To handle branch-specific overrides, introduce:

- `BranchOptionConfig`

Purpose:
- Store **branch-specific configuration** for option variants
- Created **only if the branch manager needs overrides**

Supports:
- price override
- availability override

Global variant definitions remain unchanged.

---

## 5. Database Business Rule

Enforced constraint:

- `(branch_id, variant_id)` must be unique

Meaning:
- A branch can resolve a variant configuration only once
- Duplicate entries are rejected at database level

Example:
- ❌ Blloku + Salcë Kosi (twice)



### Now I have to implement the logic in service layer