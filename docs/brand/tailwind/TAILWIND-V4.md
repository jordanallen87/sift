# Sift Tailwind CSS v4 theme

This kit assumes **Tailwind CSS v4**. The palette intentionally uses only Sift green and neutral black/gray values. There are **no gradients**.

## Install

Copy `brand/sift-tokens.css` and `tailwind/sift-theme.css` into your web project. In your main stylesheet, load Tailwind first and then the Sift theme:

```css
@import "tailwindcss/theme.css";
@import "tailwindcss/utilities.css";
@import "./styles/sift-theme.css";
```

If your project already owns a reset/preflight strategy, keep it. The Sift file only adds tokens and a tiny base layer.

## Useful classes

```html
<div class="bg-background text-foreground border-border">...</div>
<button class="bg-brand text-white hover:bg-brand-hover focus-visible:outline-ring">Continue</button>
<div class="bg-brand-soft text-sift-900">...</div>
<p class="text-muted">Secondary copy</p>
```

## Dark mode

The token layer responds to a `.dark` class. Your existing dark-mode mechanism can continue to toggle that class.

## Core brand color

- Sift Green / `sift-600`: **#1F5C52**
- Primary ink: **#111413**
- Light background: **#F7F8F7**

The scale exists so the UI can have hover, focus, selected, subtle-surface, and dark-theme states without introducing unrelated accent colors.
