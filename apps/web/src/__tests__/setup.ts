/**
 * Frontend Test Setup (Sprint 15 — T011)
 *
 * Configures jsdom environment, mocks browser APIs, and sets up
 * testing-library matchers for React component tests.
 */
import "@testing-library/jest-dom";

// Polyfill DataTransfer for jsdom (used in file upload tests)
if (typeof globalThis.DataTransfer === "undefined") {
  class DataTransferPolyfill {
    private _items: File[] = [];
    get items() {
      const items = this._items;
      return {
        add: (file: File) => {
          items.push(file);
        },
        length: items.length,
      };
    }
    get files(): FileList {
      const files = this._items;
      const fileList = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
        [Symbol.iterator]: function* () {
          for (const f of files) yield f;
        },
      } as unknown as FileList;
      for (let i = 0; i < files.length; i++) {
        (fileList as Record<number, File>)[i] = files[i]!;
      }
      return fileList;
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DataTransfer = DataTransferPolyfill;
}

// Mock window.matchMedia (not available in jsdom)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
}));

// Mock next/image
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    void fill;
    void priority;
    return rest;
  },
}));
