

# Replace DiceBear Robots with Boring Avatars Marble Style

## What Changes

Replace the current DiceBear "bottts" robot avatars with [Boring Avatars](https://boringavatars.com/) marble-style SVGs that use the system's purple/violet color palette — giving every user a unique, aesthetic, fintech-appropriate default avatar.

## How It Works

Boring Avatars is a lightweight library (`boring-avatars` npm package) that generates deterministic SVG avatars from a name string. The "marble" variant creates smooth, organic gradient patterns — no cartoonish shapes.

We'll pass in 5 colors derived from the system's purple palette:
- `#7C3AED` (primary purple)
- `#A78BFA` (lighter purple)
- `#4C1D95` (deep purple)
- `#DDD6FE` (lavender)
- `#1E1B4B` (dark navy)

These ensure every marble avatar feels cohesive with the fintech brand regardless of light/dark mode.

## Files Changed

### 1. Install `boring-avatars` package

### 2. `src/components/UserAvatar.tsx`
- Remove `getRandomAvatarUrl` function (DiceBear)
- Import `Avatar as BoringAvatar` from `boring-avatars`
- When no custom `avatarUrl` exists, render a `<BoringAvatar>` component with `variant="marble"`, the user's name as seed, and the 5-color palette
- When a custom `avatarUrl` exists, render the existing Radix avatar as before

### 3. `src/components/manager/ActiveUsersCard.tsx` and `SimpleUserCard.tsx`
- These use raw `<Avatar>` + `<AvatarImage>` with `user.avatar_url`. Update fallbacks to use a Boring Avatars marble SVG instead of initials text, using the same color palette.

## No database or backend changes needed.

