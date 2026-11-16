import { useEffect, useState } from "react";

const readStoredValue = (key, initialValue) => {
  if (typeof window === "undefined") return initialValue;
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw === null ? initialValue : JSON.parse(raw);
  } catch {
    return initialValue;
  }
};

export function useSessionStorageState(key, initialValue) {
  const [value, setValue] = useState(() => readStoredValue(key, initialValue));

  useEffect(() => {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be unavailable (private mode, quota); state still works in memory.
    }
  }, [key, value]);

  return [value, setValue];
}
