# Premium Financial Insight

## Brand & Style
The design system is engineered for a premium financial tracking experience that balances institutional trust with modern agility. The brand personality is authoritative yet accessible, positioning itself as a sophisticated digital companion for personal wealth management. 

The aesthetic follows a **Modern Minimalism** approach with subtle **Corporate** influences. It prioritizes clarity and data density without overwhelming the user. High-quality whitespace, crisp geometry, and a deliberate use of color hierarchy ensure that the user's financial status is the primary focus. The interface should feel "expensive" through its restraint—using precise alignments and a refined color palette rather than decorative flourishes.

## Layout & Spacing
The layout employs a **Fluid Grid** system based on an 8px rhythmic scale. 

- **Mobile:** A 4-column grid with 16px side margins. Elements typically span the full width or 2 columns for smaller metric cards.
- **Desktop:** A 12-column grid with a maximum content width of 1280px. Margins expand to 40px to provide a "breathable" premium feel.
- **Vertical Spacing:** Stricter adherence to the 8px scale (16, 24, 32, 48) ensures a consistent cadence as users scroll through transaction histories.
- **RTL Considerations:** The layout is strictly Right-to-Left. All horizontal spacing, padding, and iconography directions are mirrored to accommodate the Arabic language flow.

## Elevation & Depth
This design system uses **Tonal Layers** combined with **Ambient Shadows** to create a sense of organized depth.

- **Base Layer:** The Light Slate background (#f8fafc) acts as the canvas.
- **Surface Layer (Cards/Containers):** Pure white surfaces sit atop the base. These are given a very soft, diffused shadow (Blur: 15px, Opacity: 4%, Color: Royal Blue) to lift them slightly without creating a "heavy" feel.
- **Interactive Layer (Buttons/Active States):** Primary actions use the Royal Blue with a slightly more pronounced shadow to indicate clickability.
- **Zero-Border Policy:** Rely on subtle tonal shifts and shadows rather than harsh borders to define boundaries, maintaining the minimalist aesthetic.

## Components
- **Buttons:** Primary buttons are solid Royal Blue with white text. Success actions (e.g., "Add Income") use Emerald. Secondary buttons are ghost-style with a Royal Blue outline and no fill.
- **Transaction Cards:** A horizontal layout with an icon on the right (RTL), followed by the category name and timestamp. The amount is flush-left, colored Rose for expenses or Emerald for income.
- **Input Fields:** Minimalist design with a subtle 1px border in a muted slate. On focus, the border transitions to Royal Blue. Labels are placed above the field, aligned to the right.
- **Progress Bars:** Used for budget tracking. The track is a light version of the slate, while the fill is Emerald. If a budget is exceeded, the fill transitions to Rose.
- **Chips:** Small, pill-shaped tags used for filtering time periods (e.g., "This Week", "This Month"). Active chips have a Royal Blue background; inactive chips have a subtle slate background with dark text.
- **Wallet Summary:** A large "Glassmorphism" card at the top of the dashboard using a subtle gradient of Royal Blue, featuring the total balance in high-contrast white text.

