import type { Locale } from '@facile/muse';

declare global {
  namespace App {
    interface Locals {
      locale: Locale;
    }
  }
}

export {};
