# Bebop Starter

A pnpm and Turborepo monorepo with a TanStack Start web app and an Expo React Native app. Both apps use the Bebop-generated Jazz schema and client in apps/web.

## Requirements

- Node.js 22.13 or newer
- pnpm 12.6.0 or newer
- Xcode for the iOS simulator or Android Studio for an Android emulator

## Install and run

    pnpm install
    pnpm dev

The web playground is at http://127.0.0.1:3000/ and the admin is at http://127.0.0.1:3000/admin. Expo starts in development-client mode for the native app.

Run each app separately with pnpm dev:web or pnpm dev:mobile. Use pnpm ios or pnpm android to build and launch the native app. Jazz uses a native module, so Expo Go is not supported; the first native run creates a development build.

## Bebop config

Edit apps/web/bebop.config.ts, then run:

    pnpm generate
    pnpm validate:schema
    pnpm check

The config generates the Jazz schema, admin manifest, and typed client in apps/web. The starter includes one todos collection to demonstrate create, update, and delete operations from web, mobile, and /admin. The small client adapter in apps/mobile imports the same generated schema and config with paths Metro can resolve.

## Jazz connection

The web app starts a local Jazz server on port 1625; the native app connects to it. The starter uses 127.0.0.1 for iOS simulators and 10.0.2.2 for Android emulators. For a physical device, set EXPO_PUBLIC_JAZZ_SERVER_URL in your environment to the computer's reachable LAN URL, for example http://192.168.1.20:1625, and configure the Jazz host in apps/web/vite.config.ts to that same LAN address.

Data is local-first and each device has its own Jazz account. To share a record between devices, add an account sign-in or invitation flow.
