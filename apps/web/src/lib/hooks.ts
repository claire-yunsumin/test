import { useEffect, useRef, useState } from "react";

export function useLocalStorage<T>(key: string, initialValue: T, parse: (raw: string) => T = JSON.parse, serialize: (value: T) => string = JSON.stringify) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch {
      // localStorage can be unavailable in restricted browser contexts.
    }
  }, [key, serialize, value]);

  return [value, setValue] as const;
}

export function usePopover<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [onClose, open]);

  return ref;
}
